// src/dream/learner.ts — Recursive Deterministic Learner.
//
// Three recursion levels:
//   L0 — gene beliefs: Beta posteriors + EMA rewards updated from
//        deterministic stress-evaluation of every active registry gene.
//   L1 — meta-learning: the learner measures its own prediction error
//        (calibration) and rewrites its own hyperparameters by fixed
//        rules. Learning rate rises when surprised, decays when stable.
//   L2 — directives: structured recommendations (retire / refine /
//        amplify) emitted back to the ecosystem, closing the loop
//        with the AI mutator and the dreaming engine.
//
// Determinism: every episode is a pure function of
//   (seed, episode number, evaluated gene set).
// All state transitions are recorded in a hash-chained append-only
// ledger; `replayFromGenesis()` re-executes the full history and proves
// the chain reproduces bit-for-bit (or reports the divergence point).
//
// Supabase tables (durable mode):
//   create table if not exists learner_state (
//     id text primary key, state jsonb not null,
//     updated_at timestamptz not null default now());
//   create table if not exists learner_ledger (
//     episode bigint primary key, entry jsonb not null,
//     created_at timestamptz not null default now());

import type { ToolDomain } from '../types';
import { compileGenome, geneVectors, generateGenome } from './genomes';
import { hashString, mulberry32 } from './engine';
import { scoreGeneWithProperties } from './property-harness';
import { createGeneRegistryStore } from './mutator';
import fs from 'node:fs';
import path from 'node:path';
import type { GeneRegistryStore } from './mutator';
import type {
  Directive,
  EpisodeReport,
  LedgerEntry,
  LearnerState,
  MetaParams,
  ReplayReport,
} from './learner-types';

const ALL_DOMAINS: ToolDomain[] = [
  'math', 'coding', 'biotech', 'systemic',
  'neuro_symbolic', 'cyber_defense', 'quantum_sim',
];

const GENESIS_SEED = 0x9e3779b9;
const MAX_DIRECTIVES = 20;
const MAX_REPLAY = 500;

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/* ------------------------- canonical hashing ------------------------ */

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const h8 = (s: string) => hashString(s).toString(16).padStart(8, '0');

/** Canonical projection of state — excludes timestamps so replay
 *  reproduces identical hashes. */
function canonicalState(s: LearnerState): unknown {
  return {
    episode: s.episode,
    meta: s.meta,
    selfScore: s.selfScore,
    calibrationError: s.calibrationError,
    ledgerHead: s.ledgerHead,
    geneBeliefs: s.geneBeliefs,
    directives: s.directives,
  };
}

/* --------------------------- gene execution ------------------------- */

function sandboxEval(source: string): (input: unknown) => unknown {
  const tryCompile = (code: string) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vm: any = typeof require === 'function' ? require('node:vm') : null;
    if (vm && vm.Script) {
      const script = new vm.Script(`(${code})`);
      return script.runInContext(vm.createContext({}), { timeout: 500 });
    }
    return new Function(`return (${code})`)();
  };
  try {
    return tryCompile(source);
  } catch (err) {
    if (err instanceof SyntaxError) {
      // Gene is written in TypeScript — transpile it with esbuild (same honest
      // path as the execution sandbox) and try again before giving up.
      const { prepareExecutableCode } = require('../lib/executionSandbox');
      return tryCompile(prepareExecutableCode(source));
    }
    throw err;
  }
}

function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object')
    Object.values(value as Record<string, unknown>).forEach((v) => collectNumbers(v, out));
  return out;
}

const clone = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

/** Deterministic stress mutation: scale numbers by seeded jitter. */
function stressVector(v: unknown, rng: () => number, magnitude: number): unknown {
  if (typeof v === 'number') return v * (1 + (rng() - 0.5) * magnitude);
  if (Array.isArray(v)) return v.map((x) => stressVector(x, rng, magnitude));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = stressVector(val, rng, magnitude);
    }
    return out;
  }
  return v;
}

interface EvalGene {
  id: string;
  name: string;
  domain: ToolDomain;
  code: string;
  vectors: unknown[];
  versionHash?: string;
}

/** Reward in [0,1]: 50% clean-run quality on declared vectors,
 *  50% robustness under seeded stress mutations. */
function scoreGene(code: string, vectors: unknown[], rng: () => number): number {
  let fn: (input: unknown) => unknown;
  try {
    fn = sandboxEval(code);
  } catch {
    return 0;
  }
  const clean = (o: unknown) => collectNumbers(o).every((n) => Number.isFinite(n));

  let baseOk = 0;
  for (const v of vectors) {
    try {
      const a = fn(clone(v));
      const b = fn(clone(v));
      if (JSON.stringify(a) === JSON.stringify(b) && clean(a)) baseOk++;
    } catch {
      /* counts as failure */
    }
  }
  const baseFrac = vectors.length ? baseOk / vectors.length : 0;

  const stressRuns = Math.min(12, Math.max(3, vectors.length * 3));
  let stressOk = 0;
  for (let i = 0; i < stressRuns; i++) {
    const v = stressVector(vectors[i % vectors.length], rng, 1.2);
    try {
      const a = fn(clone(v));
      const b = fn(clone(v));
      if (JSON.stringify(a) === JSON.stringify(b) && clean(a)) stressOk++;
    } catch {
      /* counts as failure */
    }
  }
  const stressFrac = stressOk / stressRuns;

  return round4(0.5 * baseFrac + 0.5 * stressFrac);
}

/** Fallback evaluation set when the registry has no active genes:
 *  the dreaming engine's seven template genes, seeded deterministically. */
function genesisGeneSet(): EvalGene[] {
  const rng = mulberry32(GENESIS_SEED);
  return ALL_DOMAINS.map((domain) => {
    const spec = generateGenome(domain, rng);
    return {
      id: `genesis_${spec.kind}`,
      name: spec.kind,
      domain,
      code: compileGenome(spec),
      vectors: geneVectors(spec),
    };
  });
}

/* ------------------------------ store ------------------------------- */

export interface LearnerStore {
  loadState(): Promise<LearnerState | null>;
  saveState(state: LearnerState): Promise<void>;
  appendLedger(entry: LedgerEntry): Promise<void>;
  listLedger(limit: number): Promise<LedgerEntry[]>; // ascending by episode
}

export class InMemoryLearnerStore implements LearnerStore {
  async loadState(): Promise<LearnerState | null> {
    const g = globalThis as unknown as { __learnerState?: LearnerState };
    return g.__learnerState ?? null;
  }
  async saveState(state: LearnerState): Promise<void> {
    (globalThis as unknown as { __learnerState?: LearnerState }).__learnerState = state;
  }
  async appendLedger(entry: LedgerEntry): Promise<void> {
    const g = globalThis as unknown as { __learnerLedger?: LedgerEntry[] };
    g.__learnerLedger ??= [];
    if (!g.__learnerLedger.some((e) => e.episode === entry.episode)) g.__learnerLedger.push(entry);
  }
  async listLedger(limit: number): Promise<LedgerEntry[]> {
    const g = globalThis as unknown as { __learnerLedger?: LedgerEntry[] };
    return [...(g.__learnerLedger ?? [])].sort((a, b) => a.episode - b.episode).slice(0, limit);
  }
}

/** Durable file-backed store (default). State + ledger live in one JSON file
 *  so learning survives restarts without external infrastructure. */
export class FileLearnerStore implements LearnerStore {
  constructor(private file: string = process.env.LEARNER_STATE_FILE || path.join(process.cwd(), 'recourse_learner.json')) {}

  private read(): { state?: LearnerState; ledger?: LedgerEntry[] } {
    try {
      const raw = fs.readFileSync(this.file, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        state: parsed.state ?? undefined,
        ledger: Array.isArray(parsed.ledger) ? parsed.ledger : undefined,
      };
    } catch {
      return {};
    }
  }

  private write(data: { state?: LearnerState; ledger?: LedgerEntry[] }): void {
    try {
      const existing = this.read();
      const tmpFile = `${this.file}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify({ ...existing, ...data }, null, 2), 'utf-8');
      fs.renameSync(tmpFile, this.file);
    } catch (err) {
      console.warn('[learner:file_store] write failed:', err);
    }
  }

  async loadState(): Promise<LearnerState | null> {
    return this.read().state ?? null;
  }

  async saveState(state: LearnerState): Promise<void> {
    this.write({ state });
  }

  async appendLedger(entry: LedgerEntry): Promise<void> {
    const data = this.read();
    data.ledger ??= [];
    if (!data.ledger.some((e) => e.episode === entry.episode)) data.ledger.push(entry);
    this.write({ ledger: data.ledger });
  }

  async listLedger(limit: number): Promise<LedgerEntry[]> {
    const ledger = this.read().ledger ?? [];
    return [...ledger].sort((a, b) => a.episode - b.episode).slice(-limit);
  }
}

export class SupabaseLearnerStore implements LearnerStore {
  constructor(private url: string, private key: string) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      ...extra,
    };
  }

  async loadState(): Promise<LearnerState | null> {
    const res = await fetch(`${this.url}/rest/v1/learner_state?id=eq=singleton&select=state`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`learner state load failed: ${res.status}`);
    const rows = (await res.json()) as { state: LearnerState }[];
    return rows.length ? rows[0].state : null;
  }

  async saveState(state: LearnerState): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/learner_state`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ id: 'singleton', state, updated_at: new Date().toISOString() }),
    });
    if (!res.ok && res.status !== 201) throw new Error(`learner state save failed: ${res.status}`);
  }

  async appendLedger(entry: LedgerEntry): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/learner_ledger`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ episode: entry.episode, entry, created_at: entry.createdAt }),
    });
    if (!res.ok && res.status !== 201) throw new Error(`learner ledger append failed: ${res.status}`);
  }

  async listLedger(limit: number): Promise<LedgerEntry[]> {
    const res = await fetch(
      `${this.url}/rest/v1/learner_ledger?order=episode.asc&limit=${limit}&select=entry`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`learner ledger list failed: ${res.status}`);
    const rows = (await res.json()) as { entry: LedgerEntry }[];
    return rows.map((r) => r.entry);
  }
}

export function createLearnerStore(): LearnerStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (url && key) return new SupabaseLearnerStore(url, key);
  return new FileLearnerStore();
}

/* ------------------------------ engine ------------------------------ */

export class RecursiveLearner {
  /** Most recent episode report. The dream engine signal provider reads from
   *  here to surface `learnerEpisode` / `learnerCalibration` in
   *  `lastSignalSnapshot`. Set by every `runEpisode()` / `learnRealTools()` /
   *  `synthesizeDirective()` call so a rehydrated learner shows the right
   *  value on the first tick after a process restart. */
  lastReport: EpisodeReport | null = null;

  constructor(
    private store: LearnerStore,
    private geneRegistry: GeneRegistryStore = createGeneRegistryStore(),
    private seed = 0x1ea2a01 >>> 0,
  ) {}

  async status(): Promise<LearnerState> {
    return this.loadOrDefault();
  }

  /** Run one episode. `externalScore` (0..1) is a real ecosystem signal —
   *  verifier pass rate, readiness score, etc. Omit it when there is none;
   *  it is never silently defaulted. */
  async runEpisode(externalScore?: number): Promise<EpisodeReport> {
    const state = await this.loadOrDefault();
    const genes = await this.activeGenes();
    const next = this.execute(state, genes, externalScore);
    await this.store.saveState(next.state);
    await this.store.appendLedger(next.entry);
    const report = this.toReport(next.state, next.entry, genes.length);
    this.lastReport = report;
    return report;
  }

  async runEpisodes(n: number): Promise<EpisodeReport[]> {
    const reports: EpisodeReport[] = [];
    for (let i = 0; i < n; i++) reports.push(await this.runEpisode());
    return reports;
  }

  /** Learn from REAL per-tool outcomes. Each tool (a real registry ToolEntry)
   *  gets its own belief updated from a real reward (e.g. does its current
   *  version pass the verifier / have a suite / is it healthy?). Unlike the
   *  static-genome episodes, this is per-real-tool and discriminative. Returns
   *  the posterior mean per tool so the server can decide which real tools to
   *  repair. One store read/write for the whole batch. */
  async learnRealTools(
    tools: Array<{ name: string; domain?: string; reward: number }>,
  ): Promise<Record<string, number>> {
    if (tools.length === 0) return {};
    const state = await this.loadOrDefault();
    const meta = state.meta;
    const means: Record<string, number> = {};
    for (const t of tools) {
      const key = `real:${t.name}`;
      let b = state.geneBeliefs[key];
      if (!b) {
        b = {
          geneId: key,
          geneName: t.name,
          domain: (t.domain ?? 'coding') as ToolDomain,
          alpha: 1,
          beta: 1,
          attempts: 0,
          meanReward: 0.5,
          weight: 0.5,
          lastEpisode: 0,
        };
      }
      const r = Math.min(1, Math.max(0, Number.isFinite(t.reward) ? t.reward : 0.5));
      b.attempts += 1;
      b.alpha = round4(b.alpha + r);
      b.beta = round4(b.beta + (1 - r));
      b.meanReward = round4(b.meanReward + meta.learningRate * (r - b.meanReward));
      b.weight = b.meanReward;
      b.lastEpisode = state.episode;
      state.geneBeliefs[key] = b;
      means[t.name] = b.meanReward;
    }
    await this.store.saveState(state);
    this.lastReport = {
      episode: state.episode,
      genesEvaluated: tools.length,
      avgReward: Object.values(means).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(means).length),
      calibrationError: state.calibrationError,
      selfScore: state.selfScore,
      meta: { ...state.meta },
      directives: [...state.directives],
      stateHash: state.ledgerHead,
      replayable: true,
    };
    return means;
  }

  /** Re-execute the entire ledger from genesis without persisting, and
   *  prove the hash chain reproduces (or find the divergence point).
   *  Each episode re-runs against the exact external input recorded in its
   *  own ledger entry, so the replay is a true reproduction — not a mock. */
  async replayFromGenesis(): Promise<ReplayReport> {
    const entries = await this.store.listLedger(MAX_REPLAY);
    const stored = await this.loadOrDefault();
    const storedHead = stored.ledgerHead;

    let state = this.makeGenesis();
    let replayedHead = state.ledgerHead;
    let divergedAtEpisode: number | null = null;
    const genes = await this.activeGenes();

    for (let i = 0; i < entries.length; i++) {
      const result = this.execute(state, genes, entries[i].input?.externalScore);
      state = result.state;
      replayedHead = result.entry.stateHash;
      if (
        divergedAtEpisode === null &&
        (result.entry.inputHash !== entries[i].inputHash || result.entry.stateHash !== entries[i].stateHash)
      ) {
        divergedAtEpisode = entries[i].episode;
      }
    }

    return {
      replayed: entries.length,
      divergedAtEpisode,
      matchesHead: divergedAtEpisode === null && replayedHead === storedHead,
      storedHead,
      replayedHead,
    };
  }

  /* ---------------------------- internals --------------------------- */

  private async activeGenes(): Promise<EvalGene[]> {
    const registry = await this.geneRegistry.list();
    // UCB1 exploration: pick genes using upper-confidence-bound so the learner
    // alternates between high-reward and uncertain genes instead of locking
    // onto the first two active ones forever.
    const UCB1_C = Math.sqrt(2); // standard exploration constant
    const state = await this.loadOrDefault();
    const totalEpisodes = Math.max(1, state.episode);

    const scored = registry.map((g) => {
      const belief = state.geneBeliefs[g.id];
      const attempts = belief?.attempts ?? 0;
      const meanReward = belief?.meanReward ?? 0.5;
      const ucb = attempts > 0
        ? meanReward + UCB1_C * Math.sqrt(Math.log(totalEpisodes) / attempts)
        : meanReward + UCB1_C * 10; // high bonus for never-tried genes
      return { gene: g, ucb, attempts, meanReward };
    });

    scored.sort((a, b) => b.ucb - a.ucb);
    const picked = scored.slice(0, Math.max(2, Math.min(4, registry.length)));

    return picked.map(({ gene: g }) => ({
      id: g.id,
      name: g.name,
      domain: g.domain,
      code: g.code,
      vectors: g.testVectors,
      versionHash: g.versionHash,
    }));
  }

  /** Pure-ish core: one episode on a cloned state. No persistence. */
  private execute(
    stateIn: LearnerState,
    genes: EvalGene[],
    externalScore?: number,
  ): { state: LearnerState; entry: LedgerEntry } {
    const state: LearnerState = JSON.parse(JSON.stringify(stateIn));
    state.episode += 1;
    const seedEpisode = (this.seed ^ Math.imul(state.episode, 0x85ebca6b)) >>> 0;
    const meta = state.meta;

    const inputHash = h8(
      stableStringify(genes.map((g) => `${g.id}:${g.versionHash ?? h8(g.code)}`)),
    );

    const evaluated = new Set(genes.map((g) => g.id));
    const predictionErrors: number[] = [];
    const rewards: number[] = [];

    for (const gene of genes) {
      // Reward = the system's REAL measured outcome when the server supplies one
      // (e.g. verifier/benchmark/capability health each tick). Only when no
      // external signal is provided do we fall back to the deterministic
      // property-based (fast-check) scoring over static genome genes — which
      // otherwise pins every belief to ~0 and learns nothing.
      const useExternal = typeof externalScore === 'number' && Number.isFinite(externalScore);
      const reward = useExternal
        ? Math.min(1, Math.max(0, externalScore))
        : scoreGeneWithProperties(gene.code, gene.vectors, seedEpisode).reward;
      rewards.push(reward);

      const belief = state.geneBeliefs[gene.id] ?? {
        geneId: gene.id,
        geneName: gene.name,
        domain: gene.domain,
        alpha: 1,
        beta: 1,
        attempts: 0,
        meanReward: 0.5,
        weight: 0.5,
        lastEpisode: 0,
      };

      const priorMean = belief.alpha / (belief.alpha + belief.beta);
      predictionErrors.push(Math.abs(reward - priorMean));

      // L0: belief update — fractional Beta posterior + EMA reward
      belief.alpha = round4(belief.alpha + reward);
      belief.beta = round4(belief.beta + (1 - reward));
      belief.attempts += 1;
      belief.meanReward = round4(belief.meanReward + meta.learningRate * (reward - belief.meanReward));
      belief.weight = belief.meanReward;
      belief.lastEpisode = state.episode;
      belief.geneName = gene.name;
      state.geneBeliefs[gene.id] = belief;
    }

    // Fold the system's OWN outcome signal (real verifier pass rate, readiness
    // score, etc.) into the learner's calibration and selfScore. No synthetic
    // genes are created for it — it is a direct measurement of the ecosystem.
    if (typeof externalScore === 'number' && Number.isFinite(externalScore)) {
      const clamped = Math.min(1, Math.max(0, externalScore));
      predictionErrors.push(Math.abs(clamped - state.selfScore));
      rewards.push(clamped);
    }

    // Decay genes that were not evaluated this episode
    for (const belief of Object.values(state.geneBeliefs)) {
      if (!evaluated.has(belief.geneId)) {
        belief.weight = round4(belief.weight * (1 - meta.decayFactor * 0.05));
      }
    }

    // L1: meta-learning — the learner rewrites its own hyperparameters
    const calibration = predictionErrors.length
      ? round4(predictionErrors.reduce((a, b) => a + b, 0) / predictionErrors.length)
      : state.calibrationError;
    state.calibrationError = calibration;

    if (predictionErrors.length) {
      if (calibration > 0.15) {
        meta.learningRate = round4(Math.min(0.5, meta.learningRate * 1.1));
      } else {
        meta.learningRate = round4(Math.max(0.05, meta.learningRate * 0.95));
      }
    }

    const entropies = Object.values(state.geneBeliefs)
      .filter((b) => b.attempts > 0)
      .map((b) => betaEntropy(b.alpha, b.beta));
    if (entropies.length) {
      const avgEntropy = entropies.reduce((a, b) => a + b, 0) / entropies.length;
      meta.temperature = round4(clamp(0.2 + avgEntropy, 0.2, 1.5));
    }

    if (predictionErrors.length) {
      state.selfScore = round4(
        clamp(state.selfScore + meta.learningRate * ((1 - calibration) - state.selfScore), 0, 1),
      );
    }

    // L2: directives — recommendations back into the ecosystem
    state.directives = this.deriveDirectives(state);

    // Hash-chain the transition
    const stateHash = h8(stableStringify(canonicalState(state)));
    const entry: LedgerEntry = {
      episode: state.episode,
      prevHash: state.ledgerHead,
      inputHash,
      stateHash,
      input: typeof externalScore === 'number' && Number.isFinite(externalScore)
        ? { externalScore: round4(Math.min(1, Math.max(0, externalScore))) }
        : undefined,
      summary: `episode ${state.episode}: ${genes.length} genes, avg reward ${rewards.length ? round4(rewards.reduce((a, b) => a + b, 0) / rewards.length) : 'n/a'}, calibration ${calibration.toFixed(3)}${typeof externalScore === 'number' && Number.isFinite(externalScore) ? `, external verifier score ${externalScore.toFixed(3)}` : ''}`,
      createdAt: new Date().toISOString(),
    };
    state.ledgerHead = stateHash;
    state.updatedAt = entry.createdAt;

    return { state, entry };
  }

  private deriveDirectives(state: LearnerState): Directive[] {
    const out: Directive[] = [];
    const domainTpls: Record<string, string> = {
      math: 'tpl_newton_raphson',
      coding: 'tpl_lru_cache',
      systemic: 'tpl_merkle_anchor',
      cyber_defense: 'tpl_hmac_sanitizer',
      biotech: 'tpl_protac_optimizer',
      neuro_symbolic: 'tpl_horn_sat',
      quantum_sim: 'tpl_bell_entangler'
    };

    for (const b of Object.values(state.geneBeliefs)) {
      if (b.attempts < 5) continue;
      let kind: Directive['kind'] | null = null;
      let reason = '';
      if (b.weight < 0.25) {
        kind = 'retire';
        reason = `weight ${b.weight.toFixed(2)} below floor after ${b.attempts} evaluations`;
      } else if (b.meanReward < 0.7) {
        kind = 'refine';
        reason = `mean reward ${b.meanReward.toFixed(2)} under stress — request mutator refinement via template`;
      } else if (b.meanReward >= state.meta.promotionThreshold) {
        kind = 'amplify';
        reason = `stable reward ${b.meanReward.toFixed(2)} — propagate pattern into template component building`;
      }
      if (kind) {
        out.push({
          id: `dir_${h8(`${kind}:${b.geneName}`)}`,
          kind,
          geneName: b.geneName,
          reason,
          episode: state.episode,
          templateId: domainTpls[b.domain],
          targetDomain: b.domain,
        });
      }
    }

    // Identify domain gap or quality deficit and emit synthesize_template directives
    const domains: ToolDomain[] = ['coding', 'math', 'biotech', 'systemic', 'cyber_defense', 'neuro_symbolic', 'quantum_sim'];
    for (const d of domains) {
      const domainGenes = Object.values(state.geneBeliefs).filter(b => b.domain === d);
      if (domainGenes.length === 0 || domainGenes.every(b => b.meanReward < 0.6)) {
        out.push({
          id: `dir_${h8(`synth:${d}:${state.episode}`)}`,
          kind: 'synthesize_template',
          geneName: `${d}_template_archetype`,
          reason: `Domain ${d} deficit detected — synthesize internal component template to reinforce ecosystem`,
          episode: state.episode,
          templateId: domainTpls[d] || 'tpl_lru_cache',
          targetDomain: d,
        });
      }
    }

    return out
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.geneName.localeCompare(b.geneName))
      .slice(0, MAX_DIRECTIVES);
  }

  private toReport(state: LearnerState, entry: LedgerEntry, genesEvaluated: number): EpisodeReport {
    const beliefs = Object.values(state.geneBeliefs).filter((b) => b.lastEpisode === state.episode);
    const avgReward = beliefs.length
      ? round4(beliefs.reduce((a, b) => a + b.meanReward, 0) / beliefs.length)
      : 0;
    return {
      episode: state.episode,
      genesEvaluated,
      avgReward,
      calibrationError: state.calibrationError,
      selfScore: state.selfScore,
      meta: { ...state.meta },
      directives: [...state.directives],
      stateHash: entry.stateHash,
      replayable: true,
    };
  }

  private makeGenesis(): LearnerState {
    const meta: MetaParams = {
      learningRate: 0.2,
      temperature: 0.5,
      promotionThreshold: 0.85,
      decayFactor: 0.5,
    };
    return {
      schema: 1,
      episode: 0,
      meta,
      geneBeliefs: {},
      selfScore: 0.5,
      calibrationError: 0.5,
      directives: [],
      ledgerHead: '0'.repeat(8),
      updatedAt: new Date().toISOString(),
    };
  }

  private async loadOrDefault(): Promise<LearnerState> {
    const existing = await this.store.loadState();
    if (existing) return existing;
    const genesis = this.makeGenesis();
    await this.store.saveState(genesis);
    return genesis;
  }
}

/** Normalized Shannon entropy (bits, max 1) of a Beta(a,b) mean. */
function betaEntropy(alpha: number, beta: number): number {
  const p = alpha / (alpha + beta);
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

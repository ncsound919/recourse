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
// ledger; `replayFromGenesis()` re-executes the history it can read and
// reports exactly what it proved: a bit-for-bit reproduction
// (`matchesHead`), a state divergence (`divergedAtEpisode`), an input that
// no longer resolves (`driftAtEpisode`), or an incomplete run (`partial`).
//
// Supabase tables (durable mode):
//   create table if not exists learner_state (
//     id text primary key, state jsonb not null,
//     updated_at timestamptz not null default now());
//   create table if not exists learner_ledger (
//     episode bigint primary key, entry jsonb not null,
//     created_at timestamptz not null default now());

import type { ToolDomain } from '../types';
import { hashString } from './engine';
import { scoreGeneWithProperties } from './property-harness';
import { pruneLearnerBeliefs, type BeliefPruneReport, type PruneOptions } from '../lib/openEnded/gates.js';
import { createGeneRegistryStore } from './mutator';
import { AsyncMutex } from '../lib/asyncMutex';
import fs from 'node:fs';
import path from 'node:path';
import type { GeneRegistryStore } from './mutator';
import type { RegistryGene } from './mutator-types';
import { calibrationReport, isCalibrated } from '../lib/calibration';
import type {
  Directive,
  EpisodeReport,
  LedgerEntry,
  LearnerState,
  MetaParams,
  ReplayReport,
} from './learner-types';

const FORECAST_WINDOW_SIZE = 200;

const MAX_DIRECTIVES = 20;
/** Ledger window a replay may re-execute. The window always starts at
 *  genesis, and a window shorter than the chain is reported as
 *  `partial: true` — never as a verified or diverged chain. The cap exists
 *  because every replayed episode re-clones state and re-derives
 *  directives, so cost grows with chain length. */
const MAX_REPLAY = 2_000;
/** How much an ecosystem-wide `externalScore` moves a single gene's reward.
 *  The signal is system-level: copying it onto every gene makes all posteriors
 *  identical (beliefs stop discriminating), so it only *modulates* the
 *  per-gene property score. */
const EXTERNAL_REWARD_WEIGHT = 0.5;
/** Directive triage order when the list exceeds MAX_DIRECTIVES. */
const DIRECTIVE_SEVERITY: Record<Directive['kind'], number> = {
  retire: 0,
  refine: 1,
  synthesize_template: 2,
  amplify: 3,
};

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
    brierScore: s.brierScore,
    ece: s.ece,
    forecastWindow: s.forecastWindow,
    ledgerHead: s.ledgerHead,
    geneBeliefs: s.geneBeliefs,
    directives: s.directives,
  };
}

interface EvalGene {
  id: string;
  name: string;
  domain: ToolDomain;
  code: string;
  vectors: unknown[];
  versionHash?: string;
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

  /** Serializes every read-modify-write of the durable store: without it two
   *  concurrent episodes both load the same snapshot and the ledger dedupe
   *  drops the loser. */
  private readonly mutex = new AsyncMutex();

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
   *  it is never silently defaulted. It modulates each gene's property score
   *  (see EXTERNAL_REWARD_WEIGHT) instead of replacing it, and is also
   *  forecast separately against `selfScore`. */
  async runEpisode(externalScore?: number): Promise<EpisodeReport> {
    return this.mutex.runExclusive(async () => {
      const state = await this.loadOrDefault();
      const genes = await this.activeGenes();
      const next = this.execute(state, genes, externalScore);
      await this.store.saveState(next.state);
      await this.store.appendLedger(next.entry);
      const report = this.toReport(next.state, next.entry, genes.length);
      this.lastReport = report;
      return report;
    });
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
   *  repair. One store read/write for the whole batch.
   *
   *  `key` is an optional canonical identity (see `canonicalToolKey`) so every
   *  name-variant of one capability compounds onto a single belief. When absent
   *  the raw `name` is used, preserving the original behavior. */
  async learnRealTools(
    tools: Array<{ name: string; domain?: string; reward: number; key?: string }>,
  ): Promise<Record<string, number>> {
    return this.mutex.runExclusive(() => this.learnRealToolsUnlocked(tools));
  }

  private async learnRealToolsUnlocked(
    tools: Array<{ name: string; domain?: string; reward: number; key?: string }>,
  ): Promise<Record<string, number>> {
    if (tools.length === 0) return {};
    const state = await this.loadOrDefault();
    const meta = state.meta;
    const means: Record<string, number> = {};
    for (const t of tools) {
      const key = `real:${t.key ?? t.name}`;
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
      brierScore: state.brierScore,
      ece: state.ece,
      meta: { ...state.meta },
      directives: [...state.directives],
      stateHash: state.ledgerHead,
      replayable: true,
    };
    return means;
  }

  /** Merge behavioral-duplicate gene beliefs (same capability under different
   *  hex suffixes / casing / scaffold prefixes) and optionally retire beliefs
   *  below an explicit noise floor. Pure merge in `openEnded/gates`; this
   *  method applies it to the durable state and returns the before/after
   *  report. Nothing is dropped unless it is provably a duplicate or clears the
   *  supplied floor. */
  async pruneBeliefs(opts: PruneOptions = {}): Promise<BeliefPruneReport> {
    return this.mutex.runExclusive(() => this.pruneBeliefsUnlocked(opts));
  }

  private async pruneBeliefsUnlocked(opts: PruneOptions = {}): Promise<BeliefPruneReport> {
    const state = await this.loadOrDefault();
    const { state: next, report } = pruneLearnerBeliefs(state as unknown as Parameters<typeof pruneLearnerBeliefs>[0], opts);
    await this.store.saveState(next as unknown as LearnerState);
    return report;
  }

  /** Re-execute the ledger from genesis without persisting, and report
   *  exactly what that replay proved. Each episode re-runs against the gene
   *  set and external input recorded in its own ledger entry (falling back
   *  to the current selection for pre-`input.genes` entries). The report is
   *  `partial` whenever the window or the registry makes a full reproduction
   *  impossible — `matchesHead` is only true for a complete, undrifted run. */
  async replayFromGenesis(): Promise<ReplayReport> {
    return this.mutex.runExclusive(() => this.replayFromGenesisUnlocked());
  }

  private async replayFromGenesisUnlocked(): Promise<ReplayReport> {
    const stored = await this.loadOrDefault();
    const totalEpisodes = stored.episode;
    const entries = await this.store.listLedger(MAX_REPLAY);
    const storedHead = stored.ledgerHead;

    let state = this.makeGenesis();
    let replayedHead = state.ledgerHead;
    let divergedAtEpisode: number | null = null;
    let driftAtEpisode: number | null = null;
    const fallbackGenes = await this.activeGenes();
    const registry = await this.geneRegistry.list();
    const byId = new Map(registry.map((g) => [g.id, g]));

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const genes = replayGenes(entry, fallbackGenes, byId);
      const result = this.execute(state, genes, entry.input?.externalScore);
      state = result.state;
      replayedHead = result.entry.stateHash;
      if (result.entry.inputHash !== entry.inputHash) {
        // inputHash covers only the evaluated gene set, so a mismatch means
        // the recorded input no longer resolves — drift, not corruption.
        if (driftAtEpisode === null) driftAtEpisode = entry.episode;
      } else if (result.entry.stateHash !== entry.stateHash && divergedAtEpisode === null) {
        divergedAtEpisode = entry.episode;
      }
    }

    const partial = entries.length < totalEpisodes || driftAtEpisode !== null;
    return {
      replayed: entries.length,
      totalEpisodes,
      partial,
      driftAtEpisode,
      divergedAtEpisode,
      matchesHead: !partial && divergedAtEpisode === null && replayedHead === storedHead,
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
    const episodeForecasts: Array<{ predicted: number; realized: number }> = [];

    for (const gene of genes) {
      const useExternal = typeof externalScore === 'number' && Number.isFinite(externalScore);
      const external = useExternal ? Math.min(1, Math.max(0, externalScore!)) : null;
      const intrinsic = Array.isArray(gene.vectors) && gene.vectors.length > 0
        ? scoreGeneWithProperties(gene.code, gene.vectors, seedEpisode).reward
        : null;
      // Blend, never overwrite: a system-wide score applied verbatim to every
      // gene gives all of them the same posterior, so beliefs can no longer
      // rank genes against each other.
      const reward = intrinsic === null
        ? (external ?? 0.5)
        : external === null
          ? intrinsic
          : round4((1 - EXTERNAL_REWARD_WEIGHT) * intrinsic + EXTERNAL_REWARD_WEIGHT * external);
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
      episodeForecasts.push({ predicted: round4(priorMean), realized: round4(reward) });

      belief.alpha = round4(belief.alpha + reward);
      belief.beta = round4(belief.beta + (1 - reward));
      belief.attempts += 1;
      belief.meanReward = round4(belief.meanReward + meta.learningRate * (reward - belief.meanReward));
      belief.weight = belief.meanReward;
      belief.lastEpisode = state.episode;
      belief.geneName = gene.name;
      state.geneBeliefs[gene.id] = belief;
    }

    if (typeof externalScore === 'number' && Number.isFinite(externalScore)) {
      const clamped = Math.min(1, Math.max(0, externalScore));
      predictionErrors.push(Math.abs(clamped - state.selfScore));
      rewards.push(clamped);
      episodeForecasts.push({ predicted: round4(state.selfScore), realized: round4(clamped) });
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

    // Rolling forecast window for Brier/ECE computation
    state.forecastWindow.push(...episodeForecasts);
    if (state.forecastWindow.length > FORECAST_WINDOW_SIZE) {
      state.forecastWindow = state.forecastWindow.slice(-FORECAST_WINDOW_SIZE);
    }

    const calReport = calibrationReport(state.forecastWindow);
    state.brierScore = calReport.brier;
    state.ece = calReport.ece;

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
      input: {
        genes: genes.map((g) => ({ id: g.id, versionHash: g.versionHash })),
        externalScore: typeof externalScore === 'number' && Number.isFinite(externalScore)
          ? round4(Math.min(1, Math.max(0, externalScore)))
          : undefined,
      },
      forecasts: episodeForecasts.length > 0 ? episodeForecasts : undefined,
      summary: `episode ${state.episode}: ${genes.length} genes, avg reward ${rewards.length ? round4(rewards.reduce((a, b) => a + b, 0) / rewards.length) : 'n/a'}, calibration ${calibration.toFixed(3)}, ECE ${state.ece.toFixed(3)}, Brier ${state.brierScore.toFixed(3)}${typeof externalScore === 'number' && Number.isFinite(externalScore) ? `, external verifier score ${externalScore.toFixed(3)}` : ''}`,
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

    const calGateActive = state.meta.calibrationGate > 0;
    const calTrusted = isCalibrated(
      { brier: state.brierScore, ece: state.ece, mae: state.calibrationError, bins: [], n: state.forecastWindow.length },
      state.meta.minForecasts,
      state.meta.calibrationGate,
    );

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
        if (calGateActive && !calTrusted) {
          kind = 'refine';
          reason = `mean reward ${b.meanReward.toFixed(2)} meets threshold but learner not calibrated (ECE ${state.ece.toFixed(3)} > ${state.meta.calibrationGate}) — defer promotion`;
        } else {
          kind = 'amplify';
          reason = `stable reward ${b.meanReward.toFixed(2)} — propagate pattern into template component building`;
        }
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
      if (domainGenes.every(b => b.meanReward < 0.6)) {
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

    // Severity first: when the cap bites, act on the worst genes before
    // spending budget on propagating already-good ones.
    return out
      .sort((a, b) => (DIRECTIVE_SEVERITY[a.kind] - DIRECTIVE_SEVERITY[b.kind]) || a.geneName.localeCompare(b.geneName))
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
      brierScore: state.brierScore,
      ece: state.ece,
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
      calibrationGate: 0.20,
      minForecasts: 10,
    };
    return {
      schema: 1,
      episode: 0,
      meta,
      geneBeliefs: {},
      selfScore: 0.5,
      calibrationError: 0.5,
      brierScore: 0,
      ece: 0.5,
      forecastWindow: [],
      directives: [],
      ledgerHead: '0'.repeat(8),
      updatedAt: new Date().toISOString(),
    };
  }

  private async loadOrDefault(): Promise<LearnerState> {
    const existing = await this.store.loadState();
    if (!existing) {
      const genesis = this.makeGenesis();
      await this.store.saveState(genesis);
      return genesis;
    }
    const { state, changed } = this.migrateState(existing);
    if (changed) await this.store.saveState(state);
    return state;
  }

  /** Backfill fields a stored state may predate. `execute()` pushes onto
   *  `state.forecastWindow` unconditionally, so a save written before that
   *  field existed (or a truncated/partial write) threw on the very first
   *  episode and the learner never advanced past the episode it loaded with.
   *  Repair on load instead of crashing; the repair is persisted once. */
  private migrateState(raw: LearnerState): { state: LearnerState; changed: boolean } {
    const genesis = this.makeGenesis();
    let changed = false;
    const state = { ...genesis, ...raw } as LearnerState;

    const meta = { ...genesis.meta, ...((raw.meta ?? {}) as Partial<MetaParams>) } as MetaParams;
    for (const key of Object.keys(genesis.meta) as Array<keyof MetaParams>) {
      if (!Number.isFinite(raw.meta?.[key])) { meta[key] = genesis.meta[key]; changed = true; }
    }
    state.meta = meta;

    if (!Array.isArray(raw.forecastWindow)) { state.forecastWindow = []; changed = true; }
    if (!raw.geneBeliefs || typeof raw.geneBeliefs !== 'object') { state.geneBeliefs = {}; changed = true; }
    if (!Array.isArray(raw.directives)) { state.directives = []; changed = true; }

    if (!Number.isFinite(raw.selfScore)) { state.selfScore = genesis.selfScore; changed = true; }
    if (!Number.isFinite(raw.calibrationError)) { state.calibrationError = genesis.calibrationError; changed = true; }
    if (!Number.isFinite(raw.brierScore)) { state.brierScore = genesis.brierScore; changed = true; }
    if (!Number.isFinite(raw.ece)) { state.ece = genesis.ece; changed = true; }
    if (!Number.isFinite(raw.episode) || raw.episode < 0) { state.episode = genesis.episode; changed = true; }
    if (typeof raw.ledgerHead !== 'string') { state.ledgerHead = genesis.ledgerHead; changed = true; }

    return { state, changed };
  }
}

/** Rebuild the gene set an episode was recorded against. Entries written
 *  before `input.genes` existed fall back to the current selection, in which
 *  case the inputHash comparison reports the resulting drift. Genes that have
 *  since been removed are skipped, so their absence shows up as drift rather
 *  than silently substituting a different gene. */
function replayGenes(
  entry: LedgerEntry,
  fallback: EvalGene[],
  byId: Map<string, RegistryGene>,
): EvalGene[] {
  const recorded = entry.input?.genes;
  if (!Array.isArray(recorded) || recorded.length === 0) return fallback;
  const genes: EvalGene[] = [];
  for (const rec of recorded) {
    const g = byId.get(rec.id);
    if (!g) continue;
    genes.push({
      id: g.id,
      name: g.name,
      domain: g.domain,
      code: g.code,
      vectors: g.testVectors,
      versionHash: g.versionHash,
    });
  }
  return genes;
}

/** Normalized Shannon entropy (bits, max 1) of a Beta(a,b) mean. */
function betaEntropy(alpha: number, beta: number): number {
  const p = alpha / (alpha + beta);
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

// src/dream/engine.ts — Always-On Dreaming Engine.
// Rule-based genome operations remain deterministic and replayable, and the
// engine can additionally be given a MODEL GENERATOR (an open-source local
// model). When the generator is configured and reachable, REM cycles produce
// thoughts whose premise/hypothesis/code come from the model; those thoughts
// only ever promote after their code passes the REAL sandbox verifier. When
// the model is offline the engine falls back to rule-based drafts and tags
// every thought with its true origin (`local_model` vs `rule_based`).

import type {
  CrystallizedTool,
  DreamPhase,
  DreamState,
  DreamThought,
  InvariantCheck,
  TickResult,
  ToolDomain,
} from './types';
import { isNovelHypothesis, normalizeHypothesis } from '../lib/honestyMetrics';
import {
  compileGenome,
  compileGenomeModule,
  crossGenomes,
  generateGenome,
  geneVectors,
  mutateGenome,
  verifyGenome,
} from './genomes';
import { executeTestSuite } from '../lib/executionSandbox';
import { reconcileDreamRegistry, type ReconcileReport } from './reconcileRegistry';
import { AsyncMutex } from '../lib/asyncMutex';
import { recordStage } from '../lib/acceptance';
import { compileGeneIr, irStats, mutateIr, seedIrGenes, validateIr, verifyIrGene } from './ast-genes';
import type { DreamStore } from './store';

/** A request to the dream model generator. */
export interface DreamGeneratorInput {
  phase: DreamPhase;
  domain: ToolDomain;
  tick: number;
  recentHypotheses: string[];
}

/** The model's answer: a premise, a falsifiable hypothesis, and — crucially —
 *  a real plain-JS implementation plus assert tests. A null return means the
 *  generator is unavailable/offline and the engine falls back to rules. */
export interface DreamGeneratorResult {
  premise: string;
  hypothesis: string;
  sourceCode: string;
  testSuiteCode: string;
}

export type DreamGenerator = (
  input: DreamGeneratorInput,
) => Promise<DreamGeneratorResult | null>;

/** Result of one bounded offline precompute step (sleep-time compute). */
export interface SleepComputeStep {
  attempted: number;
  ready: number;
  note: string;
}

/** Real signals that the dream engine consumes on every tick. */
export interface DreamSignalProvider {
  readinessScore(): number;     // from math engine
  // null = the source has no reading yet (reported as null, never invented).
  legoAssemblyCount(): number | null; // from lego engine registry
  learnerEpisode(): number | null;    // from learner
  learnerCalibration(): number | null; // from learner
  /** P1: run one bounded sleep-time-compute unit during memory consolidation
   *  (offline precompute of verified artifacts). Absent => consolidation
   *  behaves exactly as before. */
  sleepCompute?(): SleepComputeStep | Promise<SleepComputeStep>;
}

/* ---------------------------- seeded RNG ---------------------------- */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Map sandbox `testDetails` lines into invariant checks.
 *  Assertion lines are `[PASS] …` / `[FAIL] …`, but the in-process runner also
 *  emits informational notes (`✓ Static syntax analysis passed…`) that are NOT
 *  assertions. The old rule (`passed: d.startsWith('[PASS]')`) therefore marked
 *  every informational line as a FAILED invariant — a verified gene was stored
 *  carrying `passed:false` checks, which also biased `recomputeCoherence`. */
export function assertionChecks(details: string[] | undefined): InvariantCheck[] {
  const out: InvariantCheck[] = [];
  for (const d of details ?? []) {
    if (d.startsWith('[PASS]')) {
      out.push({ name: d.slice(0, 80), passed: true });
    } else if (d.startsWith('[FAIL]') || d.startsWith('[COMPILATION ERROR]') || /timed out/i.test(d)) {
      out.push({ name: d.slice(0, 80), passed: false, detail: d.slice(0, 200) });
    }
    // Any other line is an informational note, not an assertion: it is neither
    // a pass nor a fail and must not be counted as an invariant.
  }
  return out;
}

/* --------------------------- engine config -------------------------- */

const PHASE_ORDER: DreamPhase[] = [
  'rem_counterfactual_sim',
  'synaptic_pruning',
  'cross_pollination',
  'theorem_induction',
  'lucid_crystallization',
  'memory_consolidation',
];

const DOMAINS: ToolDomain[] = [
  'math', 'coding', 'biotech', 'systemic',
  'neuro_symbolic', 'cyber_defense', 'quantum_sim',
];

const POOL_LIMIT = 32;     // hard cap on live thoughts
const AUTO_PROMOTE_THRESHOLD = 0.9;

const REM_OPERATORS = [
  { key: 'counterfactual_inversion', label: 'Counterfactual inversion of a core assumption' },
  { key: 'edge_case_stress', label: 'Edge-case stress at input boundaries' },
  { key: 'parameter_mutation', label: 'Parameter-space mutation of the gene blueprint' },
];

/**
 * Probability that a REM thought is drawn from the typed-IR gene pool instead of
 * the free-form genome. Deliberately a minority: the IR representation is a
 * second, structurally different way to express a gene, and both must survive
 * the same verify-then-crystallize contract. A draw that does not verify returns
 * no thought at all, so this can only slow the phase, never weaken it.
 */
const IR_GENE_DRAW_RATE = 0.25;
const IR_SEEDS = seedIrGenes();

/**
 * A private RNG for the IR branch, derived from (seed, tick, index).
 *
 * The phase's main `rng` stream is NOT touched. Several tests pin the exact
 * provenance sequence a seeded engine produces; consuming one extra draw from
 * `rng` to decide the branch shifts every subsequent draw and changes all of
 * them. Deriving separately keeps the free-form path bit-identical.
 */
function irRng(seed: number, tick: number, index: number): () => number {
  let a = (seed ^ Math.imul(tick + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEXICON: Record<ToolDomain, { premises: string[]; hypotheses: string[] }> = {
  math: {
    premises: [
      'Extrapolation drift is unbounded past the sample support edge',
      'Interpolation denominators collapse silently on near-duplicate knots',
    ],
    hypotheses: [
      'A clamped Lagrange basis with epsilon-guarded denominators keeps out-of-support drift bounded and replay-stable',
      'Guarded-basis interpolation degrades gracefully instead of returning Infinity on degenerate inputs',
    ],
  },
  coding: {
    premises: [
      'Cyclomatic pressure predicts defect density better than raw line count',
      'Review latency grows superlinearly with branch times nesting depth',
    ],
    hypotheses: [
      'A capped branch/loop pressure score separates risky diffs from noise with a hard upper bound',
      'A monotonic pressure scorer never penalizes a simplification',
    ],
  },
  biotech: {
    premises: [
      'GC skew localizes the replication origin in bacterial genomes',
      'Sequence composition drift signals assembly contamination',
    ],
    hypotheses: [
      'A windowed GC-skew analyzer flags origin-proximal regions without external dependencies',
      'Composition bias above the neutral baseline predicts misassembled contigs',
    ],
  },
  systemic: {
    premises: [
      'Queue saturation arrives earlier than mean-based alerts predict',
      'Growth-compounded load crosses the saturation cap within a bounded horizon',
    ],
    hypotheses: [
      'A capped utilization projector with steps-to-saturation gives an actionable early warning',
      'Explicit saturation step counts beat threshold alarms for capacity planning',
    ],
  },
  neuro_symbolic: {
    premises: [
      'Token entropy collapses before a model degenerates into repetition',
      'Smoothed entropy stays finite when rare tokens hit zero counts',
    ],
    hypotheses: [
      'A floor-smoothed entropy scorer detects degeneration without NaN propagation',
      'Entropy delta across windows is a cheaper repetition signal than n-gram overlap',
    ],
  },
  cyber_defense: {
    premises: [
      'Static z-score thresholds misfire on low-sample telemetry',
      'Insufficient baselines produce false negatives rather than false positives',
    ],
    hypotheses: [
      'A min-sample guarded z-gate suppresses alerts until the baseline is statistically meaningful',
      'Explicit insufficient-data states eliminate silent zero-pass filtering',
    ],
  },
  quantum_sim: {
    premises: [
      'Gate-count fidelity decay dominates coherence time in shallow circuits',
      'Per-gate penalty compounds multiplicatively, not additively',
    ],
    hypotheses: [
      'A multiplicative per-gate fidelity decayer bounds circuit depth for a target fidelity',
      'Zero-gate circuits must preserve base fidelity exactly to validate the model',
    ],
  },
};

/* ------------------------------ helpers ----------------------------- */

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Share of a thought's invariant checks that actually passed. 0 when there is
 *  nothing to check: an unverified thought has no evidence, which is not the
 *  same as half-good evidence. */
function checkPassRate(checks: InvariantCheck[] | undefined): number {
  if (!checks || !checks.length) return 0;
  return checks.filter((c) => c.passed).length / checks.length;
}

/**
 * Crystallization readiness, derived from the real verification verdict.
 *
 * This used to be `0.5 + rng() * 0.2` for a verified genome and
 * `0.25 + rng() * 0.1` otherwise — a seeded random number presented as a
 * measure of how ready a thought is to become a gene. Two thoughts with
 * different evidence could land on the same number, and the same evidence could
 * land on different numbers after a re-seed.
 *
 * The verdict dominates and the check ratio only breaks ties among failures: a
 * thought can fail verification while most of its individual checks are green
 * (one failed invariant is enough), and a failure must never out-score a pass.
 * `phaseTheoremInduction` still raises or lowers readiness as further
 * verification accumulates, and `AUTO_PROMOTE_THRESHOLD` is still the gate.
 */
function readinessFromChecks(checks: InvariantCheck[] | undefined, verified: boolean): number {
  return verified ? round2(0.6) : round2(0.2 + 0.15 * checkPassRate(checks));
}

/**
 * Thought intensity: how strongly the stream should hold on to the thought and
 * how much attention it earns. Grounded in the same verdict, with a small
 * credit for a thought fused from two proven lineages.
 *
 * Was `0.55 + rng() * 0.4` — a draw, not a signal. The floor (0.5) stays above
 * the 0.45 theorem-induction threshold so an unverified thought is still
 * re-tested instead of being starved of the verification it needs.
 */
function intensityFromChecks(
  checks: InvariantCheck[] | undefined,
  verified: boolean,
  parentIds: string[],
): number {
  const hybridCredit = parentIds.length > 1 ? 0.05 : 0;
  if (verified) return round2(Math.min(0.95, 0.85 + hybridCredit));
  return round2(0.5 + 0.15 * checkPassRate(checks) + hybridCredit);
}

/** How much a thought fades in one pruning pass, from its evidence rather than
 *  a die roll: a fully verified thought barely dims, an unverified one fades
 *  fastest so it stops occupying attention it has not earned. */
function decayFactor(checks: InvariantCheck[] | undefined): number {
  return round2(0.7 + 0.27 * checkPassRate(checks));
}
const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

function pickWeightedByIntensity(thoughts: DreamThought[], rng: () => number): DreamThought {
  const ranked = [...thoughts].sort((a, b) => b.intensity - a.intensity);
  return pick(rng, ranked.slice(0, Math.min(5, ranked.length)));
}

/* ------------------------------- engine ----------------------------- */

export class DreamingEngine {
  /** Serializes read-modify-write of the dream store so concurrent ticks
   *  (HTTP, cron, heartbeat) cannot clobber one another. */
  private readonly mutex = new AsyncMutex();

  constructor(
    private store: DreamStore,
    private baseSeed = 0x5eed0001 >>> 0,
    private generator?: DreamGenerator,
    private signals?: DreamSignalProvider,
  ) {}

  async status(): Promise<DreamState> {
    return this.loadOrDefault();
  }

  async toggle(): Promise<boolean> {
    return this.mutex.runExclusive(() => this.toggleUnlocked());
  }

  private async toggleUnlocked(): Promise<boolean> {
    const s = await this.loadOrDefault();
    s.isDreamingActive = !s.isDreamingActive;
    await this.store.save(s);
    return s.isDreamingActive;
  }

  /** Advance the engine exactly one phase. Deterministic given (seed, tick). */
  async tick(): Promise<TickResult> {
    return this.mutex.runExclusive(() => this.tickUnlocked());
  }

  private async tickUnlocked(): Promise<TickResult> {
    const s = await this.loadOrDefault();
    s.tick += 1;
    const rng = mulberry32((this.baseSeed ^ Math.imul(s.tick, 0x9e3779b1)) >>> 0);

    if (!PHASE_ORDER.includes(s.currentPhase)) s.currentPhase = PHASE_ORDER[0];

    let newThought: DreamThought | null = null;
    let phaseReport = '';

    switch (s.currentPhase) {
      case 'rem_counterfactual_sim': {
        // Prefer the configured provider model: premise/hypothesis/code from the LLM,
        // still gated by real sandbox verification before it can ever promote.
        const modelThought = await this.tryModelThought(s);
        if (modelThought && isNovelHypothesis(modelThought.hypothesis, s.recentThoughts)) {
          s.recentThoughts.unshift(modelThought);
          newThought = modelThought;
          phaseReport = `REM: model proposed "${modelThought.hypothesis.slice(0, 60)}${modelThought.hypothesis.length > 60 ? '...' : ''}" (${modelThought.origin === 'api_model' ? 'API model' : modelThought.origin === 'local_model' ? 'local model' : 'draft'})`;
        } else if (modelThought) {
          // P1.5 novelty gate: a repeated hypothesis is not a new thought. The
          // model re-deriving the same idea is a loop, not discovery — say so.
          phaseReport = `REM: model proposal repeated a recent hypothesis — not added (novelty gate)`;
        } else {
          const created = this.phaseRem(s, rng);
          newThought = created[0] ?? null;
          phaseReport = `REM simulated ${created.length} counterfactual mutation${created.length === 1 ? '' : 's'} (model offline or declined; rule-based)`;
        }
        break;
      }
      case 'synaptic_pruning': {
        const pruned = this.phasePruning(s);
        phaseReport = `Pruning eliminated ${pruned} low-intensity thought path${pruned === 1 ? '' : 's'}`;
        break;
      }
      case 'cross_pollination': {
        const created = this.phaseCrossPollination(s, rng);
        newThought = created[0] ?? null;
        phaseReport = created.length
          ? `Cross-pollinated a ${created[0].domain} gene with transplanted parameters`
          : 'No viable cross-domain pair found this cycle';
        break;
      }
      case 'theorem_induction': {
        const upgraded = this.phaseTheoremInduction(s);
        phaseReport = `Theorem induction verified ${upgraded.length} thought${upgraded.length === 1 ? '' : 's'}`;
        break;
      }
      case 'lucid_crystallization': {
        const tools = this.phaseLucid(s);
        phaseReport = tools.length
          ? `Auto-promoted ${tools.length} verified gene${tools.length === 1 ? '' : 's'}: ${tools.map((t) => t.name).join(', ')}`
          : 'No thoughts at >=90% readiness for auto-promotion';
        break;
      }
      case 'memory_consolidation': {
        phaseReport = await this.phaseMemoryConsolidation(s);
        break;
      }
      default:
        phaseReport = 'Idle reset';
    }

    const idx = PHASE_ORDER.indexOf(s.currentPhase);
    s.currentPhase = PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
    if (idx === PHASE_ORDER.length - 1) {
      s.dreamCyclesCompleted += 1;
      // Acceptance evidence: a full dream cycle genuinely completed and was
      // persisted. A partial walk through the phases is not dreaming, so this is
      // recorded only on the wrap that increments the cycle counter.
      try {
        recordStage(
          'dream',
          `dream cycle ${s.dreamCyclesCompleted} completed through ${PHASE_ORDER.length} phases; coherence ${(s.cognitiveCoherence ?? 0).toFixed(3)}`,
        );
      } catch {
        /* recording must never fail a dream tick */
      }
    }

    this.recomputeCoherence(s);
    s.lastTickAt = new Date().toISOString();
    this.trimStream(s);
    await this.store.save(s);

    return { dreamState: s, newThought, phaseReport };
  }

  /** Catch-up driver for cron: run however many ticks elapsed since the
   *  last one (capped), so infrequent schedulers still advance the dream. */
  async runCatchUpTicks(maxTicks: number): Promise<{ ticks: number; reports: string[]; dreamState: DreamState }> {
    return this.mutex.runExclusive(() => this.runCatchUpTicksUnlocked(maxTicks));
  }

  private async runCatchUpTicksUnlocked(maxTicks: number): Promise<{ ticks: number; reports: string[]; dreamState: DreamState }> {
    const s = await this.loadOrDefault();
    if (!s.isDreamingActive) return { ticks: 0, reports: ['dreaming inactive — skipped'], dreamState: s };
    const elapsedMin = s.lastTickAt ? (Date.now() - Date.parse(s.lastTickAt)) / 60000 : 1;
    const ticks = Math.max(1, Math.min(maxTicks, Math.floor(elapsedMin)));
    const reports: string[] = [];
    let last: TickResult | null = null;
    for (let i = 0; i < ticks; i++) {
      last = await this.tickUnlocked();
      reports.push(`tick ${last.dreamState.tick}: ${last.phaseReport}`);
    }
    return { ticks, reports, dreamState: (last ?? { dreamState: s }).dreamState };
  }

  /** Manual lucid crystallization — the UI's "crystallize" button. */
  async crystallize(
    thoughtId: string,
  ): Promise<{ success: boolean; crystallizedTool?: CrystallizedTool; error?: string; dreamState: DreamState }> {
    return this.mutex.runExclusive(() => this.crystallizeUnlocked(thoughtId));
  }

  private async crystallizeUnlocked(
    thoughtId: string,
  ): Promise<{ success: boolean; crystallizedTool?: CrystallizedTool; error?: string; dreamState: DreamState }> {
    const s = await this.loadOrDefault();
    const t = s.recentThoughts.find((x) => x.id === thoughtId);
    if (!t) return { success: false, error: 'Thought not found in stream', dreamState: s };
    const tool = this.promote(s, t);
    this.recomputeCoherence(s);
    await this.store.save(s);
    if (!tool) {
      return { success: false, error: 'Sandbox verification failed — gene not promoted', dreamState: s };
    }
    return { success: true, crystallizedTool: tool, dreamState: s };
  }

  /**
   * Re-verify the whole dream registry against today's verifier and persist the
   * corrected verdicts. Genes crystallized before `promote()` stopped writing a
   * literal `verified: true` carry a claim nothing re-confirms; this replaces it
   * with a real sandbox result (downgrading where the gene no longer verifies).
   * Serialized with the phase lock so it cannot interleave with a dream tick.
   */
  async reconcileRegistry(): Promise<{ dreamState: DreamState; report: ReconcileReport }> {
    return this.mutex.runExclusive(async () => {
      const s = await this.loadOrDefault();
      const { registry, report } = reconcileDreamRegistry(s.registry ?? []);
      s.registry = registry;
      s.totalCrystallizedGenes = registry.length;
      this.recomputeCoherence(s);
      await this.store.save(s);
      return { dreamState: s, report };
    });
  }

  /* --------------------------- phase logic -------------------------- */

  private phaseRem(s: DreamState, rng: () => number): DreamThought[] {
    const created: DreamThought[] = [];
    const n = 1 + Math.floor(rng() * 2); // 1-2 mutations per REM phase
    for (let i = 0; i < n; i++) {
      const domain = pick(rng, DOMAINS);
      // Occasionally draw from the typed-IR gene pool instead of the free-form
      // genome. The IR genes are a structurally different representation with
      // the same verify-then-crystallize contract, so a thought that survives
      // this path is proven by the same sandbox verdict as any other. They were
      // a fully-implemented module nothing reached, which meant the typed
      // representation contributed zero genes.
      //
      // The branch decision and the mutation both draw from `irRng`, never from
      // `rng`, so the free-form path is bit-identical to before.
      const irDraw = irRng(s.seed, s.tick, i);
      if (irDraw() < IR_GENE_DRAW_RATE) {
        const irThought = this.buildIrThought(s, irDraw, domain);
        if (irThought) {
          created.push(irThought);
          continue;
        }
      }
      let genome = generateGenome(domain, rng);
      const parent = s.recentThoughts.length ? pickWeightedByIntensity(s.recentThoughts, rng) : null;
      if (parent?.genome && parent.domain === domain && rng() < 0.6) {
        genome = mutateGenome(parent.genome, rng);
      }
      const op = pick(rng, REM_OPERATORS);
      const t = this.buildThought(s, rng, domain, genome, [op.key, ...(parent ? [`mutated:${parent.id}`] : ['genesis_seed'])], parent ? [parent.id] : []);
      created.push(t);
    }
    s.recentThoughts.unshift(...created);
    return created;
  }

  /**
   * Build one thought from the typed-IR gene pool: draw a seed or mutate the
   * previous IR thought in this domain, VERIFY it through the real sandbox, and
   * return null when it does not pass. A thought is only ever created from a
   * verified gene, so the readiness numbers below are measurements.
   */
  private buildIrThought(s: DreamState, rng: () => number, domain: ToolDomain): DreamThought | null {
    const parentIr = s.recentThoughts.find(
      (t) => t.domain === domain && t.irSpec !== undefined,
    )?.irSpec;
    // Seeds carry their own vectors; a mutated spec keeps its parent's, so the
    // invariant checks below are exercised on inputs that already shaped it.
    const seed = IR_SEEDS.find((sd) => sd.spec.domain === domain);
    const spec = parentIr && rng() < 0.6 ? mutateIr(parentIr, rng) : (seed ?? IR_SEEDS[0]).spec;
    const vectors = parentIr ? (s.recentThoughts.find((t) => t.irSpec === parentIr)?.irVectors ?? seed?.vectors ?? []) : (seed?.vectors ?? []);
    if (vectors.length === 0) return null;
    const problems = validateIr(spec);
    if (problems.length > 0) return null;
    const verification = verifyIrGene(spec, vectors);
    if (!verification.verified) return null;
    const stats = irStats(spec);
    const id = `dt_${hashString(`ir:${domain}:${spec.name}:${stats.nodes}:${s.tick}`).toString(16).padStart(8, '0').slice(0, 10)}`;
    return {
      id,
      phase: s.currentPhase,
      domain,
      premise: `Typed-IR gene ${spec.name} over ${spec.fields.map((f) => f.name).join(', ')}`,
      hypothesis: `A typed-IR expression of ${spec.name} satisfies its determinism and finiteness invariants`,
      simulatedOutcome: verification.summary,
      intensity: intensityFromChecks(verification.checks, true, []),
      crystallizationReadiness: readinessFromChecks(verification.checks, true),
      abstractGenomeDraft: compileGeneIr(spec),
      irSpec: spec,
      irVectors: vectors,
      origin: 'rule_based',
      invariantChecks: verification.checks,
      provenance: ['typed_ir_gene', parentIr ? `mutated:${spec.name}` : 'ir_seed'],
      createdAt: new Date().toISOString(),
      tick: s.tick,
    };
  }

  private phasePruning(s: DreamState): number {
    // Decay is proportional to how much evidence the thought still has, not a
    // seeded draw: the old `intensity * (0.82 + rng() * 0.06)` dimmed a fully
    // verified gene and an unverified draft by the same random amount.
    for (const t of s.recentThoughts) {
      t.intensity = round2(t.intensity * decayFactor(t.invariantChecks));
    }
    const before = s.recentThoughts.length;
    s.recentThoughts = s.recentThoughts.filter(
      (t) => t.intensity >= 0.18 || t.crystallizationReadiness >= 0.5,
    );
    const pruned = before - s.recentThoughts.length;
    s.prunedCount += pruned;
    return pruned;
  }

  private phaseCrossPollination(s: DreamState, rng: () => number): DreamThought[] {
    if (s.recentThoughts.length < 2) return [];
    const a = pick(rng, s.recentThoughts);
    let b = pick(rng, s.recentThoughts);
    let guard = 0;
    while (b.domain === a.domain && guard++ < 8) b = pick(rng, s.recentThoughts);
    if (b.domain === a.domain || !a.genome || !b.genome) return [];
    const hybrid = crossGenomes(a.genome, b.genome, rng);
    const t = this.buildThought(s, rng, a.domain, hybrid, ['cross_pollination', `base:${a.id}`, `transplant:${b.id}`], [a.id, b.id]);
    s.recentThoughts.unshift(t);
    return [t];
  }

  private phaseTheoremInduction(s: DreamState): DreamThought[] {
    const upgraded: DreamThought[] = [];
    for (const t of s.recentThoughts) {
      if (t.intensity < 0.45) continue;
      // Real verification, per thought type: arbitrary model code runs through
      // the honest sandbox verifier; rule genomes run their invariant checks.
      const v = this.verifyThought(t);
      t.invariantChecks = v.checks;
      t.simulatedOutcome = v.summary;
      if (v.verified) {
        t.crystallizationReadiness = round2(Math.min(0.95, t.crystallizationReadiness + 0.12));
        upgraded.push(t);
      } else {
        t.crystallizationReadiness = round2(Math.max(0.05, t.crystallizationReadiness - 0.1));
      }
    }
    return upgraded;
  }

  /** Verify a thought's code if it carries code, otherwise its genome. */
  private verifyThought(t: DreamThought): { verified: boolean; checks: DreamThought['invariantChecks']; summary: string } {
    if (t.code && t.codeTests) {
      const run = executeTestSuite(t.code, t.codeTests);
      const checks = assertionChecks(run.testDetails);
      return {
        verified: run.passed,
        checks,
        summary: run.passed
          ? `model code passed real sandbox (${checks.filter((c) => c.passed).length} asserts)`
          : `model code FAILED real sandbox: ${run.testDetails.find((d) => d.startsWith('[FAIL]')) || 'unknown'}`,
      };
    }
    if (t.genome) {
      const v = verifyGenome(t.genome);
      return { verified: v.verified, checks: v.checks, summary: v.summary };
    }
    return { verified: false, checks: [], summary: 'unverifiable thought (no code and no genome)' };
  }

  private phaseLucid(s: DreamState): CrystallizedTool[] {
    const tools: CrystallizedTool[] = [];
    // P1.5: crystallize each distinct hypothesis once — a duplicate in the window
    // is the same idea, not a second capability. Only substantive hypotheses are
    // deduped (a one-word/empty hypothesis carries no idea to compare).
    const seen = new Set<string>();
    for (const t of s.recentThoughts) {
      const key = normalizeHypothesis(t.hypothesis);
      if (key.length >= 8) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      if (t.crystallizationReadiness >= AUTO_PROMOTE_THRESHOLD && t.genome) {
        const tool = this.promote(s, t);
        if (tool) tools.push(tool);
      }
    }
    return tools;
  }

  /**
   * Memory consolidation: reads the real signal provider (math readiness,
   * lego assembly count, learner episode/calibration) and writes a real
   * signal-signed summary into the dream state. Bumps `lastSignalSnapshot`
   * and `consolidationCount`. The cognitive coherence is then recomputed
   * downstream so the displayed value reflects REAL state, not a curve.
   */
  private async phaseMemoryConsolidation(s: DreamState): Promise<string> {
    const readiness = this.signals?.readinessScore() ?? null;
    const legoCount = this.signals?.legoAssemblyCount() ?? null;
    const learnerEp = this.signals?.learnerEpisode() ?? null;
    const learnerCal = this.signals?.learnerCalibration() ?? null;
    s.lastSignalSnapshot = {
      readinessScore: readiness,
      legoAssemblyCount: legoCount,
      learnerEpisode: learnerEp,
      learnerCalibration: learnerCal,
      sampledAtTick: s.tick,
    };
    s.consolidationCount = (s.consolidationCount || 0) + 1;
    const parts: string[] = [];
    if (readiness != null) parts.push(`readiness ${(readiness * 100).toFixed(1)}%`);
    if (legoCount != null) parts.push(`lego assemblies: ${legoCount}`);
    if (learnerEp != null) parts.push(`learner ep ${learnerEp}`);
    if (learnerCal != null) parts.push(`calibration ${learnerCal.toFixed(3)}`);

    // P1 sleep-time compute: during consolidation ("sleep") the host may
    // precompute + sandbox-verify artifacts for anticipated forge specs. Absent
    // hook => report string is byte-identical to the pre-upgrade behavior.
    if (this.signals?.sleepCompute) {
      try {
        const step = await this.signals.sleepCompute();
        s.sleepComputeRuns = (s.sleepComputeRuns || 0) + 1;
        s.sleepReadyArtifacts = (s.sleepReadyArtifacts || 0) + Math.max(0, step.ready);
        parts.push(`sleep ${step.note}`);
      } catch {
        /* offline precompute is best-effort; a failure must not break dreaming */
      }
    }

    return parts.length
      ? `Consolidated real signals: ${parts.join(' | ')}`
      : 'Consolidated (no live signals wired this cycle)';
  }

  /* ---------------------------- internals --------------------------- */

  /** Promote a thought into the registry after real sandbox verification.
   *  Returns the tool on success, null on verification failure. */
  private promote(s: DreamState, t: DreamThought): CrystallizedTool | null {
    const v = this.verifyThought(t);
    t.invariantChecks = v.checks;
    t.simulatedOutcome = v.summary;
    // A "verified" claim requires at least one real invariant AND all of them
    // green. `verified` used to be written as a literal `true`, so a gene could
    // reach the registry carrying failed checks.
    const checks = v.checks ?? [];
    const allChecksGreen = checks.length > 0 && checks.every((c) => c.passed);
    if (!v.verified || !allChecksGreen) {
      t.crystallizationReadiness = round2(Math.max(0.05, t.crystallizationReadiness - 0.2));
      return null;
    }

    const isModelCode = !!t.code;
    const slug = (t.hypothesis || t.domain)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'gene';
    const name = isModelCode
      ? `dream_${t.domain.slice(0, 3)}_${slug}_${t.id.slice(-4)}`
      : `${t.domain.slice(0, 4).toUpperCase()}_${t.genome!.kind.split('_')[0].toUpperCase()}_${t.id.slice(-4)}`;
    const tool: CrystallizedTool = {
      id: `tool_${t.id}`,
      name,
      domain: t.domain,
      kind: isModelCode ? 'model_hypothesis' : t.genome!.kind,
      description: t.hypothesis,
      // Module form: real `export`, so the registry substance gate accepts it.
      code: isModelCode ? t.code! : compileGenomeModule(t.genome!),
      verified: allChecksGreen,
      invariantChecks: v.checks ?? [],
      testVectors: isModelCode ? undefined : geneVectors(t.genome!),
      crystallizedAt: new Date().toISOString(),
      fromThoughtId: t.id,
    };
    s.registry.push(tool);
    s.totalCrystallizedGenes = s.registry.length;
    s.recentThoughts = s.recentThoughts.filter((x) => x.id !== t.id);
    return tool;
  }

  private buildThought(
    s: DreamState,
    rng: () => number,
    domain: ToolDomain,
    genome: DreamThought['genome'],
    provenance: string[],
    parentIds: string[],
  ): DreamThought {
    const lex = LEXICON[domain];
    const premise = pick(rng, lex.premises);
    const hypothesis = pick(rng, lex.hypotheses);
    const verify = genome ? verifyGenome(genome) : null;
    // Both numbers below come from the sandbox verdict, not from the RNG — a
    // draw here used to stand in for a measure of readiness.
    const readiness = readinessFromChecks(verify?.checks, verify?.verified === true);
    const intensity = intensityFromChecks(verify?.checks, verify?.verified === true, parentIds);
    const id = `dt_${hashString(`${s.seed}:${s.tick}:${domain}:${genome?.kind ?? 'none'}:${provenance.join('>')}`).toString(16).padStart(8, '0').slice(0, 10)}`;
    return {
      id,
      phase: s.currentPhase,
      domain,
      premise,
      hypothesis,
      simulatedOutcome: verify?.summary ?? 'unverified draft',
      intensity,
      crystallizationReadiness: readiness,
      abstractGenomeDraft: genome ? compileGenome(genome) : undefined,
      genome,
      origin: 'rule_based',
      invariantChecks: verify?.checks,
      parentId: parentIds[0],
      secondParentId: parentIds[1],
      provenance,
      createdAt: new Date().toISOString(),
      tick: s.tick,
    };
  }

  /** Ask the configured model for a REM hypothesis with real code + tests.
   *  The candidate is verified immediately so the stream only ever carries
   *  honestly-evaluated thoughts. Null when the generator is absent/offline. */
  private async tryModelThought(s: DreamState): Promise<DreamThought | null> {
    if (!this.generator) return null;
    const domain = pick(mulberry32((s.seed ^ Math.imul(s.tick + 1, 0x9e3779b1)) >>> 0), DOMAINS);
    const input: DreamGeneratorInput = {
      phase: s.currentPhase,
      domain,
      tick: s.tick,
      recentHypotheses: s.recentThoughts.slice(0, 5).map((t) => t.hypothesis),
    };
    let candidate: DreamGeneratorResult | null = null;
    try {
      candidate = await this.generator(input);
    } catch {
      candidate = null;
    }
    if (!candidate) return null;

    const id = `dt_${hashString(`${s.seed}:${s.tick}:${domain}:model:${candidate.hypothesis}`).toString(16).padStart(8, '0').slice(0, 10)}`;
    const code = (candidate.sourceCode || '').trim();
    const tests = (candidate.testSuiteCode || '').trim();
    if (!code || !tests) return null; // no code => nothing honest to verify
    const run = executeTestSuite(code, tests);

    const checks = assertionChecks(run.testDetails);
    const summary = run.passed
      ? `model hypothesis code passed real sandbox (${checks.filter((c) => c.passed).length} asserts)`
      : `model hypothesis code did not pass yet: ${run.testDetails.find((d) => d.startsWith('[FAIL]')) || 'no tests supplied'}`;

    return {
      id,
      phase: s.currentPhase,
      domain,
      premise: (candidate.premise || 'Hypothesis under test.').slice(0, 300),
      hypothesis: (candidate.hypothesis || 'Untitled model hypothesis.').slice(0, 300),
      simulatedOutcome: summary,
      intensity: intensityFromChecks(checks, run.passed, []),
      crystallizationReadiness: readinessFromChecks(checks, run.passed),
      abstractGenomeDraft: code || undefined,
      code: code || undefined,
      codeTests: tests || undefined,
      origin: 'api_model',
      invariantChecks: checks,
      provenance: ['api_model_rem'],
      createdAt: new Date().toISOString(),
      tick: s.tick,
    };
  }

  private recomputeCoherence(s: DreamState): void {
    const checks = s.recentThoughts.flatMap((t) => t.invariantChecks ?? []);
    const passRate = checks.length ? checks.filter((c) => c.passed).length / checks.length : 0.5;
    const avgReadiness =
      s.recentThoughts.reduce((acc, t) => acc + t.crystallizationReadiness, 0) / s.recentThoughts.length;
    let baseCoherence = clamp01(0.45 + 0.25 * passRate + 0.3 * avgReadiness);

    // Real-signal bonus: if memory_consolidation recorded a live snapshot,
    // the coherence reflects actual system state rather than simulated inputs.
    const snapshot = s.lastSignalSnapshot;
    if (snapshot?.readinessScore != null) {
      const signalBonus = snapshot.readinessScore * 0.1; // max +0.1 for 100% readiness
      baseCoherence = clamp01(baseCoherence + signalBonus);
    }
    s.cognitiveCoherence = round2(baseCoherence);
  }

  private trimStream(s: DreamState): void {
    if (s.recentThoughts.length <= POOL_LIMIT) return;
    s.recentThoughts = s.recentThoughts
      .slice()
      .sort((a, b) => (b.intensity * 0.6 + b.crystallizationReadiness * 0.4) - (a.intensity * 0.6 + a.crystallizationReadiness * 0.4))
      .slice(0, POOL_LIMIT)
      .sort((a, b) => (b.tick ?? 0) - (a.tick ?? 0));
  }

  private async loadOrDefault(): Promise<DreamState> {
    const existing = await this.store.load();
    if (existing) return existing;

    const s: DreamState = {
      isDreamingActive: false,
      currentPhase: PHASE_ORDER[0],
      dreamCyclesCompleted: 0,
      cognitiveCoherence: 0.5,
      totalCrystallizedGenes: 0,
      recentThoughts: [],
      registry: [],
      seed: this.baseSeed,
      tick: 0,
      lastTickAt: null,
      prunedCount: 0,
    };
    const rng = mulberry32(this.baseSeed);
    for (const domain of DOMAINS.slice(0, 3)) {
      const genome = generateGenome(domain, rng);
      s.recentThoughts.push(this.buildThought(s, rng, domain, genome, ['genesis_seed'], []));
    }
    this.recomputeCoherence(s);
    await this.store.save(s);
    return s;
  }
}

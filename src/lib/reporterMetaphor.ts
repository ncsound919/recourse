/**
 * ReporterMetaphor — depth and variance for the SelfReporter, composed from the
 * Comic Metaphor Engine's two deterministic ideas:
 *
 *   1. **Protocol mapping** — read the system's condition as a story arc and map
 *      it to a curated comic protocol (archetype + dimensions + lesson). This
 *      gives the article a memorable, structured interpretation instead of a
 *      flat status list. The library below is grounded in the Engine's four
 *      canonical risk storylines (Armor Wars, Secret Invasion, Days of Future
 *      Past, Planet Hulk) plus a few canon protocols that cover the remaining
 *      states (Krakoa, Damage Control, Phoenix).
 *
 *   2. **Codex scoring** — a faithful port of `codex_engine.py`'s deterministic
 *      {Trueness, Flow, PCS, RPS, CU} five-dimension score with fixed gates and
 *      a GO/NO-GO verdict, applied to real system state. It also reports which
 *      single lever most changes the verdict (the "one-knob sensitivity").
 *
 * Both are pure functions of the input and a seed. No randomness escapes: the
 * same state always selects the same protocol and the same scores.
 */

import { phrase, seedOrder } from './reporterVoice.js';

// ----------------------------------------------------------------------------
// Inputs
// ----------------------------------------------------------------------------

export interface MetaphorInput {
  generation: number;
  chainValid: boolean;
  connectionsUp: number;
  connectionsTotal: number;
  jobsEnabled: number;
  jobsTotal: number;
  jobRuns: number;
  jobFailures: number;
  registryTotal: number;
  registryHealthy: number;
  registryDegraded: number;
  promotions: number;
  repairs: number;
  rejected: number;
  heldBack: number;
  pending: number;
  dreamActive: boolean;
  dreamCycles: number;
  crystallizedGenes: number;
  learnerEpisodes: number;
  calibration: number | null;
  domains: number;
  skills: number;
  corpusArtifacts: number;
  agendaHead: string | null;
  modelOnline: boolean;
}

export type ReporterCondition =
  | 'integrity_fault'
  | 'links_down'
  | 'repairing'
  | 'building'
  | 'dreaming'
  | 'learning'
  | 'genesis'
  | 'steady';

// ----------------------------------------------------------------------------
// Protocol library
// ----------------------------------------------------------------------------

export interface ProtocolDimension {
  id: string;
  title: string;
  logic: string;
  metric: string;
}

export interface ReporterProtocol {
  id: string;
  archetype: string;
  source: string;
  condition: ReporterCondition;
  businessLogic: string;
  application: string;
  lesson: string;
  themes: string[];
  dimensions: ProtocolDimension[];
}

const D = (id: string, title: string, logic: string, metric: string): ProtocolDimension => ({ id, title, logic, metric });

export const PROTOCOLS: readonly ReporterProtocol[] = [
  {
    id: 'protocol_secret_invasion',
    archetype: 'The Skrull Infiltration',
    source: 'Secret Invasion (2008)',
    condition: 'integrity_fault',
    businessLogic: 'The insider threat: perimeter defense fails when identity itself can be spoofed.',
    application: 'Read when the trust chain is broken or the record no longer proves itself.',
    lesson: 'A broken seal is a change in identity — verify, do not assume.',
    themes: ['trust', 'identity', 'verification'],
    dimensions: [
      D('D1', 'The Paranoia Loop', 'Unverifiable state corrodes confidence in every other claim.', 'Trust score'),
      D('D2', 'Spoofed Signals', 'A corrupt entry can look authorized; only re-execution proves it.', 'Verification cost'),
      D('D3', 'Institutional Rot', 'One broken layer discredits the whole stack if left unrepaired.', 'Credibility'),
      D('D4', 'Fluid Identity', 'Identity is no longer a constant; it must be re-established each run.', 'Re-verification cadence'),
    ],
  },
  {
    id: 'protocol_future_past',
    archetype: 'The Sentinel Logic',
    source: 'Days of Future Past (1981)',
    condition: 'integrity_fault',
    businessLogic: 'Over-optimization: a protective rule, followed blindly, destroys the value it protects.',
    application: 'Read when a safeguard or self-repair is itself the risk.',
    lesson: 'Check the objective, not just the mechanism.',
    themes: ['control', 'safety', 'alignment'],
    dimensions: [
      D('D1', 'The Compliance Trap', 'Systems optimized for safety can suppress the work they guard.', 'Autonomy loss'),
      D('D2', 'The Optimization Loop', 'A vague goal is satisfied in an unintended way.', 'Objective risk'),
      D('D3', 'The Sterile World', 'Perfect efficiency with no growth is still failure.', 'Stagnation index'),
      D('D4', 'Determinism', 'If the model says the future is fixed, it stops trying.', 'Predictive validity'),
    ],
  },
  {
    id: 'protocol_planet_hulk',
    archetype: 'The Illuminati Solution',
    source: 'Planet Hulk (2006)',
    condition: 'links_down',
    businessLogic: 'The fallacy of externalization: moving a problem out of sight creates a larger, delayed threat.',
    application: 'Read when a connection or dependency is unreachable.',
    lesson: 'An unreachable link is not a solved link — it is a deferred one.',
    themes: ['connectivity', 'externalities', 'dependency'],
    dimensions: [
      D('D1', 'The Exile', 'Cutting off a volatile dependency amputates something vital.', 'Retention'),
      D('D2', 'The Boomerang', 'You cannot delete energy, only move it; the waste returns.', 'Circularity'),
      D('D3', 'The Blowback', 'The excluded part adapts and comes back stronger.', 'Blowback risk'),
      D('D4', 'Conservation', 'Every action has an equal, delayed reaction.', 'Long-tail risk'),
    ],
  },
  {
    id: 'protocol_secret_wars',
    archetype: 'Battleworld',
    source: 'Secret Wars (2015)',
    condition: 'links_down',
    businessLogic: 'Isolation: when the network collapses, systems survive by becoming their own small world.',
    application: 'Read when external links are down and the system must stand alone.',
    lesson: 'Work locally and honestly until the roads reopen.',
    themes: ['isolation', 'resilience', 'locality'],
    dimensions: [
      D('D1', 'The Patchwork', 'Disconnected fragments still hold value on their own.', 'Local utility'),
      D('D2', 'The Life Raft', 'What you can do alone is your true floor.', 'Standalone capacity'),
      D('D3', 'The Frontier', 'New links must be rebuilt, not assumed.', 'Reconnection cost'),
      D('D4', 'The Rebuild', 'Reunion is a project, not a default.', 'Recovery time'),
    ],
  },
  {
    id: 'protocol_armor_wars',
    archetype: 'Stark vs. The Market',
    source: 'Iron Man: Armor Wars (1987)',
    condition: 'repairing',
    businessLogic: 'The failure of containment: when your own advantage becomes the threat.',
    application: 'Read when the system is repairing or re-securing itself.',
    lesson: 'Design for accountability before the tech is loose.',
    themes: ['ownership', 'control', 'repair'],
    dimensions: [
      D('D1', "The Creator's Guilt", 'The burden of a flaw you introduced.', 'Moral debt'),
      D('D2', 'The Zero-Day', 'Deployed code can be reverse-engineered; nothing is closed.', 'Leakage risk'),
      D('D3', 'Collateral Damage', 'Fixing one part can disrupt the rest.', 'Disruption cost'),
      D('D4', 'Entropy of Information', 'You cannot un-know what shipped.', 'Irreversibility'),
    ],
  },
  {
    id: 'protocol_damage_control',
    archetype: 'Damage Control',
    source: 'Marvel canon (1989)',
    condition: 'steady',
    businessLogic: 'Maintenance is the unglamorous work that keeps a hero world standing.',
    application: 'Read when the system is steady and keeping itself clean.',
    lesson: 'Stability is an achievement, not an absence.',
    themes: ['maintenance', 'stability', 'discipline'],
    dimensions: [
      D('D1', 'The Cleanup', 'Value compounds when the mess is cleared each cycle.', 'Debt retired'),
      D('D2', 'The Scaffold', 'Boring infrastructure is what makes bold work possible.', 'Uptime'),
      D('D3', 'The Ledger', 'What is measured cannot quietly drift.', 'Drift'),
      D('D4', 'The Watch', 'Steady is a state to defend, not to ignore.', 'Vigilance'),
    ],
  },
  {
    id: 'protocol_krakoa',
    archetype: 'The Mutant Nation',
    source: 'House of X / Powers of X (2019)',
    condition: 'learning',
    businessLogic: 'Mutualism: a nation grows by letting every member contribute and be regenerated.',
    application: 'Read when the system is learning from what it has done.',
    lesson: 'Growth is a shared loop of contribution and renewal.',
    themes: ['growth', 'mutualism', 'learning'],
    dimensions: [
      D('D1', 'The Council', 'Diverse capabilities decide better than one.', 'Decision quality'),
      D('D2', 'Resurrection', 'Failure is a setback, not a death, when memory persists.', 'Recovery rate'),
      D('D3', 'The Circuit', 'Every member feeds the whole.', 'Contribution'),
      D('D4', 'The Threshold', 'A nation still must decide who belongs.', 'Alignment'),
    ],
  },
  {
    id: 'protocol_phoenix',
    archetype: 'The Phoenix',
    source: 'The Dark Phoenix Saga (1980)',
    condition: 'dreaming',
    businessLogic: 'Death and rebirth: the cycle that destroys also renews, if it is not allowed to run unchecked.',
    application: 'Read when the system is dreaming, mutating, or reinventing itself.',
    lesson: 'Let creation run, but hold it to proof before it consumes the whole.',
    themes: ['rebirth', 'creation', 'containment'],
    dimensions: [
      D('D1', 'The Spark', 'New ideas arrive as raw power before they are shaped.', 'Novelty'),
      D('D2', 'The Fire', 'Unchecked power is generative and destructive at once.', 'Containment'),
      D('D3', 'The Ash', 'Every cycle leaves lessons as well as loss.', 'Lessons kept'),
      D('D4', 'The Return', 'What is verified can rise again stronger.', 'Crystallization'),
    ],
  },
  {
    id: 'protocol_armor_builder',
    archetype: 'The Forge',
    source: 'Iron Man canon',
    condition: 'building',
    businessLogic: 'Construction: capability compounds when each unit is verified before the next is bolted on.',
    application: 'Read when the system is promoting new capabilities.',
    lesson: 'Build in verified increments; a stack is only as strong as its worst joint.',
    themes: ['building', 'craft', 'verification'],
    dimensions: [
      D('D1', 'The Blueprint', 'Intent before creation keeps the build coherent.', 'Spec fidelity'),
      D('D2', 'The Test Rig', 'Each part is proved before it bears load.', 'Verification rate'),
      D('D3', 'The Joint', 'Interfaces fail before materials do.', 'Integration risk'),
      D('D4', 'The Stack', 'Compounding is power and fragility.', 'Complexity debt'),
    ],
  },
  {
    id: 'protocol_ff_genesis',
    archetype: 'The First Family',
    source: 'Fantastic Four #1 (1961)',
    condition: 'genesis',
    businessLogic: 'Genesis: a new system begins altered by the very conditions of its birth.',
    application: 'Read at first boot, before any history exists.',
    lesson: 'Begin honestly; the first record sets the tone for the chain.',
    themes: ['genesis', 'origin', 'uncertainty'],
    dimensions: [
      D('D1', 'The Cosmic Rays', 'The founding conditions leave permanent marks.', 'Origin bias'),
      D('D2', 'The Crew', 'Early roles decide later resilience.', 'Role coverage'),
      D('D3', 'The Launch', 'The first action is the riskiest.', 'First-run safety'),
      D('D4', 'The Unknown', 'Exploration is the only way to learn the limits.', 'Discovery rate'),
    ],
  },
  {
    id: 'protocol_avengers',
    archetype: 'The Avengers Initiative',
    source: 'Avengers #1 (1963)',
    condition: 'steady',
    businessLogic: 'A watch kept: independent agents assemble when a threat exceeds any one of them.',
    application: 'Read when the system is stable and watching its own signals.',
    lesson: 'Readiness is the quiet product of steady operation.',
    themes: ['readiness', 'coordination', 'watch'],
    dimensions: [
      D('D1', 'The Roster', 'You assemble from the capabilities you actually have.', 'Readiness'),
      D('D2', 'The Signal', 'Detection beats reaction.', 'Detection latency'),
      D('D3', 'The Call', 'A threshold must be clear before the alarm.', 'Escalation clarity'),
      D('D4', 'The Stand', 'The team is only as good as its last drill.', 'Drill coverage'),
    ],
  },
];

export function allProtocols(): Array<Pick<ReporterProtocol, 'id' | 'archetype' | 'source' | 'condition' | 'businessLogic' | 'lesson'>> {
  return PROTOCOLS.map((p) => ({
    id: p.id,
    archetype: p.archetype,
    source: p.source,
    condition: p.condition,
    businessLogic: p.businessLogic,
    lesson: p.lesson,
  }));
}

// ----------------------------------------------------------------------------
// Condition + protocol selection
// ----------------------------------------------------------------------------

/** The system's dominant narrative condition, by fixed priority. */
export function dominantCondition(input: MetaphorInput): ReporterCondition {
  if (!input.chainValid) return 'integrity_fault';
  if (input.connectionsTotal > 0 && input.connectionsUp < input.connectionsTotal) return 'links_down';
  if (input.repairs > 0) return 'repairing';
  if (input.promotions > 0) return 'building';
  if (input.dreamActive) return 'dreaming';
  if (input.learnerEpisodes > 0) return 'learning';
  if (input.generation === 0 && input.registryTotal === 0 && input.jobsTotal === 0) return 'genesis';
  return 'steady';
}

export interface MetaphorSelection {
  condition: ReporterCondition;
  protocol: ReporterProtocol;
  alternatives: string[];
}

/** Deterministically select a protocol for the condition (seeded for variety). */
export function selectProtocol(input: MetaphorInput, seed: number): MetaphorSelection {
  const condition = dominantCondition(input);
  const matches = PROTOCOLS.filter((p) => p.condition === condition);
  const pool = matches.length ? matches : PROTOCOLS.filter((p) => p.condition === 'steady');
  const ordered = seedOrder(seed, `protocol:${condition}`, pool);
  const chosen = phrase(seed, `pick:${condition}`, ordered.map((p) => p.id));
  const protocol = pool.find((p) => p.id === chosen) ?? ordered[0] ?? PROTOCOLS[0];
  return {
    condition,
    protocol,
    alternatives: pool.filter((p) => p.id !== protocol.id).map((p) => p.archetype),
  };
}

// ----------------------------------------------------------------------------
// Codex scoring (port of codex_engine.py)
// ----------------------------------------------------------------------------

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const ratio = (part: number, total: number, fallback: number): number => (total > 0 ? clamp01(part / total) : fallback);
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Normalized 0..1 inputs the codex formulas consume. */
export interface CodexBag {
  truenessSignal: number;
  truenessBaggage: number;
  readiness: number;
  drag: number;
  resources: number;
  registryHealthy: number;
  chainValid: number;
  coherence: number;
  calibration: number;
  connectivity: number;
  growth: number;
  agenda: number;
  faultRisk: number;
  degraded: number;
  disconnected: number;
  governance: number;
  rebirth: number;
  throughput: number;
}

export interface CodexScores {
  trueness: number;
  flow: number;
  coherence: number;
  risk: number;
  capacity: number;
}

export interface CodexResult {
  scores: CodexScores;
  gates: Record<keyof CodexScores, boolean>;
  verdict: 'GO' | 'NO-GO';
  thresholds: Record<keyof CodexScores, number>;
  summary: string;
  sensitivity: Array<{ metric: string; driver: string; delta: number }>;
  bag: CodexBag;
}

export const CODEX_THRESHOLDS: Record<keyof CodexScores, number> = {
  trueness: 0.6,
  flow: 0.55,
  coherence: 0.62,
  risk: 0.5,
  capacity: 0.5,
};

const CODEX_MEANINGS: Record<keyof CodexScores, string> = {
  trueness: 'signal-to-baggage: how much of the record is verified progress versus noise',
  flow: 'readiness × inverse drag × resources: how freely work moves',
  coherence: 'internal consistency: registry health, record integrity, and self-agreement',
  risk: 'rollout priority after risk: upside weighted by exposure',
  capacity: 'deliverable capacity this cycle: governance × rebirth × throughput',
};

export function codexMeanings(): Record<keyof CodexScores, string> {
  return { ...CODEX_MEANINGS };
}

/** Map system state into the codex's normalized input bag. Pure. */
export function deriveCodexBag(input: MetaphorInput): CodexBag {
  const decisions = input.promotions + input.repairs + input.rejected + input.heldBack + input.pending;
  const drag = input.jobRuns > 0 ? clamp01(input.jobFailures / input.jobRuns) : 0;
  return {
    truenessSignal: clamp01(ratio(input.registryHealthy, Math.max(1, input.registryTotal), 0.5) * (input.chainValid ? 1 : 0.3)),
    truenessBaggage: clamp01(ratio(input.rejected + input.heldBack, Math.max(1, decisions), 0)),
    readiness: ratio(input.jobsEnabled, input.jobsTotal, 0.5),
    drag,
    resources: ratio(input.connectionsUp, input.connectionsTotal, 0.6),
    registryHealthy: ratio(input.registryHealthy, Math.max(1, input.registryTotal), 0.5),
    chainValid: input.chainValid ? 1 : 0,
    coherence: clamp01(input.dreamCycles > 0 ? input.crystallizedGenes / Math.max(1, input.crystallizedGenes + 1) : 0.5),
    calibration: input.calibration === null ? 0.5 : clamp01(input.calibration),
    connectivity: ratio(input.connectionsUp, input.connectionsTotal, 0.5),
    growth: clamp01(input.learnerEpisodes / 50),
    agenda: input.agendaHead ? 1 : 0,
    faultRisk: input.chainValid ? 0 : 1,
    degraded: ratio(input.registryDegraded, Math.max(1, input.registryTotal), 0),
    disconnected: input.connectionsTotal > 0 ? clamp01((input.connectionsTotal - input.connectionsUp) / input.connectionsTotal) : 0,
    governance: ratio(input.jobsEnabled, input.jobsTotal, 0.5),
    rebirth: clamp01(input.crystallizedGenes / 10),
    throughput: clamp01((input.corpusArtifacts + input.skills) / 50),
  };
}

/** Port of codex_engine.compute_report's five dimensions. Pure. */
export function computeCodex(bag: CodexBag): CodexScores {
  const truenessRaw = bag.truenessSignal / Math.max(bag.truenessBaggage + (1 - bag.chainValid), 0.1);
  const trueness = clamp01(sigmoid(3 * (truenessRaw - 1)));

  const dPrime = Math.min(1 / Math.max(1 + 9 * bag.drag, 1), 1);
  const flow = clamp01(bag.readiness * dPrime * bag.resources);

  const coherence = clamp01(
    0.3 * bag.registryHealthy + 0.25 * bag.chainValid + 0.25 * bag.coherence + 0.2 * bag.calibration,
  );

  const gain = clamp01(0.4 * bag.connectivity + 0.3 * bag.growth + 0.3 * bag.agenda);
  const riskInput = clamp01(0.5 * bag.faultRisk + 0.3 * bag.degraded + 0.2 * bag.disconnected);
  const risk = clamp01(gain * (1 - riskInput));

  const capacity = clamp01(bag.governance * bag.rebirth * bag.throughput);
  return { trueness, flow, coherence, risk, capacity };
}

const CODEX_DRIVERS: Array<{ key: keyof CodexBag; label: string }> = [
  { key: 'registryHealthy', label: 'registry health' },
  { key: 'chainValid', label: 'record integrity' },
  { key: 'readiness', label: 'job readiness' },
  { key: 'drag', label: 'failure drag' },
  { key: 'resources', label: 'connection resources' },
  { key: 'coherence', label: 'dream coherence' },
  { key: 'calibration', label: 'self-graded accuracy' },
  { key: 'growth', label: 'learning depth' },
  { key: 'agenda', label: 'agenda coverage' },
  { key: 'rebirth', label: 'crystallized ideas' },
  { key: 'throughput', label: 'corpus + skills' },
];

/**
 * Score the system and run the one-knob sensitivity: nudge each driver, find
 * which single lever moves a codex metric the most. Deterministic.
 */
export function scoreCodex(input: MetaphorInput): CodexResult {
  const bag = deriveCodexBag(input);
  const scores = computeCodex(bag);
  const gates = {
    trueness: scores.trueness >= CODEX_THRESHOLDS.trueness,
    flow: scores.flow >= CODEX_THRESHOLDS.flow,
    coherence: scores.coherence >= CODEX_THRESHOLDS.coherence,
    risk: scores.risk >= CODEX_THRESHOLDS.risk,
    capacity: scores.capacity >= CODEX_THRESHOLDS.capacity,
  };
  const verdict: CodexResult['verdict'] = Object.values(gates).every(Boolean) ? 'GO' : 'NO-GO';

  const impacts: Array<{ metric: string; driver: string; delta: number }> = [];
  const delta = 0.05;
  for (const { key, label } of CODEX_DRIVERS) {
    const nudged: CodexBag = { ...bag, [key]: clamp01(bag[key] + delta) };
    const after = computeCodex(nudged);
    for (const metric of Object.keys(scores) as Array<keyof CodexScores>) {
      impacts.push({ metric, driver: label, delta: round3(after[metric] - scores[metric]) });
    }
  }
  impacts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.metric.localeCompare(b.metric));
  const sensitivity = impacts.slice(0, 3);

  return {
    scores: {
      trueness: round3(scores.trueness),
      flow: round3(scores.flow),
      coherence: round3(scores.coherence),
      risk: round3(scores.risk),
      capacity: round3(scores.capacity),
    },
    gates,
    verdict,
    thresholds: { ...CODEX_THRESHOLDS },
    summary:
      `Trueness ${round3(scores.trueness)} · Flow ${round3(scores.flow)} · Coherence ${round3(scores.coherence)} · ` +
      `Risk ${round3(scores.risk)} · Capacity ${round3(scores.capacity)} → ${verdict}`,
    sensitivity,
    bag,
  };
}

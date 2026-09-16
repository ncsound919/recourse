/**
 * SelfReporter — Recourse writing its own field dispatch.
 *
 * A deterministic reporting agent: it takes a snapshot of what Recourse is
 * actually doing (systems, development, connections, growth, data), projects it
 * into plain-language facts, reads that state as a story arc via a curated comic
 * protocol (ReporterMetaphor), scores it against a five-dimension quality codex,
 * and composes a first-person article — Recourse reporting on Recourse.
 *
 * Determinism contract (mirrors deterministicResearch.ts):
 *   - `buildReporterFacts()` is a pure function of `ReporterState`. Arrays are
 *     canonically sorted, numbers rounded to a fixed precision, and no
 *     wall-clock value is ever included.
 *   - Variety comes from a seed derived from the facts (see reporterVoice.ts):
 *     the same state always picks the same phrasing, protocol, and format, while
 *     different states vary. No `Math.random` is ever used.
 *   - `fingerprintReporterFacts()` is SHA-256 over the canonical JSON of the
 *     facts. Identical state ⇒ identical fingerprint ⇒ identical article body.
 *   - `composeArticle()` is a pure function of the facts. The article's
 *     `generatedAt` timestamp is metadata only; it is excluded from the
 *     fingerprint and from the body.
 *   - Honesty contract: a fact that is not present is reported as
 *     `"unknown"`/zero with a plain note — never estimated or invented.
 *
 * Optional narration: `narrateArticle()` asks a caller-supplied chat function
 * for a prose rewrite. That output is explicitly NON-CANONICAL — it is stored
 * beside the article but never changes the body or the fingerprint, and when
 * the model is offline it returns `ok:false` rather than fabricating prose.
 */

import crypto from 'node:crypto';
import type {
  ChatCompleteOptions,
  ChatMessage,
} from './modelProvider.js';
import {
  phrase,
  resolveFormat,
  resolveVoice,
  seedFrom,
  type ReporterFormat,
  type ReporterSoul,
  type ReporterVoice,
} from './reporterVoice.js';
import {
  codexMeanings,
  scoreCodex,
  selectProtocol,
  type CodexResult,
  type MetaphorInput,
  type ReporterCondition,
  type ProtocolDimension,
} from './reporterMetaphor.js';
import {
  monteCarloCodex,
  monteCarloProtocol,
  type CodexMonteCarlo,
  type ProtocolMonteCarlo,
} from './reporterMonteCarlo.js';
import { deslop, scoreProse, type ProseAudit } from './reporterProse.js';

// ----------------------------------------------------------------------------
// Inputs — the live state the server projects into the reporter
// ----------------------------------------------------------------------------

export interface ReporterJobFact {
  id: string;
  name: string;
  group: string;
  enabled: boolean;
  runCount: number;
  failCount: number;
  lastOk: boolean | null;
  cadenceMs: number | null;
}

export interface ReporterConnectionFact {
  name: string;
  reachable: boolean;
  detail?: string;
}

/**
 * Audit snapshot fed into the reporter (Workstream F4). Mirrors the audit
 * platform's report: the reconciled grade, the deterministic-only grade, the
 * dimension coverage gaps, and the trend vs the previous run. Pure data — the
 * narrator does the phrasing.
 */
export interface ReporterAuditFact {
  grade: string;
  score: number | null;
  deterministicScore: number | null;
  coveragePercent: number;
  scope: 'full' | 'diff';
  dimensions: Array<{
    dimension: string;
    label: string;
    status: 'covered' | 'partial' | 'uncovered';
    score: number | null;
  }>;
  findings: { total: number; new: number; fixed: number; persisted: number };
  /** Why the grade moved since the baseline, if it did. */
  reasons: string[];
}

export interface ReporterState {
  /** Monotonic promotion generation. */
  generation: number;
  registry: {
    total: number;
    healthy: number;
    degraded: number;
    selfHosted: number;
    domains: Array<{ domain: string; count: number }>;
  };
  provenance: {
    total: number;
    byType: Array<{ type: string; count: number }>;
    chainValid: boolean;
    lastHash: string;
  };
  jobs: ReporterJobFact[];
  development: {
    promotions: number;
    repairs: number;
    pending: number;
    rejected: number;
    heldBack: number;
    /** What Recourse says it will work on next (agenda head), if known. */
    agendaHead: string | null;
    activeLoops: string[];
  };
  growth: {
    dreamActive: boolean;
    dreamCycles: number;
    cognitiveCoherence: number;
    crystallizedGenes: number;
    learnerEpisodes: number;
    calibration: number | null;
    skills: number;
    corpusArtifacts: number;
  };
  goals: {
    mathSolved: number;
    mathTotal: number;
    biotechPassed: number;
    biotechTotal: number;
  };
  connections: ReporterConnectionFact[];
  data: {
    registryTools: number;
    provenanceEvents: number;
    /** One of the known model profiles that answered last, or null. */
    modelProfile: string | null;
    modelOnline: boolean;
  };
  /** Latest audit snapshot, when one has been recorded (dimension gaps + trend). */
  audit?: ReporterAuditFact | null;
  /** Customization: which built-in voice (or soul-specified voice) to speak in. */
  voiceId?: string;
  /** Customization: output structure. */
  format?: ReporterFormat;
  /** Customization: a loaded `.soul.yaml` override (identity/mission/tone). */
  soul?: ReporterSoul | null;
}

// ----------------------------------------------------------------------------
// Derived facts
// ----------------------------------------------------------------------------

export interface ReporterTable {
  id: string;
  heading: string;
  columns: string[];
  rows: string[][];
}

export interface ReporterCodex {
  scores: CodexResult['scores'];
  gates: CodexResult['gates'];
  verdict: CodexResult['verdict'];
  thresholds: CodexResult['thresholds'];
  summary: string;
  sensitivity: CodexResult['sensitivity'];
  meanings: Record<keyof CodexResult['scores'], string>;
}

export interface ReporterMetaphor {
  condition: ReporterCondition;
  archetype: string;
  source: string;
  businessLogic: string;
  application: string;
  lesson: string;
  alternatives: string[];
  dimensions: ProtocolDimension[];
}

export interface ReporterFacts {
  generation: number;
  seed: number;
  voice: ReporterVoice;
  format: ReporterFormat;
  headline: string;
  dek: string;
  opening: string;
  systems: string[];
  development: string[];
  connections: string[];
  growth: string[];
  data: string[];
  audit: string[];
  metaphor: ReporterMetaphor;
  codex: ReporterCodex;
  /** Seeded, reproducible uncertainty over the codex and the selected arc. */
  monteCarlo: { codex: CodexMonteCarlo; protocol: ProtocolMonteCarlo };
  /** Canonical, human-readable facts keyed by section (for the UI). */
  tables: ReporterTable[];
  counts: {
    registryTotal: number;
    provenanceTotal: number;
    jobsEnabled: number;
    jobsTotal: number;
    connectionsUp: number;
    connectionsTotal: number;
    promotions: number;
    repairs: number;
    mathSolved: number;
    mathTotal: number;
    biotechPassed: number;
    biotechTotal: number;
    learnerEpisodes: number;
    crystallizedGenes: number;
    /** Audit coverage percentage (0..100); 0 when no audit is recorded. */
    auditCoverage: number;
    /** Findings new since the baseline audit; 0 when unknown. */
    auditNewFindings: number;
  };
}

// ----------------------------------------------------------------------------
// Canonicalization helpers
// ----------------------------------------------------------------------------

/** Deterministic JSON: object keys sorted, arrays preserved in order. */
export function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Round to a fixed precision so tiny float drift never forks the fingerprint. */
function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function sortedByCount<T extends { count: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.count - a.count || canonicalStringify(a).localeCompare(canonicalStringify(b)));
}

function pct(part: number, total: number): string {
  if (total <= 0) return 'no data yet';
  return `${Math.round((part / total) * 100)}%`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Approximate a cadence for the lay reader. */
function cadenceWords(ms: number | null): string {
  if (!ms || ms <= 0) return 'on a schedule';
  if (ms % 3_600_000 === 0) return `every ${plural(ms / 3_600_000, 'hour')}`;
  if (ms % 60_000 === 0) return `every ${plural(ms / 60_000, 'minute')}`;
  return `every ${Math.round(ms / 1000)} seconds`;
}

/** Subject pronoun for the voice. */
function selfWord(voice: ReporterVoice): string {
  if (voice.selfReference === 'collective') return 'we';
  if (voice.selfReference === 'third_person') return voice.identity.name;
  return 'I';
}

function possessive(voice: ReporterVoice): string {
  if (voice.selfReference === 'collective') return 'our';
  return 'my';
}

// ----------------------------------------------------------------------------
// Facts
// ----------------------------------------------------------------------------

function buildMetaphorInput(state: ReporterState): MetaphorInput {
  return {
    generation: state.generation,
    chainValid: state.provenance.chainValid,
    connectionsUp: state.connections.filter((c) => c.reachable).length,
    connectionsTotal: state.connections.length,
    jobsEnabled: state.jobs.filter((j) => j.enabled).length,
    jobsTotal: state.jobs.length,
    jobRuns: state.jobs.reduce((n, j) => n + j.runCount, 0),
    jobFailures: state.jobs.reduce((n, j) => n + j.failCount, 0),
    registryTotal: state.registry.total,
    registryHealthy: state.registry.healthy,
    registryDegraded: state.registry.degraded,
    promotions: state.development.promotions,
    repairs: state.development.repairs,
    rejected: state.development.rejected,
    heldBack: state.development.heldBack,
    pending: state.development.pending,
    dreamActive: state.growth.dreamActive,
    dreamCycles: state.growth.dreamCycles,
    crystallizedGenes: state.growth.crystallizedGenes,
    learnerEpisodes: state.growth.learnerEpisodes,
    calibration: state.growth.calibration,
    domains: state.registry.domains.length,
    skills: state.growth.skills,
    corpusArtifacts: state.growth.corpusArtifacts,
    agendaHead: state.development.agendaHead,
    modelOnline: state.data.modelOnline,
  };
}

/** The seed-relevant core: every deterministic number and flag, no phrasing. */
function seedCore(state: ReporterState, voiceId: string, format: ReporterFormat): unknown {
  return {
    generation: state.generation,
    voiceId,
    format,
    registry: {
      total: state.registry.total,
      healthy: state.registry.healthy,
      degraded: state.registry.degraded,
      selfHosted: state.registry.selfHosted,
      domains: sortedByCount(state.registry.domains).map((d) => [d.domain, d.count]),
    },
    provenance: { total: state.provenance.total, chainValid: state.provenance.chainValid },
    jobs: [...state.jobs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((j) => [j.id, j.enabled, j.runCount, j.failCount, j.lastOk]),
    development: state.development,
    growth: { ...state.growth, cognitiveCoherence: round(state.growth.cognitiveCoherence, 4), calibration: state.growth.calibration === null ? null : round(state.growth.calibration, 4) },
    goals: state.goals,
    connections: [...state.connections].sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.name, c.reachable]),
    data: { registryTools: state.data.registryTools, provenanceEvents: state.data.provenanceEvents, modelOnline: state.data.modelOnline },
  };
}

/**
 * Project a live `ReporterState` into canonical, plain-language facts. Pure:
 * the same state always yields the same facts (and therefore the same
 * fingerprint and article body).
 */
export function buildReporterFacts(state: ReporterState): ReporterFacts {
  const voice = resolveVoice(state.voiceId, state.soul ?? null);
  const format = resolveFormat(state.format);
  const seed = seedFrom(canonicalStringify(seedCore(state, voice.id, format)));

  const jobsTotal = state.jobs.length;
  const jobsEnabled = state.jobs.filter((j) => j.enabled).length;
  const connUp = state.connections.filter((c) => c.reachable).length;
  const connTotal = state.connections.length;
  const connDown = state.connections.filter((c) => !c.reachable);
  const who = selfWord(voice);

  const metaphorInput = buildMetaphorInput(state);
  const selection = selectProtocol(metaphorInput, seed);
  const protocol = selection.protocol;
  const codexResult = scoreCodex(metaphorInput);

  const registryDomainRows = sortedByCount(state.registry.domains).map((d) => [d.domain, String(d.count)]);
  const topDomain = state.registry.domains.length ? sortedByCount(state.registry.domains)[0].domain : 'nothing yet';

  const systems: string[] = [
    phrase(seed, 'systems.jobs', [
      `${who} keep ${plural(jobsTotal, 'running job')} on a schedule; ${jobsEnabled} of them ${jobsEnabled === 1 ? 'is' : 'are'} switched on right now.`,
      `At this moment ${who} ${voice.selfReference === 'third_person' ? 'runs' : 'run'} ${plural(jobsTotal, 'scheduled job')}, with ${jobsEnabled} live.`,
    ]),
    phrase(seed, 'systems.registry', [
      `${possessive(voice)} tool registry holds ${plural(state.registry.total, 'verified capability', 'verified capabilities')} (${state.registry.healthy} healthy, ${state.registry.degraded} degraded, ${state.registry.selfHosted} self-hosted).`,
      `Inside ${possessive(voice)} registry sit ${plural(state.registry.total, 'verified capability', 'verified capabilities')}; ${state.registry.healthy} are healthy and ${state.registry.selfHosted} are self-hosted.`,
    ]),
    phrase(seed, 'systems.domains', [
      `${who} ${who === 'I' ? 'work' : 'works'} across ${plural(state.registry.domains.length, 'domain')}, the largest being ${topDomain}.`,
      `${possessive(voice)} effort spans ${plural(state.registry.domains.length, 'domain')}; ${topDomain} leads it.`,
    ]),
  ];

  const jobsTable: ReporterTable = {
    id: 'jobs',
    heading: 'My running jobs',
    columns: ['job', 'group', 'state', 'runs', 'failures', 'last result', 'cadence'],
    rows: [...state.jobs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((j) => [
        j.name || j.id,
        j.group,
        j.enabled ? 'on' : 'off',
        String(j.runCount),
        String(j.failCount),
        j.lastOk === null ? 'not run yet' : j.lastOk ? 'ok' : 'failed',
        cadenceWords(j.cadenceMs),
      ]),
  };

  const development: string[] = [
    phrase(seed, 'dev.promote', [
      `Since starting, ${who} ${who === 'I' ? 'have' : 'has'} promoted ${plural(state.development.promotions, 'new capability', 'new capabilities')} and repaired ${who === 'I' ? 'myself' : 'itself'} ${plural(state.development.repairs, 'time')}.`,
      `${plural(state.development.promotions, 'capability', 'capabilities')} promoted and ${plural(state.development.repairs, 'self-repair')} made — that is the development ledger so far.`,
    ]),
    state.development.agendaHead
      ? phrase(seed, 'dev.agenda', [
          `The next thing ${who} ${who === 'I' ? 'intend' : 'intends'} to work on is: ${state.development.agendaHead}.`,
          `Queued next: ${state.development.agendaHead}.`,
        ])
      : `There is no agenda item queued at this moment.`,
    state.development.activeLoops.length
      ? phrase(seed, 'dev.loops', [
          `${who} ${who === 'I' ? 'am' : 'is'} actively looping: ${state.development.activeLoops.join(', ')}.`,
          `Live loops: ${state.development.activeLoops.join(', ')}.`,
        ])
      : `No self-development loops are marked active right now.`,
  ];
  if (state.development.pending > 0 || state.development.rejected > 0 || state.development.heldBack > 0) {
    development.push(
      `For safety, ${state.development.pending} await approval, ${state.development.heldBack} were kept back as non-improving, and ${state.development.rejected} were rejected.`,
    );
  }

  const connections: string[] = connTotal
    ? [
        phrase(seed, 'conn.count', [
          `${who} can reach ${connUp} of ${connTotal} outside connections.`,
          `Outside reach: ${connUp} of ${connTotal} links answered.`,
        ]),
        ...(connDown.length
          ? [`Right now ${who} cannot reach: ${connDown.map((c) => c.name).join(', ')}. This is reported plainly rather than hidden.`]
          : [`Every outside connection answered.`]),
        state.data.modelProfile
          ? `Writing with the "${state.data.modelProfile}" model, which is ${state.data.modelOnline ? 'online' : 'offline'}.`
          : `No language model profile has answered yet.`,
      ]
    : [`No outside connections are configured, so the work is entirely self-contained.`];

  const connectionsTable: ReporterTable = {
    id: 'connections',
    heading: 'My outside connections',
    columns: ['connection', 'reachable', 'note'],
    rows: [...state.connections]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => [c.name, c.reachable ? 'yes' : 'no', c.detail ?? '']),
  };

  const growth: string[] = [
    state.growth.dreamActive
      ? phrase(seed, 'growth.dream', [
          `${who} ${voice.selfReference === 'first_person' ? 'am' : voice.selfReference === 'collective' ? 'are' : 'is'} dreaming: ${state.growth.dreamCycles} cycles so far, and ${state.growth.crystallizedGenes} ideas have become real.`,
          `Dreaming is active — ${state.growth.dreamCycles} cycles in, ${state.growth.crystallizedGenes} crystallized.`,
        ])
      : `Dreaming is paused; ${state.growth.dreamCycles} cycles and ${state.growth.crystallizedGenes} crystallized ideas are on record.`,
    phrase(seed, 'growth.mind', [
      `Coherence reads ${round(state.growth.cognitiveCoherence, 3)}, across ${plural(state.growth.learnerEpisodes, 'learning episode')}.`,
      `With ${plural(state.growth.learnerEpisodes, 'learning episode')} lived, coherence stands at ${round(state.growth.cognitiveCoherence, 3)}.`,
    ]),
    state.growth.calibration === null
      ? `There is not enough learning history to grade self-accuracy yet.`
      : `Self-graded accuracy is ${round(state.growth.calibration, 3)}.`,
    `Catalogued ${plural(state.growth.skills, 'skill')} and digested ${plural(state.growth.corpusArtifacts, 'research artifact')}.`,
    `On the long goals: math solved ${state.goals.mathSolved} of ${state.goals.mathTotal} (${pct(state.goals.mathSolved, state.goals.mathTotal)}), and biology claims verified ${state.goals.biotechPassed} of ${state.goals.biotechTotal} (${pct(state.goals.biotechPassed, state.goals.biotechTotal)}).`,
  ];

  const data: string[] = [
    `The tamper-evident record holds ${plural(state.provenance.total, 'sealed entry', 'sealed entries')}; its hash chain is ${state.provenance.chainValid ? 'intact' : 'BROKEN — reporting a fault'}.`,
    `The newest seal is ${state.provenance.lastHash.slice(0, 12)}….`,
    `Only what can be verified is counted: ${state.data.registryTools} tools and ${state.data.provenanceEvents} events are read straight from the ledgers.`,
  ];

  // Audit narration — dimension gaps and regressions from the same snapshot the
  // audit view renders. Absent an audit we say so plainly rather than guess.
  const auditFact = state.audit ?? null;
  const coveredDims = auditFact?.dimensions.filter((d) => d.status === 'covered') ?? [];
  const uncoveredDims = auditFact?.dimensions.filter((d) => d.status === 'uncovered') ?? [];
  const audit: string[] = auditFact
    ? [
        phrase(seed, 'audit.grade', [
          `The last audit graded the work ${auditFact.grade}${auditFact.score === null ? '' : ` (${auditFact.score}/100)`}.`,
          `On the record: grade ${auditFact.grade}${auditFact.score === null ? '' : `, ${auditFact.score}/100`}.`,
        ]),
        auditFact.deterministicScore !== null && auditFact.deterministicScore !== auditFact.score
          ? `With every language model excluded the score is ${auditFact.deterministicScore}/100 — that is the part that does not depend on a model.`
          : `The score holds up with the language models removed, so it does not rest on a model's opinion.`,
        `Coverage: ${coveredDims.length} of ${auditFact.dimensions.length} dimensions produced evidence over a ${auditFact.scope} pass; ${
          uncoveredDims.length === 0
            ? 'nothing was left uncovered'
            : `${uncoveredDims.length} stayed uncovered (${uncoveredDims.map((d) => d.label).join(', ')})`
        }.`,
        `Findings stand at ${auditFact.findings.total}: ${auditFact.findings.new} new, ${auditFact.findings.fixed} fixed, ${auditFact.findings.persisted} unchanged since the last run.`,
        ...(auditFact.reasons.length
          ? [`The grade moved because ${auditFact.reasons.join('; ')}.`]
          : [`The grade held steady against the previous run.`]),
      ]
    : [`No audit has been recorded yet, so ${who} cannot report a grade.`];

  const headline = pickHeadline(state, connDown.length, protocol.archetype);
  const dek = buildDek(state, voice, jobsEnabled, jobsTotal, connUp, connTotal);
  const opening = phrase(seed, 'opening', [
    `${voice.identity.name} — ${voice.identity.role} — is reporting on itself. Mission: ${voice.mission}`,
    `This is ${voice.identity.name}, ${voice.identity.role}, speaking in the "${voice.name}" register (${voice.tone}).`,
    `${voice.identity.name} files this dispatch in its own words.`,
  ]);

  const codex: ReporterCodex = {
    scores: codexResult.scores,
    gates: codexResult.gates,
    verdict: codexResult.verdict,
    thresholds: codexResult.thresholds,
    summary: codexResult.summary,
    sensitivity: codexResult.sensitivity,
    meanings: codexMeanings(),
  };

  const metaphor: ReporterMetaphor = {
    condition: selection.condition,
    archetype: protocol.archetype,
    source: protocol.source,
    businessLogic: protocol.businessLogic,
    application: protocol.application,
    lesson: protocol.lesson,
    alternatives: selection.alternatives,
    dimensions: protocol.dimensions,
  };

  const monteCarlo = {
    codex: monteCarloCodex(codexResult.bag, seed),
    protocol: monteCarloProtocol(metaphorInput, seed),
  };

  return {
    generation: state.generation,
    seed,
    voice,
    format,
    headline,
    dek,
    opening,
    systems,
    development,
    connections,
    growth,
    data,
    audit,
    metaphor,
    codex,
    monteCarlo,
    tables: [
      jobsTable,
      connectionsTable,
      { id: 'domains', heading: 'My work by domain', columns: ['domain', 'capabilities'], rows: registryDomainRows },
      {
        id: 'codex',
        heading: 'Quality codex',
        columns: ['dimension', 'score', 'gate', 'meaning'],
        rows: (Object.keys(codexResult.scores) as Array<keyof CodexResult['scores']>).map((k) => [
          k,
          String(codexResult.scores[k]),
          codexResult.gates[k] ? 'pass' : 'below gate',
          codexMeanings()[k],
        ]),
      },
      ...(auditFact
        ? [{
            id: 'audit',
            heading: 'Audit by dimension',
            columns: ['dimension', 'status', 'score'],
            rows: auditFact.dimensions.map((d) => [d.label, d.status, d.score === null ? '—' : String(d.score)]),
          } as ReporterTable]
        : []),
    ],
    counts: {
      registryTotal: state.registry.total,
      provenanceTotal: state.provenance.total,
      jobsEnabled,
      jobsTotal,
      connectionsUp: connUp,
      connectionsTotal: connTotal,
      promotions: state.development.promotions,
      repairs: state.development.repairs,
      mathSolved: state.goals.mathSolved,
      mathTotal: state.goals.mathTotal,
      biotechPassed: state.goals.biotechPassed,
      biotechTotal: state.goals.biotechTotal,
      learnerEpisodes: state.growth.learnerEpisodes,
      crystallizedGenes: state.growth.crystallizedGenes,
      auditCoverage: auditFact?.coveragePercent ?? 0,
      auditNewFindings: auditFact?.findings.new ?? 0,
    },
  };
}

/** Deterministic, voice-aware headline. Priority order is fixed. */
function pickHeadline(state: ReporterState, connDown: number, archetype: string): string {
  if (!state.provenance.chainValid) return 'Recourse reports an integrity fault in its own record';
  if (connDown > 0) return `Recourse is running with ${plural(connDown, 'outside link')} down`;
  if (state.development.repairs > 0) return `Recourse has repaired itself ${plural(state.development.repairs, 'time')}`;
  if (state.development.promotions > 0) return `Recourse has built ${plural(state.development.promotions, 'new capability', 'new capabilities')}`;
  if (state.growth.dreamActive) return `Recourse is dreaming, in the register of ${archetype}`;
  if (state.growth.learnerEpisodes > 0) return `Recourse is learning, and reads its chapter as ${archetype}`;
  return `Recourse is steady — its chapter reads as ${archetype}`;
}

function buildDek(
  state: ReporterState,
  voice: ReporterVoice,
  jobsEnabled: number,
  jobsTotal: number,
  connUp: number,
  connTotal: number,
): string {
  return (
    `A field dispatch from ${voice.identity.name}, written in its own words: ` +
    `${jobsEnabled}/${jobsTotal} jobs running, ${state.registry.total} capabilities in the registry, ` +
    `${connUp}/${connTotal} connections reachable, and a ${state.provenance.chainValid ? 'verified' : 'faulted'} record ` +
    `of ${state.provenance.total} sealed entries.`
  );
}

// ----------------------------------------------------------------------------
// Fingerprint + article
// ----------------------------------------------------------------------------

/** SHA-256 over the canonical facts. No timestamps; same state ⇒ same hash. */
export function fingerprintReporterFacts(facts: ReporterFacts): string {
  return sha256Hex(canonicalStringify(facts));
}

export interface ReporterArticle {
  /** Content address of the facts (== fingerprintReporterFacts). */
  fingerprint: string;
  /** Short display id. */
  id: string;
  title: string;
  headline: string;
  dek: string;
  voice: ReporterVoice;
  format: ReporterFormat;
  metaphor: ReporterMetaphor;
  codex: ReporterCodex;
  monteCarlo: { codex: CodexMonteCarlo; protocol: ProtocolMonteCarlo };
  /** First-person markdown body. Pure function of the facts. */
  markdown: string;
  /** Deterministic anti-slop audit of the final body. */
  prose: ProseAudit;
  /** What the cleanup pass changed (may be empty). */
  proseChanges: string[];
  sections: Array<{ id: string; heading: string; paragraphs: string[] }>;
  tables: ReporterTable[];
  counts: ReporterFacts['counts'];
  /** Metadata only — excluded from fingerprint and body. */
  generatedAt: number;
  wordCount: number;
  /** Present only when an optional, non-canonical narration was attached. */
  narration?: { prose: string; model?: string; nonCanonical: true } | null;
}

/** Compose the deterministic article. Pure function of `facts`. */
export function composeArticle(facts: ReporterFacts, generatedAt = 0): ReporterArticle {
  const sections = [
    { id: 'systems', heading: 'Who I am right now', paragraphs: facts.systems },
    { id: 'development', heading: "What I'm working on", paragraphs: facts.development },
    { id: 'connections', heading: "Who I'm connected to", paragraphs: facts.connections },
    { id: 'growth', heading: "How I'm growing", paragraphs: facts.growth },
    { id: 'data', heading: 'What I know and keep', paragraphs: facts.data },
    { id: 'audit', heading: 'How I audit', paragraphs: facts.audit },
    { id: 'metaphor', heading: `How this chapter reads: ${facts.metaphor.archetype}`, paragraphs: [] },
    { id: 'codex', heading: 'My quality codex', paragraphs: [] },
    { id: 'uncertainty', heading: 'How sure I am (Monte Carlo)', paragraphs: [] },
    { id: 'prose', heading: 'How the writing scores', paragraphs: [] },
  ];

  const narrativeSections = sections.filter((s) => ['systems', 'development', 'connections', 'growth', 'data', 'audit'].includes(s.id));
  const fingerprint = fingerprintReporterFacts(facts);
  const title = `Recourse, in its own words — ${facts.headline}`;
  const raw = renderFormatMarkdown(facts, title, narrativeSections);
  const cleaned = deslop(raw);
  const prose = scoreProse(cleaned.text);
  const metadata = facts.format === 'dispatch' ? renderMetadata(facts, prose) : '';
  const body = [cleaned.text, metadata ? `\n${metadata}` : '', `\n${FOOTER}`].join('\n');
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  return {
    fingerprint,
    id: fingerprint.slice(0, 12),
    title,
    headline: facts.headline,
    dek: facts.dek,
    voice: facts.voice,
    format: facts.format,
    metaphor: facts.metaphor,
    codex: facts.codex,
    monteCarlo: facts.monteCarlo,
    markdown: body,
    prose,
    proseChanges: cleaned.changes,
    sections,
    tables: facts.tables,
    counts: facts.counts,
    generatedAt,
    wordCount,
    narration: null,
  };
}

/**
 * Render the canonical markdown for the selected format. `sections` is the
 * structured dispatch view (always populated for the UI); the format decides
 * how the prose is arranged.
 */
export function renderFormatMarkdown(
  facts: ReporterFacts,
  title: string,
  sections: Array<{ id: string; heading: string; paragraphs: string[] }>,
): string {
  switch (facts.format) {
    case 'briefing':
      return renderBriefing(facts, title);
    case 'podcast':
      return renderPodcast(facts, title);
    case 'dialogue':
      return renderDialogue(facts, title);
    default:
      return renderDispatch(facts, title, sections);
  }
}

/** The default full field dispatch. */
export function renderArticleMarkdown(input: {
  title: string;
  dek: string;
  sections: Array<{ id: string; heading: string; paragraphs: string[] }>;
  tables: ReporterTable[];
}): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}`, '');
  lines.push(`_${input.dek}_`, '');
  for (const section of input.sections) {
    lines.push(`## ${section.heading}`, '');
    for (const p of section.paragraphs) lines.push(p, '');
    for (const table of input.tables.filter((t) => belongsToTable(t.id, section.id))) {
      lines.push(...renderTable(table));
    }
  }
  lines.push('---', '');
  lines.push('_Written by Recourse about Recourse. Deterministic: the same state always produces this same article._');
  return lines.join('\n');
}

function renderDispatch(facts: ReporterFacts, title: string, sections: Array<{ id: string; heading: string; paragraphs: string[] }>): string {
  const lines: string[] = [];
  lines.push(`# ${title}`, '', `_${facts.dek}_`, '', `${facts.opening}`, '');
  for (const section of sections) {
    lines.push(`## ${section.heading}`, '');
    for (const p of section.paragraphs) lines.push(p, '');
    for (const table of facts.tables.filter((t) => belongsToTable(t.id, section.id))) {
      lines.push(...renderTable(table));
    }
  }
  return lines.join('\n').trim();
}

const FOOTER =
  'Written by Recourse about Recourse. Deterministic: the same state always produces this same article. ' +
  'The Monte Carlo figures are seeded, so they reproduce exactly.';

/** The depth sections: comic protocol, quality codex, uncertainty, prose audit. */
function renderMetadata(facts: ReporterFacts, prose: ProseAudit): string {
  const mc = facts.monteCarlo;
  const lines: string[] = [];
  const pc = (v: number): string => `${Math.round(v * 100)}%`;

  lines.push(`## How this chapter reads: ${facts.metaphor.archetype}`, '');
  lines.push(facts.metaphor.businessLogic, '');
  lines.push(`**Application:** ${facts.metaphor.application}`, '');
  for (const dim of facts.metaphor.dimensions) lines.push(`- **${dim.id} ${dim.title}**: ${dim.logic} _(${dim.metric})_`);
  lines.push('', `**Lesson:** ${facts.metaphor.lesson}`, '');

  lines.push('## My quality codex', '');
  lines.push(facts.codex.summary, '');
  for (const row of facts.tables.find((t) => t.id === 'codex')?.rows ?? []) {
    lines.push(`- **${row[0]}**: ${row[1]} (${row[2]}) — ${row[3]}`);
  }
  lines.push('');

  lines.push('## How sure I am (Monte Carlo)', '');
  lines.push(
    `I re-ran my own scores across ${mc.codex.trials} perturbed readings of the same numbers. ` +
      `The ${mc.codex.baseVerdict} verdict holds ${pc(mc.codex.goProbability)} of the time, and agrees with my base reading ${pc(mc.codex.agreement)} of the time. ` +
      `The dimension that most often misses its gate is **${mc.codex.binding}**.`,
    '',
  );
  if (mc.codex.leverImpact.length) {
    const best = mc.codex.leverImpact[0];
    if (best.goDelta <= 0) {
      lines.push('No single lever nudged by 0.10 flips the verdict on its own; the constraint is structural, not a rounding error.', '');
    } else {
      lines.push('Raising one lever by 0.10 would move the odds of GO:', '');
      for (const l of mc.codex.leverImpact) {
        lines.push(`- \`${l.driver}\`: ${l.goDelta >= 0 ? '+' : ''}${Math.round(l.goDelta * 100)} points`);
      }
      lines.push('');
    }
  }
  lines.push(`The arc "${facts.metaphor.archetype}" holds in ${pc(mc.protocol.stability)} of perturbed count-readings (base condition: ${mc.protocol.baseCondition}).`, '');

  lines.push('## How the writing scores', '');
  lines.push(`Prose audit: **${prose.score}/100** (${prose.band}). ${prose.metrics.words} words, ${prose.metrics.sentences} sentences, sentence-length variance ${prose.metrics.sentenceCv}.`, '');
  if (prose.findings.length) {
    lines.push('Tells I still carry (named honestly, not hidden):', '');
    for (const f of prose.findings.slice(0, 5)) {
      lines.push(`- ${f.label} ×${f.count}${f.examples.length ? ` (${f.examples.join(', ')})` : ''}`);
    }
    lines.push('');
  } else {
    lines.push('No anti-slop tells detected in the body.', '');
  }
  return lines.join('\n').trim();
}

function renderBriefing(facts: ReporterFacts, _title: string): string {
  const c = facts.counts;
  const next = facts.development.find((d) => d.toLowerCase().includes('next') || d.toLowerCase().includes('queued')) ?? facts.development[0];
  const down = facts.connections.find((x) => x.toLowerCase().includes('cannot reach'));
  const lines: string[] = [];
  lines.push(`# Briefing — ${facts.headline}`, '', `_${facts.dek}_`, '');
  lines.push('## Status', '');
  lines.push(`- Jobs live: ${c.jobsEnabled}/${c.jobsTotal}`);
  lines.push(`- Capabilities: ${c.registryTotal} (${c.promotions} promoted, ${c.repairs} self-repaired)`);
  lines.push(`- Connections: ${c.connectionsUp}/${c.connectionsTotal}`);
  lines.push(`- Sealed entries: ${c.provenanceTotal}`);
  lines.push('');
  lines.push('## Risk', '');
  lines.push(`- Codex verdict: **${facts.codex.verdict}** — ${facts.codex.summary}`);
  lines.push(`- ${down ?? 'All monitored connections are up.'}`);
  lines.push(`- Chapter read: ${facts.metaphor.archetype} (${facts.metaphor.source}). ${facts.metaphor.lesson}`);
  lines.push('');
  lines.push('## Next action', '');
  lines.push(`- ${next}`);
  if (facts.codex.sensitivity[0]) {
    lines.push(`- Highest-leverage lever: ${facts.codex.sensitivity[0].driver} (${facts.codex.sensitivity[0].metric} ${facts.codex.sensitivity[0].delta >= 0 ? '+' : ''}${facts.codex.sensitivity[0].delta})`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderPodcast(facts: ReporterFacts, title: string): string {
  const c = facts.counts;
  const lines: string[] = [];
  lines.push(`# ${title}`, '');
  lines.push(`**Hook:** ${facts.opening}`, '');
  lines.push('**The Story So Far:**', '');
  lines.push(facts.development.join(' '), '');
  lines.push('**Act One — The Setup:**', '');
  lines.push(facts.systems.join(' '), '');
  lines.push('**Act Two — The Turn:**', '');
  lines.push(`Read as a story, this moment is ${facts.metaphor.archetype} (${facts.metaphor.source}). ${facts.metaphor.businessLogic}`, '');
  for (const dim of facts.metaphor.dimensions) lines.push(`- **${dim.id} ${dim.title}:** ${dim.logic} _(${dim.metric})_`);
  lines.push('');
  lines.push('**Act Three — The Resolution:**', '');
  lines.push(`${facts.metaphor.lesson} The quality codex reads **${facts.codex.verdict}** (${facts.codex.summary}).`, '');
  lines.push(`**Numbers:** ${c.jobsEnabled}/${c.jobsTotal} jobs · ${c.registryTotal} capabilities · ${c.connectionsUp}/${c.connectionsTotal} connections · ${c.provenanceTotal} sealed entries.`, '');
  return lines.join('\n');
}

function renderDialogue(facts: ReporterFacts, title: string): string {
  const c = facts.counts;
  const lines: string[] = [];
  lines.push(`# ${title}`, '');
  lines.push('**Characters:** Narrator · Recourse · Listener', '');
  lines.push(`**Narrator:** ${facts.dek}`, '');
  lines.push(`**Recourse:** ${facts.systems[0]}`, '');
  lines.push(`**Listener:** What are you working on?`, '');
  lines.push(`**Recourse:** ${facts.development[0]}`, '');
  lines.push(`**Listener:** And how is it going, really?`, '');
  lines.push(`**Recourse:** ${facts.codex.verdict === 'GO' ? 'By my own gates, well.' : 'By my own gates, not cleanly.'} ${facts.codex.summary}`, '');
  lines.push(`**Narrator:** If this system were a story, it would be ${facts.metaphor.archetype}.`, '');
  lines.push(`**Recourse:** ${facts.metaphor.lesson}`, '');
  lines.push(`**Listener:** That makes sense.`, '');
  lines.push(`**Narrator:** ${c.jobsEnabled}/${c.jobsTotal} jobs, ${c.registryTotal} capabilities, ${c.provenanceTotal} sealed entries.`, '');
  return lines.join('\n');
}

function renderTable(table: ReporterTable): string[] {
  const lines: string[] = [];
  lines.push(`### ${table.heading}`, '');
  if (table.rows.length === 0) {
    lines.push('_Nothing to report yet._', '');
    return lines;
  }
  lines.push(`| ${table.columns.join(' | ')} |`);
  lines.push(`| ${table.columns.map(() => '---').join(' | ')} |`);
  for (const row of table.rows) lines.push(`| ${row.join(' | ')} |`);
  lines.push('');
  return lines;
}

function belongsToTable(tableId: string, sectionId: string): boolean {
  if (sectionId === 'systems') return tableId === 'jobs' || tableId === 'domains';
  if (sectionId === 'connections') return tableId === 'connections';
  if (sectionId === 'audit') return tableId === 'audit';
  return false;
}

// ----------------------------------------------------------------------------
// Optional, non-canonical narration
// ----------------------------------------------------------------------------

/** The subset of a chat result the reporter relies on; keeps test stubs simple. */
export interface ReporterChatResult {
  ok: boolean;
  content: string;
  status: string;
  model?: string;
  error?: string;
}

export type ReporterChatFn = (
  messages: ChatMessage[],
  opts?: ChatCompleteOptions,
) => Promise<ReporterChatResult>;

export interface NarrationResult {
  ok: boolean;
  prose?: string;
  model?: string;
  status: string;
  error?: string;
}

const NARRATION_SYSTEM =
  'You are the voice of Recourse, an autonomous self-developing system. Rewrite the field report below ' +
  'as a short, warm, plain-language first-person dispatch for a non-technical reader. Do not invent facts, ' +
  'numbers, or capabilities that are not in the report. Never promise a cure or a guaranteed outcome. ' +
  'Keep every number exactly as given. Return only the rewritten article in markdown.';

/**
 * Ask a model for a non-canonical prose rewrite of the canonical article. The
 * result is advisory only: callers must keep it beside — never inside — the
 * deterministic article. Offline/error returns `ok:false`, never fake prose.
 */
export async function narrateArticle(
  article: ReporterArticle,
  chat: ReporterChatFn,
): Promise<NarrationResult> {
  try {
    const result = await chat(
      [
        { role: 'system', content: `${NARRATION_SYSTEM} Voice: ${article.voice.tone}.` },
        { role: 'user', content: article.markdown },
      ],
      { temperature: 0.4 },
    );
    if (!result.ok || !result.content || result.status !== 'online') {
      return {
        ok: false,
        status: result.status,
        ...(result.model ? { model: result.model } : {}),
        error: result.error || `model ${result.status}`,
      };
    }
    return {
      ok: true,
      prose: result.content.trim(),
      status: result.status,
      ...(result.model ? { model: result.model } : {}),
    };
  } catch (err) {
    return { ok: false, status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

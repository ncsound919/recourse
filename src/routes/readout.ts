/**
 * readout.ts — operator readouts extracted from `server.ts`:
 * GET /status (the big live status), /provenance, /registry, /sandbox,
 * /failures, /benchmark, /selfuse, /system/snapshots, /legacy-digest,
 * /system/upgrade-report, /capabilities, /generations, /readout.
 *
 * Verifier/health/readout primitives are lib imports. Mutable host state
 * (registry, ledgers, dream/growth) and side-effecting helpers (serveCapability,
 * upgrade reports, intake/benchmark snapshots) are injected as typed refs/fns.
 * GET /metrics stays inline (mounted at app root, not under /api/recourse).
 */
import { Router } from 'express';
import {
  checkOnline as modelCheckOnline,
  providerStatuses,
} from '../lib/modelProvider.js';
import { isIsolateAvailable } from '../lib/isolatedSandbox.js';
import { evaluateAcceptance } from '../lib/acceptance.js';
import { repairVerificationStats } from '../lib/repairVerification.js';
import type { RepairVerification } from '../lib/repairVerification.js';
import { domainHealth, capabilityReadiness } from '../lib/honestyMetrics.js';
import { evaluateGrowthDecision } from '../lib/decisionEngine.js';
import { decisionSynergyInputs } from '../lib/synergy/decisionBridge.js';
import { listSelfHostedEntries } from '../lib/selfHosting.js';
import { allBenchmarkProblems } from '../benchmark/benchmark.js';
import { buildDevelopmentReadout } from '../intake/readout.js';
import type { ReadoutContext } from '../intake/readout.js';
import type { IntakeSnapshot, BenchmarkRun } from '../intake/types.js';
import type { SystemSnapshot } from '../lib/systemDiff.js';
import type { CapabilityDef } from '../lib/capabilities.js';
import type { PromotedAuditSummary } from '../lib/promotedAudit.js';
import type { ConsumptionReport } from '../lib/toolConsumption.js';
import type {
  SystemStatus,
  ToolEntry,
  ProvenanceEvent,
  GrowthFactorWeights,
  GrowthDecisionReport,
  GitHubRepoBlueprint,
  SwarmStatus,
  AnomalyReport,
  DreamState,
} from '../types.js';
import type { FailureEntry, ForgeLedgerEntry, GenerationLedgerEntry } from '../../server.js';

export interface ReadoutRouterDeps {
  verifyChainIntegrity(): { valid: boolean; length: number; lastHash: string; brokenIndex?: number };
  statusRef(): SystemStatus;
  registryRef(): ToolEntry[];
  /**
   * The honest registry pair: how many entries are actually runnable versus
   * declared-but-inert. Recomputed per request so it can never go stale.
   */
  registryExecutability?: () => NonNullable<SystemStatus['registryExecutability']>;
  currentProviderStatus(): { model: string; baseUrl: string; [k: string]: unknown };
  repairVerificationsRef(): RepairVerification[];
  growthWeightsRef(): GrowthFactorWeights;
  dreamEngine: { status(): Promise<DreamState> };
  setDreamState(state: DreamState): void;
  swarmStatusRef(): SwarmStatus;
  lastGrowthDecisionRef(): GrowthDecisionReport | null;
  anomaliesRef(): AnomalyReport[];
  gitHubBlueprintsRef(): GitHubRepoBlueprint[];
  forgeLedgerRef(): ForgeLedgerEntry[];
  benchmarkHistoryRef(): BenchmarkRun[];
  latestBenchmarkRef(): BenchmarkRun | null;
  learnerStore: {
    loadState(): Promise<
      | {
          episode?: number;
          /** Renamed from `calibrationError`; the old name is still read from
           *  saves written before the rename. */
          meanAbsSurprise?: number;
          calibrationError?: number;
          ece?: number;
          selfEce?: number;
          selfScore?: number;
          updatedAt?: string;
        }
      | null
    >;
  };
  provenanceEventsRef(): ProvenanceEvent[];
  serveCapability(capId: string, ctx: unknown): Promise<unknown>;
  failureLedger: FailureEntry[];
  outcomeLedger: { reward(n: number): number | null | undefined };
  selfUseStatus(): Record<string, unknown>;
  /** Value ledger snapshot: real invocations, consumptions, usefulness, dead weight. */
  valueSnapshot?(): Record<string, unknown>;
  /** Self-diagnosis: value-signal health, run outcomes, verification cost. */
  introspectionReport?(): Record<string, unknown>;
  /** Runs a budgeted slice of the promoted-tool quality audit. */
  runPromotedAudit?(budget: number): PromotedAuditSummary;
  /** Classifies every forge-materialized tool by whether a live path calls it. */
  consumptionReport?(): ConsumptionReport;
  systemSnapshotsRef(): SystemSnapshot[];
  systemBaselineRef(): SystemSnapshot | null;
  legacyDigestRef(): Record<string, unknown> | null;
  buildUpgradeReport(): Promise<{
    diff: { addedTools: unknown[]; removedTools: unknown[]; upgradedTools: unknown[]; capabilityChanges: unknown[]; totals: { before: number; after: number } };
    plain?: string;
    [k: string]: unknown;
  }>;
  upgradeReport(): {
    diff: { addedTools: unknown[]; removedTools: unknown[]; upgradedTools: unknown[]; capabilityChanges: unknown[]; totals: { before: number; after: number } };
    plain: string;
    topChanged: Array<{ name: string; description: string }>;
    [k: string]: unknown;
  };
  capabilitiesRef(): CapabilityDef[];
  capabilitiesState(): { adoptions: Record<string, unknown>; served: Record<string, number> };
  generationLedgerRef(): GenerationLedgerEntry[];
  intakeSnapshot(): IntakeSnapshot;
  benchmarkState(): ReadoutContext['benchmark'];
}

/**
 * The single most common failure reason across failed forge entries.
 *
 * A ledger of 58 failures with no reason is not actionable; "58 x HTTP 401" is.
 * Longer/more specific messages win so a single auth outage is not averaged
 * away by unrelated noise.
 */
function topFailureReason(
  failed: Array<{ summary?: string; failures?: Array<{ attempt: number; note: string }> }>,
): string | null {
  const counts = new Map<string, number>();
  for (const f of failed) {
    // Prefer the last recorded attempt note — that is the reason the build
    // actually stopped — and fall back to the entry summary.
    const raw =
      f.failures && f.failures.length > 0 ? f.failures[f.failures.length - 1].note : f.summary;
    if (typeof raw !== 'string' || !raw.trim()) continue;
    // Collapse to the distinctive part: status codes and short quoted reasons.
    const key =
      /\b(4\d\d|5\d\d)\b/.test(raw) && raw.length < 160
        ? raw
        : raw.slice(0, 80);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [reason, n] of counts) {
    if (n > bestN) {
      best = reason;
      bestN = n;
    }
  }
  return best;
}

export function createReadoutRouter(deps: ReadoutRouterDeps): Router {
  const router = Router();

  router.get('/status', async (req, res) => {
    const integrity = deps.verifyChainIntegrity();
    const status = deps.statusRef();
    const registry = deps.registryRef();
    // An empty chain is not INVALID, it is UNVERIFIED. Copying `valid` straight into
    // `hashChainIntegrity` reported "chain integrity OK" for a system that has
    // never recorded a provenance event, and the seeded default in mockData.ts is
    // also a hardcoded `true`. Claim integrity only when links were actually
    // checked; otherwise surface the truth (nothing verified yet).
    status.hashChainIntegrity = integrity.length > 0 ? integrity.valid : false;
    status.hashChainUnverified = integrity.length === 0;
    status.registeredToolsCount = registry.length;
    // Recomputed on every read, not cached on `status`: the boot-time assignment
    // ran before the registry finished loading and produced all zeros, which reads
    // as a measurement rather than as "not computed yet".
    if (deps.registryExecutability) {
      status.registryExecutability = deps.registryExecutability();
    }
    let pending = 0;
    registry.forEach(r => {
      pending += (r.pendingVersions?.length || 0);
    });
    status.pendingApprovalsCount = pending;

    // Live model provider status (probe both profiles independently).
    // The snapshot must be taken AFTER the probes: reading it first reported
    // the pre-probe state, so the first /status call after a boot always showed
    // `online: null` (rendered false) even for a healthy local llama-server.
    // `deep: true` spends one token to confirm the provider can actually
    // GENERATE, not merely answer /models — otherwise a gateway that rejects
    // the key on chat (the 401 that hid here for 58 forge attempts) still reads
    // as healthy on the operator readout.
    await modelCheckOnline(true, 'local', { deep: true });
    await modelCheckOnline(true, 'api', { deep: true });
    const live = providerStatuses();
    const cps = deps.currentProviderStatus();
    (status.providerStatus as any) = { ...cps, statuses: live };
    status.aiStudioModel = cps.model;

    // Update domain coverage from real verifier outcomes
    const allDomains: Array<ToolEntry['domain']> = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];
    let passTotal = 0;
    let passOk = 0;
    allDomains.forEach(d => {
      const domainTools = registry.filter(r => r.domain === d);
      const liveTools = domainTools.filter(t => {
        const cur = t.currentVersion;
        const v = t.versions.find(x => x.version === cur && x.promoted);
        return v?.passed_verifier === true;
      }).length;
      const tried = domainTools.filter(t => {
        const cur = t.currentVersion;
        return t.versions.some(x => x.version === cur && x.promoted);
      }).length;
      if (!status.domainCoverage) status.domainCoverage = {} as any;
      const passRate = tried > 0 ? Math.round((liveTools / tried) * 100) / 100 : 0;
      const health = domainHealth(liveTools, passRate);
      status.domainCoverage[d] = {
        activeGenes: liveTools,
        passRate,
        // P1.6: a domain with ~no genes / ~no pass rate is BROKEN, not covered.
        broken: health.broken,
        ...(health.note ? { note: health.note } : {}),
      };
      passTotal += tried;
      passOk += liveTools;
    });
    status.verifierPassRate = passTotal > 0 ? Math.round((passOk / passTotal) * 100) / 100 : 0;

    // P1.7: capability readiness — a number that can move. The existing
    // `readinessScore` is the recursive-math convergence, not capability; label
    // its basis and expose a separate capability figure.
    {
      const lastBench = deps.latestBenchmarkRef() ?? deps.benchmarkHistoryRef()[deps.benchmarkHistoryRef().length - 1] ?? null;
      const rv = repairVerificationStats(deps.repairVerificationsRef());
      const cap = capabilityReadiness({
        benchmarkSolved: lastBench?.solved ?? 0,
        benchmarkTotal: lastBench?.total ?? 0,
        verified: rv.verified,
        regressed: rv.regressed,
      });
      status.capabilityReadiness = cap.score;
      status.capabilityBasis = cap.basis;
      status.readinessBasis = 'math-loop convergence (not a capability score)';
    }

    status.growthWeights = deps.growthWeightsRef();
    const dreamState = await deps.dreamEngine.status();
    deps.setDreamState(dreamState);
    status.dreamState = dreamState;
    status.swarmStatus = deps.swarmStatusRef();
    status.lastDecision = deps.lastGrowthDecisionRef() || evaluateGrowthDecision(
      deps.registryRef(),
      deps.anomaliesRef(),
      deps.growthWeightsRef(),
      status.generation,
      dreamState.recentThoughts,
      deps.gitHubBlueprintsRef(),
      decisionSynergyInputs().crossDomainSynergyByDomain
    );

    // Real, durable progress (not math-loop readiness). Measured artifacts only.
    const liveSelfHosted = listSelfHostedEntries().filter((e) => e.lastVerified?.passed).length;
    const benchmarkHistory = deps.benchmarkHistoryRef();
    const lastBench = benchmarkHistory[benchmarkHistory.length - 1];
    const anomalies = deps.anomaliesRef();
    const forgeLedger = deps.forgeLedgerRef();
    const forgeMaterialized = forgeLedger.filter((l) => l.status === 'materialized');
    const forgeFailed = forgeLedger.filter((l) => l.status === 'failed');
    status.realProgress = {
      registeredTools: registry.length,
      liveSelfHostedTools: liveSelfHosted,
      forgeMaterialized: forgeMaterialized.length,
      healedTools: status.selfRepair?.totalHealedCount ?? 0,
      benchmarkSolved: lastBench ? lastBench.solved : 0,
      benchmarkTotal: lastBench ? lastBench.total : 0,
      verifierPassRate: typeof status.verifierPassRate === 'number' ? status.verifierPassRate : 0,
      openAnomalies: anomalies.filter((a) => a.status === 'detected').length,
    };

    // Autonomy truth. `registeredTools` counts what exists; it says nothing
    // about whether the machine is running. These blocks exist so the operator
    // readout cannot read as healthy while every capability path is switched
    // off — the failure mode where the dashboard and the code disagreed.
    const forgeLastMaterialized = forgeMaterialized
      .map((l) => l.at)
      .filter((t) => typeof t === 'number' && t > 0)
      .sort((a, b) => b - a)[0] ?? null;
    (status as any).forge = {
      entries: forgeLedger.length,
      materialized: forgeMaterialized.length,
      failed: forgeFailed.length,
      lastMaterializedAt: forgeLastMaterialized,
      // The most common failure reason, so a 58-failure ledger reads as "auth",
      // not as an unexplained number.
      topFailureReason: topFailureReason(forgeFailed),
      // Materialized tools that nothing ever consumed again.
      selfHostedToolsBuilt: forgeMaterialized.length,
      selfHostedToolsLive: liveSelfHosted,
    };

    // Surface learner state so the dashboard reports real episode count +
    // calibration rather than a flat null. Read from the durable store the
    // RecursiveLearner writes through, so the value reflects what survived
    // the last restart — not what an in-memory learner would have.
    try {
      const persisted = await deps.learnerStore.loadState();
      if (persisted) {
        (status as any).learner = {
          episode: persisted.episode ?? 0,
          meanAbsSurprise: persisted.meanAbsSurprise ?? persisted.calibrationError ?? 0,
          ece: persisted.ece ?? 0,
          selfEce: persisted.selfEce ?? 0,
          selfScore: persisted.selfScore ?? 0,
          lastUpdatedAt: persisted.updatedAt ?? null,
        };
      }
    } catch { /* non-fatal: learner is optional status */ }

    res.json({ status, chainIntegrity: integrity });
  });

  router.get('/provenance', async (req, res) => {
    const integrity = deps.verifyChainIntegrity();
    const provenanceEvents = deps.provenanceEventsRef();
    const hashes = provenanceEvents.map((e) => e.hash);
    const served = await deps.serveCapability('provenance_merkle', { hashes });
    res.json({
      events: provenanceEvents,
      integrity,
      merkleRoot: served,
      totalLeaves: hashes.length,
      firstHash: hashes[0] ?? null,
      lastHash: hashes[hashes.length - 1] ?? null,
    });
  });

  router.get('/registry', (req, res) => {
    res.json({ registry: deps.registryRef() });
  });

  // Sandbox backend status (isolated-vm availability + current mode).
  router.get('/sandbox', (req, res) => {
    res.json({
      success: true,
      mode: process.env.RECOURSE_SANDBOX_MODE === 'isolated' ? 'isolated' : 'inproc',
      isolatedAvailable: isIsolateAvailable(),
      // Set RECOURSE_SANDBOX_MODE=isolated to run arbitrary/submitted code in a
      // real memory- and time-bounded isolate with no host-global access.
    });
  });

  // Failures endpoint — surfaces the failure ledger so the operator can see
  // every silently-swallowed error across all autopilots instead of guessing.
  router.get('/failures', (_req, res) => {
    const failureLedger = deps.failureLedger;
    const now = Date.now();
    const recent = failureLedger.filter(e => now - e.at < 3600000); // last hour
    const counts = failureLedger.reduce<Record<string, number>>((acc, f) => {
      acc[f.source] = (acc[f.source] || 0) + 1;
      return acc;
    }, {});
    res.json({
      total: failureLedger.length,
      lastHour: recent.length,
      bySource: counts,
      entries: failureLedger.slice(-50), // newest 50
    });
  });

  // External capability benchmark telemetry (drives the learner reward at weight
  // 0.30). Surfaces the latest run + history + per-problem solved state so the
  // UI can show "is the registry actually more capable", not a self-report.
  router.get('/benchmark', (_req, res) => {
    const benchmarkHistory = deps.benchmarkHistoryRef();
    const latestBenchmark = deps.latestBenchmarkRef();
    const status = deps.statusRef();
    const last = latestBenchmark ?? benchmarkHistory[benchmarkHistory.length - 1] ?? null;
    res.json({
      success: true,
      latest: last,
      history: benchmarkHistory.slice(-30).map((r) => ({ at: r.at, solved: r.solved, total: r.total })),
      totalProblems: allBenchmarkProblems().length,
      problems: allBenchmarkProblems().map((p) => ({
        id: p.id,
        title: p.title,
        domain: p.domain,
        solved: last ? last.solvedIds.includes(p.id) : false,
      })),
      realProgress: status.realProgress ?? null,
      rewardWeightBenchmark: 0.25,
      rewardWeightOutcome: 0.15,
      outcomeReward: deps.outcomeLedger.reward(5) ?? null,
    });
  });

  router.get('/selfuse', (req, res) => {
    res.json({ success: true, selfuse: deps.selfUseStatus() });
  });

  /**
   * VALUE LEDGER — which tools are actually doing anything.
   *
   * Reports real invocations (a caller asked), consumptions (something used
   * the result), and the resulting usefulness. Loop liveness and the
   * self-use differential watchdog are deliberately EXCLUDED: they are
   * verification, not use. A tool that runs constantly but is never consumed
   * scores 0 and shows up under `deadWeight` — this is the metric that was
   * missing while the registry accumulated 1,128 near-duplicate tools.
   */
  router.get('/value', (req, res) => {
    // Optional dep: report honestly instead of throwing when a host omits it.
    const snapshot = deps.valueSnapshot?.();
    if (!snapshot) {
      return res.status(503).json({ success: false, error: 'value snapshot unavailable on this host' });
    }
    res.json({ success: true, ...snapshot });
  });

  // Self-diagnosis: is the system actually working, and what is it costing?
  // Aggregates the three signals that decide that — value signal health, run
  // outcomes, and verification cost — into one report with actionable concerns.
  router.get('/introspection', (_req, res) => {
    const report = deps.introspectionReport?.();
    if (!report) {
      return res.status(503).json({ success: false, error: 'introspection unavailable on this host' });
    }
    res.json({ success: true, ...report });
  });

  // Promoted-tool quality audit, on demand. The scheduler advances this in
  // budgeted slices; an operator (or an unattended loop) can push a bigger slice
  // here instead of waiting out the cadence. `status.promotedQualityAudit`
  // carries the coverage — `pending` is the number that is not yet verified.
  router.post('/quality-audit/run', (req, res) => {
    const runner = deps.runPromotedAudit;
    if (!runner) {
      return res.status(503).json({ success: false, error: 'promoted-tool audit unavailable on this host' });
    }
    const budgetRaw = Number((req.body as { budget?: unknown } | undefined)?.budget ?? (req.query.budget as string | undefined));
    const budget = Number.isFinite(budgetRaw) ? Math.min(500, Math.max(0, Math.floor(budgetRaw))) : 25;
    const summary = runner(budget);
    res.json({
      success: true,
      budget,
      summary: `${summary.audited} audited, ${summary.passed} gate-pass, ${summary.failed} gate-fail, ${summary.cached} cached, ${summary.stillPending} pending, ${summary.skipped} not auditable, ${summary.behavioralGap} suite-only`,
      // Standing exposure: how much of the promoted registry the enhanced
      // (scale/oracle) gate can actually speak to. A large suiteOnly figure means
      // those tools still report health from the old weak gate.
      coverage: summary.coverage,
      failures: summary.failures.slice(0, 25),
      skips: summary.skips.slice(0, 25),
      ms: summary.ms,
    });
  });

  router.get('/quality-audit', (_req, res) => {
    const audit = deps.statusRef().promotedQualityAudit;
    if (!audit) {
      return res.json({ success: true, available: false, note: 'no audit run yet on this boot' });
    }
    res.json({ success: true, available: true, ...audit });
  });

  // Does anything CALL the tools the forge builds? `unconsumed` is the number
  // that decides whether the forge is producing capability or inventory.
  router.get('/forge/consumption', (_req, res) => {
    const report = deps.consumptionReport?.();
    if (!report) {
      return res.status(503).json({ success: false, error: 'consumption report unavailable on this host' });
    }
    res.json({ success: true, ...report });
  });

  // ==========================================================================
  // THE ACCEPTANCE GATE — the one endpoint that answers "is it working?".
  // ==========================================================================
  // Every other readout in Recourse can be green while the system is idle; this
  // one cannot. Each stage passes ONLY on an event recorded by the code that
  // genuinely did that work, within a freshness window matching that stage's
  // real cadence. No evidence = failure, always, with the reason spelled out.
  //
  //   pass:false with a named failing stage is the normal, useful state: it says
  //   exactly which link in the chain is dark. That is the opposite of the
  //   `24/24 enabled` and `powerMod: healthy` readings this exists to replace.
  router.get('/acceptance', (_req, res) => {
    const report = evaluateAcceptance();
    // 200 either way: this is a verdict, not an error. A failing acceptance is a
    // successfully-measured failure, and a 503 would make monitoring read
    // "the gate correctly says no" as "the endpoint is down".
    res.json({ success: true, ...report });
  });

  // System snapshot history (every materially distinct system state).
  router.get('/system/snapshots', (req, res) => {
    const systemSnapshots = deps.systemSnapshotsRef();
    res.json({ success: true, count: systemSnapshots.length, baseline: deps.systemBaselineRef(), snapshots: systemSnapshots });
  });

  // P2.9: the distilled legacy digest — a first-class artifact so old runs inform
  // new work (capability trend, registry/health trend, learner trend, repair
  // patterns, research topics, agenda themes) instead of being re-derived.
  router.get('/legacy-digest', (_req, res) => {
    const legacyDigest = deps.legacyDigestRef();
    res.json({ success: true, available: legacyDigest !== null, digest: legacyDigest });
  });

  // Differential upgrade report: upgraded (current) system vs the boot baseline.
  router.get('/system/upgrade-report', async (req, res) => {
    try {
      const report = await deps.buildUpgradeReport();
      res.json({ success: true, ...report });
    } catch {
      // Never block the report on a model hiccup — fall back to deterministic.
      res.json({ success: true, ...deps.upgradeReport() });
    }
  });

  // Capability adoption status (which generated tools back internal ops).
  router.get('/capabilities', (req, res) => {
    res.json({
      success: true,
      capabilities: deps.capabilitiesRef().map((c) => ({
        id: c.id,
        label: c.label,
        backableTemplateId: c.backableTemplateId,
        method: c.method,
      })),
      ...deps.capabilitiesState(),
    });
  });

  // Real per-generation ledger endpoint (what each 24/7 generation actually did).
  router.get('/generations', (req, res) => {
    const status = deps.statusRef();
    const generationLedger = deps.generationLedgerRef();
    res.json({
      success: true,
      generation: status.generation,
      count: generationLedger.length,
      entries: generationLedger
    });
  });

  router.get('/readout', async (req, res) => {
    const chain = deps.verifyChainIntegrity();
    const status = deps.statusRef();
    const registry = deps.registryRef();
    const provenanceEvents = deps.provenanceEventsRef();
    const legacyDigest = deps.legacyDigestRef();
    let upgrade: ReadoutContext['upgrade'] = undefined;
    let plainUpgrade: string | null = null;
    try {
      const rep = await deps.buildUpgradeReport();
      upgrade = {
        added: rep.diff.addedTools.length,
        removed: rep.diff.removedTools.length,
        upgraded: rep.diff.upgradedTools.length,
        capabilityChanges: rep.diff.capabilityChanges.length,
        netTools: rep.diff.totals.after - rep.diff.totals.before,
      };
      plainUpgrade = rep.plain ?? null;
    } catch { /* upgrade section optional */ }
    const ctx: ReadoutContext = {
      status,
      registry,
      provenanceEvents,
      intake: deps.intakeSnapshot(),
      benchmark: deps.benchmarkState(),
      generation: status.generation,
      chainIntegrity: chain.valid,
      upgrade,
      plainUpgrade,
      legacyDigest,
    };
    res.json({ success: true, markdown: buildDevelopmentReadout(ctx), plain: plainUpgrade, generatedAt: new Date().toISOString() });
  });

  return router;
}

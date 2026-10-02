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
  learnerStore: { loadState(): Promise<{ episode?: number; calibrationError?: number; selfScore?: number; updatedAt?: string } | null> };
  provenanceEventsRef(): ProvenanceEvent[];
  serveCapability(capId: string, ctx: unknown): Promise<unknown>;
  failureLedger: FailureEntry[];
  outcomeLedger: { reward(n: number): number | null | undefined };
  selfUseStatus(): Record<string, unknown>;
  /** Value ledger snapshot: real invocations, consumptions, usefulness, dead weight. */
  valueSnapshot?(): Record<string, unknown>;
  /** Self-diagnosis: value-signal health, run outcomes, verification cost. */
  introspectionReport?(): Record<string, unknown>;
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

export function createReadoutRouter(deps: ReadoutRouterDeps): Router {
  const router = Router();

  router.get('/status', async (req, res) => {
    const integrity = deps.verifyChainIntegrity();
    const status = deps.statusRef();
    const registry = deps.registryRef();
    status.hashChainIntegrity = integrity.valid;
    status.registeredToolsCount = registry.length;
    let pending = 0;
    registry.forEach(r => {
      pending += (r.pendingVersions?.length || 0);
    });
    status.pendingApprovalsCount = pending;

    // Live model provider status (probe both profiles independently).
    const live = providerStatuses();
    await modelCheckOnline(false, 'local');
    await modelCheckOnline(false, 'api');
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
    status.realProgress = {
      registeredTools: registry.length,
      liveSelfHostedTools: liveSelfHosted,
      forgeMaterialized: deps.forgeLedgerRef().filter((l) => l.status === 'materialized').length,
      healedTools: status.selfRepair?.totalHealedCount ?? 0,
      benchmarkSolved: lastBench ? lastBench.solved : 0,
      benchmarkTotal: lastBench ? lastBench.total : 0,
      verifierPassRate: typeof status.verifierPassRate === 'number' ? status.verifierPassRate : 0,
      openAnomalies: anomalies.filter((a) => a.status === 'detected').length,
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
          calibrationError: persisted.calibrationError ?? 0,
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

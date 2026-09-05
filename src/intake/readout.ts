/**
 * Development readout — the "detailed readout at a button push". Aggregates the
 * live engine, intake, and benchmark state into one honest markdown digest.
 * Every number comes from real state; no fabricated claims.
 */
import type { ToolDomain, SystemStatus, ToolEntry, ProvenanceEvent } from '../types';
import type { IntakeSnapshot, BenchmarkState } from './types';

export interface ReadoutContext {
  status: SystemStatus;
  registry: ToolEntry[];
  provenanceEvents: ProvenanceEvent[];
  intake: IntakeSnapshot;
  benchmark: BenchmarkState;
  generation: number;
  chainIntegrity: boolean;
  /** Optional old-vs-new upgrade delta summary (see systemDiff.ts). */
  upgrade?: { added: number; removed: number; upgraded: number; capabilityChanges: number; netTools: number };
  /** Optional plain-language explanation of the upgrade (what changed in
   *  everyday terms). Rendered verbatim so the operator can read the report
   *  without decoding hashes/scores. */
  plainUpgrade?: string | null;
}

const DOMAIN_ORDER: ToolDomain[] = ['math', 'coding', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];

export function buildDevelopmentReadout(ctx: ReadoutContext): string {
  const { status, registry, provenanceEvents, intake, benchmark, generation, chainIntegrity, upgrade, plainUpgrade } = ctx;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const healthy = registry.filter((t) => t.healthStatus === 'healthy').length;
  const degraded = registry.length - healthy;
  const domainLine = DOMAIN_ORDER.map((d) => {
    const c = status.domainCoverage?.[d];
    return c ? `${d}: ${c.activeGenes} gene${c.activeGenes === 1 ? '' : 's'} @ ${Math.round(c.passRate * 100)}%` : d;
  }).join(' | ');

  const benchLatest = benchmark.lastRun
    ? `${benchmark.lastRun.solved}/${benchmark.lastRun.total} solved (${Math.round((benchmark.lastRun.solved / benchmark.lastRun.total) * 100)}%)`
    : 'not run yet';

  const benchTrend = benchmark.history.length
    ? benchmark.history.map((h) => h.solved).join(' → ')
    : 'no history yet';

  const provenanceTypes = new Map<string, number>();
  for (const e of provenanceEvents) provenanceTypes.set(e.type, (provenanceTypes.get(e.type) ?? 0) + 1);
  const topEvents = [...provenanceTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const signalsLine = intake.total
    ? `${intake.total} signals (${intake.unconsumed} pending, ${intake.consumed} grounded)`
    : 'no signals ingested yet';

  const L: string[] = [];
  L.push(`## Recourse Development Readout — Gen ${generation}`);
  L.push('');
  L.push(`Generated: ${now}`);
  L.push('');
  L.push('### Engine');
  L.push(`- Uptime: ${Math.floor((status.uptimeSeconds ?? 0) / 60)}m | Registered tools: ${registry.length} (${healthy} healthy${degraded ? `, ${degraded} degraded` : ''}) | Upgrades: ${status.totalUpgrades}`);
  L.push(`- Verifier pass rate: ${Math.round((status.verifierPassRate ?? 0) * 100)}% | Hash-chain integrity: ${chainIntegrity ? 'OK' : 'BROKEN'}`);
  L.push(`- Model: ${status.providerStatus?.online ? `${status.providerStatus.model} (online)` : 'offline — deterministic loops only'}`);
  L.push('');
  L.push('### Domain coverage');
  L.push(`- ${domainLine}`);
  L.push('');
  L.push('### External intake (learning)');
  L.push(`- ${signalsLine}`);
  if (intake.bySource && Object.keys(intake.bySource).length) {
    L.push(`- By source: ${Object.entries(intake.bySource).map(([s, n]) => `${s}: ${n}`).join(', ')}`);
  }
  L.push(`- Grounded tools from signals: ${intake.groundedTools.length ? intake.groundedTools.join(', ') : 'none yet'}`);
  if (intake.lastGroundSummary) L.push(`- Last grounding: ${intake.lastGroundSummary}`);
  L.push('');
  L.push('### External benchmark (capability, not self-report)');
  L.push(`- Latest: ${benchLatest}`);
  L.push(`- Trend (solved per run): ${benchTrend}`);
  L.push(`- Problem set is FIXED and never changes; growth = live registry solving more of it.`);
  L.push('');
  L.push('### Provenance (last 14d)');
  if (topEvents.length) {
    L.push(topEvents.map(([t, n]) => `- ${t}: ${n}`).join('\n'));
  } else {
    L.push('- none');
  }
  L.push('');
  L.push('### Self-repair');
  L.push(`- Total healed: ${status.selfRepair?.totalHealedCount ?? 0} | Active anomalies: ${status.selfRepair?.activeAnomaliesCount ?? 0} | Success rate: ${Math.round((status.selfRepair?.repairSuccessRate ?? 0) * 100)}%`);
  if (upgrade) {
    L.push('');
    L.push('### Upgrade delta vs boot baseline (old → new system)');
    L.push(`- Tools: ${upgrade.netTools > 0 ? '+' : ''}${upgrade.netTools} net (${upgrade.added} added, ${upgrade.removed} removed, ${upgrade.upgraded} upgraded)`);
    if (upgrade.capabilityChanges) L.push(`- Capability (dogfood) changes: ${upgrade.capabilityChanges}`);
    if (plainUpgrade) {
      L.push('');
      L.push('**In plain terms:**');
      L.push(...plainUpgrade.split('\n').map((l) => l.replace(/^#{1,6}\s*/, '### ')));
    }
  }
  return L.join('\n');
}

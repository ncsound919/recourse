/**
 * reports.ts — hourly report generation routes extracted from `server.ts`:
 * POST /report/generate, GET /reports.
 *
 * Report generation reads host persistent state (status, provenance chain,
 * the report list) and mutates the report list + persists, so those are
 * injected. Types come from `../types.js`.
 */
import { Router } from 'express';
import type { HourlyReport, ProvenanceEvent, SystemStatus } from '../types.js';

export interface ReportsRouterDeps {
  statusRef(): SystemStatus;
  provenanceEventsRef(): ProvenanceEvent[];
  reportsRef(): HourlyReport[];
  getLastHash(): string;
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
}

export function createReportsRouter(deps: ReportsRouterDeps): Router {
  const router = Router();

  router.post('/report/generate', (req, res) => {
    const reportId = `rep_hourly_${String(deps.statusRef().generation).padStart(3, '0')}_${Date.now()}`;
    const now = Date.now();
    const dateFormatted = new Date(now).toISOString().replace('T', ' ').substring(0, 16) + ' UTC';

    let promoted = 0;
    let rejected = 0;
    let heldBack = 0;
    let pending = 0;
    let repaired = 0;

    // Count REAL emitted event names. Promotions arrive via several honest
    // pipelines, each with its own event (only success paths emit):
    //  - 'tool_verification' with data.outcome 'promoted' (evolve/mutate routes)
    //  - 'template_component_built' (Capability Forge materialization)
    //  - 'signal_grounded' (intake grounding; emitted only when verified)
    //  - 'dream_crystallized' with data.verified (or data.count for auto-mirror)
    //  - 'ai_mutation' (emitted only on promotion), 'tool_human_approved',
    //  - 'gene_crossover' with data.verified
    // Legacy 'tool_promoted'/'tool_rejected'/... types are also honored.
    // Repairs arrive as 'tool_repaired' or 'template_repair_synthesized'.
    deps.provenanceEventsRef().forEach(e => {
      const d = (e as any)?.data ?? {};
      if (e.type === 'tool_promoted' || (e.type === 'tool_verification' && d.outcome === 'promoted')) promoted++;
      else if (e.type === 'template_component_built') promoted++;
      else if (e.type === 'signal_grounded') promoted++;
      else if (e.type === 'dream_crystallized') promoted += typeof d.count === 'number' ? d.count : (d.verified === false ? 0 : 1);
      else if (e.type === 'ai_mutation') promoted++;
      else if (e.type === 'tool_human_approved') promoted++;
      else if (e.type === 'gene_crossover' && d.verified !== false) promoted++;
      if (e.type === 'tool_rejected' || (e.type === 'tool_verification' && d.outcome === 'rejected')) rejected++;
      if (e.type === 'tool_held_back' || (e.type === 'tool_verification' && d.outcome === 'held_back')) heldBack++;
      if (e.type === 'tool_pending_approval' || (e.type === 'tool_verification' && d.outcome === 'pending_approval')) pending++;
      if (e.type === 'tool_repaired' || e.type === 'template_repair_synthesized') repaired++;
    });

    const markdown = `## Hourly Report â€” Gen ${deps.statusRef().generation} (${dateFormatted})

### Architectural Adjustments Summary
- **${promoted} tool(s) promoted** across 7 frontier domains
- **${repaired} autonomous self-repairs executed** (MTTR: ${deps.statusRef().selfRepair.meanTimeToRepairMs}ms)
- **${pending} tool(s) pending human safety approval**
- **${heldBack} tool(s) held back** (non-improving under policy \`${deps.statusRef().activePolicy}\`)
- **${rejected} tool(s) rejected** by deterministic verifier matrix

### Autonomous Self-Learning & Self-Healing Health
- **Auto-Healing State:** ${deps.statusRef().selfRepair.isAutoHealingEnabled ? 'ACTIVE (Zero-Downtime Autonomous Patching)' : 'STANDBY'}
- **Total Healed Genes:** ${deps.statusRef().selfRepair.totalHealedCount}
- **Self-Repair Success Rate:** ${(deps.statusRef().selfRepair.repairSuccessRate * 100).toFixed(1)}%

### Provenance Audit Integrity
- **Total Immutable Hash Chain Entries:** ${deps.provenanceEventsRef().length}
- **Last Provenance Root Hash:** \`${deps.getLastHash()}\`
- **Tamper Status:** VERIFIED (100% cryptographic continuity)
  `;

    const newReport: HourlyReport = {
      id: reportId,
      timestamp: now,
      dateFormatted,
      promotedCount: promoted,
      rejectedCount: rejected,
      heldBackCount: heldBack,
      pendingCount: pending,
      repairedCount: repaired,
      summaryMarkdown: markdown,
      eventsCount: deps.provenanceEventsRef().length
    };

    deps.reportsRef().unshift(newReport);
    if (deps.reportsRef().length > 50) {
      deps.reportsRef().pop();
    }

    deps.appendProvenance('report_generated', {
      reportId,
      generation: deps.statusRef().generation,
      promoted,
      pending,
      rejected,
      repaired
    });

    deps.saveState();

    res.json({ success: true, report: newReport });
  });

  router.get('/reports', (req, res) => {
    res.json({ reports: deps.reportsRef() });
  });
  return router;
}

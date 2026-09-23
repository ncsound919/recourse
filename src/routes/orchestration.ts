/**
 * orchestration.ts — phased subsystem orchestration plus issue-progression and
 * research-report surfaces, extracted from the `server.ts` monolith.
 *
 * The subsystem orchestrator is imported lazily (as it was inline) so boot does
 * not pull the heavier module; issue/report helpers are pure libs.
 */
import { Router } from 'express';
import {
  readIssueRecords,
  renderIssueDocs,
  renderIssueIndex,
} from '../lib/issueTracker.js';
import {
  generateFleetReport,
  renderDailyReport,
  recentReports,
} from '../lib/researchReports.js';

export interface OrchestrationRouterDeps {
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
}

export function createOrchestrationRouter(deps: OrchestrationRouterDeps): Router {
  const router = Router();

  // --- Phased subsystem orchestration --------------------------------------
  router.get('/orchestration/status', async (_req, res) => {
    const { SUBSYSTEMS, sampleResources, pm2Table } = await import('../lib/subsystemOrchestrator.js');
    const resources = sampleResources();
    const table = await pm2Table();
    const subsystems = SUBSYSTEMS.map((s) => ({
      id: s.id, pm2Name: s.pm2Name, port: s.port, phase: s.phase, control: !!s.control,
      label: s.label,
      status: table[s.pm2Name]?.status ?? 'unknown',
      cpu: table[s.pm2Name]?.cpu ?? 0,
      memMB: table[s.pm2Name]?.mem ?? 0,
    }));
    res.json({ success: true, resources, subsystems });
  });

  router.post('/orchestration/run', async (req, res) => {
    const phase = req.body?.phase;
    const { orchestrate } = await import('../lib/subsystemOrchestrator.js');
    const apply = req.body?.apply !== false;
    const result = await orchestrate(phase, { apply });
    res.json({ success: true, ...result });
  });

  // --- Issue progression + research reports --------------------------------
  router.get('/issues', (_req, res) => {
    const records = readIssueRecords();
    res.json({ success: true, count: records.length, issues: records });
  });

  router.post('/issues/refresh', (_req, res) => {
    try {
      renderIssueDocs();
      renderIssueIndex();
      const records = readIssueRecords();
      res.json({ success: true, count: records.length, issues: records });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'issue refresh failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get('/reports', (_req, res) => {
    const files = recentReports(20);
    res.json({ success: true, count: files.length, reports: files });
  });

  router.post('/reports/generate', async (_req, res) => {
    try {
      const daily = await renderDailyReport();
      renderIssueDocs();
      renderIssueIndex();
      const report = await generateFleetReport();
      deps.appendProvenance('report_generated', {
        driverId: 'research_reports',
        files: daily.files,
        issues: report.issues.length,
      });
      res.json({ success: true, files: daily.files, report });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'report generation failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

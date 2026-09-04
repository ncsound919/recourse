/**
 * Web channel routes — AgentBrowser download/fetch surface.
 *
 * First cluster extracted out of the server.ts monolith, as the pattern for
 * the rest of the split. Each feature cluster becomes its own module under
 * src/server/routes that exports a `create*Router(deps)` factory. The factory
 * receives only the shared server concerns it actually uses (a narrow deps
 * bag), so a router stays readable and testable without importing the whole
 * monolith.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { agentBrowserConfig, agentBrowserOnline, agentBrowserFetch } from '../../lib/agentBrowser.js';
import type { AgentBrowserMode } from '../../lib/agentBrowser.js';
import type { ProvenanceEvent } from '../../types.js';

export interface WebChannelDeps {
  /** Record a provenance event (server-owned durable ledger). */
  appendProvenanceEvent(type: ProvenanceEvent['type'], data: Record<string, any>): void;
}

const DOWNLOAD_MODES = ['download', 'reader', 'extract', 'search'] as const;

export function createWebChannelRouter(deps: WebChannelDeps): Router {
  const router = Router();

  // Download / fetch a web URL through AgentBrowser (download, reader, extract, search).
  router.get('/api/recourse/web/agentbrowser', async (_req: Request, res: Response) => {
    try {
      const cfg = agentBrowserConfig();
      const online = cfg.configured ? await agentBrowserOnline() : false;
      res.json({ success: true, configured: cfg.configured, baseUrl: cfg.baseUrl, online });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/api/recourse/web/download', async (req: Request, res: Response) => {
    try {
      const { url, mode, selectors } = req.body ?? {};
      if (typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ success: false, error: 'url is required' });
      }
      const m = (DOWNLOAD_MODES as readonly string[]).includes(mode) ? mode : 'download';
      const result = await agentBrowserFetch({
        url,
        mode: m as AgentBrowserMode,
        selectors: Array.isArray(selectors) ? selectors.map(String) : undefined,
      });
      deps.appendProvenanceEvent('intake_poll', {
        source: 'agentbrowser',
        url: url.slice(0, 300),
        mode: m,
        ok: result.ok,
        httpStatus: result.httpStatus,
      });
      res.json({ success: result.ok, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

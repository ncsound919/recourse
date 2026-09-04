// api/recourse/dream/[action].ts — Vercel serverless route backing
// DreamingEngineView. Place at exactly this path so the dynamic [action]
// segment matches status | toggle | tick | crystallize | cron.
//
// Endpoint contract (matches the existing view exactly):
//   GET  /api/recourse/dream/status       -> { success, dreamState }
//   POST /api/recourse/dream/toggle       -> { success, isDreamingActive }
//   POST /api/recourse/dream/tick         -> { success, dreamState, newThought }
//   POST /api/recourse/dream/crystallize  -> { success, crystallizedTool: { name, ... } }
//   GET  /api/recourse/dream/cron         -> catch-up tick driver (scheduler target)
//
// Requires: npm i -D @vercel/node

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DreamingEngine } from '../../../src/dream/engine';
import { createDreamStore } from '../../../src/dream/store';

const engine = new DreamingEngine(createDreamStore());

const MAX_CATCHUP_TICKS = 60;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  res.setHeader('Cache-Control', 'no-store');
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  try {
    switch (action) {
      case 'status': {
        if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });
        const dreamState = await engine.status();
        return res.status(200).json({ success: true, dreamState });
      }

      case 'toggle': {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
        const isDreamingActive = await engine.toggle();
        return res.status(200).json({ success: true, isDreamingActive });
      }

      case 'tick': {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
        const r = await engine.tick();
        return res.status(200).json({
          success: true,
          dreamState: r.dreamState,
          newThought: r.newThought,
          phaseReport: r.phaseReport,
        });
      }

      case 'crystallize': {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
        const thoughtId = req.body?.thoughtId;
        if (!thoughtId || typeof thoughtId !== 'string') {
          return res.status(400).json({ success: false, error: 'thoughtId required' });
        }
        const r = await engine.crystallize(thoughtId);
        return res.status(r.success ? 200 : 422).json(r);
      }

      case 'cron': {
        // Scheduler target for the "always-on" loop. Optionally protected by
        // a shared secret: set DREAM_CRON_SECRET and send `x-dream-secret`.
        if (process.env.DREAM_CRON_SECRET && req.headers['x-dream-secret'] !== process.env.DREAM_CRON_SECRET) {
          return res.status(401).json({ success: false, error: 'unauthorized' });
        }
        const r = await engine.runCatchUpTicks(MAX_CATCHUP_TICKS);
        return res.status(200).json({ success: true, ...r });
      }

      default:
        return res.status(404).json({ success: false, error: `unknown dream action: ${action}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'dream engine error';
    console.error(`[dream:${action}]`, err);
    return res.status(500).json({ success: false, error: message });
  }
}

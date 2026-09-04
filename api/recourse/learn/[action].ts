// api/recourse/learn/[action].ts — Vercel serverless route for the
// Recursive Learner. Place at exactly this path so [action] matches
// status | episode | run | replay | directives.
//
// Endpoint contract:
//   GET  /api/recourse/learn/status      -> live learner state (beliefs, meta, selfScore)
//   POST /api/recourse/learn/episode     -> run exactly one learning episode
//   POST /api/recourse/learn/run         -> { episodes?: n } batch run (default 5, max 50)
//   POST /api/recourse/learn/replay      -> re-execute ledger from genesis, prove determinism
//   GET  /api/recourse/learn/directives  -> current retire/refine/amplify directives
//
// Optional cron wiring (same catch-up pattern as the dream engine):
//   { "crons": [{ "path": "/api/recourse/learn/run?episodes=10", "schedule": "0 4 * * *" }] }
//
// Requires: npm i -D @vercel/node

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createLearnerStore, RecursiveLearner } from '../../../src/dream/learner';
import { requireMutationAuth, serverError } from '../_guard';

const MAX_BATCH_EPISODES = 50;

function publicView(state: ReturnType<RecursiveLearner['status']> extends Promise<infer T> ? T : never) {
  const beliefs = Object.values(state.geneBeliefs).sort((a, b) => b.weight - a.weight);
  return {
    episode: state.episode,
    meta: state.meta,
    selfScore: state.selfScore,
    calibrationError: state.calibrationError,
    ledgerHead: state.ledgerHead,
    updatedAt: state.updatedAt,
    geneCount: beliefs.length,
    topGenes: beliefs.slice(0, 10).map((b) => ({
      geneName: b.geneName,
      domain: b.domain,
      attempts: b.attempts,
      meanReward: b.meanReward,
      weight: b.weight,
      posteriorMean: Number((b.alpha / (b.alpha + b.beta)).toFixed(4)),
    })),
    directives: state.directives,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  res.setHeader('Cache-Control', 'no-store');
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  const store = createLearnerStore();
  const learner = new RecursiveLearner(store);

  if (!requireMutationAuth(req, res)) return;

  try {
    switch (action) {
      case 'status': {
        if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });
        const state = await learner.status();
        return res.status(200).json({ success: true, state: publicView(state) });
      }

      case 'episode': {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
        const report = await learner.runEpisode();
        return res.status(200).json({ success: true, report });
      }

      case 'run': {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
        const raw = Number(req.query.episodes ?? req.body?.episodes ?? 5);
        const episodes = Number.isFinite(raw) ? Math.max(1, Math.min(MAX_BATCH_EPISODES, Math.floor(raw))) : 5;
        const reports = await learner.runEpisodes(episodes);
        return res.status(200).json({ success: true, episodesRun: reports.length, reports });
      }

      case 'replay': {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
        const replay = await learner.replayFromGenesis();
        return res.status(200).json({ success: true, replay });
      }

      case 'directives': {
        if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'GET only' });
        const state = await learner.status();
        return res.status(200).json({ success: true, directives: state.directives });
      }

      default:
        return res.status(404).json({ success: false, error: `unknown learn action: ${action}` });
    }
  } catch (err) {
    return serverError(res, err, `learn:${action}`);
  }
}

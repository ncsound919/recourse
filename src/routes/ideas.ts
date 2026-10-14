/**
 * ideas.ts — the fleet-partner telemetry intake: external tool ideas from
 * systems like SIEVE, into the state consumed by runForgeCycle.
 *
 * Separated from /fleet/memory (which drives the learning/dream vector store):
 * these are EXECUTION requests — "build a tool for this precisely-shaped
 * signal". They must carry their own contract (>=2 asserts) so the generated
 * tool faces the same gates as any forge capability.
 */
import { Router } from 'express';
import {
  ingestIdeas, markIdeaOutcome, pickIdeasForForge, summarizeIdeas, type ExternalStateIdea,
} from '../lib/externalIdeas.js';
import { requireMutationAuth } from '../lib/mutationAuth.js';

export interface IdeasRouterDeps {
  ideasRef(): ExternalStateIdea[];
  builtNames(): ReadonlySet<string>;
  quarantine(): Map<string, number>;
  saveState(): void;
  requireMutationAuth(req: any, res: any): boolean;
}

export function createIdeasRouter(deps: IdeasRouterDeps): Router {
  const router = Router();

  /** POST one batch of idea cards (Sieve -> Recourse). Idempotent by id. */
  router.post('/fleet/ideas', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const body = req.body as { ideas?: unknown[] } | undefined;
    const list = Array.isArray(body?.ideas) ? body!.ideas : [];
    if (!list.length) return res.status(400).json({ success: false, error: 'ideas array is required' });
    const result = ingestIdeas(list.slice(0, 20), deps.ideasRef());
    if (result.accepted.length) deps.saveState();
    res.json({
      success: true,
      accepted: result.accepted.length,
      rejected: result.rejected.slice(0, 10),
      summary: summarizeIdeas(deps.ideasRef()),
    });
  });

  /** Read-only status: what the telemetry said, what the forge did about it. */
  router.get('/fleet/ideas/status', (req, res) => {
    const ideas = deps.ideasRef();
    const summary = summarizeIdeas(ideas);
    const nextUp = pickIdeasForForge(ideas, { built: deps.builtNames(), quarantine: deps.quarantine(), limit: 5 })
      .map((i) => ({ id: i.id, toolName: i.toolName, title: i.title, domain: i.domain, score: i.score ?? 0.5 }));
    res.json({
      success: true,
      summary,
      // Closed-loop accountability: the forge marked built/failed with its own name+hash.
      built: ideas.filter((i) => i.status === 'built').map((i) => ({ id: i.id, toolName: i.builtTool, versionHash: i.builtVersionHash, at: i.builtAt })).slice(0, 20),
      failed: ideas.filter((i) => i.status === 'failed').map((i) => ({ id: i.id, toolName: i.toolName, reason: i.failureReason })).slice(0, 20),
      nextUp,
    });
  });

  // Operator/test hook: force-mark a card (tested and reachable without the
  // forge loop when a caller already knows the outcome).
  router.post('/fleet/ideas/:id/outcome', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const { status, toolName, versionHash, failureReason } = req.body ?? {};
    if (!['built', 'failed', 'quarantined'].includes(String(status))) {
      return res.status(400).json({ success: false, error: 'status must be built|failed|quarantined' });
    }
    const ok = markIdeaOutcome(deps.ideasRef(), req.params.id, {
      status,
      toolName: typeof toolName === 'string' ? toolName : undefined,
      versionHash: typeof versionHash === 'string' ? versionHash : undefined,
      failureReason: typeof failureReason === 'string' ? failureReason : undefined,
    });
    if (!ok) return res.status(404).json({ success: false, error: 'unknown idea id' });
    deps.saveState();
    res.json({ success: true, summary: summarizeIdeas(deps.ideasRef()) });
  });

  return router;
}

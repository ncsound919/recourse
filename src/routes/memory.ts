/**
 * memory.ts — the vector/semantic memory + fleet-memory surface extracted from
 * the `server.ts` monolith.
 *
 * The vector-memory singleton, the system-memory indexer, and the OpenHub fleet
 * signal are host-owned (they read other live state), so they are injected. The
 * tiered-store and skill-promotion helpers are pure libs imported directly.
 */
import { Router } from 'express';
import {
  memoryStoreStatus,
  consolidateSemanticMemory,
  runSkillPromotionPass,
} from '../lib/recourseActivator.js';
import { buildFleetMemoryEntry } from '../lib/fleetMemory.js';
import { requireMutationAuth } from '../lib/mutationAuth.js';

export interface MemoryRouterDeps {
  ensureVectorMemory(): Promise<{
    status(): Promise<unknown>;
    recall(q: string, kind: string | null, topK: number): Promise<Array<{ id: string; kind: string; text: string; score: number }>>;
    remember(kind: string, id: string, text: string, meta?: unknown): Promise<unknown>;
  }>;
  indexSystemMemory(): Promise<{ indexed: number; status: unknown }>;
  openhubFleetSignal(): Promise<{
    beliefs: unknown[];
    reportAt: unknown;
    degraded: boolean;
    health: unknown;
    auditSignals: unknown;
  }>;
}

export function createMemoryRouter(deps: MemoryRouterDeps): Router {
  const router = Router();

  router.get('/memory/status', async (_req, res) => {
    try { res.json({ success: true, status: await (await deps.ensureVectorMemory()).status() }); }
    catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.post('/memory/index', async (_req, res) => {
    try { res.json({ success: true, ...(await deps.indexSystemMemory()) }); }
    catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Tiered memory (episodic + semantic): durable SQLite-backed store status.
  router.get('/memory/tiered', (_req, res) => {
    res.json({ success: true, ...memoryStoreStatus() });
  });

  // Consolidate episode clusters into durable semantic facts (idempotent).
  router.post('/memory/consolidate', (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    try {
      const minClusterSize = Math.max(1, Number(req.body?.minClusterSize) || 2);
      const created = consolidateSemanticMemory({ minClusterSize });
      res.json({ success: true, created: created.length, facts: created, ...memoryStoreStatus() });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Skill auto-promotion pass: detect generalist genes, then verify + lint +
  // export the verified self-hosted tool backing them as a SKILL.md folder.
  router.post('/memory/promote-skills', async (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    try {
      const minDistinctProblemWins = Math.max(1, Number(req.body?.minDistinctProblemWins) || 2);
      const maxPerRun = Math.min(10, Math.max(1, Number(req.body?.maxPerRun) || 3));
      const result = await runSkillPromotionPass({ minDistinctProblemWins, maxPerRun });
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get('/memory/recall', async (req, res) => {
    try {
      const q = String(req.query.q || '');
      const kind = (req.query.kind as string) || null;
      const topK = Math.min(Number(req.query.topK || 5), 20);
      const mem = await deps.ensureVectorMemory();
      const hits = q ? await mem.recall(q, kind, topK) : [];
      res.json({ success: true, query: q, hits: hits.map((h) => ({ id: h.id, kind: h.kind, text: h.text.slice(0, 300), score: h.score })) });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Fleet memory intake — external agent loops write their real outcomes into
  // Recourse's durable vector memory. Guarded fail-closed: mutates durable
  // state, so it requires RECOURSE_API_SECRET.
  router.post('/fleet/memory', async (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    try {
      const entry = buildFleetMemoryEntry(req.body ?? {});
      if (!entry.ok) {
        const status = entry.error?.includes('exceeds') ? 413 : 400;
        return res.status(status).json({ success: false, error: entry.error });
      }
      const mem = await deps.ensureVectorMemory();
      await mem.remember(entry.kind!, entry.id!, entry.text!, entry.meta);
      res.json({ success: true, indexed: 1, id: entry.id, kind: entry.kind, source: entry.meta?.source, status: await mem.status() });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Fleet signal read surface — what Recourse derives from the latest external
  // self-report (OpenHub). Read-only and honest.
  router.get('/fleet/signal', async (_req, res) => {
    try {
      const signal = await deps.openhubFleetSignal();
      res.json({
        success: true,
        available: signal.beliefs.length > 0,
        source: 'openhub',
        reportAt: signal.reportAt,
        degraded: signal.degraded,
        health: signal.health,
        belief: signal.beliefs[0] ?? null,
        auditSignals: signal.auditSignals,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}

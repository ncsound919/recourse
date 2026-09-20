/**
 * rating.ts — cross-app pairwise rating API.
 *
 * A generic, source-tagged preference store any client (ChordStudio today) can
 * POST blind A/B choices to and read ranked standings from. It is deliberately
 * separate from the composer learner: this store never re-generates the audio,
 * it only records what the client says it heard.
 *
 * GET routes are CORS-open (a browser client on another origin can rank).
 * POST routes are mutation-guarded by the host.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { RatingStore, RegisterVariationInput } from '../lib/rating/store.js';
import { RATING_SYSTEM } from '../lib/rating/types.js';

export interface RatingRouterDeps {
  store: RatingStore;
  /** Fail-closed or config-gated guard supplied by the host. */
  requireMutationAuth: (req: Request, res: Response) => boolean;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function createRatingRouter(deps: RatingRouterDeps): Router {
  const router = Router();
  const { store } = deps;

  // Cross-origin clients (e.g. the ChordStudio WebView) must be able to read
  // and write. Auth is a header secret, not a cookie, so a wildcard origin is
  // safe here and no credentials mode is used.
  router.use('/rating', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Secret');
    res.header('Access-Control-Max-Age', '600');
    res.header('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  /** Ranked standings, recomputed from the ledger on every call. */
  router.get('/rating/standings', (req, res) => {
    const source = asString(req.query.source);
    const minMatches = asNumber(req.query.minMatches);
    const standings = store.standings({ source, minMatches });
    res.json({
      success: true,
      ratingSystem: RATING_SYSTEM,
      source: source ?? null,
      count: standings.length,
      standings,
    });
  });

  router.get('/rating/variations', (req, res) => {
    const source = asString(req.query.source);
    res.json({ success: true, variations: store.variations({ source }) });
  });

  /**
   * Ranked parents for an evolutionary loop: the top standing variations with
   * their original `params`, so a client can seed its next batch from what has
   * actually been preferred. This is the return leg of the loop.
   */
  router.get('/rating/suggest', (req, res) => {
    const source = asString(req.query.source);
    const count = Math.min(50, Math.max(1, asNumber(req.query.count) ?? 8));
    const minMatches = Math.max(0, asNumber(req.query.minMatches) ?? 1);
    const byHash = new Map(store.variations({ source }).map((v) => [v.paramHash, v]));
    const standings = store.standings({ source, minMatches });
    const suggestions = standings.slice(0, count).map((s) => {
      const v = byHash.get(s.paramHash);
      return { ...s, label: v?.label, params: v?.params ?? {} };
    });
    res.json({
      success: true,
      source: source ?? null,
      minMatches,
      count: suggestions.length,
      // Fewer than two rated parents means the client must cold-start.
      coldStart: suggestions.length < 2,
      suggestions,
    });
  });

  /** Deterministic next pair for a client to put in front of a human. */
  router.get('/rating/pair/next', (req, res) => {
    const source = asString(req.query.source);
    const pair = store.nextPair({ source });
    if (!pair) {
      return res.json({ success: false, error: 'need at least two variations', a: null, b: null });
    }
    res.json({ success: true, sessionId: asString(req.query.sessionId), a: pair.a, b: pair.b });
  });

  /** Ledger integrity: valid prefix, head hash, record count. */
  router.get('/rating/ledger', (req, res) => {
    const include = req.query.include === 'records';
    res.json({
      success: true,
      ratingSystem: RATING_SYSTEM,
      ...store.verify(),
      file: store.filePath,
      ...(include ? { variations: store.variations(), choices: store.choices() } : {}),
    });
  });

  /** Register (or fetch) a variation. Idempotent on paramHash. */
  router.post('/rating/variation', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const b = req.body ?? {};
      const source = asString(b.source);
      if (!source) return res.status(400).json({ success: false, error: 'source is required' });
      if (!b.params || typeof b.params !== 'object' || Array.isArray(b.params)) {
        return res.status(400).json({ success: false, error: 'params must be an object' });
      }
      const input: RegisterVariationInput = {
        source,
        params: b.params as Record<string, unknown>,
        paramHash: asString(b.paramHash),
        label: asString(b.label),
        seedId: asString(b.seedId),
        generation: asNumber(b.generation),
        origin: asString(b.origin),
        createdAt: asNumber(b.createdAt),
      };
      const variation = store.registerVariation(input);
      res.json({ success: true, variation });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  /**
   * Record one blind A/B choice. `a`/`b` may be full descriptors (registered
   * on the fly) or bare paramHash strings for pre-registered variations.
   */
  router.post('/rating/pair', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const b = req.body ?? {};
      const source = asString(b.source);
      if (!source) return res.status(400).json({ success: false, error: 'source is required' });
      const winner = b.winner === 'A' || b.winner === 'B' ? (b.winner as 'A' | 'B') : undefined;
      if (!winner) return res.status(400).json({ success: false, error: "winner must be 'A' or 'B'" });

      const resolveHash = (side: unknown, label: 'a' | 'b'): string => {
        if (typeof side === 'string') return side;
        if (side && typeof side === 'object') {
          const desc = side as Record<string, unknown>;
          if (!desc.params || typeof desc.params !== 'object' || Array.isArray(desc.params)) {
            throw new Error(`side ${label} requires params`);
          }
          return store.registerVariation({
            source,
            params: desc.params as Record<string, unknown>,
            paramHash: asString(desc.paramHash),
            label: asString(desc.label),
            seedId: asString(desc.seedId),
            generation: asNumber(desc.generation),
            origin: asString(desc.origin),
            createdAt: asNumber(desc.createdAt),
          }).paramHash;
        }
        throw new Error('each side must be a paramHash string or a descriptor object');
      };

      const aHash = resolveHash(b.a, 'a');
      const bHash = resolveHash(b.b, 'b');
      const confidence = b.confidence === 1 || b.confidence === 2 || b.confidence === 3 ? b.confidence : undefined;
      const dimensions =
        b.dimensions && typeof b.dimensions === 'object'
          ? {
              tags: Array.isArray(b.dimensions.tags) ? b.dimensions.tags.map(String) : undefined,
              note: typeof b.dimensions.note === 'string' ? b.dimensions.note.slice(0, 200) : undefined,
            }
          : undefined;

      const choice = store.recordPair({
        source,
        aHash,
        bHash,
        winner,
        pairId: asString(b.pairId),
        sessionId: asString(b.sessionId),
        confidence,
        dimensions,
        listenMsA: asNumber(b.listenMsA),
        listenMsB: asNumber(b.listenMsB),
        elapsedMs: asNumber(b.elapsedMs),
        decidedAt: asNumber(b.decidedAt),
      });
      const standings = store.standings({ source });
      res.json({
        success: true,
        choice,
        ratingSystem: RATING_SYSTEM,
        a: standings.find((s) => s.paramHash === aHash) ?? null,
        b: standings.find((s) => s.paramHash === bHash) ?? null,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  return router;
}

/**
 * researchGrounding.ts — the operator surface for evidence gathering.
 *
 * Mounted at `/api/recourse/grounding`. The forge gathers grounding on every
 * cycle, which means it runs unattended; this route exists so an operator can
 * see what it is about to see, and why.
 *
 * `GET /preview` is the interesting one: it runs the real gatherer against a real
 * query and returns the *prompt text that would be injected*, without touching
 * the forge. That is the only way to check a trust-classification or a relevance
 * threshold by reading the consequence rather than the configuration.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';

import { gatherGrounding, groundingQuery, describeGrounding } from '../lib/researchGrounding/gather.js';
import { groundingSection } from '../lib/researchGrounding/prompt.js';
import {
  PROVIDER_RULES,
  groundingEnabled,
  omniresearchUrl,
  serviceHealth,
  synthbookUrl,
} from '../lib/researchGrounding/providers.js';
import { filterByRelevance } from '../lib/researchGrounding/relevance.js';
import {
  latestGroundingFor,
  readGroundingLedger,
  verifyGroundingRecords,
} from '../lib/researchGrounding/ledger.js';

export interface GroundingRouterDeps {
  requireMutationAuth: (req: Request, res: Response) => boolean;
  /** Injectable for tests; defaults to the real gatherer. */
  gather?: typeof gatherGrounding;
  /** Injectable for tests; defaults to the on-disk ledger. */
  ledgerFile?: string;
}

export function createGroundingRouter(deps: GroundingRouterDeps): Router {
  const router = Router();
  const gather = deps.gather ?? gatherGrounding;

  /** Configuration and the trust registry. The registry is the audit trail. */
  router.get('/', (_req, res) => {
    res.json({
      success: true,
      enabled: groundingEnabled(),
      services: { synthbook: synthbookUrl(), omniresearch: omniresearchUrl() },
      trustRegistry: PROVIDER_RULES.map((r) => ({
        provider: `${r.service}/${r.provider}`,
        trust: r.trust,
        quotable: r.trust === 'retrieved',
        why: r.why,
      })),
    });
  });

  /** Live reachability of both services. */
  router.get('/health', async (_req, res) => {
    const [synthbook, omniresearch] = await Promise.all([serviceHealth('synthbook'), serviceHealth('omniresearch')]);
    res.json({
      success: true,
      // A service being up says nothing about whether its model lane is; the
      // forge's keyless routes are the ones that survive a gateway outage, so
      // that is what the verdict reports.
      synthbook: { online: synthbook.ok, latencyMs: synthbook.latencyMs, error: synthbook.error || null },
      omniresearch: { online: omniresearch.ok, latencyMs: omniresearch.latencyMs, error: omniresearch.error || null },
    });
  });

  /**
   * Run the real gatherer and show exactly what would reach the model.
   *
   * Read-only: it fetches from third parties but changes nothing here, which is
   * why it is not behind the mutation guard even though it is a POST (the body
   * carries a query).
   */
  router.post('/preview', async (req, res) => {
    const title = String(req.body?.title ?? '');
    const prompt = String(req.body?.prompt ?? title);
    const id = String(req.body?.id ?? 'preview');
    if (!title.trim() && !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'title or prompt is required' });
    }
    const domain = typeof req.body?.domain === 'string' ? req.body.domain : undefined;
    const minRelevance = typeof req.body?.minRelevance === 'number' ? req.body.minRelevance : undefined;
    const bundle = await gather(
      { id, title, prompt, ...(domain ? { domain } : {}) },
      { ...(minRelevance !== undefined ? { minRelevance } : {}), ...(req.body?.query ? { query: String(req.body.query) } : {}) },
    );
    return res.json({
      success: true,
      query: bundle.query,
      derivedQuery: groundingQuery({ id, title, prompt, ...(domain ? { domain } : {}) }),
      summary: describeGrounding(bundle),
      degraded: bundle.degraded,
      degradedReasons: bundle.degradedReasons,
      providers: bundle.providers,
      quotable: bundle.quotable,
      leads: bundle.sources.filter((s) => s !== undefined),
      hash: bundle.hash,
      // The actual text injected into the generation prompt.
      promptSection: groundingSection(bundle),
    });
  });

  /**
   * What a looser or stricter relevance threshold would have kept.
   *
   * The threshold is the one parameter most likely to need tuning per domain, and
   * tuning it blind is how you end up quoting astrophysics into an entropy
   * implementation. This gathers with the filter bypassed and then re-applies it
   * at several settings, so the dropped items are visible rather than inferred.
   */
  router.post('/threshold', async (req, res) => {
    const target = {
      id: String(req.body?.id ?? 'preview'),
      title: String(req.body?.title ?? ''),
      prompt: String(req.body?.prompt ?? String(req.body?.title ?? '')),
      ...(typeof req.body?.domain === 'string' ? { domain: req.body.domain } : {}),
    };
    if (!target.title.trim() && !target.prompt.trim()) {
      return res.status(400).json({ success: false, error: 'title or prompt is required' });
    }
    // Bypass the filter so every provider hit is available to re-score.
    const unfiltered = await gather(target, { keepAll: true });
    const thresholds = [0.2, 0.34, 0.5, 0.7];
    return res.json({
      success: true,
      query: unfiltered.query,
      candidates: unfiltered.sources.length,
      keptAt: thresholds.map((minScore) => {
        const { kept, dropped } = filterByRelevance(unfiltered.sources, unfiltered.query, { minScore });
        return {
          minScore,
          kept: kept.length,
          quotable: kept.filter((s) => s.trust === 'retrieved' && s.span.length > 0).length,
          dropped: dropped.slice(0, 3).map((d) => ({ title: d.source.title.slice(0, 70), score: Number(d.score.toFixed(2)) })),
        };
      }),
    });
  });

  // --- the record ----------------------------------------------------------

  router.get('/ledger', (_req, res) => {
    const records = readGroundingLedger(deps.ledgerFile);
    const chain = verifyGroundingRecords(records);
    res.json({
      success: true,
      count: records.length,
      chain,
      degradedCount: records.filter((r) => r.degraded).length,
      recent: records.slice(-25).reverse(),
    });
  });

  /** The record for one spec id, for answering "what was this built from?". */
  router.get('/ledger/:id', (req, res) => {
    const record = latestGroundingFor(req.params.id, deps.ledgerFile);
    if (!record) return res.status(404).json({ success: false, error: `no grounding record for "${req.params.id}"` });
    return res.json({ success: true, record });
  });

  return router;
}
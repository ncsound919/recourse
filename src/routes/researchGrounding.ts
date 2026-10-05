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
  readGroundingLedgerWithTail,
  type LedgerRead,
  verifyGroundingRecords,
} from '../lib/researchGrounding/ledger.js';

/**
 * The band a caller may ask for.
 *
 * The ceiling is the default. Below it, coverage widens for a genuinely
 * narrow query; above it, the filter stops meaning anything.
 */
const MIN_RELEVANCE_FLOOR = 0.1;
const MAX_RELEVANCE_CEILING = 0.34;

export interface GroundingRouterDeps {
  /**
   * Deliberately NOT injected.
   *
   * An earlier version declared this and never called it, which read as
   * "these routes are guarded" while `/preview` and `/threshold` fanned out to
   * third-party services unauthenticated. Rather than keep a guard that does
   * nothing, the property is absent: no route here mutates Recourse, so there is
   * no secret to present. What the routes do cost is upstream egress, which is
   * why `/threshold` — the only one that widens the relevance filter — is
   * reachable but bounded by `MAX_RELEVANCE_CEILING` above.
   */
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

    // Clamp `minRelevance`. Unclamped, `0` — or any negative number — put an
    // off-topic astrophysics paper into the returned `promptSection`, reproducing
    // the exact failure `relevance.ts` exists to prevent, from a request that
    // looks completely ordinary. A caller may loosen the threshold within a
    // narrow band to widen coverage; it may not switch the filter off from
    // outside, so the band is enforced rather than clamped silently.
    const requested = typeof req.body?.minRelevance === 'number' ? req.body.minRelevance : undefined;
    if (requested !== undefined && (!Number.isFinite(requested) || requested < MIN_RELEVANCE_FLOOR || requested > MAX_RELEVANCE_CEILING)) {
      return res.status(400).json({
        success: false,
        error: `minRelevance must be between ${MIN_RELEVANCE_FLOOR} and ${MAX_RELEVANCE_CEILING} (got ${requested})`,
      });
    }
    const minRelevance = requested;

    // Cap an operator-supplied query: it goes straight to third-party services,
    // and the derived query is bounded to 8 words for a reason.
    const rawQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const query = rawQuery ? rawQuery.split(/\s+/).slice(0, 12).join(' ') : '';

    const bundle = await gather(
      { id, title, prompt, ...(domain ? { domain } : {}) },
      { ...(minRelevance !== undefined ? { minRelevance } : {}), ...(query ? { query } : {}) },
    );
    const quotableIds = new Set(bundle.quotable.map((s) => s.id));
    return res.json({
      success: true,
      query: bundle.query,
      derivedQuery: groundingQuery({ id, title, prompt, ...(domain ? { domain } : {}) }),
      summary: describeGrounding(bundle),
      degraded: bundle.degraded,
      degradedReasons: bundle.degradedReasons,
      providers: bundle.providers,
      quotable: bundle.quotable,
      // Leads are the results that are NOT quoted. The previous predicate was a
      // tautology, so this field returned the quotable items too — a consumer
      // treating "leads" as "unquoted" was reading the very thing it meant to
      // distinguish.
      leads: bundle.sources.filter((s) => !quotableIds.has(s.id)),
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
    // Use the tail-aware reader directly. `readGroundingLedger` swallows BOTH a
    // torn tail and mid-file corruption and returns `[]`, so this route used to
    // answer `{count: 0, chain: {valid: true}}` for a ledger that had been
    // silently dropped — an empty ledger and a corrupted one looked identical,
    // and "valid" on an empty chain is trivially true.
    let read: LedgerRead;
    try {
      read = readGroundingLedgerWithTail(deps.ledgerFile);
    } catch (error) {
      // Corruption is a real, reportable condition: 500, with the reason. Do not
      // present it as an empty ledger.
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        corrupt: true,
      });
    }
    const chain = verifyGroundingRecords(read.records);
    res.json({
      success: true,
      count: read.records.length,
      chain,
      // A torn final line means the last append never completed. It is dropped
      // rather than fatal, but it is not "nothing to report" either.
      truncatedTail: read.truncatedTail,
      degradedCount: read.records.filter((r) => r.degraded).length,
      recent: read.records.slice(-25).reverse(),
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
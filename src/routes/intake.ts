/**
 * intake.ts — the external-intake (poll/brain/ground/autopilot) and benchmark
 * surfaces extracted from the `server.ts` monolith.
 *
 * The signal store, autopilot flag, and benchmark cycles are host state and are
 * injected; the benchmark-ledger helpers and the source poller are pure libs.
 */
import { Router } from 'express';
import { verifyBenchmarkLedger, readBenchmarkLedger, benchmarkLeaderboard } from '../lib/benchmarkLedger.js';
import { pollAllSources } from '../intake/poll.js';
import { DEFAULT_TOPIC_QUERIES } from '../intake/store.js';

export interface IntakeRouterDeps {
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
  snapshot(): unknown;
  isAutopilotOn(): boolean;
  intervalMs(): number;
  maxPoll(): number;
  brainUrl(): string;
  brainKaggleQueries(): string[];
  brainNews(): boolean;
  brainNewsLimit(): number;
  runCycle(queries: string[]): Promise<Record<string, unknown>>;
  runGrounding(signalId?: string): Promise<Record<string, unknown>>;
  ingest(signals: unknown[]): { added: number; dupes: number };
  setLastPollResults(results: unknown[]): void;
  toggleAutopilot(): boolean;
  benchmarkState(): unknown;
  runBenchmark(): unknown;
}

export function createIntakeRouter(deps: IntakeRouterDeps): Router {
  const router = Router();

  router.get('/intake/status', (_req, res) => {
    res.json({
      success: true,
      intake: deps.snapshot(),
      autopilot: deps.isAutopilotOn(),
      autopilotIntervalMs: deps.intervalMs(),
    });
  });

  router.post('/intake/poll', async (req, res) => {
    try {
      const { queries } = req.body ?? {};
      const maxPoll = deps.maxPoll();
      const result = await deps.runCycle(
        Array.isArray(queries) && queries.length ? queries.map(String).slice(0, maxPoll) : DEFAULT_TOPIC_QUERIES,
      );
      res.json({ success: true, ...result, intake: deps.snapshot() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Pull deterministic-brain sources (Kaggle datasets + news) into the store
   *  now, regardless of the autopilot env flags. Honest: brain offline/empty is
   *  reported per-source, never fabricated. */
  router.post('/intake/brain', async (req, res) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const maxPoll = deps.maxPoll();
      const url = typeof b.url === 'string' && b.url.trim() ? b.url.trim().replace(/\/+$/, '') : deps.brainUrl();
      if (!url) return res.status(400).json({ success: false, error: 'BRAIN_URL not configured (pass url or set BRAIN_URL)' });
      const brainKaggleQueries = deps.brainKaggleQueries();
      const queries = Array.isArray(b.queries) && (b.queries as unknown[]).length
        ? (b.queries as string[]).map(String).slice(0, maxPoll)
        : (brainKaggleQueries.length ? brainKaggleQueries : DEFAULT_TOPIC_QUERIES);
      // `deps.brainNews()` is already a strict boolean gate (RECOURSE_INTAKE_BRAIN_NEWS === '1').
      // `deps.brainNews() || true` collapsed that to a constant `true`, because
      // `false || true === true` — so an operator who left the opt-in unset still
      // paid for /news traffic on every poll. Same gate is honoured correctly at
      // server.ts:5949. Honour it here too.
      const news = typeof b.news === 'boolean' ? b.news : deps.brainNews();
      const newsLimit = Number(b.newsLimit) || deps.brainNewsLimit();

      const { signals, results } = await pollAllSources({
        queries: queries.slice(0, maxPoll),
        brain: { url, kaggleQueries: queries, news, newsLimit },
      });
      deps.setLastPollResults(results);
      const { added, dupes } = deps.ingest(signals);
      deps.saveState();
      if (added > 0) {
        deps.appendProvenance('intake_brain', {
          added,
          dupes,
          sources: results.map((r) => ({ source: r.source, ok: r.ok, count: r.count, error: r.error ?? undefined })),
        });
      }
      res.json({ success: true, added, dupes, signals: signals.slice(0, 20), results, intake: deps.snapshot() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/intake/ground', async (req, res) => {
    try {
      const { signalId } = req.body ?? {};
      const result = await deps.runGrounding(typeof signalId === 'string' && signalId ? signalId : undefined);
      res.json({ success: true, ...result, intake: deps.snapshot() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/intake/autopilot/toggle', (_req, res) => {
    const on = deps.toggleAutopilot();
    res.json({ success: true, autopilot: on, intervalMs: deps.intervalMs() });
  });

  router.get('/benchmark/state', (_req, res) => {
    res.json({ success: true, benchmark: deps.benchmarkState() });
  });

  router.post('/benchmark/run', (_req, res) => {
    try {
      const run = deps.runBenchmark();
      res.json({ success: true, run, benchmark: deps.benchmarkState() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Self-attested benchmark ledger: the hash-chained record of every run.
  router.get('/benchmark/ledger', (_req, res) => {
    const chain = verifyBenchmarkLedger();
    res.json({ success: true, chain, records: readBenchmarkLedger().slice(-50) });
  });

  // Self-attested leaderboard: every recorded run ranked by solved count.
  router.get('/benchmark/leaderboard', (_req, res) => {
    const entries = benchmarkLeaderboard();
    res.json({ success: true, count: entries.length, entries });
  });

  return router;
}

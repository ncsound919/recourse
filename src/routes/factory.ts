/**
 * factory.ts (route) — the software-factory surface.
 *
 *   GET  /factory                 catalogue + engine status + recent artifacts
 *   POST /factory/scaffold        build a full-stack artifact set (mutation auth)
 *   GET  /factory/artifacts       the artifact ledger
 *
 * The build is DETERMINISTIC (Cheetah 4 via SIEVE): no LLM, byte-identical for
 * the same intent. Optional verification runs the audit suite against the
 * target directory and reports honestly when a scorer is unavailable — a
 * factory that claims "verified" without checking is worse than one that says
 * "not verified".
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FACTORY_CAPABILITIES, buildScaffoldRequest, summarizeScaffoldResult,
  type FactoryArtifactRecord, type ScaffoldRequestInput,
} from '../lib/factory.js';
import { requireMutationAuth } from '../lib/mutationAuth.js';
import { emitFactoryEvent, recentFactoryEvents, subscribeFactory, factoryStreamStats } from '../lib/factoryStream.js';
import { writeScienceLog, buildArtifactPaper } from '../lib/scienceLog.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export interface FactoryRouterDeps {
  artifactsRef(): FactoryArtifactRecord[];
  /** Run the deterministic engine (SIEVE /scaffold). */
  scaffold(request: { command: string; args: string[]; cwd?: string; dryRun?: boolean }): Promise<{
    available: boolean; ok: boolean; reason?: string; files?: string[]; cwd?: string; result?: unknown;
  }>;
  /** Optional verification of the target directory. */
  verifyDir?(dir: string): Promise<{ ok: boolean | null; method: string; detail?: string }>;
  engineStatus(): Promise<Record<string, unknown>>;
  saveState(): void;
  appendProvenance(event: string, detail: Record<string, unknown>): void;
  /** Root the factory may write into (confined on the SIEVE side too). */
  defaultCwd(): string;
  /** Host-injected durable extras for the dashboard snapshot (ideas, jobs, forge). */
  stateExtra?(): Promise<Record<string, unknown>>;
  /**
   * THE DRAIN. Consumes the next unconsumed agenda item.
   *
   * WHY THIS EXISTS: the admission gate refuses new specs when the unconsumed
   * pile is at least as deep as the consumed pile is tall (measured: 29
   * unconsumed vs a headroom of 27). That back-pressure is CORRECT — the system
   * invented work ~1000x faster than it could consume it. What was missing is
   * the release valve: with no way to consume, the queue could only ever fill,
   * so every later proposal was refused by its own backlog and the pipeline's
   * IDEAS half went permanently dark.
   *
   * The contract: pick the oldest unconsumed item, emit `idea.consumed` (so the
   * visualiser's IDEAS station actually runs), build through the SAME gated
   * scaffold path as `/factory/scaffold` so there is one implementation of
   * build + verify + record, then report the real outcome. Never fabricates:
   * an engine failure or a verification miss is reported as such.
   */
  consumeNext?(): Promise<Record<string, unknown>>;
  /**
   * Why intake is currently blocked (or that it is not). The admission gate's
   * 429 was correct but opaque: an operator saw "over capacity" with no way to
   * act on it. This exposes the measured numbers AND the names of the
   * unconsumed tools, because the only real fix is to bind one of them to a
   * live call site — which requires knowing which they are.
   */
  admissionStats?(): Record<string, unknown>;
}

export function createFactoryRouter(deps: FactoryRouterDeps): Router {
  const router = Router();

  router.get('/factory', async (_req, res) => {
    const engine = await deps.engineStatus().catch((e) => ({ available: false, reason: String(e?.message ?? e) }));
    const artifacts = deps.artifactsRef();
    res.json({
      success: true,
      engine,
      defaultCwd: deps.defaultCwd(),
      capabilities: FACTORY_CAPABILITIES,
      totals: {
        artifacts: artifacts.length,
        built: artifacts.filter((a) => a.engineOk).length,
        verified: artifacts.filter((a) => a.verification?.ok === true).length,
      },
      recent: artifacts.slice(-10).map((a) => ({ id: a.id, kind: a.kind, command: a.command, at: a.at, files: a.files.length, verified: a.verification?.ok ?? null })),
    });
  });

  router.get('/factory/artifacts', (_req, res) => {
    const artifacts = deps.artifactsRef();
    res.json({ success: true, count: artifacts.length, artifacts: artifacts.slice(-50) });
  });

  /**
   * The dashboard's one-shot snapshot. Durable state (artifacts, totals, ideas,
   * jobs) plus the live ring, so a reload is never a blank screen. `extra` is
   * injected host-side (ideas summary, scheduler jobs, forge ledger) to keep
   * this router free of server internals.
   */
  router.get('/factory/state', async (_req, res) => {
    const engine = await deps.engineStatus().catch((e) => ({ available: false, reason: String((e as Error)?.message ?? e) }));
    const artifacts = deps.artifactsRef();
    const extra = deps.stateExtra ? await deps.stateExtra().catch(() => ({})) : {};
    res.json({
      success: true,
      at: Date.now(),
      engine,
      defaultCwd: deps.defaultCwd(),
      capabilities: FACTORY_CAPABILITIES,
      totals: {
        artifacts: artifacts.length,
        built: artifacts.filter((a) => a.engineOk).length,
        verified: artifacts.filter((a) => a.verification?.ok === true).length,
        files: artifacts.reduce((n, a) => n + (a.files?.length ?? 0), 0),
      },
      artifacts: artifacts.slice(-25).map((a) => ({
        id: a.id, kind: a.kind, command: a.command, args: a.args, at: a.at,
        files: a.files, engineOk: a.engineOk, verification: a.verification, requestedBy: a.requestedBy ?? null,
      })),
      events: recentFactoryEvents(60),
      stream: factoryStreamStats(),
      extra,
    });
  });

  /** Server-Sent Events: snapshot first, then every factory event as it happens. */
  router.get('/factory/stream', async (req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('hello', { at: Date.now(), stream: factoryStreamStats() });
    // Replay the ring so a late subscriber sees the current burst.
    for (const e of recentFactoryEvents(40)) send('factory', e);
    const unsub = subscribeFactory((e) => send('factory', e));
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); unsub(); });
  });

  /** The dashboard itself (self-contained React + three.js app). */
  router.get('/factory/dashboard', (_req, res) => {
    const file = path.join(MODULE_DIR, '..', 'dashboard', 'factory.html');
    if (!fs.existsSync(file)) return res.status(404).type('text/plain').send('dashboard not built: src/dashboard/factory.html missing');
    res.type('text/html').send(fs.readFileSync(file, 'utf8'));
  });

  /**
   * The dashboard bundle: React + react-dom + three inlined by esbuild, so the
   * page needs no CDN and renders offline. Built by scripts/build-dashboard.mjs.
   */
  router.get('/factory/dashboard.js', (_req, res) => {
    const file = path.join(MODULE_DIR, '..', 'dashboard', 'factory.bundle.js');
    if (!fs.existsSync(file)) return res.status(404).type('text/plain').send('dashboard bundle missing: run `node scripts/build-dashboard.mjs`');
    res.type('application/javascript').send(fs.readFileSync(file, 'utf8'));
  });

  /**
   * THE DRAIN — consume the next unconsumed agenda item. Mutation-auth: it
   * writes files. It is the release valve for the admission gate, so an empty
   * queue is a SUCCESS (`nothing_to_consume`), not an error — an idle system is
   * the state the gate exists to produce.
   */
  router.post('/factory/consume-next', async (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    if (!deps.consumeNext) {
      return res.status(503).json({ success: false, error: 'consume-next is not wired on this host' });
    }
    try {
      const outcome = await deps.consumeNext();
      const status = outcome.status === 'built' || outcome.status === 'consumed'
        ? 200
        : outcome.status === 'nothing_to_consume'
          ? 200
          : 500;
      res.status(status).json({ success: outcome.status !== 'failed', ...outcome });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err), status: 'failed' });
    }
  });

  /**
   * Why intake is blocked. Reads the gate's own measured numbers and names the
   * unconsumed tools, so the refusal is actionable rather than a bare 429.
   * Cheap: consumptionReport verifies bindings against the filesystem.
   */
  router.get('/factory/admission', async (_req, res) => {
    if (!deps.admissionStats) {
      return res.status(503).json({ success: false, error: 'admission stats are not wired on this host' });
    }
    try {
      res.json({ success: true, ...deps.admissionStats() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  router.post('/factory/scaffold', async (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    const body = (req.body ?? {}) as ScaffoldRequestInput & { cwd?: string; verify?: boolean; dryRun?: boolean; requestedBy?: string };

    const built = buildScaffoldRequest(body);
    if (!built.ok) return res.status(400).json({ success: false, error: built.reason });

    const cwd = typeof body.cwd === 'string' && body.cwd.trim() ? body.cwd.trim() : deps.defaultCwd();

    const engine = await deps.scaffold({ command: built.request.command, args: built.request.args, cwd, dryRun: Boolean(body.dryRun) });
    if (!engine.available) {
      return res.status(503).json({ success: false, error: engine.reason ?? 'deterministic engine unavailable', request: built.request });
    }

    const record = summarizeScaffoldResult(body.kind, built.request, cwd, engine, {
      ...(typeof body.requestedBy === 'string' ? { requestedBy: body.requestedBy } : {}),
    });
    record.files = engine.files ?? record.files;

    // Layer 1 (always): do the files the engine claimed actually exist? A build
    // that reports files it did not write is not a build.
    if (engine.ok && record.files.length) {
      const missing = record.files.filter((f) => {
        const abs = path.isAbsolute(f) ? f : path.join(engine.cwd || cwd, f);
        try { return !fs.existsSync(abs); } catch { return true; }
      });
      record.verification = {
        ran: true,
        ok: missing.length === 0,
        method: 'file-existence',
        detail: missing.length ? `${missing.length}/${record.files.length} reported files missing (e.g. ${missing[0]})` : `${record.files.length}/${record.files.length} reported files present`,
      };
    } else if (engine.ok) {
      // The engine said ok but named no files: say so rather than imply a build.
      record.verification = { ran: true, ok: null, method: 'file-existence', detail: 'engine reported no files to verify' };
    }

    // Layer 2 (opt-in): the audit suite on the target directory. A fresh
    // scaffold usually has no node_modules, so scorers report unavailable —
    // which is reported honestly, never as a pass.
    if (body.verify && deps.verifyDir && engine.ok) {
      try {
        const v = await deps.verifyDir(cwd);
        record.verification = {
          ran: true,
          ok: v.ok,
          method: `audit-suite (${v.method})`,
          detail: v.detail ?? record.verification?.detail,
        };
      } catch (e) {
        record.verification = { ran: true, ok: null, method: 'audit-suite', detail: String((e as Error)?.message ?? e) };
      }
    }

    deps.artifactsRef().push(record);
    if (deps.artifactsRef().length > 500) deps.artifactsRef().splice(0, deps.artifactsRef().length - 500);

    // SCIENCE-PAPER LOGGING (opt-in): render the development record through the
    // ecosystem writing lane (LibreOffice MCP). Fail-open — a paper that cannot
    // be written is reported as unavailable, never faked.
    if (body.scienceLog && engine.ok) {
      const paper = buildArtifactPaper(record, { toolchain: ['sieve_scaffold (Cheetah 4)', 'libreoffice lo_write'] });
      const docPath = path.join(cwd, `${record.id}.docx`);
      const log = await writeScienceLog({ markdown: paper, path: docPath });
      record.scienceLog = log;
      emitFactoryEvent(log.ok ? 'science.logged' : 'science.failed', {
        artifact: record.id, ok: log.ok, path: log.path ?? null, reason: log.reason ?? null, verified: log.verified ?? null,
      });
    }

    deps.saveState();
    emitFactoryEvent(engine.ok ? 'artifact.built' : 'artifact.failed', {
      id: record.id, kind: record.kind, command: record.command, args: record.args,
      files: record.files.length, verified: record.verification?.ok ?? null,
      requestedBy: record.requestedBy ?? null,
    });
    try {
      deps.appendProvenance('factory_artifact_built', {
        id: record.id, kind: record.kind, command: record.command, args: record.args,
        cwd: record.cwd, files: record.files.length, engineOk: record.engineOk,
        verified: record.verification?.ok ?? null, requestedBy: record.requestedBy ?? null,
      });
    } catch { /* provenance is a record, not a gate */ }

    res.status(engine.ok ? 200 : 422).json({
      success: engine.ok,
      artifact: record,
      ...(engine.ok ? {} : { error: engine.reason ?? 'the deterministic engine reported failure' }),
    });
  });

  return router;
}

/**
 * openhubAdapter.ts — Recourse's autopilot auditor backed by OpenHub's audit
 * suite.
 *
 * WHY THIS EXISTS
 * The autopilot loop refused to propose anything because none of its five
 * auditors had a working backend: grader/reporank/codegang were down, and
 * `deep` pointed at a Vite dev server that 404s on `/audit`. OpenHub already
 * runs `executeAuditSuite` — 20 scorers, 12 of them deterministic and local
 * (typecheck, lint, local_qa, duplication, git_history, iac, a11y,
 * api_contract, deps_freshness, licenses_sbom, perf) plus reporank, grader,
 * deep, codegang and codenexus when those are configured.
 *
 * Recourse's own team was a strictly worse copy of that list with nothing
 * behind it. Rather than reimplement twelve local scorers, this adapter calls
 * OpenHub's internal service surface (POST /api/internal/audit/run).
 *
 * HONESTY CONTRACT
 *  - `included: true` only when OpenHub returned a report with at least one
 *    scorer that actually produced a score. A report where every scorer came
 *    back unavailable is NOT an audit, and saying so is the whole point.
 *  - The scorers OpenHub could not run are carried through verbatim in
 *    `meta.unavailableScorers`, so a thin audit reads as thin instead of
 *    scoring as if it were complete.
 *  - An unreachable OpenHub is reported as unreachable, never as a clean repo.
 */
import type { AuditAdapter, AuditAdapters, AuditorServiceConfig } from './auditRunner';
import type { AuditorSectionT } from './loopTypes';
import { openHubPresetForDepth } from './auditDepth';
import { createRequire } from 'node:module';
import { recordStage } from '../lib/acceptance.js';
import { fleetBaseUrl } from '../lib/fleetRegistry.js';

// A full suite spawns many tools. The first real run took 137s for a modest
// repo, which is inside undici's DEFAULT 300s headers timeout — but that
// timeout is independent of any AbortSignal we set, so a slower repo fails with
// HeadersTimeoutError no matter how generous our own budget is. Raise both.
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

export function openHubBase(env: NodeJS.ProcessEnv = process.env): string {
  return fleetBaseUrl('openhub', env);
}

export function openHubSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.RECOURSE_OPENHUB_SECRET || '').trim();
}

interface OpenHubAuditReport {
  ok: boolean;
  report?: {
    id?: string;
    overallStatus?: string;
    overallScore?: number | null;
    overallScoreDeterministic?: number | null;
    grade?: string;
    coveragePercent?: number;
    scorersRun?: number;
    scorersTotal?: number;
    unavailableScorers?: string[];
    criticalFindings?: number;
    findings?: unknown[];
    results?: Array<{ scorer?: string; score?: number | null; error?: string }>;
  };
  error?: string;
}

/**
 * The OpenHub auditor. Named `olympics` in the team because that is the slot
 * OpenHub's own dashboard labels "Benchmark Olympics QA" — reusing the existing
 * id rather than inventing a sixth auditor id that every consumer would then
 * need to learn.
 */
/**
 * Pull the secret out of either header shape Recourse sends.
 */
let cachedAgent: unknown;
let cachedKey = '';

/**
 * An undici Agent with audit-sized timeouts, created lazily.
 *
 * `fetch`'s AbortSignal bounds OUR patience; it does not change undici's own
 * 300s headers timeout, which fires first on a long audit and surfaces as
 * HeadersTimeoutError rather than anything our error handling recognises. This
 * is only available on Node's global fetch (undici), so it is feature-detected
 * rather than assumed.
 */
function longTimeoutAgent(): unknown {
  const key = String(RUN_TIMEOUT_MS);
  if (cachedKey === key) return cachedAgent;
  cachedKey = key;
  try {
    // These modules are ESM (package.json type: module), where a bare
    // `require` is NOT defined — an earlier version of this used one inside a
    // try/catch, so it threw ReferenceError, was swallowed, and silently fell
    // back to undici's 300s default. That is why a 315s audit kept failing with
    // a bare "fetch failed" while the AbortSignal budget was 30 minutes.
    // createRequire is the supported way to reach a CJS/builtin module from ESM.
    const req = createRequire(import.meta.url);
    const undici = req('undici');
    if (undici?.Agent) {
      cachedAgent = new undici.Agent({ headersTimeout: RUN_TIMEOUT_MS, bodyTimeout: RUN_TIMEOUT_MS });
      return cachedAgent;
    }
  } catch (err) {
    console.warn(
      `[autopilot] undici Agent unavailable; audits longer than ~300s will fail at the HTTP layer: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  cachedAgent = undefined;
  return cachedAgent;
}

export const openHubAuditor: AuditAdapter = async (
  cfg: AuditorServiceConfig,
): Promise<AuditorSectionT> => {
  const base = openHubBase();
  const secret = openHubSecret();
  if (!secret) {
    return {
      included: false,
      reason: 'openhub: RECOURSE_OPENHUB_SECRET is not set — cannot reach OpenHub\'s audit surface',
    };
  }
  const targetDir = cfg.localPath;
  if (!targetDir) {
    return { included: false, reason: 'openhub: no localPath on the repo binding to audit' };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), RUN_TIMEOUT_MS);
  const dispatcher = longTimeoutAgent();
  let body: OpenHubAuditReport;
  try {
    const res = await fetch(`${base}/api/internal/audit/run`, {
      method: 'POST',
      signal: ac.signal,
      ...(dispatcher ? { dispatcher } : {}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        targetDir,
        ...(cfg.repoUrl ? { repoUrl: cfg.repoUrl } : {}),
        // Depth scales the OpenHub preset instead of deciding whether the
        // aggregator runs at all.
        ...(cfg.auditDepth ? { preset: openHubPresetForDepth(cfg.auditDepth) } : {}),
      }),
    });
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : ({} as OpenHubAuditReport);
    } catch {
      return {
        included: false,
        reason: `openhub: non-JSON response (HTTP ${res.status}) — is :${new URL(base).port || '80'} OpenHub?`,
      };
    }
    if (!res.ok || body?.ok === false) {
      return {
        included: false,
        reason: `openhub: ${body?.error ?? `HTTP ${res.status}`}`,
        meta: { url: base, status: res.status },
      };
    }
  } catch (err: any) {
    const reason =
      err?.name === 'AbortError'
        ? `timeout after ${RUN_TIMEOUT_MS}ms`
        : String(err?.message || err);
    return {
      included: false,
      reason: `openhub unreachable at ${base}: ${reason}`,
      meta: { url: base },
    };
  } finally {
    clearTimeout(timer);
  }

  const report = body.report;
  if (!report) {
    return { included: false, reason: 'openhub: response contained no report' };
  }

  const ran = typeof report.scorersRun === 'number' ? report.scorersRun : 0;
  const total = typeof report.scorersTotal === 'number' ? report.scorersTotal : 0;
  const unavailable = Array.isArray(report.unavailableScorers) ? report.unavailableScorers : [];

  // A report where nothing ran is not an audit. Reporting it as included would
  // be exactly the kind of green-but-empty result this whole exercise is fixing.
  if (ran === 0) {
    return {
      included: false,
      reason: `openhub: audit ran but no scorer produced a score (0/${total}${
        unavailable.length ? `; unavailable: ${unavailable.join(', ')}` : ''
      })`,
      payload: report,
      meta: { scorersRun: ran, scorersTotal: total, unavailableScorers: unavailable },
    };
  }

  // Acceptance evidence: a real repo was audited, with scorers actually
  // producing scores. Recorded on the success path only, so the gate can never
  // be satisfied by the auditor merely being configured.
  try {
    recordStage(
      'audited',
      `openhub report ${report.id ?? 'unknown'} on ${cfg.localPath}: ${ran}/${total} scorers scored, overall ${report.overallStatus ?? 'unknown'}`,
    );
  } catch {
    /* recording must never fail the audit */
  }

  return {
    included: true,
    reason: `openhub: ${ran}/${total} scorers produced a score (${report.overallStatus ?? 'unknown'}${
      typeof report.overallScoreDeterministic === 'number'
        ? `, deterministic ${report.overallScoreDeterministic}`
        : ''
    })`,
    scoreBasis: 'openhub auditSuite (deterministic scorers + configured integrations)',
    payload: report,
    meta: {
      reportId: report.id ?? null,
      scorersRun: ran,
      scorersTotal: total,
      coveragePercent: report.coveragePercent ?? null,
      criticalFindings: report.criticalFindings ?? 0,
      unavailableScorers: unavailable,
    },
  };
};

/**
 * The autopilot auditor team.
 *
 * `olympics` is the OpenHub-backed auditor (OpenHub's dashboard groups its
 * whole scorer roster under "Benchmark Olympics QA"). The other four slots stay
 * wired to their own services so a directly-reachable one can still contribute
 * when it is up — availability is a runtime fact, decided per auditor.
 */
export function defaultAuditAdapters(): AuditAdapters {
  return {
    grader: serviceAuditor('grader', '/audit'),
    reporank: serviceAuditor('reporank', '/audit'),
    deep: serviceAuditor('deep', '/audit'),
    codegang: serviceAuditor('codegang', '/audit'),
    olympics: openHubAuditor,
  };
}

function serviceAuditor(auditorName: string, path: string): AuditAdapter {
  return async (cfg) => {
    if (!cfg.url) {
      return { included: false, reason: `${auditorName}: no service URL configured` } satisfies AuditorSectionT;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60_000);
    try {
      const res = await fetch(`${cfg.url.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
          ...(cfg.secret ? { 'x-codegang-secret': cfg.secret } : {}),
        },
        body: JSON.stringify({ repoUrl: cfg.repoUrl, localPath: cfg.localPath, targetUrl: cfg.targetUrl }),
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        return {
          included: false,
          reason: `${auditorName}: non-JSON response (HTTP ${res.status})`,
        } satisfies AuditorSectionT;
      }
      if (!res.ok) {
        return {
          included: false,
          reason: `${auditorName}: service returned HTTP ${res.status}`,
          meta: { url: cfg.url, status: res.status },
        } satisfies AuditorSectionT;
      }
      return {
        included: true,
        reason: `${auditorName}: audited via ${cfg.url}${path}`,
        payload: parsed,
        meta: { url: cfg.url, status: res.status },
      } satisfies AuditorSectionT;
    } catch (err: any) {
      const reason =
        err?.name === 'AbortError' ? 'timeout after 60s' : String(err?.message || err);
      return {
        included: false,
        reason: `${auditorName} unreachable at ${cfg.url}: ${reason}`,
      } satisfies AuditorSectionT;
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Which auditors can actually run right now. Used by the operator readout so
 * "the audit team is all down" is visible before the loop tries and fails.
 */
export async function probeAuditTeam(
  adapters: AuditAdapters = defaultAuditAdapters(),
  configs: Partial<Record<string, AuditorServiceConfig>> = {},
): Promise<Array<{ auditor: string; available: boolean; detail: string }>> {
  const out: Array<{ auditor: string; available: boolean; detail: string }> = [];
  for (const [name, adapter] of Object.entries(adapters)) {
    const cfg =
      configs[name] ??
      ({ url: '', apiKey: '', repoUrl: '', localPath: '', secret: '', targetUrl: '' } as AuditorServiceConfig);
    if (name === 'olympics') {
      // The OpenHub auditor is not probeable without a target directory, so
      // report configuration rather than pretending to have checked.
      out.push({
        auditor: name,
        available: Boolean(openHubSecret()),
        detail: openHubSecret()
          ? `configured (base ${openHubBase()}); needs a repo binding with localPath to run`
          : 'RECOURSE_OPENHUB_SECRET not set',
      });
      continue;
    }
    if (!cfg.url) {
      out.push({ auditor: name, available: false, detail: 'no service URL configured' });
      continue;
    }
    try {
      const section = await adapter(cfg);
      out.push({
        auditor: name,
        available: section.included === true,
        detail: section.reason ?? (section.included ? 'ok' : 'no section'),
      });
    } catch (err: any) {
      out.push({ auditor: name, available: false, detail: String(err?.message || err) });
    }
  }
  return out;
}

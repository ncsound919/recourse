/**
 * toolConsumption.ts — does anything actually CALL the tools the forge builds?
 *
 * WHY THIS EXISTS
 * The forge materializes tools and the registry counts them, so "17 tools built"
 * read as progress. Nothing measured whether a single production path invoked
 * them. The measured answer was zero: the only scheduled execution of a
 * generated tool is the self-use watchdog, which runs each capability's tool
 * against its builtin and DISCARDS the result (server.ts:3713 documents that
 * counting it as use previously inflated the learner with phantom calls), and
 * the capability route serves them with synthetic probe inputs. That is
 * verification wearing the label of consumption — the same deadWeight disease
 * one level up, which is why the number had to become a first-class metric
 * rather than a claim.
 *
 * A binding here is a CLAIM about a call site ("tool X is load-bearing at
 * file:line"), and `verifyBindings` checks the claim against the source tree so
 * a binding cannot rot into a comfortable lie. Bindings are graded by what the
 * call site actually is:
 *
 *   load_bearing — a real path (scheduled job, request handler, loop) whose
 *                  output the system depends on.
 *   probe_only   — invoked, but with synthetic inputs or with the result
 *                  discarded. Honest bookkeeping, not value.
 *   unconsumed   — materialized, never called.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ToolEntry } from '../types.js';

export type ConsumerKind = 'load_bearing' | 'probe_only';

export interface ConsumerBinding {
  tool: string;
  /** Source file that contains the call site, relative to the repo root. */
  file: string;
  /** Exported symbol that performs the call. */
  symbol: string;
  /** Which scheduled job / route reaches it. */
  reachedBy: string;
  kind: ConsumerKind;
  purpose: string;
}

export const CONSUMER_BINDINGS: ConsumerBinding[] = [
  {
    tool: 'isPrivateIPv4',
    file: 'src/lib/outboundGuard.ts',
    symbol: 'guardOutboundUrl',
    reachedBy:
      'POST /api/recourse/pdf/extract-url -> guardOutboundUrl -> isPrivateIPv4, on every caller-supplied URL',
    kind: 'load_bearing',
    purpose:
      'SSRF guard for operator-supplied URLs. A wrong answer here lets the server fetch cloud instance metadata (169.254.169.254) or its own admin surface on request. The adopted tool must agree with the longhand RFC1918+loopback reference on 12 vectors, including the 0.0.0.0 and 169.254 bypass cases; on any disagreement the reference decides.',
  },
  {
    tool: 'exponentialBackoffMs',
    file: 'src/lib/connectors/webhooks.ts',
    symbol: 'resolveBackoff',
    reachedBy: 'deliverWebhook retry loop -> resolveBackoff -> sleep()',
    kind: 'load_bearing',
    purpose:
      'Webhook retry backoff, baseMs * 2^(attempt-1). Currently REJECTED by its equivalence proof (the forged build returns null), so the hand-written reference is serving. Declared because the call site exists and is real; a rejection here is a working demonstration that the gate refuses a broken tool, not a claim that the tool is in use.',
  },
  {
    tool: 'levenshteinDistance',
    file: 'src/lib/deterministicResearch.ts',
    symbol: 'adoptForgeLevenshtein',
    reachedBy: 'scheduler job `science` -> runScienceCycle -> runEvidencePhase -> dedupSources',
    kind: 'load_bearing',
    purpose:
      'Evidence-source near-duplicate detection. A wrong distance silently merges two different papers (an evidence source disappears from the findings) or fails to merge the same paper twice. The tool answers only after agreeing with the local reference on 15 equivalence vectors.',
  },
  {
    tool: 'dedupeStable',
    file: 'server.ts',
    symbol: 'serveCapability',
    reachedBy: 'GET /api/recourse/capabilities/serve (synthetic probe inputs only)',
    kind: 'probe_only',
    purpose: 'Capability `dedupe` is served with a synthetic event-type array. Exercised, not depended on.',
  },
  {
    tool: 'chunkArray',
    file: 'server.ts',
    symbol: 'serveCapability',
    reachedBy: 'GET /api/recourse/capabilities/serve (synthetic probe inputs only)',
    kind: 'probe_only',
    purpose: 'Capability `numeric_kernel` chunks a hardcoded array of hash strings. Exercised, not depended on.',
  },
  {
    tool: 'runLengthEncode',
    file: 'server.ts',
    symbol: 'serveCapability',
    reachedBy: 'GET /api/recourse/capabilities/serve (synthetic probe inputs only)',
    kind: 'probe_only',
    purpose: 'Capability `text_encode` encodes a hardcoded string. Exercised, not depended on.',
  },
  {
    tool: 'topKFrequent',
    file: 'server.ts',
    symbol: 'serveCapability',
    reachedBy: 'GET /api/recourse/capabilities/serve (synthetic probe inputs only)',
    kind: 'probe_only',
    purpose: 'Capability `scheduler` counts a synthetic event-type array. Exercised, not depended on.',
  },
  {
    tool: 'fibonacciN',
    file: 'server.ts',
    symbol: 'serveCapability',
    reachedBy: 'GET /api/recourse/capabilities/serve (synthetic probe inputs only)',
    kind: 'probe_only',
    purpose: 'Capability `math_sequence` evaluates fibonacciN(2). Exercised, not depended on.',
  },
  {
    tool: 'gcdPair',
    file: 'server.ts',
    symbol: 'serveCapability',
    reachedBy: 'GET /api/recourse/capabilities/serve (synthetic probe inputs only)',
    kind: 'probe_only',
    purpose: 'Capability `verify_gate` evaluates gcdPair(6,3). Exercised, not depended on.',
  },
];

export interface BindingStatus extends ConsumerBinding {
  /** The claim still matches the source tree. */
  live: boolean;
  line: number | null;
  note: string;
}

function defaultRepoRoot(): string {
  const explicit = process.env.RECOURSE_REPO;
  if (explicit) return path.resolve(explicit);
  // Walk up from this module until a directory containing `src` is found, so
  // the bindings resolve whether the caller runs from the repo root, from
  // `src/lib`, or from a bundled build.
  let dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'src', 'lib'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

/** Check every binding against the source tree. A binding that no longer matches
 *  is reported, not silently trusted. */
export function verifyBindings(root: string = defaultRepoRoot()): BindingStatus[] {
  return CONSUMER_BINDINGS.map((b) => {
    const abs = path.join(root, b.file);
    if (!fs.existsSync(abs)) return { ...b, live: false, line: null, note: `file missing: ${b.file}` };
    const text = fs.readFileSync(abs, 'utf-8');
    const lines = text.split('\n');
    const idx = lines.findIndex((l) => l.includes(b.symbol));
    if (idx === -1) {
      return { ...b, live: false, line: null, note: `symbol not found in ${b.file}` };
    }
    return { ...b, live: true, line: idx + 1, note: '' };
  });
}

export type ConsumptionClass = 'load_bearing' | 'probe_only' | 'unconsumed' | 'not_materialized';

export interface ToolConsumptionRow {
  tool: string;
  cls: ConsumptionClass;
  materialized: boolean;
  health?: string;
  version?: string;
  binding?: { file: string; symbol: string; line: number | null; live: boolean; reachedBy: string };
}

export interface ConsumptionReport {
  materialized: number;
  loadBearing: number;
  probeOnly: number;
  unconsumed: number;
  notMaterialized: number;
  /** materialized / (loadBearing + probeOnly) — share that something calls. */
  calledShare: number;
  bindingsLive: boolean;
  rows: ToolConsumptionRow[];
  bindings: BindingStatus[];
}

/**
 * Did the forge build this one?
 *
 * NOT the verifier note: boot re-verification rewrites `verifier_notes` with the
 * fresh suite verdict, so "CAPABILITY FORGE" only survives on versions that have
 * not been re-verified since. The description is written once at materialization
 * and never rewritten, so it is the durable provenance signal.
 */
export function isForgeMaterialized(tool: ToolEntry): boolean {
  if (/\[Capability Forge\]/.test(tool.description ?? '')) return true;
  return tool.versions?.some((v) => /\[?Capability Forge\]?|forge-repaired/.test(v.verifier_notes ?? '')) === true;
}

/**
 * Classify every forge-materialized tool by whether a live call site uses it.
 *
 * `registry` is the live tool registry; a tool counts as materialized when the
 * forge built it. Tools with no registry entry (quarantined, never promoted) are
 * reported as `not_materialized` rather than quietly dropped, so the denominator
 * is auditable.
 */
export function consumptionReport(
  registry: ToolEntry[],
  opts: { root?: string; extraTools?: string[] } = {},
): ConsumptionReport {
  const bindings = verifyBindings(opts.root);
  const byTool = new Map<string, BindingStatus>();
  for (const b of bindings) {
    const prev = byTool.get(b.tool);
    // A load-bearing binding wins over a probe-only one for the same tool.
    if (!prev || (b.kind === 'load_bearing' && prev.kind !== 'load_bearing')) byTool.set(b.tool, b);
  }

  const rows: ToolConsumptionRow[] = [];
  let loadBearing = 0;
  let probeOnly = 0;
  let unconsumed = 0;

  for (const tool of registry) {
    const version = tool.versions?.find((v) => v.promoted && v.version === tool.currentVersion);
    const materialized = isForgeMaterialized(tool);
    const binding = byTool.get(tool.name);
    const isLive = Boolean(binding?.live);
    const row: ToolConsumptionRow = {
      tool: tool.name,
      cls: !materialized
        ? 'not_materialized'
        : isLive && binding!.kind === 'load_bearing'
          ? 'load_bearing'
          : isLive
            ? 'probe_only'
            : 'unconsumed',
      materialized,
      health: tool.healthStatus,
      version: version?.version,
      ...(binding
        ? { binding: { file: binding.file, symbol: binding.symbol, line: binding.line, live: binding.live, reachedBy: binding.reachedBy } }
        : {}),
    };
    if (row.cls === 'load_bearing') loadBearing++;
    else if (row.cls === 'probe_only') probeOnly++;
    else if (row.cls === 'unconsumed') unconsumed++;
    rows.push(row);
  }

  for (const name of opts.extraTools ?? []) {
    if (rows.some((r) => r.tool === name)) continue;
    const binding = byTool.get(name);
    rows.push({
      tool: name,
      cls: binding?.live ? (binding.kind === 'load_bearing' ? 'load_bearing' : 'probe_only') : 'unconsumed',
      materialized: true,
      ...(binding ? { binding: { file: binding.file, symbol: binding.symbol, line: binding.line, live: binding.live, reachedBy: binding.reachedBy } } : {}),
    });
    if (binding?.live && binding.kind === 'load_bearing') loadBearing++;
    else if (binding?.live) probeOnly++;
    else unconsumed++;
  }

  const materialized = loadBearing + probeOnly + unconsumed;
  const called = loadBearing + probeOnly;
  return {
    materialized,
    loadBearing,
    probeOnly,
    unconsumed,
    notMaterialized: rows.length - materialized,
    calledShare: materialized > 0 ? Math.round((called / materialized) * 1000) / 1000 : 0,
    bindingsLive: bindings.every((b) => b.live),
    rows: rows.sort((a, b) => a.tool.localeCompare(b.tool)),
    bindings,
  };
}

/** One line for a job result or a ledger entry. */
export function describeConsumption(r: ConsumptionReport): string {
  return (
    `${r.materialized} materialized: ${r.loadBearing} load-bearing, ${r.probeOnly} probe-only, ` +
    `${r.unconsumed} unconsumed (called share ${r.calledShare})`
  );
}
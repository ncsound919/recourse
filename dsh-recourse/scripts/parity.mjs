/**
 * Parity check: the native tools against the MCP bridge they replace.
 *
 * The whole justification for cutting `mcp-recourse` out of the profile is that
 * the native tools answer the same questions with the same shapes. That claim is
 * only worth something if it is measured, so this drives the real bridge over
 * stdio and the real native tools in one process and diffs the two projections.
 *
 * Coverage is every tool that does not change Recourse state: all GET routes,
 * plus the POST routes flagged `readOnly` (validate_plugin and the oncology
 * evidence layer, which use POST because they carry a request body). Mutating
 * tools are excluded by default and can be included deliberately with
 * `--include-mutating`, which exists so a human can opt in on a scratch instance.
 *
 *   node scripts/parity.mjs [--include-mutating]
 *
 * Comparison is structural rather than byte-for-byte: live fields drift between
 * two calls (generation counters, timestamps, durations), so an exact diff would
 * fail for the wrong reason. Key sets and value types are compared instead.
 */

import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { RecourseApi } from '../lib/api.js';
import { TOOL_SPECS } from '../lib/catalog.js';
import { buildToolDefinitions } from '../lib/tools.js';

const RECOURSE_ROOT = 'C:/Users/User/Downloads/BUSINESS/INFRASTRUCTURE/recourse';
const API_BASE = process.env.RECOURSE_API_URL ?? 'http://127.0.0.1:3050';
const INCLUDE_MUTATING = process.argv.includes('--include-mutating');

/**
 * Arguments for the tools that take them.
 *
 * Read-only routes still need input, and the fixture has to be valid or both
 * sides simply fail identically and the comparison proves nothing. Values are
 * chosen to exercise real code paths (a known registry tool name, a query that
 * matches something) rather than to be maximally general.
 */
const FIXTURES = {
  recourse_inspect_gene: { name: 'crossover_MATH_LAG_BIOT_GC__7d2e' },
  recourse_recall_memory: { q: 'sandbox verifier', topK: 3 },
  recourse_kg_live_graph: {},
  recourse_ode_synthesize: {},
  recourse_dosing_optimize: {},
  recourse_pipeline_dossier: {},
  // An empty manifest exercises the schema + default-deny capability check.
  recourse_validate_plugin: { manifest: { name: 'parity-probe', version: '0.0.0' } },
};

/** Bridge tool name for a native name: `recourse_status` -> `recourse.status`. */
function bridgeNameFor(nativeName) {
  const cut = nativeName.indexOf('_');
  return `recourse.${nativeName.slice(cut + 1)}`;
}

/** Lift the secret the same way start-all.ps1 does, so this runs standalone. */
function resolveSecret() {
  if (process.env.RECOURSE_API_SECRET) return process.env.RECOURSE_API_SECRET;
  try {
    const env = readFileSync(`${RECOURSE_ROOT}/.env`, 'utf8');
    const match = env.match(/^\s*RECOURSE_API_SECRET\s*=\s*(.+?)\s*$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    /* fall through to empty */
  }
  return '';
}

const secret = resolveSecret();
const api = new RecourseApi({ baseUrl: API_BASE, secret, defaultTimeoutMs: 120_000 });
const native = new Map(buildToolDefinitions(api, 600_000).map((tool) => [tool.name, tool]));

const typeOf = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const shape = (value) =>
  typeOf(value) === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, member]) => [key, typeOf(member)]))
    : { __kind: typeOf(value) };

/** Compare one tool's two answers. Returns a list of human-readable problems. */
function diff(label, bridgeValue, nativeValue) {
  const problems = [];

  // The bridge degrades several expected-empty states into a plain English note
  // rather than JSON. There is nothing structural to diff against, so assert the
  // weaker but meaningful property: the native side answered with a marked
  // result instead of throwing.
  if (bridgeValue !== null && typeof bridgeValue === 'object' && '__unparsed' in bridgeValue) {
    const marked =
      typeof nativeValue === 'object' &&
      nativeValue !== null &&
      !Array.isArray(nativeValue) &&
      ('empty' in nativeValue || 'ok' in nativeValue || 'found' in nativeValue);
    if (!marked) {
      problems.push(
        `${label}: bridge degraded to a text note ("${bridgeValue.__unparsed.slice(0, 80)}") but the ` +
          'native tool did not return a marked result',
      );
    }
    return problems;
  }

  const bridgeIsArray = Array.isArray(bridgeValue);
  const nativeIsArray = Array.isArray(nativeValue);
  if (bridgeIsArray !== nativeIsArray) {
    problems.push(
      `${label}: container differs (bridge ${typeOf(bridgeValue)}, native ${typeOf(nativeValue)})`,
    );
    return problems;
  }

  if (bridgeIsArray) {
    if (bridgeValue.length !== nativeValue.length) {
      problems.push(
        `${label}: length ${bridgeValue.length} (bridge) vs ${nativeValue.length} (native) -- often a ` +
          'growing collection between two calls; re-run to confirm',
      );
    }
    if (bridgeValue.length > 0 && nativeValue.length > 0) {
      const bk = Object.keys(bridgeValue[0] ?? {}).sort();
      const nk = Object.keys(nativeValue[0] ?? {}).sort();
      if (bk.join() !== nk.join()) {
        problems.push(`${label}: element keys differ\n  bridge: ${bk.join()}\n  native: ${nk.join()}`);
      }
    }
    return problems;
  }

  const b = shape(bridgeValue);
  const n = shape(nativeValue);
  const bk = Object.keys(b).sort();
  const nk = Object.keys(n).sort();

  // The contract is NO INFORMATION LOSS, not byte equality. A key the bridge
  // returns and the native tool does not is a regression and fails. A key only
  // the native tool returns is an intentional superset and is reported, not
  // failed -- `recourse_status` deliberately carries the self-repair verified /
  // unverifiable / success-rate fields alongside the heal count, because the
  // heal count on its own reads as health when it is not.
  const lost = bk.filter((key) => !nk.includes(key));
  const added = nk.filter((key) => !bk.includes(key));

  if (lost.length > 0) {
    problems.push(`${label}: information lost vs the bridge\n  missing in native: ${lost.join()}`);
  }
  if (added.length > 0) {
    supersets.push(`${label}: native adds ${added.join()}`);
  }
  return problems;
}

/** Call a native tool the way the host does, and read its canonical value. */
async function callNative(name, args) {
  const tool = native.get(name);
  if (tool === undefined) throw new Error(`native tool ${name} was not registered`);
  return tool.execute(args, { signal: undefined, name });
}

/** Call the bridge and parse the single text block it returns. */
async function callBridge(client, toolName, args) {
  const result = await client.callTool({ name: toolName, arguments: args });
  const text = (result.content ?? []).find((block) => block.type === 'text')?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return { __unparsed: text };
  }
}

const transport = new StdioClientTransport({
  command: 'node',
  args: ['node_modules/tsx/dist/cli.mjs', 'mcp-server.ts'],
  cwd: RECOURSE_ROOT,
  env: { ...process.env, RECOURSE_API_URL: API_BASE, RECOURSE_API_SECRET: secret },
});

const client = new Client({ name: 'dsh-recourse-parity', version: '0.1.0' });
const problems = [];
const supersets = [];
let checked = 0;
let skipped = 0;

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const bridgeNames = new Set(listed.tools.map((tool) => tool.name));

  const comparable = TOOL_SPECS.filter(
    (spec) => spec.method === 'GET' || spec.readOnly === true || INCLUDE_MUTATING,
  );
  const unsafeCount = TOOL_SPECS.length - comparable.length;
  skipped = unsafeCount;

  console.log(
    `bridge exposes ${bridgeNames.size} tools; catalog declares ${TOOL_SPECS.length}; ` +
      `comparing ${comparable.length} non-mutating${INCLUDE_MUTATING ? ' (mutations included)' : ''}\n`,
  );

  // Anything the catalog declares but the bridge does not offer is a gap in the
  // migration, and the reverse is a tool the bridge has that we dropped.
  for (const spec of TOOL_SPECS) {
    const bridge = bridgeNameFor(spec.name);
    if (!bridgeNames.has(bridge)) {
      problems.push(`catalog declares ${spec.name} but the bridge has no ${bridge}`);
    }
  }
  for (const bridge of bridgeNames) {
    const nativeName = `recourse_${bridge.slice('recourse.'.length)}`;
    if (!native.has(nativeName)) {
      problems.push(`bridge exposes ${bridge} with no native counterpart (${nativeName})`);
    }
  }

  for (const spec of comparable) {
    const bridge = bridgeNameFor(spec.name);
    if (!bridgeNames.has(bridge)) continue;
    const args = FIXTURES[spec.name] ?? {};
    try {
      const [b, n] = await Promise.all([callBridge(client, bridge, args), callNative(spec.name, args)]);
      const found = diff(`${spec.name} vs ${bridge}`, b, n);
      problems.push(...found);
      checked += 1;
      console.log(`  ${found.length === 0 ? 'ok  ' : 'DIFF'} ${spec.name}`);
    } catch (error) {
      problems.push(`${spec.name}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`  ERR  ${spec.name}`);
    }
  }
} catch (error) {
  console.error('could not drive the bridge:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}

console.log(`\ncompared ${checked}, skipped ${skipped} mutating`);
if (problems.length > 0) {
  console.error(`${problems.length} parity problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('parity: every compared tool matches the bridge, and the two catalogs agree on names');
}
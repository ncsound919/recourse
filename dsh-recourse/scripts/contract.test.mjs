/**
 * Contract tests for the 46-tool catalog.
 *
 * `parity.mjs` proves the non-mutating tools answer like the bridge. It cannot
 * prove anything about the 14 mutating ones without changing Recourse state, so
 * this file covers the properties that must hold for every tool regardless:
 *
 * - names obey DeepSeek's function-name contract and are unique
 * - every tool maps to a real bridge tool, and every bridge tool is covered
 * - argument validation rejects bad input BEFORE any request is made, with a
 *   message that names the tool
 * - mutating tools declare that they need the secret
 *
 * Run: node --test scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RecourseApi } from '../lib/api.js';
import { TOOL_SPECS } from '../lib/catalog.js';
import { NO_SECRET_WARNING } from '../lib/spec.js';
import {
  buildCatalogDefinitions,
  buildToolDefinitions,
  DISPATCH_TOOL_NAME,
  NATIVE_TOOL_NAMES,
} from '../lib/tools.js';

const API = new RecourseApi({ baseUrl: 'http://127.0.0.1:0', secret: '', defaultTimeoutMs: 1000 });
const SECRETED = new RecourseApi({ baseUrl: 'http://127.0.0.1:0', secret: 'x', defaultTimeoutMs: 1000 });

// Per-tool invariants are stated over the whole catalog. The *registered*
// surface is deliberately smaller (native tools + a dispatcher), so it is
// checked separately at the bottom - see tools.ts for why.
const catalogDefs = buildCatalogDefinitions(API, 60_000);
const byName = new Map(catalogDefs.map((def) => [def.name, def]));
const surfaceDefs = buildToolDefinitions(API, 60_000);
const surfaceByName = new Map(surfaceDefs.map((def) => [def.name, def]));

/** DeepSeek function-name contract, per dsh-mcp-client's own constants. */
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g;
const MAX_NAME = 64;

/**
 * Every bridge tool, and the two ways one can be reached.
 *
 * The bridge (`recourse/mcp-server.ts`) registers a native subset plus a single
 * `recourse_call` dispatcher, for the same reason this plugin does: every
 * registered schema is paid for on every turn. So "does the bridge expose X?"
 * has two true answers — X is registered, or X is in the dispatcher's enum —
 * and a contract that only checked the first would fail on a cutover that lost
 * nothing.
 */
const BRIDGE_TOOLS = JSON.parse(
  // eslint-disable-next-line n/no-sync
  (await import('node:fs')).readFileSync(new URL('../bridge-tools.json', import.meta.url), 'utf8'),
);
const BRIDGE_NAMES = new Set(BRIDGE_TOOLS.map((tool) => tool.name));

/** Names the bridge registers directly (i.e. excluding the dispatcher). */
const BRIDGE_NATIVE = new Set([...BRIDGE_NAMES].filter((n) => n !== 'recourse_call'));

/** Names reachable through the bridge's dispatcher. */
const BRIDGE_DISPATCHABLE = new Set(
  BRIDGE_TOOLS.find((t) => t.name === 'recourse_call')?.inputSchema?.properties?.name?.enum ?? [],
);

test('the bridge exposes a dispatcher, and its enum is the whole surface', () => {
  // If the dispatcher ever disappears, the tests below would pass vacuously by
  // finding every tool unreachable only if they also failed. Assert the shape
  // explicitly so a broken dump cannot read as a clean cutover.
  assert.ok(BRIDGE_NAMES.has('recourse_call'), 'bridge exposes no recourse_call dispatcher');
  assert.ok(
    BRIDGE_DISPATCHABLE.size > BRIDGE_NATIVE.size,
    `dispatcher enum (${BRIDGE_DISPATCHABLE.size}) should cover more than the native set (${BRIDGE_NATIVE.size})`,
  );
});

test('every tool name satisfies the DeepSeek function-name contract', () => {
  for (const spec of TOOL_SPECS) {
    assert.ok(spec.name.length <= MAX_NAME, `${spec.name} exceeds ${MAX_NAME} characters`);
    assert.equal(
      INVALID_NAME_CHARS.test(spec.name),
      false,
      `${spec.name} contains characters outside [A-Za-z0-9_-]`,
    );
    INVALID_NAME_CHARS.lastIndex = 0;
  }
});

test('tool names are unique', () => {
  const seen = new Set();
  for (const spec of TOOL_SPECS) {
    assert.equal(seen.has(spec.name), false, `duplicate tool name ${spec.name}`);
    seen.add(spec.name);
  }
});

test('every tool is reachable through the bridge, natively or via its dispatcher', () => {
  for (const spec of TOOL_SPECS) {
    const bridgeName = `recourse.${spec.name.slice(spec.name.indexOf('_') + 1)}`;
    const reachable = BRIDGE_NATIVE.has(bridgeName) || BRIDGE_DISPATCHABLE.has(bridgeName);
    assert.equal(
      reachable,
      true,
      `${spec.name} maps to ${bridgeName}, which the bridge neither registers nor dispatches to`,
    );
  }
});

test('every bridge tool has a catalog counterpart, so the cutover loses nothing', () => {
  for (const bridgeName of BRIDGE_NAMES) {
    if (bridgeName === 'recourse_call') continue; // the dispatcher itself has no catalog row
    const nativeName = `recourse_${bridgeName.slice('recourse.'.length)}`;
    assert.equal(byName.has(nativeName), true, `bridge tool ${bridgeName} has no native ${nativeName}`);
  }
});

test('required arguments are enforced before any request leaves the process', async () => {
  for (const spec of TOOL_SPECS) {
    const required = Object.entries(spec.params ?? {}).filter(([, param]) => param.required === true);
    if (required.length === 0) continue;

    const tool = byName.get(spec.name);
    // Port 0 refuses instantly, so a request that did escape would fail with a
    // connection error rather than the validation error we assert on.
    await assert.rejects(
      () => tool.execute({}, { signal: undefined, name: spec.name }),
      (error) => {
        assert.match(error.message, new RegExp(spec.name), `${spec.name}: error must name the tool`);
        assert.match(error.message, /required/, `${spec.name}: error must say what is wrong`);
        return true;
      },
      `${spec.name} should reject empty arguments`,
    );
  }
});

test('enum constraints are enforced', async () => {
  const tool = byName.get('recourse_evolve');
  await assert.rejects(
    () => tool.execute({ domain: 'not-a-domain', instructions: 'do a thing' }, { signal: undefined }),
    /must be one of/,
    'recourse_evolve should reject an unknown domain',
  );
});

test('numeric bounds are enforced', async () => {
  const tool = byName.get('recourse_run_forge');
  await assert.rejects(
    () => tool.execute({ count: 99 }, { signal: undefined }),
    /must be <= 3/,
    'recourse_run_forge should reject count above its declared maximum',
  );
});

test('undeclared arguments are rejected by the schema', () => {
  const tool = byName.get('recourse_status');
  assert.equal(tool.parameters.additionalProperties, false);
  assert.deepEqual(tool.parameters.required, undefined, 'a no-arg tool should declare no required keys');
});

test('every mutating tool declares that it needs the secret', () => {
  for (const spec of TOOL_SPECS) {
    if (spec.mutating === true) {
      assert.equal(spec.needsSecret, true, `${spec.name} mutates but does not declare needsSecret`);
    }
  }
});

test('a harness without a secret is warned on mutating tools only', () => {
  for (const spec of TOOL_SPECS) {
    const definition = byName.get(spec.name);
    const warned = definition.description.includes(NO_SECRET_WARNING);
    assert.equal(warned, spec.mutating === true, `${spec.name}: secret warning presence is wrong`);
  }
  // With a secret present the warning must not be there.
  const withSecret = new Map(buildCatalogDefinitions(SECRETED, 1000).map((def) => [def.name, def]));
  assert.equal(
    withSecret.get('recourse_evolve').description.includes(NO_SECRET_WARNING),
    false,
  );
});

test('long-running tools carry a cooperative deadline', () => {
  for (const spec of TOOL_SPECS) {
    if (spec.long === true) {
      assert.equal(byName.get(spec.name).timeoutMs, 60_000, `${spec.name} should declare timeoutMs`);
    }
  }
});

test('read-only POST routes are flagged so the parity harness can cover them', () => {
  const readOnlyPosts = TOOL_SPECS.filter((spec) => spec.method === 'POST' && spec.readOnly === true);
  assert.ok(readOnlyPosts.length >= 5, 'expected the oncology layer to be flagged read-only');
  for (const spec of readOnlyPosts) {
    assert.notEqual(spec.mutating, true, `${spec.name} cannot be both read-only and mutating`);
  }
});

// ---------------------------------------------------------------------------
// Registered surface (native subset + dispatcher)
//
// Every registered schema is paid for on every model turn, so the surface is
// deliberately not the whole catalog. That only holds up if nothing becomes
// unreachable, which is what these assert.
// ---------------------------------------------------------------------------

test('the registered surface is exactly the native subset plus the dispatcher', () => {
  const expected = new Set([...NATIVE_TOOL_NAMES, DISPATCH_TOOL_NAME]);
  assert.deepEqual(
    new Set(surfaceDefs.map((def) => def.name)),
    expected,
    'registered surface must be the native names plus the dispatcher, nothing else',
  );
  for (const name of NATIVE_TOOL_NAMES) {
    assert.equal(byName.has(name), true, `NATIVE_TOOL_NAMES lists ${name}, which is not in the catalog`);
  }
  assert.ok(
    surfaceDefs.length < catalogDefs.length,
    'the point of the split is a smaller surface than the catalog',
  );
});

test('the dispatcher can reach every catalog tool, and delegates its validation', async () => {
  const dispatch = surfaceByName.get(DISPATCH_TOOL_NAME);
  assert.ok(dispatch, 'the dispatcher must be registered');

  const enumerated = dispatch.parameters.properties.name.enum;
  assert.deepEqual(
    new Set(enumerated),
    new Set(catalogDefs.map((def) => def.name)),
    'the dispatcher enum must list the whole catalog, or a tool is unreachable',
  );

  // A dispatched call runs the target tool's own validation, so it cannot drift
  // from a native one.
  await assert.rejects(
    () =>
      dispatch.execute(
        { name: 'recourse_evolve', args: { domain: 'not-a-domain', instructions: 'x' } },
        { signal: undefined },
      ),
    /must be one of/,
    'a dispatched call must enforce the target tool\u2019s own argument rules',
  );

  // Unknown names fail naming the valid set rather than opaquely.
  await assert.rejects(
    () => dispatch.execute({ name: 'recourse_nope' }, { signal: undefined }),
    /unknown tool "recourse_nope"/,
  );

  // Non-object args are rejected before any request is built.
  await assert.rejects(
    () => dispatch.execute({ name: 'recourse_status', args: [1, 2] }, { signal: undefined }),
    /must be an object/,
  );
});
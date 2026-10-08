/**
 * Contract tests for a scaffolded DSH bundle.
 *
 * ## Why this checks a *generated* bundle
 *
 * This repository is the hand-written reference implementation of the bundle
 * shape. Recourse generates other bundles from the same contract
 * (`recourse/src/lib/dshPlugins/`), and a generated bundle is the one most likely
 * to be wrong: nobody hand-reviewed it, and a mistake only surfaces as a plugin
 * that boots with no tools and no error.
 *
 * So the checks below are stated over the generator's own output — scaffolded at
 * test time into a temp directory, built with the repo's real `tsc`, then loaded
 * and driven. `parity.mjs` proves live behaviour; this proves a generated bundle
 * is *structurally* sound before it is ever mounted.
 *
 * What is asserted, and why each one matters:
 *
 * - zero runtime dependencies + type-only host imports: a runtime import
 *   resolves against the *host's* node_modules, which on a linked profile can be
 *   a dangling junction, and the bundle then fails to load at boot.
 * - `apply` requires no service and injects the ones it needs: `apply` runs
 *   BEFORE the web app provides `tools`/`systemPrompt`, so a plugin that probes
 *   for them there sees nothing and silently does nothing.
 * - tools register, schemas are emitted, argument validation runs before any
 *   request, and a mutating tool without a secret says so in its description.
 * - the patch row names the secret variable and never carries its value.
 * - no BOM anywhere: the harness `JSON.parse`s a bundle's package.json, and a BOM
 *   drops the whole bundle with no boot-graph entry.
 *
 * Run: node --test scripts/scaffold-contract.test.mjs
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Where the generator lives. Skipped wholesale when it is not checked out. */
/** This package's own root, from its URL (a bare Windows path is not importable). */
const HERE = fileURLToPath(new URL('..', import.meta.url));
const RECOURSE = 'C:/Users/User/Downloads/BUSINESS/INFRASTRUCTURE/recourse';
const GENERATOR = join(RECOURSE, 'src/lib/dshPlugins/template.ts');
const available = existsSync(GENERATOR);
/** This repo's own TypeScript, reused so the generated bundle is checked by the same compiler. */
const tsc = join(HERE, 'node_modules', 'typescript', 'bin', 'tsc');

/**
 * A probe spec exercising every branch the generator has: a plain read, a
 * mutating POST, a long-running call, and a tool with fixed query parameters.
 */
const SPEC = {
  id: 'probe',
  packageName: 'dsh-probe',
  description: 'Generated bundle contract probe. Never mounted on a real profile.',
  apiSecretEnvVar: 'RECOURSE_API_SECRET',
  tools: [
    { name: 'probe_status', title: 'Probe status', description: 'Read the probe state.', method: 'GET', path: '/api/probe/status' },
    { name: 'probe_run', title: 'Run the probe', description: 'Mutating probe run.', method: 'POST', path: '/api/probe/run', mutating: true, long: true },
    { name: 'probe_for', title: 'Probe one profile', description: 'Scoped read.', method: 'GET', path: '/api/probe/profile', query: { scope: 'default' } },
  ],
};

let root;
let dir;
let mod;

/** Render the generator's output to a temp directory, via a tiny tsx script. */
before(async () => {
  if (!available) return;
  root = mkdtempSync(join(tmpdir(), 'dsh-scaffold-'));
  const script = join(root, 'gen.mts');
  writeFileSync(
    script,
    [
      // file:// URLs, not raw paths: an ESM import of a `C:/...` path throws
      // ERR_UNSUPPORTED_ESM_URL_SCHEME on Windows.
      `import { validateDshPluginSpec } from ${JSON.stringify(pathToFileURL(join(RECOURSE, 'src/lib/dshPlugins/spec.ts')).href)};`,
      `import { renderDshBundle } from ${JSON.stringify(pathToFileURL(GENERATOR).href)};`,
      `import { mkdirSync, writeFileSync } from 'node:fs';`,
      `import { dirname, join } from 'node:path';`,
      `const v = validateDshPluginSpec(${JSON.stringify(SPEC)});`,
      `if (!v.ok) throw new Error(v.errors.join('\\n'));`,
      `for (const [rel, body] of renderDshBundle(v.spec)) {`,
      `  const t = join(process.argv[2], rel);`,
      `  mkdirSync(dirname(t), { recursive: true });`,
      `  writeFileSync(t, body, 'utf-8');`,
      `}`,
    ].join('\n'),
    'utf-8',
  );
  dir = join(root, 'dsh-probe');
  execFileSync(
    process.execPath,
    [join(RECOURSE, 'node_modules/tsx/dist/cli.mjs'), script, dir],
    { cwd: RECOURSE, stdio: 'pipe' },
  );

  // Build against the @deepseek-ai types this repo already has installed. A
  // junction is what lets `tsc` resolve the devDependencies the generated
  // package.json declares without a network install; Recourse's own node_modules
  // does not carry them.
  //
  // A typecheck failure here is a real defect in the generated bundle and is
  // reported as such. The one tolerated gap is a host with no @deepseek-ai
  // packages at all, which is an environment, not a regression.
  if (existsSync(join(HERE, 'node_modules', '@deepseek-ai'))) {
    if (!existsSync(join(dir, 'node_modules'))) {
      execFileSync('cmd', ['/c', 'mklink', '/J', join(dir, 'node_modules'), join(HERE, 'node_modules')], { stdio: 'pipe' });
    }
try {
    // Invoke tsc's JS entry directly rather than the `.cmd` shim: `execFileSync`
    // on Windows cannot spawn a batch file without a shell, and shelling out
    // would be a needless dependency.
    execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], { cwd: dir, stdio: 'pipe' });
  } catch (error) {
      throw new Error(`a generated bundle does not typecheck:\n${error.stdout ?? ''}${error.stderr ?? ''}`);
    }
  } else {
    console.warn('scaffold-contract: no @deepseek-ai packages installed; skipping the generated-bundle typecheck');
  }
  mod = await import(pathToFileURL(join(dir, 'lib/index.js')).href);
});

after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const test0 = available ? test : test.skip;
const read = (rel) => readFileSync(join(dir, rel), 'utf-8');

test0('the generated bundle builds and exposes the cordis entry contract', () => {
  assert.equal(typeof mod.apply, 'function');
  assert.equal(mod.name, SPEC.id);
  // Nothing is required: a hard requirement fails the profile layer on a host
  // that lacks the service.
  assert.deepEqual(mod.inject, []);
});

test0('it declares zero runtime dependencies and only type-only host imports', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  // devDependencies are needed for `tsc` to resolve `import type`.
  assert.ok(pkg.devDependencies['@deepseek-ai/dsh-tools']);

  for (const name of ['index.ts', 'spec.ts', 'api.ts', 'catalog.ts', 'config.ts', 'params.ts', 'prompt.ts']) {
    for (const line of read(join('src', name)).split('\n')) {
      if (!line.includes("from '@deepseek-ai/")) continue;
      assert.match(line, /^import type /, `${name}: ${line}`);
    }
  }
});

test0('apply attaches tools and a prompt section through ctx.inject, not eagerly', () => {
  const registered = [];
  const sections = [];
  const log = [];
  const ctx = {
    logger: { info: (m) => log.push(m), warn: (m) => log.push(m) },
    inject: (keys, fn) => {
      const key = Array.isArray(keys) ? keys.join('+') : keys;
      if (key.includes('tools')) {
        fn({ logger: ctx.logger, effect: (f) => f(), tools: { register: (t) => (registered.push(t), () => {}) } });
      } else if (key.includes('systemPrompt')) {
        fn({ effect: (f) => f(), systemPrompt: { section: (s) => sections.push(s) } });
      }
    },
  };

  mod.apply(ctx, { apiBaseUrl: 'http://127.0.0.1:3050', promptSectionOrder: 118, contributePrompt: true });

  assert.equal(registered.length, SPEC.tools.length, 'every declared tool registers');
  assert.equal(sections.length, 1, 'exactly one prompt section');
  assert.equal(sections[0].order, 118);
  // The boot line reports the secret state honestly rather than implying auth.
  assert.match(log[0], /secret ABSENT|secret present/);
});

test0('the prompt section degrades honestly when no tool registered', () => {
  // A host that provides `systemPrompt` but never `tools` is the realistic bad
  // case: claiming tools that do not exist teaches the model to call into the
  // void, so the section must say so instead of listing the catalog.
  const sections = [];
  mod.apply(
    {
      logger: { info: () => {}, warn: () => {} },
      inject: (keys, fn) => {
        if (!keys.includes('systemPrompt')) return;
        fn({ effect: (f) => f(), systemPrompt: { section: (s) => sections.push(s) } });
      },
    },
    { contributePrompt: true },
  );
  assert.equal(sections.length, 1);
  const text = sections[0].text();
  assert.match(text, /no tools were registered on this host/);
  assert.doesNotMatch(text, /probe_run/);
});

test0('long tools take the long budget and ordinary tools take none', () => {
  const registered = [];
  mod.apply(
    {
      logger: { info: () => {}, warn: () => {} },
      inject: (keys, fn) => {
        if (!keys.includes('tools')) return;
        fn({ logger: { warn: () => {} }, effect: (f) => f(), tools: { register: (t) => (registered.push(t), () => {}) } });
      },
    },
    { longTimeoutMs: 600000, contributePrompt: false },
  );
  const byName = new Map(registered.map((t) => [t.name, t]));
  assert.equal(byName.get('probe_status').timeoutMs, undefined);
  assert.equal(byName.get('probe_run').timeoutMs, 600000);
});

test0('a mutating tool says it will fail closed when no secret is configured', () => {
  const registered = [];
  mod.apply(
    {
      logger: { info: () => {}, warn: () => {} },
      inject: (keys, fn) => {
        if (!keys.includes('tools')) return;
        fn({ logger: { warn: () => {} }, effect: (f) => f(), tools: { register: (t) => (registered.push(t), () => {}) } });
      },
    },
    { contributePrompt: false },
  );
  const byName = new Map(registered.map((t) => [t.name, t]));
  assert.match(byName.get('probe_run').description, /RECOURSE_API_SECRET is not configured/);
  assert.doesNotMatch(byName.get('probe_status').description, /RECOURSE_API_SECRET is not configured/);
});

test0('every tool carries a closed JSON Schema the model can call', () => {
  const registered = [];
  mod.apply(
    {
      logger: { info: () => {}, warn: () => {} },
      inject: (keys, fn) => {
        if (!keys.includes('tools')) return;
        fn({ logger: { warn: () => {} }, effect: (f) => f(), tools: { register: (t) => (registered.push(t), () => {}) } });
      },
    },
    { contributePrompt: false },
  );
  for (const tool of registered) {
    assert.match(tool.name, /^[A-Za-z0-9_-]{1,64}$/, `${tool.name} obeys the function-name contract`);
    assert.equal(tool.parameters.type, 'object');
    // additionalProperties:false stops the model inventing arguments the tool
    // does not read, which otherwise round-trips as transcript noise.
    assert.equal(tool.parameters.additionalProperties, false);
  }
});

test0('a disposed tools service stops the prompt section claiming tools', () => {
  // Teardown is the case where a stale section is worst: the harness has torn
  // the plugin down, and a prompt still advertising its tools is a lie.
  const sections = [];
  let teardown;
  mod.apply(
    {
      logger: { info: () => {}, warn: () => {} },
      inject: (keys, fn) => {
        if (keys.includes('tools')) {
          fn({
            logger: { warn: () => {} },
            effect: (f) => (teardown = f()),
            tools: { register: () => () => {} },
          });
        } else if (keys.includes('systemPrompt')) {
          fn({ effect: (f) => f(), systemPrompt: { section: (s) => sections.push(s) } });
        }
      },
    },
    { contributePrompt: true },
  );
  assert.match(sections[0].text(), /probe_status/);
  teardown();
  assert.match(sections[0].text(), /no tools were registered on this host/);
});

test0('an unknown argument is rejected before any request leaves the process', async () => {
  const registered = [];
  mod.apply(
    {
      logger: { info: () => {}, warn: () => {} },
      inject: (keys, fn) => {
        if (!keys.includes('tools')) return;
        fn({ logger: { warn: () => {} }, effect: (f) => f(), tools: { register: (t) => (registered.push(t), () => {}) } });
      },
    },
    { apiBaseUrl: 'http://127.0.0.1:1', contributePrompt: false },
  );
  const tool = registered.find((t) => t.name === 'probe_status');
  // Port 1 refuses instantly; the point is that validation throws first, so the
  // message names the tool rather than being a connection error.
  await assert.rejects(
    () => tool.execute({ bogus: 1 }, { signal: new AbortController().signal }),
    /probe_status: unknown argument "bogus"/,
  );
});

test0('the patch row names the secret variable and never carries a value', () => {
  const patch = read('cordis.patch.yml');
  assert.match(patch, /apiSecretEnvVar: 'RECOURSE_API_SECRET'/);
  assert.doesNotMatch(patch, /apiSecret:\s*\S/);
  // A Windows path must survive single-quoted YAML, where backslash is literal.
  assert.match(patch, /'http:\/\/127\.0\.0\.1:3050'/);
  // The two-budget contract: a stdio bridge's blanket cap could not express this.
  assert.match(patch, /defaultTimeoutMs: 15000/);
  assert.match(patch, /longTimeoutMs: 600000/);
});

test0('no file carries a UTF-8 BOM', () => {
  // The harness JSON.parses a bundle's package.json; U+FEFF is not JSON
  // whitespace, and a BOM drops the bundle with no boot-graph entry.
  for (const rel of ['package.json', 'tsconfig.json', 'cordis.patch.yml', 'plugin.manifest.json', 'README.md', 'src/index.ts']) {
    const buf = readFileSync(join(dir, rel));
    assert.ok(!(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf), `${rel} starts with a BOM`);
  }
});

test0('lib/ is generated and gitignored, because a profile links to it', () => {
  assert.ok(existsSync(join(dir, 'lib', 'index.js')), 'the build produced lib/index.js');
  assert.match(read('.gitignore'), /^lib\/$/m);
});
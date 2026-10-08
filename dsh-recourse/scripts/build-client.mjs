/**
 * Bundle the client plane into the single file the harness serves.
 *
 * ## The required output shape
 *
 * `@deepseek-ai/dsh-client-modules` loads a plugin bundle as a CLASSIC SCRIPT:
 *
 *   const el = document.createElement("script");
 *   el.async = true;
 *   el.src = url;                       // no type="module"
 *
 * and the loader injects a CommonJS-style `require`. The bundle must therefore
 * register itself through the global module loader:
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => {
 *     var module = { exports: {} };
 *     var exports = module.exports;
 *     let react = require("react");
 *     // ...body...
 *     exports.apply = apply;
 *     exports.inject = inject;
 *     return module.exports;
 *   }});
 *
 * Inside that factory `require` is NOT Node's: it resolves the host's platform
 * seeds (`react`, `react-dom`, …), already-materialized plugin modules, and --
 * through `require.async` -- package-local chunks that must be named
 * `client.<name>.js`. A bare `import`/`export` statement is a SyntaxError here,
 * and a relative `import()` is rejected by the `CLIENT_CHUNK` guard.
 *
 * `dsh-teams-x`'s published `lib/client.js` is the reference artifact.
 *
 * ## How this script produces it
 *
 * esbuild bundles to CommonJS (so externals become `require(...)` calls and
 * exports land on `module.exports`), and the result is then wrapped in the
 * loader shell. esbuild's `banner`/`footer` cannot do this because the wrapper
 * must close around the *final* `module.exports`, so the wrap is textual and the
 * emitted body is checked before it is written.
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'lib', 'client.js');

/** Must match package.json `name`; the loader keys every bundle by it. */
const PLUGIN_ID = 'dsh-recourse';

const result = await build({
  entryPoints: [join(root, 'src', 'client', 'index.tsx')],
  bundle: true,
  write: false,
  // CommonJS, because the host injects a `require` and reads `module.exports`.
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  // The host supplies React to every client plugin. Bundling our own copy would
  // give this panel a second, unshared React and break every hook it uses.
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  metafile: true,
  logLevel: 'warning',
});

const body = result.outputFiles[0].text;

const problems = [];

// 1. The bundle must not carry module syntax: it is evaluated as a classic
//    script, where `import`/`export` are SyntaxErrors.
if (/^\s*(import|export)\s/m.test(body)) {
  problems.push('bundle body still contains top-level import/export syntax');
}

// 2. Externals must be requested through the injected `require`, which is the
//    only resolver the factory has.
for (const match of body.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
  const specifier = match[1];
  if (specifier.startsWith('.')) {
    problems.push(`bundle requires a relative specifier the loader cannot serve: ${specifier}`);
  } else if (!/^(react|react-dom|react\/jsx-runtime)$/.test(specifier)) {
    problems.push(`bundle requires an unknown bare specifier: ${specifier}`);
  }
}

// 3. esbuild must have produced something the harness can still read.
if (!/module\.exports/.test(body)) {
  problems.push('bundle body never assigns module.exports');
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('client bundle is malformed; the harness serves this file verbatim');
  process.exitCode = 1;
} else {
  const wrapped = `window.__ModuleLoader__.load({
	id: ${JSON.stringify(PLUGIN_ID)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
		return module.exports;
	}
});
`;
  writeFileSync(outfile, wrapped);
  const inputs = Object.keys(result.metafile.inputs).length;
  console.log(`client bundle: ${Buffer.byteLength(wrapped)} bytes from ${inputs} module(s) -> lib/client.js`);
  console.log('registered via window.__ModuleLoader__.load as a classic script');
}
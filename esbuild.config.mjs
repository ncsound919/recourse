/**
 * esbuild config for the Recourse production bundle (dist/server.cjs).
 *
 * `--packages=external` externalizes every node_modules package, which is
 * correct for native addons (isolated-vm, lancedb, sharp) but breaks two pure-JS
 * packages whose internals only resolve when bundled:
 *   - autograd-ts: exports map exposes only `import`, so CJS require() fails
 *   - diff-grok:   internal ESM directory imports (ERR_UNSUPPORTED_DIR_IMPORT)
 * This config bundles everything EXCEPT native/optional addons.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const directDeps = Object.keys(pkg.dependencies ?? {});

// Everything except these bundles; these stay external (native .node binaries
// or already-handled-by-vite client libs).
const external = [
  'isolated-vm',
  '@lancedb/lancedb',
  '@lancedb/lancedb-win32-x64-msvc',
  '@lancedb/lancedb-darwin-arm64',
  '@lancedb/lancedb-darwin-x64',
  '@lancedb/lancedb-linux-x64-gnu',
  '@lancedb/lancedb-linux-arm64-gnu',
  'sharp',
  'three',
  'react',
  'react-dom',
  'vite',
  'node-cron',
  // esbuild's SYNCHRONOUS API (transformSync, used by the sandbox verifier at
  // boot) spawns a worker thread and blocks the main thread in Atomics.wait.
  // Its JS API cannot be bundled: the bundled copy's worker never reports back,
  // so transformSync deadlocks the event loop and app.listen() never binds.
  // It must resolve its own binary via a relative path from the real package.
  'esbuild',
  // Pure-JS + WASM; must resolve its own .wasm assets at runtime, so it is
  // loaded dynamically and kept external rather than bundled.
  'quickjs-emscripten',
];

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // bundle all direct deps, then explicitly re-externalize the native ones
  external,
  sourcemap: true,
  outfile: 'dist/server.cjs',
}).catch((e) => { console.error(e); process.exit(1); });
console.log(`esbuild config build done (${directDeps.length} direct deps, ${external.length} external)`);
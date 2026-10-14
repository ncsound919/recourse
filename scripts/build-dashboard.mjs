// Build the factory dashboard into one self-contained bundle.
//
// Why: the dashboard used to load React + three from esm.sh via an importmap,
// so an offline/proxied browser rendered nothing but the "loading…" fallback.
// All three deps are already in node_modules, so bundle them in — the page then
// needs no network at all.
//
//   node scripts/build-dashboard.mjs
//
// Source: src/dashboard/factory-app.js  (edit this)
// Output: src/dashboard/factory.bundle.js (served at /api/recourse/factory/dashboard.js)
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src', 'dashboard');

await build({
  entryPoints: [path.join(dir, 'factory-app.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  platform: 'browser',
  target: ['es2020'],
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: path.join(dir, 'factory.bundle.js'),
  logLevel: 'info',
});

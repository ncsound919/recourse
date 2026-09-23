/**
 * route-snapshot.mjs — CLI for the static route-table extractor.
 *
 * The monolith (`server.ts`) is being split into `src/routes/*` routers. This
 * composes the full (METHOD, path) table from BOTH the inline routes in
 * `server.ts` and every mounted router file, so a decomposition PR can be
 * proven not to drop or rename a route.
 *
 * Usage:
 *   node scripts/route-snapshot.mjs                    # print sorted table
 *   node scripts/route-snapshot.mjs --json             # print JSON array
 *   node scripts/route-snapshot.mjs --write [file]     # write snapshot (default tests/fixtures/route-snapshot.json)
 *   node scripts/route-snapshot.mjs --check <file>     # exit 1 on drift
 *
 * NOTE: static analysis, not live Express introspection. It covers the mount
 * patterns used in this repo; add new patterns to scripts/lib/routeTable.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeRouteTable, diffRouteTables } from './lib/routeTable.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const table = computeRouteTable(root);
const json = JSON.stringify(table, null, 2);

if (args.includes('--json')) {
  console.log(json);
} else if (args.includes('--write')) {
  const idx = args.indexOf('--write');
  const out = args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1]
    : path.join(root, 'tests', 'fixtures', 'route-snapshot.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, json + '\n');
  console.log(`wrote ${table.length} routes to ${out}`);
} else if (args.includes('--check')) {
  const target = args[args.indexOf('--check') + 1];
  if (!target) {
    console.error('--check requires a snapshot file');
    process.exit(2);
  }
  const expected = JSON.parse(fs.readFileSync(target, 'utf8'));
  const { missing, added } = diffRouteTables(expected, table);
  if (missing.length === 0 && added.length === 0) {
    console.log(`route table OK (${table.length} routes)`);
    process.exit(0);
  }
  if (missing.length) console.error('MISSING routes:\n' + missing.map((r) => '  - ' + r).join('\n'));
  if (added.length) console.error('ADDED routes:\n' + added.map((r) => '  + ' + r).join('\n'));
  process.exit(1);
} else {
  console.log(table.join('\n'));
  console.error(`\n${table.length} routes`);
}

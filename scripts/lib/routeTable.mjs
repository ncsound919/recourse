/**
 * routeTable.mjs — shared static route-table extractor (see scripts/route-snapshot.mjs).
 * Exported so `tests/routeSnapshot.test.ts` can assert the decomposition never
 * drops or renames a route.
 */
import fs from 'node:fs';
import path from 'node:path';

const methods = ['get', 'post', 'put', 'delete', 'patch'];
const routeRe = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\.(${methods.join('|')})\\(\\s*'([^']*)'`, 'g');

function joinPath(mount, rel) {
  if (!rel || rel === '/') return mount || '/';
  const base = (mount || '').replace(/\/+$/, '');
  const tail = rel.startsWith('/') ? rel : `/${rel}`;
  return `${base}${tail}` || '/';
}

function collectBindings(src) {
  const map = new Map();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(create\w+Router)\s*\(/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

function findFactoryFile(root, factory) {
  const candidates = [];
  const routesDir = path.join(root, 'src', 'routes');
  if (fs.existsSync(routesDir)) {
    for (const f of fs.readdirSync(routesDir)) {
      if (f.endsWith('.ts')) candidates.push(path.join(routesDir, f));
    }
  }
  candidates.push(path.join(root, 'src', 'server', 'routes', 'webChannel.ts'));
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (new RegExp(`export\\s+(?:function|const)\\s+${factory}\\b`).test(src)) return file;
  }
  return null;
}

function routesInRouterFile(file, mount) {
  const src = fs.readFileSync(file, 'utf8');
  const routerVars = new Set();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(?:Router|express\.Router)\s*\(\s*\)/g)) {
    routerVars.add(m[1]);
  }
  if (routerVars.size === 0) routerVars.add('router');
  const out = [];
  for (const m of src.matchAll(routeRe)) {
    if (!routerVars.has(m[1])) continue;
    out.push(`${m[2].toUpperCase()} ${joinPath(mount, m[3])}`);
  }
  return out;
}

/**
 * Compose the full (METHOD, path) route table from server.ts inline routes plus
 * every mounted router file. Returns a sorted string[].
 */
export function computeRouteTable(root = process.cwd()) {
  const serverSrc = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  const routes = new Set();

  for (const m of serverSrc.matchAll(/\bapp\.(get|post|put|delete|patch)\(\s*'([^']*)'/g)) {
    routes.add(`${m[1].toUpperCase()} ${m[2]}`);
  }

  const bindings = collectBindings(serverSrc);
  const factoryMounts = new Map();
  const addMount = (factory, mount) => {
    if (!factoryMounts.has(factory)) factoryMounts.set(factory, new Set());
    factoryMounts.get(factory).add(mount);
  };

  for (const m of serverSrc.matchAll(/app\.use\(\s*'([^']*)'\s*,\s*(create\w+Router)\s*\(/g)) {
    addMount(m[2], m[1]);
  }
  for (const m of serverSrc.matchAll(/app\.use\(\s*'([^']*)'\s*,\s*(\w+)(?:\.router)?\s*[,)]/g)) {
    const factory = bindings.get(m[2]);
    if (factory) addMount(factory, m[1]);
  }
  for (const m of serverSrc.matchAll(/app\.use\(\s*(create\w+Router)\s*\(/g)) {
    addMount(m[1], '');
  }

  for (const [factory, mounts] of factoryMounts) {
    const file = findFactoryFile(root, factory);
    if (!file) {
      routes.add(`!! UNRESOLVED ROUTER ${factory}`);
      continue;
    }
    for (const mount of mounts) {
      for (const r of routesInRouterFile(file, mount)) routes.add(r);
    }
  }

  return [...routes].sort();
}

/** Compare two route tables; returns what's missing/added. */
export function diffRouteTables(expected, actual) {
  const cur = new Set(actual);
  const exp = new Set(expected);
  return {
    missing: expected.filter((r) => !cur.has(r)),
    added: actual.filter((r) => !exp.has(r)),
  };
}

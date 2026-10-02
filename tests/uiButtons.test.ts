/**
 * uiButtons.test.ts — every dashboard button is wired to something real.
 *
 * WHY THIS EXISTS
 * The dashboard grew 170+ buttons across 30 views and a meaningful number of
 * them did nothing at all. Three real causes were found by hand:
 *
 *  1. A view called `/api/ollama/{status,chat,manage}` — no such route has
 *     ever existed, so all three buttons 404'd.
 *  2. `createSlopBenchRouter()` was mounted at `/api/recourse` instead of
 *     `/api/recourse/slopbench`, so its `/status` shadowed the core
 *     `GET /api/recourse/status` that six components poll, and the view's own
 *     `/slopbench/*` calls 404'd.
 *  3. A handler POSTed to `/api/recourse/github/ingest`, which does not exist
 *     (the real route is `/github/import`, with a different payload).
 *
 * None of these fail `tsc`, and none are visible until a human clicks. These
 * tests make them loud and permanent.
 *
 * WHAT IS ASSERTED
 *  - Every <button> has an onClick, or is a real submit inside a <form> that
 *    has onSubmit. A button with neither is inert — that is the definition of
 *    "does nothing".
 *  - No click handler has an empty body, and no inline `() => {}` no-op.
 *  - Every /api/... path the UI calls resolves to a REAL route (params and
 *    wildcards allowed) — never satisfied by the SPA catch-all `GET *`.
 *  - The HTTP method the UI sends matches a method the route actually serves.
 *    A POST to a GET-only route is a guaranteed 404 in Express.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeRouteTable } from '../scripts/lib/routeTable.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Every .tsx under src/ — the whole dashboard surface. */
const UI_FILES = walk(SRC).sort();

/** (METHOD, path) pairs the server actually serves. */
const ROUTE_TABLE = computeRouteTable(ROOT);

const ROUTES = new Map<string, Set<string>>();
for (const entry of ROUTE_TABLE) {
  const m = /^([A-Z]+) (.+)$/.exec(entry);
  if (!m) continue;
  const [, method, routePath] = m;
  if (!ROUTES.has(routePath)) ROUTES.set(routePath, new Set());
  ROUTES.get(routePath)!.add(method);
}

const ROUTE_PATHS = [...ROUTES.keys()];

/** Turn a served route into a matcher: ':id' and '*' become wildcards. */
function routeMatcher(routePath: string): RegExp {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `:` is not an escape-worthy character, so params are rewritten before the
  // wildcard pass. One segment — a route param never spans a slash.
  const withParams = escaped.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '[^/]+');
  return new RegExp(`^${withParams.replace(/\\\*/g, '.*')}$`);
}

/**
 * Resolve a UI-called path to the route that serves it.
 * Returns the served route path, or null when nothing serves it.
 *
 * The SPA catch-all (`GET *`) is deliberately NOT a match: it answers any GET
 * with the dashboard shell, so treating it as a hit would make every unknown
 * endpoint look implemented — which is exactly how the dead /api/ollama/*
 * buttons survived review.
 */
function resolveRoute(calledPath: string): string | null {
  if (ROUTES.has(calledPath)) return calledPath;
  for (const routePath of ROUTE_PATHS) {
    if (routePath === '*') continue;
    if (routeMatcher(routePath).test(calledPath)) return routePath;
  }
  return null;
}

/**
 * Strip the query string and replace each interpolation with a placeholder
 * segment, so a templated path can match a route param. Dropping the
 * interpolation instead would leave a double slash that no single-segment
 * route param can satisfy.
 */
function normalizePath(raw: string): string {
  return raw
    .split('?')[0]
    .replace(/\$\{[^}]*\}/g, '*')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '') || '/';
}

/** All /api/... string literals passed to fetch() or recourseJson() in a file. */
interface ApiCall {
  path: string;
  method: string;
  line: number;
}

const FETCH_RE = /(?:fetch|recourseJson)\s*(?:<[^>]*>)?\s*\(\s*([`'"])(\/api\/[^`'"]*)\1/g;
const METHOD_RE = /method\s*:\s*['"]([A-Za-z]+)['"]/;

/**
 * Extract API calls with their method.
 *
 * The method must be read from the SAME call expression, not from a 400-char
 * window ahead: an earlier version of this scan looked ahead and picked up the
 * `method: 'POST'` of the *next* fetch, inventing mismatches that did not
 * exist. We bound the scan to the call's argument list instead.
 */
function apiCallsIn(src: string): ApiCall[] {
  const calls: ApiCall[] = [];
  for (const m of src.matchAll(FETCH_RE)) {
    const [full, , rawPath] = m;
    const start = m.index + full.length;

    // Walk the argument list from the opening paren to its match, tracking
    // nesting and string literals so we stop at the right place.
    let depth = 1;
    let i = src.indexOf('(', m.index) + 1;
    let quote: string | null = null;
    const argStart = start;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      } else if (ch === '{' || ch === '[' || ch === '(') {
        depth++;
      } else if (ch === '}' || ch === ']' || ch === ')') {
        depth--;
      }
      i++;
    }
    const argSrc = src.slice(argStart, i);

    const methodMatch = METHOD_RE.exec(argSrc);
    calls.push({
      path: normalizePath(rawPath),
      method: (methodMatch?.[1] ?? 'GET').toUpperCase(),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return calls;
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

/**
 * Opening tags of `name` in a file, brace-aware.
 *
 * A plain /<button[^>]*>/ match is wrong: JSX attributes contain braces and
 * arrows (`onMouseEnter={() =>`), so the first `>` is usually an arrow, not the
 * end of the tag — which truncates the tag and hides real handlers.
 */
function openingTags(src: string, name: string): Array<{ tag: string; index: number; line: number }> {
  const out: Array<{ tag: string; index: number; line: number }> = [];
  const re = new RegExp(`<${name}\\b`, 'g');
  for (const m of src.matchAll(re)) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    while (i < src.length) {
      const ch = src[i];
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
      } else if (ch === '>' && depth === 0) {
        break;
      }
      i++;
    }
    out.push({ tag: src.slice(m.index, i + 1), index: m.index, line: lineOf(src, m.index) });
  }
  return out;
}

function buttonTags(src: string): Array<{ tag: string; index: number; line: number }> {
  return openingTags(src, 'button');
}

/**
 * True when the button sits inside a <form ...> that has an onSubmit handler.
 * type="submit" is the default for a button, so a submit inside a handled form
 * fires real work; anything else needs its own onClick.
 */
function isSubmitInHandlerForm(src: string, index: number): boolean {
  const before = src.slice(0, index);
  const forms = openingTags(src, 'form').filter((f) => f.index < index);
  const lastOpen = forms[forms.length - 1];
  if (!lastOpen) return false;
  const lastClose = before.lastIndexOf('</form>');
  if (lastClose > lastOpen.index) return false;
  return /\bonSubmit\s*=/.test(lastOpen.tag);
}

describe('dashboard buttons are wired', () => {
  it('finds the dashboard surface (sanity: the scan is not silently empty)', () => {
    const total = UI_FILES.reduce((n, f) => n + buttonTags(fs.readFileSync(f, 'utf8')).length, 0);
    expect(UI_FILES.length, 'expected .tsx files under src/').toBeGreaterThan(5);
    expect(total, 'expected a meaningful number of buttons').toBeGreaterThan(50);
  });

  it('every <button> has an onClick or is a submit inside a form with onSubmit', () => {
    const inert: string[] = [];
    for (const file of UI_FILES) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      for (const { tag, index, line } of buttonTags(src)) {
        if (/\bonClick\s*=/.test(tag)) continue;
        // A button submits by default. type="button"/"reset" never do, so those
        // must carry their own onClick; anything else is fine inside a form
        // whose onSubmit does the work.
        const explicitType = /type\s*=\s*["'](button|reset|submit)["']/.exec(tag)?.[1];
        const canSubmit = explicitType === undefined || explicitType === 'submit';
        if (canSubmit && isSubmitInHandlerForm(src, index)) continue;
        inert.push(`${rel}:${line}  ${tag.replace(/\s+/g, ' ').slice(0, 110)}`);
      }
    }
    expect(
      inert,
      `Buttons with no click handler (they do nothing):\n${inert.join('\n')}`,
    ).toEqual([]);
  });

  it('no click handler has an empty body and no inline no-op arrow', () => {
    const noops: string[] = [];
    for (const file of UI_FILES) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      // Inline no-ops passed straight to onClick.
      for (const m of src.matchAll(/onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/g)) {
        noops.push(`${rel}:${lineOf(src, m.index)}  inline empty arrow`);
      }
      // Named handlers declared with an empty body.
      for (const m of src.matchAll(/(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{\s*\}/g)) {
        noops.push(`${rel}:${lineOf(src, m.index)}  empty handler ${m[1] ?? m[2]}`);
      }
    }
    expect(noops, `Empty click handlers (they do nothing):\n${noops.join('\n')}`).toEqual([]);
  });
});

describe('UI calls reach real routes', () => {
  it('every /api/... path the UI calls is served by a route', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const file of UI_FILES) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      for (const call of apiCallsIn(src)) {
        if (!call.path.includes('/api/')) continue;
        // A bare '/api/' or template-only fragment carries no real path.
        if (call.path === '/api' || call.path.endsWith('/api')) continue;
        checked++;
        // The SPA fallback `GET *` serves the dashboard shell for unknown GETs;
        // it is NOT evidence that an endpoint exists.
        if (resolveRoute(call.path) === null) {
          missing.push(`${rel}:${call.line}  ${call.method} ${call.path}`);
        }
      }
    }
    expect(checked, 'expected the UI to call real endpoints').toBeGreaterThan(20);
    expect(
      missing,
      `UI calls with no matching server route (these 404):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('the HTTP method the UI sends is a method the route serves', () => {
    const mismatches: string[] = [];
    for (const file of UI_FILES) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      for (const call of apiCallsIn(src)) {
        if (!call.path.includes('/api/')) continue;
        const served = resolveRoute(call.path);
        if (served === null) continue; // reported by the existence test above
        const methods = ROUTES.get(served)!;
        if (!methods.has(call.method)) {
          mismatches.push(
            `${rel}:${call.line}  ${call.method} ${call.path} -> route serves ${[...methods].sort().join(', ')}`,
          );
        }
      }
    }
    expect(
      mismatches,
      `UI sends a method no route serves (guaranteed 404):\n${mismatches.join('\n')}`,
    ).toEqual([]);
  });
});

describe('route table extraction is trustworthy', () => {
  it('resolves every mounted router factory', () => {
    expect(ROUTE_TABLE.filter((r) => r.startsWith('!! UNRESOLVED ROUTER'))).toEqual([]);
  });

  it('has a non-trivial number of routes', () => {
    expect(ROUTE_TABLE.length).toBeGreaterThan(300);
  });

  it('the core status endpoint is served by exactly one GET', () => {
    // Regression guard for the slopbench mount bug: createSlopBenchRouter
    // mounted at /api/recourse served its own /status and shadowed this one,
    // so the dashboard's status strip silently rendered slopbench data.
    const methods = ROUTES.get('/api/recourse/status');
    expect(methods, 'core GET /api/recourse/status must exist').toBeDefined();
    expect(methods!.has('GET')).toBe(true);
  });

  it('slopbench routes live under /api/recourse/slopbench', () => {
    // The view calls /api/recourse/slopbench/{status,runs,run}.
    for (const p of ['/api/recourse/slopbench/status', '/api/recourse/slopbench/runs', '/api/recourse/slopbench/run']) {
      expect(resolveRoute(p), `${p} must be served`).not.toBeNull();
    }
  });

  it('serves the local llama.cpp hub the dashboard view calls', () => {
    for (const [p, method] of [
      ['/api/llama/status', 'GET'],
      ['/api/llama/models', 'GET'],
      ['/api/llama/chat', 'POST'],
    ] as const) {
      const served = resolveRoute(p);
      expect(served, `${p} must be served`).not.toBeNull();
      expect(ROUTES.get(served!)!.has(method), `${p} must accept ${method}`).toBe(true);
    }
  });

  it('does not serve the removed ollama endpoints', () => {
    for (const p of ['/api/ollama/status', '/api/ollama/chat', '/api/ollama/manage']) {
      expect(resolveRoute(p), `${p} was never implemented and must stay gone`).toBeNull();
    }
  });
});

import { describe, it, expect } from 'vitest';
import { FORGE_AGENDA, verifyForgeSource } from '../src/lib/capabilityForge';

// Correct reference implementations for every agenda item. The forge contract
// is: the model writes the implementation; the HUMAN-authored reference suite
// judges it. This test proves each reference suite is (a) achievable by a real
// correct implementation (so a passing model impl is genuinely correct, not an
// artifact of a broken suite) and (b) strict enough to reject wrong code.

const CORRECT: Record<string, string> = {
  dedupeStable: `export function dedupeStable(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) { if (!seen.has(x)) { seen.add(x); out.push(x); } }
  return out;
}`,
  chunkArray: `export function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}`,
  runLengthEncode: `export function runLengthEncode(str) {
  if (!str) return '';
  let out = ''; let c = str[0]; let count = 1;
  for (let i = 1; i < str.length; i++) {
    if (str[i] === c) count++;
    else { out += c + count; c = str[i]; count = 1; }
  }
  out += c + count;
  return out;
}`,
  fibonacciN: `export function fibonacciN(n) {
  if (n === 0) return 0;
  let a = 0, b = 1;
  for (let i = 1; i < n; i++) { const t = a + b; a = b; b = t; }
  return b;
}`,
  gcdPair: `export function gcdPair(a, b) {
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}`,
  levenshteinDistance: `export function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}`,
  topKFrequent: `export function topKFrequent(arr, k) {
  const freq = new Map();
  const first = new Map();
  arr.forEach((x, i) => {
    freq.set(x, (freq.get(x) || 0) + 1);
    if (!first.has(x)) first.set(x, i);
  });
  const items = [...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a) || first.get(a) - first.get(b));
  return items.slice(0, k);
}`,
  // --- Benchmark-aligned agenda specs (forge_binary_search etc.) ---
  binarySearch: `export function binarySearch(a, t) {
  let lo = 0, hi = a.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] === t) return m; if (a[m] < t) lo = m + 1; else hi = m - 1; }
  return -1;
}`,
  isBalanced: `export function isBalanced(s) {
  const st = []; const map = { ')': '(', ']': '[', '}': '{' };
  for (const ch of s) { if ('([{'.includes(ch)) st.push(ch); else if (map[ch]) { if (st.pop() !== map[ch]) return false; } }
  return st.length === 0;
}`,
  mergeSorted: `export function mergeSorted(a, b) {
  const r = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) r.push(a[i] < b[j] ? a[i++] : b[j++]);
  while (i < a.length) r.push(a[i++]); while (j < b.length) r.push(b[j++]);
  return r;
}`,
  isPrime: `export function isPrime(n) {
  if (n < 2) return false; if (n < 4) return true; if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
}`,
  multiply: `export function multiply(A, B) {
  const rows = A.length, cols = B[0].length, n = A[0].length;
  const R = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) for (let k = 0; k < n; k++) { const av = A[i][k]; if (av === 0) continue; for (let j = 0; j < cols; j++) R[i][j] += av * B[k][j]; }
  return R;
}`,
  dijkstra: `export function dijkstra(g, s) {
  const dist = {}; const visited = new Set(); const nodes = Object.keys(g);
  for (const n of nodes) dist[n] = Infinity; dist[s] = 0;
  while (visited.size < nodes.length) {
    let u = null, best = Infinity;
    for (const n of nodes) if (!visited.has(n) && dist[n] < best) { best = dist[n]; u = n; }
    if (u === null) break; visited.add(u);
    for (const v of Object.keys(g[u])) { const w = g[u][v]; if (dist[v] > dist[u] + w) dist[v] = dist[u] + w; }
  }
  return dist;
}`,
  applyX: `export function applyX(v) { return [v[1], v[0]]; }`,
  quickSort: `export function quickSort(arr) {
  if (arr.length <= 1) return arr.slice();
  const pivot = arr[arr.length >> 1];
  const lo = [], eq = [], hi = [];
  for (const x of arr) { if (x < pivot) lo.push(x); else if (x > pivot) hi.push(x); else eq.push(x); }
  return [...quickSort(lo), ...eq, ...quickSort(hi)];
}`,
  flattenDeep: `export function flattenDeep(arr) {
  const out = [];
  for (const x of arr) { if (Array.isArray(x)) out.push(...flattenDeep(x)); else out.push(x); }
  return out;
}`,
  sievePrimes: `export function sievePrimes(n) {
  if (n < 2) return [];
  const sieve = new Array(n + 1).fill(true); sieve[0] = sieve[1] = false;
  for (let i = 2; i * i <= n; i++) if (sieve[i]) for (let j = i * i; j <= n; j += i) sieve[j] = false;
  const out = []; for (let i = 2; i <= n; i++) if (sieve[i]) out.push(i);
  return out;
}`,
  powerMod: `export function powerMod(base, exp, mod) {
  let r = 1 % mod; let b = base % mod;
  while (exp > 0) { if (exp % 2 === 1) r = (r * b) % mod; b = (b * b) % mod; exp = Math.floor(exp / 2); }
  return r;
}`,
  exponentialBackoffMs: `export function exponentialBackoffMs(attempt, baseMs, capMs) {
  return Math.min(capMs, baseMs * Math.pow(2, attempt));
}`,
  isPrivateIPv4: `export function isPrivateIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const p = ip.split('.');
  if (p.length !== 4) return false;
  const n = p.map((x) => { if (!/^[0-9]+$/.test(x)) return -1; const v = Number(x); return v >= 0 && v <= 255 ? v : -1; });
  if (n.some((v) => v < 0)) return false;
  if (n[0] === 10) return true;
  if (n[0] === 172 && n[1] >= 16 && n[1] <= 31) return true;
  if (n[0] === 192 && n[1] === 168) return true;
  if (n[0] === 127) return true;
  return false;
}`,
  redactSecrets: `export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = /password|secret|token|apikey|api_key/i.test(k) ? '***' : redactSecrets(value[k]);
    }
    return out;
  }
  return value;
}`,
  forwardChain: `export function forwardChain(facts, rules) {
  const known = new Set(facts);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rules) {
      if (!known.has(r.head) && r.premises.every((p) => known.has(p))) { known.add(r.head); changed = true; }
    }
  }
  return [...known].sort();
}`,
  tokenizeLogic: `export function tokenizeLogic(expr) {
  const toks = []; let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')' || ch === '!' || ch === '&' || ch === '|') { toks.push(ch); i++; continue; }
    if (ch === '-' && expr[i + 1] === '>') { toks.push('->'); i += 2; continue; }
    const m = /^[A-Za-z][A-Za-z0-9_]*/.exec(expr.slice(i));
    if (m) { toks.push(m[0]); i += m[0].length; continue; }
    return null;
  }
  return toks;
}`,
  applyHadamard: `export function applyHadamard(v) {
  return [(v[0] + v[1]) * Math.SQRT1_2, (v[0] - v[1]) * Math.SQRT1_2];
}`,
  measureProbs: `export function measureProbs(v) {
  const n = v[0] * v[0] + v[1] * v[1];
  if (n === 0) return [0.5, 0.5];
  return [v[0] * v[0] / n, v[1] * v[1] / n];
}`,
  LRUCache: `export class LRUCache {
  constructor(capacity) { this.cap = capacity; this.m = new Map(); }
  get(key) { if (!this.m.has(key)) return -1; const v = this.m.get(key); this.m.delete(key); this.m.set(key, v); return v; }
  set(key, value) { if (this.m.has(key)) this.m.delete(key); this.m.set(key, value); if (this.m.size > this.cap) this.m.delete(this.m.keys().next().value); }
}`,
};

describe('Capability Forge agenda — every reference suite is achievable & strict', () => {
  it('has a non-empty, correctly-formed agenda across domains', () => {
    expect(FORGE_AGENDA.length).toBeGreaterThanOrEqual(7);
    const ids = new Set(FORGE_AGENDA.map((s) => s.id));
    expect(ids.size).toBe(FORGE_AGENDA.length); // unique ids
    for (const spec of FORGE_AGENDA) {
      expect(spec.name).toMatch(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/);
      expect(spec.refSuite).toContain(`assert`);
      expect(spec.prompt.length).toBeGreaterThan(20);
    }
  });

  it('passes every reference suite against a correct implementation', () => {
    for (const spec of FORGE_AGENDA) {
      const impl = CORRECT[spec.name];
      expect(impl, `missing reference impl for ${spec.name}`).toBeDefined();
      const run = verifyForgeSource(impl, spec.refSuite);
      expect(run.passed, `${spec.name}: ${run.testDetails.filter((d) => d.startsWith('[FAIL')).join('; ')}`).toBe(true);
    }
  });

  it('rejects an incorrect implementation with captured failure feedback', () => {
    const spec = FORGE_AGENDA.find((s) => s.name === 'dedupeStable')!;
    const wrong = `export function dedupeStable(arr) { return [...new Set(arr)].reverse(); }`;
    const run = verifyForgeSource(wrong, spec.refSuite);
    expect(run.passed).toBe(false);
    expect(run.testDetails.some((d) => d.startsWith('[FAIL'))).toBe(true);
  });
});

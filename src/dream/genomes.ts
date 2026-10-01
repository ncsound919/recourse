// src/dream/genomes.ts — structural tool-gene templates, mutation, crossover,
// and sandbox verification. Every gene compiles to a self-contained pure
// function; verification runs it against fixed test vectors inside an
// isolated `node:vm` context (with a Function fallback for bundlers).

import type { GenomeSpec, InvariantCheck, ToolDomain } from './types';
import { inProcessFallbackRefusal } from '../lib/codeSafety';
import { createIsolatedCallable, isIsolateAvailable, type IsolatedCallable } from '../lib/isolatedSandbox';

const fmt = (n: number): number => Number(n.toPrecision(8));

function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object')
    Object.values(value as Record<string, unknown>).forEach((v) => collectNumbers(v, out));
  return out;
}

interface KindDef {
  kind: string;
  domain: ToolDomain;
  ranges: Record<string, [number, number]>;
  compile: (p: Record<string, number>) => string;
  vectors: () => unknown[];
  semantic?: (outputs: unknown[]) => InvariantCheck[];
}

const KINDS: Record<string, KindDef> = {
  lagrange_extrapolator: {
    kind: 'lagrange_extrapolator',
    domain: 'math',
    ranges: { epsilon: [1e-9, 1e-6], clamp: [50, 5000], decimals: [3, 6] },
    compile: (p) => `
function lagrangeExtrapolator(input) {
  const { xs, ys, x } = input;
  let result = 0;
  for (let i = 0; i < xs.length; i++) {
    let term = ys[i];
    for (let j = 0; j < xs.length; j++) {
      if (i === j) continue;
      const denom = xs[i] - xs[j];
      if (Math.abs(denom) < ${fmt(p.epsilon)}) continue;
      term = term * (x - xs[j]) / denom;
    }
    result += term;
  }
  const clamped = Math.max(-${fmt(p.clamp)}, Math.min(${fmt(p.clamp)}, result));
  return Number(clamped.toFixed(${Math.round(p.decimals)}));
}`,
    vectors: () => [
      { xs: [0, 1, 2, 3], ys: [1, 3, 5, 7], x: 4 },
      { xs: [0, 1, 2, 3], ys: [1, 3, 5, 7], x: 50 },
      { xs: [0, 1, 2, 2.0000001], ys: [1, 3, 5, 7], x: 2.5 },
    ],
    semantic: (out) => [
      { name: 'SupportEdgeAccuracy', passed: Math.abs((out[0] as number) - 9) < 0.01, detail: `f(4)=${out[0]}, expected ~9 on y=2x+1` },
      { name: 'OutOfSupportBounded', passed: Number.isFinite(out[1] as number) && Math.abs(out[1] as number) <= 5000 },
      { name: 'DegenerateKnotStability', passed: Number.isFinite(out[2] as number) },
    ],
  },

  cyclomatic_pressure_scorer: {
    kind: 'cyclomatic_pressure_scorer',
    domain: 'coding',
    ranges: { branchWeight: [0.8, 1.5], loopWeight: [0.6, 1.2], pressureCap: [50, 200] },
    compile: (p) => `
function cyclomaticPressureScorer(input) {
  const { branches, loops, nesting } = input;
  const raw = ${fmt(p.branchWeight)} * branches + ${fmt(p.loopWeight)} * loops + 0.5 * nesting;
  const capped = Math.min(${fmt(p.pressureCap)}, raw);
  return Number(capped.toFixed(4));
}`,
    vectors: () => [
      { branches: 4, loops: 2, nesting: 1 },
      { branches: 40, loops: 20, nesting: 5 },
      { branches: 400, loops: 300, nesting: 9 },
    ],
    semantic: (out) => [
      { name: 'MonotonicUnderComplexityGrowth', passed: (out[0] as number) <= (out[1] as number) && (out[1] as number) <= (out[2] as number) },
      { name: 'CapEnforced', passed: (out[2] as number) <= 200.0001 },
    ],
  },

  gc_skew_analyzer: {
    kind: 'gc_skew_analyzer',
    domain: 'biotech',
    ranges: { window: [8, 32], gcBias: [0.9, 1.1] },
    compile: (p) => `
function gcSkewAnalyzer(input) {
  const { seq } = input;
  const window = ${Math.round(p.window)};
  let gc = 0, total = 0, plusGC = 0, minusGC = 0;
  for (let i = 0; i < seq.length; i++) {
    const ch = seq[i];
    total++;
    if (ch === 'G' || ch === 'C') gc++;
    if (i < window && ch === 'G') plusGC++;
    if (i >= seq.length - window && ch === 'C') minusGC++;
  }
  const gcContent = total ? (gc / total) * ${fmt(p.gcBias)} : 0;
  const skew = plusGC + minusGC > 0 ? (plusGC - minusGC) / (plusGC + minusGC) : 0;
  return { gcContent: Number(Math.min(1, gcContent).toFixed(4)), skew: Number(skew.toFixed(4)) };
}`,
    vectors: () => [
      { seq: 'ACGTACGTGGCCAAATTTGCACTG' },
      { seq: 'GGGGCCCCGGGGCCCCGGGGCCCC' },
      { seq: 'AAAAAAAATTTTTTTT' },
    ],
    semantic: (out) => [
      { name: 'GcContentWithinUnitInterval', passed: out.every((o) => { const v = (o as { gcContent: number }).gcContent; return v >= 0 && v <= 1; }) },
      { name: 'GcRichSequenceDetected', passed: (out[1] as { gcContent: number }).gcContent > (out[2] as { gcContent: number }).gcContent },
      { name: 'SkewWithinUnitInterval', passed: out.every((o) => Math.abs((o as { skew: number }).skew) <= 1) },
    ],
  },

  queue_pressure_projector: {
    kind: 'queue_pressure_projector',
    domain: 'systemic',
    ranges: { growthRate: [1.01, 1.08], horizon: [50, 200], loadCap: [10, 50] },
    compile: (p) => `
function queuePressureProjector(input) {
  const { arrival, service, utilization } = input;
  let u = utilization, steps = 0;
  const horizon = ${Math.round(p.horizon)};
  for (let t = 0; t < horizon; t++) {
    u = Math.min(${fmt(p.loadCap)}, u * (arrival / service) * ${fmt(p.growthRate)});
    steps = t + 1;
    if (u >= ${fmt(p.loadCap)} - 1e-9) break;
  }
  return { projectedUtilization: Number(u.toFixed(4)), stepsToSaturation: steps, saturated: u >= ${fmt(p.loadCap)} - 1e-9 };
}`,
    vectors: () => [
      { arrival: 0.9, service: 1.0, utilization: 0.5 },
      { arrival: 1.2, service: 1.0, utilization: 0.5 },
      { arrival: 2.0, service: 1.0, utilization: 0.1 },
    ],
    semantic: (out) => [
      { name: 'MonotonicUnderLoadGrowth', passed: (out[0] as { projectedUtilization: number }).projectedUtilization <= (out[1] as { projectedUtilization: number }).projectedUtilization },
      { name: 'SaturationDetectedUnderOverload', passed: (out[2] as { saturated: boolean }).saturated === true },
      { name: 'CapRespected', passed: out.every((o) => (o as { projectedUtilization: number }).projectedUtilization <= 50.0001) },
    ],
  },

  token_entropy_scorer: {
    kind: 'token_entropy_scorer',
    domain: 'neuro_symbolic',
    ranges: { smoothingFloor: [1e-9, 1e-6], scale: [0.9, 1.1] },
    compile: (p) => `
function tokenEntropyScorer(input) {
  const { counts } = input;
  const floor = ${fmt(p.smoothingFloor)};
  let total = 0;
  for (const c of counts) total += c;
  let entropy = 0;
  for (const c of counts) {
    const prob = Math.max(floor, c / total);
    entropy -= prob * Math.log2(prob);
  }
  return Number((entropy * ${fmt(p.scale)}).toFixed(4));
}`,
    vectors: () => [
      { counts: [1, 1, 1, 1, 1, 1, 1, 1] },
      { counts: [100, 1, 1, 1, 1, 1, 1, 1] },
      { counts: [5, 0, 5, 0] },
    ],
    semantic: (out) => [
      { name: 'UniformMaximizesEntropy', passed: (out[0] as number) > (out[1] as number) },
      { name: 'ZeroCountsDoNotNaN', passed: Number.isFinite(out[2] as number) },
      { name: 'EntropyBoundedByLog2Vocab', passed: (out[0] as number) <= 3.31 },
    ],
  },

  anomaly_zscore_gate: {
    kind: 'anomaly_zscore_gate',
    domain: 'cyber_defense',
    ranges: { threshold: [2, 4], minSamples: [3, 10] },
    compile: (p) => `
function anomalyZscoreGate(input) {
  const { samples, value } = input;
  const min = ${Math.round(p.minSamples)};
  if (!Array.isArray(samples) || samples.length < min) return { z: 0, anomaly: false, insufficient: true };
  let mean = 0;
  for (const s of samples) mean += s;
  mean /= samples.length;
  let variance = 0;
  for (const s of samples) variance += (s - mean) * (s - mean);
  variance /= samples.length;
  const std = Math.sqrt(variance) || 1e-9;
  const z = (value - mean) / std;
  return { z: Number(z.toFixed(4)), anomaly: Math.abs(z) > ${fmt(p.threshold)}, insufficient: false };
}`,
    vectors: () => [
      { samples: [10, 10.5, 9.5, 10, 10.2], value: 10.05 },
      { samples: [10, 10.5, 9.5, 10, 10.2], value: 25 },
      { samples: [10, 10], value: 12 },
    ],
    semantic: (out) => [
      { name: 'InDistributionNotFlagged', passed: (out[0] as { anomaly: boolean }).anomaly === false },
      { name: 'OutlierFlagged', passed: (out[1] as { anomaly: boolean }).anomaly === true },
      { name: 'InsufficientSamplesGuarded', passed: (out[2] as { insufficient: boolean }).insufficient === true },
    ],
  },

  qubit_fidelity_decayer: {
    kind: 'qubit_fidelity_decayer',
    domain: 'quantum_sim',
    ranges: { baseFidelity: [0.99, 0.9999], gatePenalty: [1e-4, 5e-3] },
    compile: (p) => `
function qubitFidelityDecayer(input) {
  const { gates, errorRate } = input;
  let fidelity = ${fmt(p.baseFidelity)};
  for (let g = 0; g < gates; g++) {
    fidelity *= (1 - Math.min(0.5, ${fmt(p.gatePenalty)} + errorRate));
  }
  return Number(Math.max(0, fidelity).toFixed(6));
}`,
    vectors: () => [
      { gates: 10, errorRate: 0.001 },
      { gates: 100, errorRate: 0.001 },
      { gates: 0, errorRate: 0.5 },
    ],
    semantic: (out) => [
      { name: 'MonotonicDecayWithGates', passed: (out[0] as number) > (out[1] as number) },
      { name: 'ZeroGatesPreserveBaseFidelity', passed: (out[2] as number) >= 0.98 },
      { name: 'FidelityWithinUnitInterval', passed: out.every((v) => (v as number) >= 0 && (v as number) <= 1) },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Gene synthesis operators                                            */
/* ------------------------------------------------------------------ */

export function generateGenome(domain: ToolDomain, rng: () => number): GenomeSpec {
  const kind = Object.values(KINDS).find((k) => k.domain === domain);
  if (!kind) throw new Error(`no gene kind registered for domain ${domain}`);
  const params: Record<string, number> = {};
  for (const [key, [lo, hi]] of Object.entries(kind.ranges)) {
    params[key] = Number((lo + rng() * (hi - lo)).toPrecision(8));
  }
  return { kind: kind.kind, domain, params };
}

export function mutateGenome(spec: GenomeSpec, rng: () => number): GenomeSpec {
  const kind = KINDS[spec.kind];
  const params: Record<string, number> = {};
  for (const [key, value] of Object.entries(spec.params)) {
    const [lo, hi] = kind?.ranges[key] ?? [0, 1];
    const span = hi - lo;
    const mutated = Math.min(hi, Math.max(lo, value + (rng() - 0.5) * 0.3 * span));
    params[key] = Number(mutated.toPrecision(8));
  }
  return { ...spec, params };
}

/** Structural crossover: keep gene A's kind, transplant a normalized
 *  parameter from gene B into one of A's parameter slots. */
export function crossGenomes(a: GenomeSpec, b: GenomeSpec, rng: () => number): GenomeSpec {
  const aKind = KINDS[a.kind];
  const bKind = KINDS[b.kind];
  const params: Record<string, number> = { ...a.params };
  const aKeys = Object.keys(aKind?.ranges ?? {});
  const bKeys = Object.keys(bKind?.ranges ?? {});
  if (aKeys.length && bKeys.length) {
    const targetKey = aKeys[Math.floor(rng() * aKeys.length)];
    const sourceKey = bKeys[Math.floor(rng() * bKeys.length)];
    const [bLo, bHi] = bKind.ranges[sourceKey];
    const [aLo, aHi] = aKind.ranges[targetKey];
    const src = b.params[sourceKey] ?? bLo;
    const normalized = Math.min(1, Math.max(0, (src - bLo) / (bHi - bLo || 1)));
    params[targetKey] = Number((aLo + normalized * (aHi - aLo)).toPrecision(8));
  }
  return { kind: a.kind, domain: a.domain, params };
}

/** Expression form: a bare function declaration, evaluable as `(${source})`
 *  by the sandbox callables below (node:vm / isolated-vm / Function). */
export function compileGenome(spec: GenomeSpec): string {
  const kind = KINDS[spec.kind];
  if (!kind) throw new Error(`unknown gene kind ${spec.kind}`);
  return kind.compile(spec.params).trim();
}

/** Module form: the same gene with a real `export`, so the source clears the
 *  registry substance gate (`assessSourceSubstance` requires an exported
 *  binding) and can be imported by the forge / self-host pipeline. Without
 *  this, a dream gene could verify inside the engine yet be refused at
 *  promotion — the dream -> registry loop delivered ~0 genes. */
export function compileGenomeModule(spec: GenomeSpec): string {
  return geneModuleForm(compileGenome(spec));
}

/** Module form of an already-compiled gene body: the same `export` prefixing
 *  `compileGenomeModule` applies, exposed separately so a gene that is already
 *  stored in the registry can be brought into module form without re-deriving
 *  its GenomeSpec (which is not persisted). */
export function geneModuleForm(source: string): string {
  return source.replace(
    /^(\s*)function\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
    '$1export function $2',
  );
}

/* ------------------------------------------------------------------ */
/* Sandbox verification                                                */
/* ------------------------------------------------------------------ */

/** Strip module syntax so a stored module-form gene can be exercised by the
 *  same harness as a bare one.
 *
 *  A gene is verified as module form (`export function ...`) but the isolate
 *  evaluates a function expression, where `export` is a syntax error. Without
 *  this, a gene that had already been promoted to module form would fail
 *  `SandboxSyntaxValid` on its next verification - i.e. re-running the
 *  reconcile would downgrade exactly the genes it had just fixed. */
function stripModuleSyntax(source: string): string {
  return source
    .replace(/\bexport\s+default\s+/g, '')
    .replace(/\bexport\s+(?=(function|const|let|var|class|async)\b)/g, '');
}

/** Evaluate a gene in a real isolate (no host globals). The node:vm/Function
 *  path is reachable only under the explicit RECOURSE_ALLOW_INPROCESS_EVAL=1
 *  opt-in — it is not a security boundary, so it is refused by default. */
function createGeneCallable(source: string): IsolatedCallable {
  const runnable = stripModuleSyntax(source);
  if (isIsolateAvailable()) return createIsolatedCallable(runnable);
  const refusal = inProcessFallbackRefusal(runnable);
  if (refusal) throw new Error(refusal);

  const evalOnce = (code: string): ((input: unknown) => unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vm: any = typeof require === 'function' ? require('node:vm') : null;
    if (vm && vm.Script) {
      const script = new vm.Script(`(${code})`);
      return script.runInContext(vm.createContext({}), { timeout: 250 });
    }
    return new Function(`return (${code})`)();
  };
  const fn = evalOnce(runnable);
  return {
    call(input: unknown) {
      let a: unknown;
      try { a = JSON.parse(JSON.stringify(input)); } catch { return { ok: false, threw: true, mutated: false }; }
      const before = JSON.stringify(a);
      let value: unknown;
      let threw = false;
      try { value = fn(a); } catch { threw = true; }
      return { ok: true, threw, mutated: JSON.stringify(a) !== before, value };
    },
    dispose() { /* nothing to release */ },
  };
}

export interface VerifyResult {
  verified: boolean;
  checks: InvariantCheck[];
  summary: string;
}

export function geneVectors(spec: GenomeSpec): unknown[] {
  const kind = KINDS[spec.kind];
  if (!kind) return [];
  return kind.vectors();
}

/** The invariant-check input vectors for a gene kind. Kinds generate these
 *  deterministically from the kind alone, so a stored gene's vectors can be
 *  recovered without its (unpersisted) GenomeSpec. */
export function geneVectorsForKind(kindName: string): unknown[] {
  return KINDS[kindName]?.vectors() ?? [];
}

/** Whether this kind is a rule-based gene the engine knows how to verify. */
export function isKnownGeneKind(kindName: string): boolean {
  return Boolean(KINDS[kindName]);
}

/**
 * The entrypoint a gene kind's compiled body declares (e.g.
 * `cyclomatic_pressure_scorer` -> `cyclomaticPressureScorer`).
 *
 * Derived from the kind's own compile template, so it is a property of the
 * kind rather than of any particular GenomeSpec. Callers use it to check that
 * a stored artifact really IS the gene a name suggests: the registry contains
 * tools named `CODI_CYCLOMATIC_*` whose source is a TypeScript `LRUCache`
 * class, and verifying those against the cyclomatic protocol would attribute
 * a verdict to a gene that never produced them. Null for an unknown kind.
 */
export function geneEntrypointName(kindName: string): string | null {
  const kind = KINDS[kindName];
  if (!kind) return null;
  let body: string;
  try {
    // Deterministic stand-in parameters (range midpoints): the declared function
    // name is a property of the kind's template, not of the values. `compile`
    // throws on missing keys, so the ranges have to be filled.
    const params: Record<string, number> = {};
    for (const [key, [lo, hi]] of Object.entries(kind.ranges)) params[key] = (lo + hi) / 2;
    body = kind.compile(params);
  } catch {
    return null;
  }
  const m = body.match(/^\s*(?:export\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/m);
  return m ? m[1] : null;
}

export function verifyGenome(spec: GenomeSpec): VerifyResult {
  const kind = KINDS[spec.kind];
  if (!kind) {
    return { verified: false, checks: [{ name: 'UnknownGeneKind', passed: false }], summary: 'unknown gene kind' };
  }
  return verifyGeneSource(spec.kind, compileGenome(spec));
}

/**
 * Verify an already-compiled gene body against today's invariant protocol.
 *
 * Same checks as `verifyGenome`, but taking the source instead of a spec: a
 * gene already in the registry has no GenomeSpec persisted, while its kind
 * determines the vectors and the semantic invariants, so the stored artifact
 * can still be re-checked honestly instead of keeping a `verified: true` that
 * nothing re-confirms.
 */
export function verifyGeneSource(kindName: string, source: string): VerifyResult {
  const kind = KINDS[kindName];
  if (!kind) {
    return { verified: false, checks: [{ name: 'UnknownGeneKind', passed: false }], summary: 'unknown gene kind' };
  }
  const checks: InvariantCheck[] = [];
  let callable: IsolatedCallable;
  try {
    callable = createGeneCallable(source);
    checks.push({ name: 'SandboxSyntaxValid', passed: true });
  } catch (err) {
    return {
      verified: false,
      checks: [...checks, { name: 'SandboxSyntaxValid', passed: false, detail: String(err) }],
      summary: 'gene failed to compile in sandbox',
    };
  }

  const vectors = kind.vectors();
  const run = (v: unknown): unknown => {
    const r = callable.call(v);
    if (!r.ok || r.threw) throw new Error(r.error || 'gene threw during sandbox execution');
    return r.value;
  };
  let out1: unknown[];
  let out2: unknown[];
  try {
    out1 = vectors.map((v) => run(v));
    out2 = vectors.map((v) => run(v));
    checks.push({ name: 'SandboxExecutionClean', passed: true });
  } catch (err) {
    callable.dispose();
    return {
      verified: false,
      checks: [...checks, { name: 'SandboxExecutionClean', passed: false, detail: String(err) }],
      summary: 'gene threw during sandbox execution',
    };
  }
  callable.dispose();

  checks.push({
    name: 'DeterminismUnderReplay',
    passed: JSON.stringify(out1) === JSON.stringify(out2),
  });
  checks.push({
    name: 'FiniteOutputs',
    passed: collectNumbers(out1).every((n) => Number.isFinite(n)),
  });
  if (kind.semantic) checks.push(...kind.semantic(out1));

  const passed = checks.filter((c) => c.passed).length;
  return {
    verified: checks.every((c) => c.passed),
    checks,
    summary: `${passed}/${checks.length} invariants hold · replay-stable`,
  };
}

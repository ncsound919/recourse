// src/dream/property-harness.ts — property-based evaluation harness.
//
// Upgrades the learner's reward signal from "survives synthetic numeric
// stress" to "survives thousands of property-based test cases". Uses
// fast-check (npm i fast-check) with EXPLICIT SEEDS, so property runs
// are deterministic and replayable just like everything else in the
// stack. If fast-check is not installed, every function degrades
// gracefully to the previous stress-only scoring.
//
// Arbitrary (input generator) shapes are INFERRED from the gene's own
// declared test vectors — numbers become doubles scaled around observed
// magnitudes, arrays become arrays, objects become records — then fed
// through four properties:
//   Totality                 — never throws on any generated input
//   DeterminismUnderReplay   — same input, same output, always
//   InputPurity              — never mutates its input
//   FiniteOutputs            — never produces NaN/Infinity
//
// Learner wire-in (one-line change in learner.ts execute()):
//   // before:
//   const reward = scoreGene(gene.code, gene.vectors, rng);
//   // after:
//   const { reward } = scoreGeneWithProperties(gene.code, gene.vectors,
//     (this.seed ^ Math.imul(state.episode, 0x85ebca6b)) >>> 0);
//
// The seed mirrors the episode rng seed, so replays stay bit-identical.

import { mulberry32 } from './engine';

/* ------------------------- module bootstrap ------------------------ */

let fcModule: any = null;
let fcAttempted = false;

function getFc(): any | null {
  if (fcAttempted) return fcModule;
  fcAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fcModule = typeof require === 'function' ? require('fast-check') : null;
  } catch {
    fcModule = null;
  }
  return fcModule;
}

/* --------------------------- sandbox utils ------------------------- */

function sandboxEval(source: string): (input: unknown) => unknown {
  const tryCompile = (code: string) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vm: any = typeof require === 'function' ? require('node:vm') : null;
    if (vm && vm.Script) {
      const script = new vm.Script(`(${code})`);
      return script.runInContext(vm.createContext({}), { timeout: 500 });
    }
    return new Function(`return (${code})`)();
  };
  try {
    return tryCompile(source);
  } catch (err) {
    if (err instanceof SyntaxError) {
      // TypeScript genes are transpiled with esbuild (same honest path as the
      // execution sandbox) before the property harness evaluates them.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { prepareExecutableCode } = require('../lib/executionSandbox');
      return tryCompile(prepareExecutableCode(source));
    }
    throw err;
  }
}

function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object')
    Object.values(value as Record<string, unknown>).forEach((v) => collectNumbers(v, out));
  return out;
}

const clone = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unserializable]';
  }
}

/* ------------------------ arbitrary inference ---------------------- */

function inferArbitrary(fc: any, sample: unknown): any {
  if (typeof sample === 'number') {
    const scale = Math.max(1, Math.abs(sample)) * 10;
    return fc.double({ min: -scale, max: scale, noNaN: true });
  }
  if (typeof sample === 'boolean') return fc.boolean();
  if (typeof sample === 'string') return fc.string({ maxLength: 32 });
  if (sample === null || sample === undefined) return fc.constant(null);
  if (Array.isArray(sample)) {
    const inner = sample.length
      ? inferArbitrary(fc, sample[0])
      : fc.double({ min: -100, max: 100, noNaN: true });
    return fc.array(inner, { maxLength: 16 });
  }
  if (typeof sample === 'object') {
    const record: Record<string, any> = {};
    for (const [k, v] of Object.entries(sample as Record<string, unknown>)) {
      record[k] = inferArbitrary(fc, v);
    }
    return fc.record(record);
  }
  return fc.constant(null);
}

function uniqueShapes(vectors: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const v of vectors) {
    const key = safeStringify(v);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/* --------------------------- property core ------------------------- */

export interface PropertyResult {
  name: string;
  passed: boolean;
  counterexample?: string;
}

export interface PropertyReport {
  available: boolean;
  runsPerProperty: number;
  properties: PropertyResult[];
  score: number; // fraction of properties fully passing (0 if unavailable)
}

export function propertyScore(
  code: string,
  vectors: unknown[],
  seed = 0xace5eed,
  runsPerProperty = 50,
): PropertyReport {
  const fc = getFc();
  if (!fc) return { available: false, runsPerProperty: 0, properties: [], score: 0 };

  let fn: (input: unknown) => unknown;
  try {
    fn = sandboxEval(code);
  } catch {
    return {
      available: true,
      runsPerProperty,
      properties: [{ name: 'SandboxSyntaxValid', passed: false, counterexample: 'gene failed to compile' }],
      score: 0,
    };
  }

  try {
    const shapes = uniqueShapes(vectors).slice(0, 3);
    const arbitrary =
      shapes.length === 1
        ? inferArbitrary(fc, shapes[0])
        : fc.oneof(...(shapes.length ? shapes : [null]).map((s) => inferArbitrary(fc, s)));

    const properties: { name: string; predicate: (v: unknown) => boolean }[] = [
      { name: 'Totality', predicate: (v) => { fn(clone(v)); return true; } },
      { name: 'DeterminismUnderReplay', predicate: (v) => JSON.stringify(fn(clone(v))) === JSON.stringify(fn(clone(v))) },
      { name: 'InputPurity', predicate: (v) => { const before = safeStringify(v); fn(v); return safeStringify(v) === before; } },
      { name: 'FiniteOutputs', predicate: (v) => collectNumbers(fn(clone(v))).every((n) => Number.isFinite(n)) },
    ];

    const results: PropertyResult[] = properties.map((p) => {
      const out = fc.check(fc.property(arbitrary, p.predicate), { seed, numRuns: runsPerProperty });
      return {
        name: p.name,
        passed: !out.failed,
        counterexample: out.failed ? safeStringify(out.counterexample) : undefined,
      };
    });

    const score = results.filter((r) => r.passed).length / results.length;
    return { available: true, runsPerProperty, properties: results, score };
  } catch (err) {
    // fast-check API drift or unexpected failure — degrade, never crash learning
    console.warn('[property-harness] property run failed, degrading:', err);
    return { available: false, runsPerProperty: 0, properties: [], score: 0 };
  }
}

/* --------------------- blended learner scoring --------------------- */

function stressVector(v: unknown, rng: () => number, magnitude: number): unknown {
  if (typeof v === 'number') return v * (1 + (rng() - 0.5) * magnitude);
  if (Array.isArray(v)) return v.map((x) => stressVector(x, rng, magnitude));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = stressVector(val, rng, magnitude);
    }
    return out;
  }
  return v;
}

/** Drop-in replacement for the learner's scoreGene(): same base + stress
 *  components, plus a weighted property-based component when fast-check
 *  is available. Deterministic given (seed, code, vectors). */
export function scoreGeneWithProperties(
  code: string,
  vectors: unknown[],
  seed: number,
): { reward: number; propertyReport: PropertyReport } {
  const rng = mulberry32(seed >>> 0);

  let fn: (input: unknown) => unknown;
  try {
    fn = sandboxEval(code);
  } catch {
    return { reward: 0, propertyReport: { available: false, runsPerProperty: 0, properties: [], score: 0 } };
  }
  const clean = (o: unknown) => collectNumbers(o).every((n) => Number.isFinite(n));

  let baseOk = 0;
  for (const v of vectors) {
    try {
      const a = fn(clone(v));
      const b = fn(clone(v));
      if (JSON.stringify(a) === JSON.stringify(b) && clean(a)) baseOk++;
    } catch {
      /* failure */
    }
  }
  const baseFrac = vectors.length ? baseOk / vectors.length : 0;

  const stressRuns = Math.min(12, Math.max(3, vectors.length * 3));
  let stressOk = 0;
  for (let i = 0; i < stressRuns; i++) {
    const v = stressVector(vectors[i % vectors.length], rng, 1.2);
    try {
      const a = fn(clone(v));
      const b = fn(clone(v));
      if (JSON.stringify(a) === JSON.stringify(b) && clean(a)) stressOk++;
    } catch {
      /* failure */
    }
  }
  const stressFrac = stressOk / stressRuns;

  const report = propertyScore(code, vectors, seed);
  const reward = report.available
    ? round4(0.35 * baseFrac + 0.25 * stressFrac + 0.4 * report.score)
    : round4(0.5 * baseFrac + 0.5 * stressFrac);

  return { reward, propertyReport: report };
}

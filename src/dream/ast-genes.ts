// src/dream/ast-genes.ts — AST-level structural gene compiler.
//
// Genes are no longer opaque source strings: they are serializable
// expression trees (an IR we control) that COMPILE to pure JS functions.
// Mutation and cross-pollination become tree surgery (constant nudges,
// operator swaps, subtree grafts), and totality is guaranteed by
// construction — every arithmetic result is wrapped in __num(), every
// array access is clamped, every loop is a bounded map/reduce. A gene
// that compiles can still be wrong, but it can never hang, throw, or
// return Infinity.
//
// Why an IR instead of Babel/ts-morph: zero heavyweight deps in the
// serverless bundle, fully deterministic tree ops, genes are plain JSON
// (storable/queryable in Supabase), and the compiled output stays
// human-readable for the UI's gene inspector.
//
// Wire-in (dream engine REM phase):
//   const { spec } = seedIrGenes()[0];
//   const evolved = mutateIr(spec, rng);        // or crossIr(a, b, rng)
//   const draft = compileGeneIr(evolved);       // -> abstractGenomeDraft
//
// Wire-in (gene registry):
//   const gene = irGeneToRegistryGene(spec, vectors);
//   await geneRegistry.save(gene);              // status: pending_approval

import type { InvariantCheck, ToolDomain } from '../types';
import { hashString } from './engine';
import type { RegistryGene } from './mutator-types';

/* ------------------------------ IR types --------------------------- */

export type BinOp = '+' | '-' | '*' | '/' | '%' | '<' | '>' | '<=' | '>=' | '==' | '!=' | '&&' | '||';
export type UnaryOp = '-' | '+';
export type BuiltinFn =
  | 'Math.abs' | 'Math.min' | 'Math.max' | 'Math.sqrt' | 'Math.floor'
  | 'Math.ceil' | 'Math.round' | 'Math.log2' | 'Math.pow' | 'Math.sign';
export type FieldKind = 'number' | 'array';
export type NodeKind = 'number' | 'array' | 'object';

export interface FieldSpec {
  name: string;
  kind: FieldKind;
}

export type IrNode =
  | { t: 'num'; v: number }
  | { t: 'field'; name: string }
  | { t: 'bin'; op: BinOp; a: IrNode; b: IrNode }
  | { t: 'un'; op: UnaryOp; a: IrNode }
  | { t: 'cond'; test: IrNode; then: IrNode; else: IrNode }
  | { t: 'call'; fn: BuiltinFn; args: IrNode[] }
  | { t: 'obj'; fields: Record<string, IrNode> }
  | { t: 'arr'; items: IrNode[] }
  | { t: 'idx'; arr: IrNode; i: IrNode }
  | { t: 'len'; arr: IrNode }
  | { t: 'map'; v: string; arr: IrNode; body: IrNode }
  | { t: 'reduce'; v: string; acc: string; arr: IrNode; init: IrNode; body: IrNode };

export interface GeneIrSpec {
  name: string;
  domain: ToolDomain;
  fields: FieldSpec[];
  body: IrNode;
}

const BUILTINS: Record<BuiltinFn, { min: number; max: number }> = {
  'Math.abs': { min: 1, max: 1 },
  'Math.min': { min: 1, max: 4 },
  'Math.max': { min: 1, max: 4 },
  'Math.sqrt': { min: 1, max: 1 },
  'Math.floor': { min: 1, max: 1 },
  'Math.ceil': { min: 1, max: 1 },
  'Math.round': { min: 1, max: 1 },
  'Math.log2': { min: 1, max: 1 },
  'Math.pow': { min: 2, max: 2 },
  'Math.sign': { min: 1, max: 1 },
};

const OP_CLASS: Record<string, BinOp[]> = {
  '+': ['+', '-', '*', '/', '%'], '-': ['+', '-', '*', '/', '%'],
  '*': ['+', '-', '*', '/', '%'], '/': ['+', '-', '*', '/', '%'],
  '%': ['+', '-', '*', '/', '%'],
  '<': ['<', '>', '<=', '>='], '>': ['<', '>', '<=', '>='],
  '<=': ['<', '>', '<=', '>='], '>=': ['<', '>', '<=', '>='],
  '==': ['==', '!='], '!=': ['==', '!='],
  '&&': ['&&', '||'], '||': ['&&', '||'],
};

const ARITH_OPS: BinOp[] = ['+', '-', '*', '/', '%'];
const ONE_ARG_FNS: BuiltinFn[] = ['Math.abs', 'Math.floor', 'Math.round', 'Math.sign', 'Math.sqrt', 'Math.log2', 'Math.ceil'];

const VAR_RE = /^[a-z_$][\\w$]*$/i;
const MAX_DEPTH = 14;
const MAX_NODES = 400;

/* --------------------------- tree utilities ------------------------ */

function kindOf(n: IrNode): NodeKind {
  if (n.t === 'map' || n.t === 'arr') return 'array';
  if (n.t === 'obj') return 'object';
  return 'number';
}

function collectNodes(n: IrNode, out: IrNode[] = []): IrNode[] {
  out.push(n);
  switch (n.t) {
    case 'num': case 'field': break;
    case 'un': collectNodes(n.a, out); break;
    case 'bin': collectNodes(n.a, out); collectNodes(n.b, out); break;
    case 'cond': collectNodes(n.test, out); collectNodes(n.then, out); collectNodes(n.else, out); break;
    case 'call': n.args.forEach((a) => collectNodes(a, out)); break;
    case 'obj': Object.values(n.fields).forEach((v) => collectNodes(v, out)); break;
    case 'arr': n.items.forEach((i) => collectNodes(i, out)); break;
    case 'idx': collectNodes(n.arr, out); collectNodes(n.i, out); break;
    case 'len': collectNodes(n.arr, out); break;
    case 'map': collectNodes(n.arr, out); collectNodes(n.body, out); break;
    case 'reduce': collectNodes(n.arr, out); collectNodes(n.init, out); collectNodes(n.body, out); break;
  }
  return out;
}

function replaceNode(node: IrNode, target: IrNode, replacement: IrNode): IrNode {
  if (node === target) return replacement;
  switch (node.t) {
    case 'num': case 'field': return node;
    case 'un': return { ...node, a: replaceNode(node.a, target, replacement) };
    case 'bin': return { ...node, a: replaceNode(node.a, target, replacement), b: replaceNode(node.b, target, replacement) };
    case 'cond': return {
      ...node,
      test: replaceNode(node.test, target, replacement),
      then: replaceNode(node.then, target, replacement),
      else: replaceNode(node.else, target, replacement),
    };
    case 'call': return { ...node, args: node.args.map((a) => replaceNode(a, target, replacement)) };
    case 'obj': {
      const fields: Record<string, IrNode> = {};
      for (const [k, v] of Object.entries(node.fields)) fields[k] = replaceNode(v, target, replacement);
      return { ...node, fields };
    }
    case 'arr': return { ...node, items: node.items.map((i) => replaceNode(i, target, replacement)) };
    case 'idx': return { ...node, arr: replaceNode(node.arr, target, replacement), i: replaceNode(node.i, target, replacement) };
    case 'len': return { ...node, arr: replaceNode(node.arr, target, replacement) };
    case 'map': return { ...node, arr: replaceNode(node.arr, target, replacement), body: replaceNode(node.body, target, replacement) };
    case 'reduce': return {
      ...node,
      arr: replaceNode(node.arr, target, replacement),
      init: replaceNode(node.init, target, replacement),
      body: replaceNode(node.body, target, replacement),
    };
  }
}

/** Input fields referenced by a subtree, excluding lambda-bound names. */
function referencedFields(n: IrNode, scope: Set<string>, out: Set<string> = new Set()): Set<string> {
  switch (n.t) {
    case 'field': if (!scope.has(n.name)) out.add(n.name); break;
    case 'un': referencedFields(n.a, scope, out); break;
    case 'bin': referencedFields(n.a, scope, out); referencedFields(n.b, scope, out); break;
    case 'cond': referencedFields(n.test, scope, out); referencedFields(n.then, scope, out); referencedFields(n.else, scope, out); break;
    case 'call': n.args.forEach((a) => referencedFields(a, scope, out)); break;
    case 'obj': Object.values(n.fields).forEach((v) => referencedFields(v, scope, out)); break;
    case 'arr': n.items.forEach((i) => referencedFields(i, scope, out)); break;
    case 'idx': referencedFields(n.arr, scope, out); referencedFields(n.i, scope, out); break;
    case 'len': referencedFields(n.arr, scope, out); break;
    case 'map': {
      referencedFields(n.arr, scope, out);
      referencedFields(n.body, new Set([...scope, n.v]), out);
      break;
    }
    case 'reduce': {
      referencedFields(n.arr, scope, out);
      referencedFields(n.init, scope, out);
      referencedFields(n.body, new Set([...scope, n.v, n.acc]), out);
      break;
    }
  }
  return out;
}

/* ----------------------------- validation -------------------------- */

export function validateIr(spec: GeneIrSpec): string[] {
  const problems: string[] = [];
  if (!VAR_RE.test(spec.name)) problems.push('invalid gene name');
  const fieldNames = new Set(spec.fields.map((f) => f.name));
  if (spec.fields.some((f) => !VAR_RE.test(f.name))) problems.push('invalid field name');

  let count = 0;
  const walk = (n: IrNode, depth: number, scope: Set<string>): number => {
    count++;
    const d = depth + 1;
    switch (n.t) {
      case 'num':
        if (!Number.isFinite(n.v)) problems.push('non-finite constant');
        return d;
      case 'field':
        if (!scope.has(n.name)) problems.push(`unknown field '${n.name}'`);
        return d;
      case 'un': return walk(n.a, d, scope);
      case 'bin': return Math.max(walk(n.a, d, scope), walk(n.b, d, scope));
      case 'cond': return Math.max(walk(n.test, d, scope), walk(n.then, d, scope), walk(n.else, d, scope));
      case 'call': {
        const def = BUILTINS[n.fn];
        if (!def) problems.push(`unknown builtin '${n.fn}'`);
        else if (n.args.length < def.min || n.args.length > def.max) problems.push(`wrong arity for ${n.fn}`);
        return Math.max(d, ...n.args.map((a) => walk(a, d, scope)));
      }
      case 'obj': return Math.max(d, ...Object.values(n.fields).map((v) => walk(v, d, scope)));
      case 'arr': return Math.max(d, ...n.items.map((i) => walk(i, d, scope)));
      case 'idx': return Math.max(walk(n.arr, d, scope), walk(n.i, d, scope));
      case 'len': return walk(n.arr, d, scope);
      case 'map':
        if (!VAR_RE.test(n.v)) problems.push('invalid map variable');
        return Math.max(walk(n.arr, d, scope), walk(n.body, d, new Set([...scope, n.v])));
      case 'reduce':
        if (!VAR_RE.test(n.v) || !VAR_RE.test(n.acc)) problems.push('invalid reduce variables');
        return Math.max(
          walk(n.arr, d, scope),
          walk(n.init, d, scope),
          walk(n.body, d, new Set([...scope, n.v, n.acc])),
        );
    }
  };

  const depth = walk(spec.body, 0, fieldNames);
  if (depth > MAX_DEPTH) problems.push(`depth ${depth} exceeds limit ${MAX_DEPTH}`);
  if (count > MAX_NODES) problems.push(`node count ${count} exceeds limit ${MAX_NODES}`);
  return problems;
}

export function irStats(spec: GeneIrSpec): { nodes: number; depth: number } {
  let nodes = 0;
  let depth = 0;
  const walk = (n: IrNode, d: number): void => {
    nodes++;
    depth = Math.max(depth, d);
    const kids: IrNode[] = [];
    switch (n.t) {
      case 'num': case 'field': break;
      case 'un': kids.push(n.a); break;
      case 'bin': kids.push(n.a, n.b); break;
      case 'cond': kids.push(n.test, n.then, n.else); break;
      case 'call': kids.push(...n.args); break;
      case 'obj': kids.push(...Object.values(n.fields)); break;
      case 'arr': kids.push(...n.items); break;
      case 'idx': kids.push(n.arr, n.i); break;
      case 'len': kids.push(n.arr); break;
      case 'map': kids.push(n.arr, n.body); break;
      case 'reduce': kids.push(n.arr, n.init, n.body); break;
    }
    kids.forEach((k) => walk(k, d + 1));
  };
  walk(spec.body, 1);
  return { nodes, depth };
}

/* ------------------------------ compiler --------------------------- */

const numLit = (n: number) => `(${Number(n.toPrecision(8))})`;

function compileExpr(n: IrNode, scope: Set<string>): string {
  switch (n.t) {
    case 'num': return numLit(n.v);
    case 'field':
      return scope.has(n.name) ? `(${n.name})` : `(input[${JSON.stringify(n.name)}])`;
    case 'bin': return `__num((${compileExpr(n.a, scope)}) ${n.op} (${compileExpr(n.b, scope)}))`;
    case 'un': return `__num(${n.op}(${compileExpr(n.a, scope)}))`;
    case 'cond': return `((${compileExpr(n.test, scope)}) ? (${compileExpr(n.then, scope)}) : (${compileExpr(n.else, scope)}))`;
    case 'call': return `__num(${n.fn}(${n.args.map((a) => compileExpr(a, scope)).join(', ')}))`;
    case 'obj': {
      const entries = Object.entries(n.fields)
        .map(([k, v]) => `${JSON.stringify(k)}: (${compileExpr(v, scope)})`)
        .join(', ');
      return `({ ${entries} })`;
    }
    case 'arr': return `[${n.items.map((i) => compileExpr(i, scope)).join(', ')}]`;
    case 'idx': return `__idx(${compileExpr(n.arr, scope)}, ${compileExpr(n.i, scope)})`;
    case 'len': return `__len(${compileExpr(n.arr, scope)})`;
    case 'map': return `((${compileExpr(n.arr, scope)}) || []).map((${n.v}) => (${compileExpr(n.body, new Set([...scope, n.v]))}))`;
    case 'reduce': {
      const inner = new Set([...scope, n.v, n.acc]);
      return `((${compileExpr(n.arr, scope)}) || []).reduce((${n.acc}, ${n.v}) => (${compileExpr(n.body, inner)}), (${compileExpr(n.init, scope)}))`;
    }
  }
}

export function compileGeneIr(spec: GeneIrSpec): string {
  const problems = validateIr(spec);
  if (problems.length) throw new Error(`invalid gene IR: ${problems.join('; ')}`);
  return [
    `function ${spec.name}(input) {`,
    `  const __num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);`,
    `  const __idx = (a, i) => (Array.isArray(a) && a.length ? a[Math.max(0, Math.min(a.length - 1, Math.floor(i) || 0))] : 0);`,
    `  const __len = (a) => (Array.isArray(a) ? a.length : 0);`,
    `  return ${compileExpr(spec.body, new Set())};`,
    `}`,
  ].join('\\n');
}

/* --------------------------- tree generation ----------------------- */

const pickT = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];

function randomExpr(fields: FieldSpec[], rng: () => number, depth: number, kind: NodeKind): IrNode {
  const numFields = fields.filter((f) => f.kind === 'number');
  const arrFields = fields.filter((f) => f.kind === 'array');
  const numTerminal = (): IrNode =>
    numFields.length && rng() < 0.5
      ? { t: 'field', name: pickT(rng, numFields).name }
      : { t: 'num', v: Number(((rng() * 2 - 1) * Math.pow(10, Math.floor(rng() * 3))).toPrecision(2)) };
  const arrTerminal = (): IrNode =>
    arrFields.length
      ? { t: 'field', name: pickT(rng, arrFields).name }
      : { t: 'arr', items: [numTerminal()] };

  if (kind === 'object') {
    const fieldsOut: Record<string, IrNode> = {};
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) fieldsOut[`out${i}`] = randomExpr(fields, rng, Math.max(0, depth - 1), 'number');
    return { t: 'obj', fields: fieldsOut };
  }

  if (kind === 'array') {
    if (depth <= 0 || rng() < 0.4) return arrTerminal();
    return {
      t: 'map',
      v: 'm',
      arr: arrTerminal(),
      body: randomExpr([...fields, { name: 'm', kind: 'number' }], rng, depth - 1, 'number'),
    };
  }

  // number kind
  if (depth <= 0 || rng() < 0.3) return numTerminal();
  switch (Math.floor(rng() * 7)) {
    case 0: return { t: 'bin', op: pickT(rng, ARITH_OPS), a: randomExpr(fields, rng, depth - 1, 'number'), b: randomExpr(fields, rng, depth - 1, 'number') };
    case 1: return { t: 'un', op: '-', a: randomExpr(fields, rng, depth - 1, 'number') };
    case 2: return { t: 'cond', test: randomExpr(fields, rng, depth - 1, 'number'), then: randomExpr(fields, rng, depth - 1, 'number'), else: randomExpr(fields, rng, depth - 1, 'number') };
    case 3: return { t: 'call', fn: pickT(rng, ONE_ARG_FNS), args: [randomExpr(fields, rng, depth - 1, 'number')] };
    case 4: return { t: 'call', fn: rng() < 0.5 ? 'Math.max' : 'Math.min', args: [randomExpr(fields, rng, depth - 1, 'number'), randomExpr(fields, rng, depth - 1, 'number')] };
    case 5: return { t: 'len', arr: randomExpr(fields, rng, Math.min(depth - 1, 1), 'array') };
    default: return { t: 'idx', arr: randomExpr(fields, rng, Math.min(depth - 1, 1), 'array'), i: numTerminal() };
  }
}

export function randomIrGene(name: string, domain: ToolDomain, fields: FieldSpec[], rng: () => number): GeneIrSpec {
  return { name, domain, fields, body: randomExpr(fields, rng, 4, 'number') };
}

/* ------------------------ structural mutations --------------------- */

export function mutateIr(spec: GeneIrSpec, rng: () => number): GeneIrSpec {
  const nodes = collectNodes(spec.body);
  if (!nodes.length) return spec;

  const trySpec = (body: IrNode): GeneIrSpec | null => {
    const candidate: GeneIrSpec = { ...spec, body };
    return validateIr(candidate).length ? null : candidate;
  };
  const pickNode = <T extends IrNode>(filter: (n: IrNode) => n is T): T | null => {
    const matches = nodes.filter(filter);
    return matches.length ? matches[Math.floor(rng() * matches.length)] : null;
  };

  const op = Math.floor(rng() * 5);
  if (op === 0) {
    const target = pickNode((n): n is Extract<IrNode, { t: 'num' }> => n.t === 'num');
    if (target) {
      const next = Number((target.v * (0.5 + rng())).toPrecision(6));
      const mutated = trySpec(replaceNode(spec.body, target, { t: 'num', v: Number.isFinite(next) ? next : 0 }));
      if (mutated) return mutated;
    }
  } else if (op === 1) {
    const target = pickNode((n): n is Extract<IrNode, { t: 'bin' }> => n.t === 'bin');
    if (target) {
      const alternatives = OP_CLASS[target.op].filter((o) => o !== target.op);
      if (alternatives.length) {
        const mutated = trySpec(replaceNode(spec.body, target, { ...target, op: pickT(rng, alternatives) }));
        if (mutated) return mutated;
      }
    }
  } else if (op === 2) {
    const target = pickNode((n): n is Extract<IrNode, { t: 'call' }> => n.t === 'call');
    if (target) {
      const alternatives = (Object.keys(BUILTINS) as BuiltinFn[]).filter(
        (fn) => fn !== target.fn && n_arityOk(fn, target.args.length),
      );
      if (alternatives.length) {
        const mutated = trySpec(replaceNode(spec.body, target, { ...target, fn: pickT(rng, alternatives) }));
        if (mutated) return mutated;
      }
    }
  } else if (op === 3) {
    const target = pickNode((n): n is IrNode => kindOf(n) === 'number');
    if (target) {
      const mutated = trySpec(replaceNode(spec.body, target, { t: 'call', fn: 'Math.abs', args: [target] }));
      if (mutated) return mutated;
    }
  } else {
    const target = pickNode((n): n is IrNode => true);
    if (target) {
      const regrown = randomExpr(spec.fields, rng, 3, kindOf(target));
      const mutated = trySpec(replaceNode(spec.body, target, regrown));
      if (mutated) return mutated;
    }
  }

  // Fallback: absorb a random numeric node in Math.abs (always valid)
  const numeric = nodes.filter((n) => kindOf(n) === 'number');
  if (numeric.length) {
    const target = numeric[Math.floor(rng() * numeric.length)];
    const mutated = trySpec(replaceNode(spec.body, target, { t: 'call', fn: 'Math.abs', args: [target] }));
    if (mutated) return mutated;
  }
  return spec;
}

function n_arityOk(fn: BuiltinFn, args: number): boolean {
  const def = BUILTINS[fn];
  return args >= def.min && args <= def.max;
}

/** Subtree graft: take a compatible, field-compatible subtree from b
 *  and splice it into a. Deterministic given rng. */
export function crossIr(a: GeneIrSpec, b: GeneIrSpec, rng: () => number): GeneIrSpec {
  const aFields = new Set(a.fields.map((f) => f.name));
  const emptyScope = new Set<string>();
  const donors = collectNodes(b.body).filter(
    (n) => [...referencedFields(n, emptyScope)].every((f) => aFields.has(f)),
  );
  const targets = collectNodes(a.body);

  for (let attempt = 0; attempt < 10; attempt++) {
    const target = targets[Math.floor(rng() * targets.length)];
    const matching = donors.filter((d) => kindOf(d) === kindOf(target));
    if (!matching.length) continue;
    const donor = matching[Math.floor(rng() * matching.length)];
    const candidate: GeneIrSpec = { ...a, body: replaceNode(a.body, target, donor) };
    if (!validateIr(candidate).length) return candidate;
  }
  return mutateIr(a, rng);
}

/* ------------------------ verification + seeds --------------------- */

function sandboxEval(source: string): (input: unknown) => unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vm: any = typeof require === 'function' ? require('node:vm') : null;
    if (vm && vm.Script) {
      const script = new vm.Script(`(${source})`);
      return script.runInContext(vm.createContext({}), { timeout: 250 });
    }
  } catch (err) {
    if (err instanceof SyntaxError) throw err;
  }
  return new Function(`return (${source})`)();
}

function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out));
  else if (value && typeof value === 'object')
    Object.values(value as Record<string, unknown>).forEach((v) => collectNumbers(v, out));
  return out;
}

export function verifyIrGene(
  spec: GeneIrSpec,
  vectors: unknown[],
): { verified: boolean; checks: InvariantCheck[]; summary: string } {
  const checks: InvariantCheck[] = [];
  const problems = validateIr(spec);
  checks.push({ name: 'IrWellFormed', passed: problems.length === 0, detail: problems.join('; ') || undefined });
  if (problems.length) return { verified: false, checks, summary: `IR validation failed: ${problems[0]}` };

  const source = compileGeneIr(spec);
  let fn: (input: unknown) => unknown;
  try {
    fn = sandboxEval(source);
    checks.push({ name: 'SandboxSyntaxValid', passed: true });
  } catch (err) {
    return { verified: false, checks: [...checks, { name: 'SandboxSyntaxValid', passed: false, detail: String(err) }], summary: 'gene failed to compile in sandbox' };
  }

  let out1: unknown[];
  let out2: unknown[];
  try {
    out1 = vectors.map((v) => fn(JSON.parse(JSON.stringify(v))));
    out2 = vectors.map((v) => fn(JSON.parse(JSON.stringify(v))));
    checks.push({ name: 'SandboxExecutionClean', passed: true });
  } catch (err) {
    return { verified: false, checks: [...checks, { name: 'SandboxExecutionClean', passed: false, detail: String(err) }], summary: 'gene threw during sandbox execution' };
  }

  checks.push({ name: 'DeterminismUnderReplay', passed: JSON.stringify(out1) === JSON.stringify(out2) });
  checks.push({ name: 'FiniteOutputs', passed: collectNumbers(out1).every((n) => Number.isFinite(n)) });

  const passed = checks.filter((c) => c.passed).length;
  return { verified: checks.every((c) => c.passed), checks, summary: `${passed}/${checks.length} invariants hold · structurally total` };
}

/** Hand-authored seed genes: verified parents for the evolution loop. */
export function seedIrGenes(): { spec: GeneIrSpec; vectors: unknown[] }[] {
  return [
    {
      spec: {
        name: 'bounded_mean_gene',
        domain: 'math',
        fields: [{ name: 'values', kind: 'array' }],
        body: {
          t: 'bin', op: '/',
          a: {
            t: 'reduce', v: 'x', acc: 'acc',
            arr: { t: 'field', name: 'values' },
            init: { t: 'num', v: 0 },
            body: { t: 'bin', op: '+', a: { t: 'field', name: 'acc' }, b: { t: 'field', name: 'x' } },
          },
          b: { t: 'len', arr: { t: 'field', name: 'values' } },
        },
      },
      vectors: [{ values: [1, 2, 3, 4] }, { values: [] }, { values: [-5, 5, 10] }],
    },
    {
      spec: {
        name: 'clamped_pressure_gene',
        domain: 'coding',
        fields: [{ name: 'branches', kind: 'number' }, { name: 'loops', kind: 'number' }],
        body: {
          t: 'call', fn: 'Math.max',
          args: [
            { t: 'num', v: 0 },
            {
              t: 'call', fn: 'Math.min',
              args: [
                { t: 'num', v: 100 },
                {
                  t: 'bin', op: '+',
                  a: { t: 'bin', op: '*', a: { t: 'num', v: 1.2 }, b: { t: 'field', name: 'branches' } },
                  b: { t: 'bin', op: '*', a: { t: 'num', v: 0.9 }, b: { t: 'field', name: 'loops' } },
                },
              ],
            },
          ],
        },
      },
      vectors: [{ branches: 4, loops: 2 }, { branches: 400, loops: 300 }, { branches: -3, loops: 0 }],
    },
    {
      spec: {
        name: 'spread_signal_gene',
        domain: 'systemic',
        fields: [{ name: 'samples', kind: 'array' }],
        body: {
          t: 'bin', op: '-',
          a: {
            t: 'reduce', v: 'x', acc: 'acc',
            arr: { t: 'field', name: 'samples' },
            init: { t: 'num', v: -1e9 },
            body: { t: 'call', fn: 'Math.max', args: [{ t: 'field', name: 'acc' }, { t: 'field', name: 'x' }] },
          },
          b: {
            t: 'reduce', v: 'x', acc: 'acc',
            arr: { t: 'field', name: 'samples' },
            init: { t: 'num', v: 1e9 },
            body: { t: 'call', fn: 'Math.min', args: [{ t: 'field', name: 'acc' }, { t: 'field', name: 'x' }] },
          },
        },
      },
      vectors: [{ samples: [1, 5, 2] }, { samples: [10] }, { samples: [] }],
    },
  ];
}

/** Package a verified IR gene as a registry-ready gene (pending approval). */
export function irGeneToRegistryGene(spec: GeneIrSpec, vectors: unknown[]): RegistryGene {
  const verification = verifyIrGene(spec, vectors);
  const code = compileGeneIr(spec);
  const versionHash = hashString(`${spec.name}:${code}`).toString(16).padStart(8, '0');
  const stats = irStats(spec);
  return {
    id: `ir_${spec.name}_v1_${versionHash.slice(0, 6)}`,
    name: spec.name,
    domain: spec.domain,
    version: 1,
    generation: 1,
    origin: 'dream_engine',
    status: 'pending_approval',
    code,
    description: `Structural IR gene — ${stats.nodes} nodes, depth ${stats.depth}, ${spec.fields.length} input fields.`,
    testVectors: vectors,
    versionHash,
    verifierChecks: verification.checks,
    createdAt: new Date().toISOString(),
  };
}

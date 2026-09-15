import { describe, it, expect } from 'vitest';
import {
  validateIr,
  irStats,
  compileGeneIr,
  randomIrGene,
  mutateIr,
  crossIr,
  verifyIrGene,
  seedIrGenes,
  irGeneToRegistryGene,
} from '../src/dream/ast-genes';
import type { GeneIrSpec, IrNode, FieldSpec } from '../src/dream/ast-genes';
import { mulberry32 } from '../src/dream/engine';

/** Scripted RNG: pops values, then returns `fill` once exhausted. */
function seqRng(values: number[], fill = 0.5): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : fill);
}

const NUM_FIELDS: FieldSpec[] = [
  { name: 'a', kind: 'number' },
  { name: 'b', kind: 'number' },
];
const ARR_FIELDS: FieldSpec[] = [
  { name: 'vals', kind: 'array' },
  { name: 'a', kind: 'number' },
];
const MIX_FIELDS: FieldSpec[] = [
  { name: 'a', kind: 'number' },
  { name: 'vals', kind: 'array' },
];

const VALID_SPEC: GeneIrSpec = {
  name: 'test_gene',
  domain: 'math',
  fields: MIX_FIELDS,
  body: {
    t: 'bin', op: '+',
    a: { t: 'field', name: 'a' },
    b: { t: 'len', arr: { t: 'field', name: 'vals' } },
  },
};

/** A body exercising every node kind for compile / stats / referencedFields. */
const ALL_KINDS_BODY: IrNode = {
  t: 'reduce', v: 'x', acc: 'acc',
  arr: { t: 'field', name: 'vals' },
  init: { t: 'num', v: 1 },
  body: {
    t: 'bin', op: '+',
    a: {
      t: 'cond',
      test: { t: 'bin', op: '<', a: { t: 'field', name: 'x' }, b: { t: 'num', v: 0 } },
      then: { t: 'un', op: '-', a: { t: 'idx', arr: { t: 'field', name: 'vals' }, i: { t: 'num', v: 0 } } },
      else: { t: 'call', fn: 'Math.sqrt', args: [{ t: 'len', arr: { t: 'field', name: 'vals' } }] },
    },
    b: {
      t: 'obj', fields: {
        k1: { t: 'map', v: 'm', arr: { t: 'field', name: 'vals' }, body: { t: 'field', name: 'm' } },
        k2: { t: 'arr', items: [{ t: 'field', name: 'a' }] },
      },
    },
  },
};

const ALL_KINDS_SPEC: GeneIrSpec = {
  name: 'all_kinds_gene',
  domain: 'math',
  fields: MIX_FIELDS,
  body: ALL_KINDS_BODY,
};

describe('ast-genes coverage', () => {
  describe('validateIr', () => {
    it('accepts a well-formed spec', () => {
      expect(validateIr(VALID_SPEC)).toEqual([]);
      expect(validateIr(ALL_KINDS_SPEC)).toEqual([]);
    });

    it('rejects an invalid gene name', () => {
      const p = validateIr({ ...VALID_SPEC, name: 'bad name!' });
      expect(p).toContain('invalid gene name');
    });

    it('rejects an invalid field name', () => {
      const p = validateIr({
        ...VALID_SPEC,
        fields: [...MIX_FIELDS, { name: 'not ok', kind: 'number' }],
      });
      expect(p).toContain('invalid field name');
    });

    it('rejects a non-finite constant', () => {
      const p = validateIr({ ...VALID_SPEC, body: { t: 'num', v: Infinity } });
      expect(p).toContain('non-finite constant');
    });

    it('rejects an unknown field reference', () => {
      const p = validateIr({ ...VALID_SPEC, body: { t: 'field', name: 'nope' } });
      expect(p).toContain(`unknown field 'nope'`);
    });

    it('rejects an unknown builtin', () => {
      const p = validateIr({
        ...VALID_SPEC,
        body: { t: 'call', fn: 'Math.foo' as any, args: [{ t: 'num', v: 1 }] },
      });
      expect(p.some((s) => s.includes('unknown builtin'))).toBe(true);
    });

    it('rejects wrong builtin arity', () => {
      const p = validateIr({
        ...VALID_SPEC,
        body: { t: 'call', fn: 'Math.abs', args: [{ t: 'num', v: 1 }, { t: 'num', v: 2 }] },
      });
      expect(p.some((s) => s.includes('wrong arity'))).toBe(true);
    });

    it('rejects invalid map variable', () => {
      const p = validateIr({
        ...VALID_SPEC,
        body: { t: 'map', v: 'not var', arr: { t: 'field', name: 'vals' }, body: { t: 'num', v: 1 } },
      });
      expect(p).toContain('invalid map variable');
    });

    it('rejects invalid reduce variables', () => {
      const p = validateIr({
        ...VALID_SPEC,
        body: {
          t: 'reduce', v: 'not var', acc: 'acc',
          arr: { t: 'field', name: 'vals' },
          init: { t: 'num', v: 0 },
          body: { t: 'num', v: 1 },
        },
      });
      expect(p).toContain('invalid reduce variables');
    });

    it('rejects excessive depth', () => {
      let body: IrNode = { t: 'num', v: 1 };
      for (let i = 0; i < 20; i++) body = { t: 'un', op: '-', a: body };
      const p = validateIr({ ...VALID_SPEC, body });
      expect(p.some((s) => s.includes('depth'))).toBe(true);
    });

    it('rejects excessive node count (under depth limit)', () => {
      const build = (d: number): IrNode =>
        d <= 0 ? { t: 'num', v: 1 } : { t: 'bin', op: '+', a: build(d - 1), b: build(d - 1) };
      const p = validateIr({ ...VALID_SPEC, body: build(8) });
      expect(p.some((s) => s.includes('node count'))).toBe(true);
    });
  });

  describe('irStats', () => {
    it('counts nodes and depth', () => {
      const s = irStats(VALID_SPEC);
      expect(s.nodes).toBeGreaterThan(0);
      expect(s.depth).toBeGreaterThan(0);
      const all = irStats(ALL_KINDS_SPEC);
      expect(all.nodes).toBeGreaterThan(1);
    });
  });

  describe('compileGeneIr', () => {
    it('compiles every node kind and throws on invalid IR', () => {
      const src = compileGeneIr(ALL_KINDS_SPEC);
      expect(src).toContain('function all_kinds_gene(input)');
      expect(src).toContain('__num');
      expect(src).toContain('__idx');
      expect(src).toContain('__len');

      expect(() => compileGeneIr({ ...VALID_SPEC, name: 'bad!' })).toThrow(/invalid gene IR/);
    });
  });

  describe('randomIrGene / randomExpr branches', () => {
    it('produces a valid random gene', () => {
      const g = randomIrGene('rand_gene', 'math', MIX_FIELDS, mulberry32(7));
      expect(validateIr(g)).toEqual([]);
    });

    it('hits the bin switch arm (case 0)', () => {
      const g = randomIrGene('r', 'math', NUM_FIELDS, seqRng([0.5, 0.01]));
      expect(validateIr(g)).toEqual([]);
      expect(g.body.t).toBe('bin');
    });

    it('hits the un switch arm (case 1)', () => {
      const g = randomIrGene('r', 'math', NUM_FIELDS, seqRng([0.5, 0.2]));
      expect(validateIr(g)).toEqual([]);
      expect(g.body.t).toBe('un');
    });

    it('hits the cond switch arm (case 2)', () => {
      const g = randomIrGene('r', 'math', NUM_FIELDS, seqRng([0.5, 0.35]));
      expect(validateIr(g)).toEqual([]);
      expect(g.body.t).toBe('cond');
    });

    it('hits the one-arg call switch arm (case 3)', () => {
      const g = randomIrGene('r', 'math', NUM_FIELDS, seqRng([0.5, 0.5]));
      expect(validateIr(g)).toEqual([]);
      expect(g.body.t).toBe('call');
    });

    it('hits the max/min call switch arm (case 4)', () => {
      const g = randomIrGene('r', 'math', NUM_FIELDS, seqRng([0.5, 0.65]));
      expect(validateIr(g)).toEqual([]);
      expect(g.body.t).toBe('call');
    });

    it('hits the len switch arm (case 5) with array terminal', () => {
      const g = randomIrGene('r', 'math', NUM_FIELDS, seqRng([0.5, 0.8, 0.2]));
      expect(validateIr(g)).toEqual([]);
      expect(g.body.t).toBe('len');
    });

    it('hits the len switch arm (case 5) with a map body', () => {
      const g = randomIrGene('r', 'math', NUM_FIELDS, seqRng([0.5, 0.8, 0.5]));
      expect(validateIr(g)).toEqual([]);
      expect(g.body.t).toBe('len');
    });

    it('hits the idx switch arm (case 6)', () => {
      const g = randomIrGene('r', 'math', NUM_FIELDS, seqRng([0.5, 0.9]));
      expect(validateIr(g)).toEqual([]);
      expect(g.body.t).toBe('idx');
    });

    it('hits the array-field terminal branch (arrFields non-empty)', () => {
      const g = randomIrGene('r', 'math', ARR_FIELDS, seqRng([0.5, 0.8, 0.2]));
      expect(validateIr(g)).toEqual([]);
    });

    it('hits the number-field terminal branch (numFields + rng<0.5)', () => {
      const g = randomIrGene('r', 'math', MIX_FIELDS, seqRng([0.2, 0.1]));
      expect(validateIr(g)).toEqual([]);
    });
  });

  describe('mutateIr structural ops', () => {
    it('op 0 nudges a numeric node', () => {
      const spec: GeneIrSpec = { name: 'm', domain: 'math', fields: NUM_FIELDS, body: { t: 'num', v: 5 } };
      const out = mutateIr(spec, seqRng([0.1, 0.0]));
      expect(validateIr(out)).toEqual([]);
    });

    it('op 1 swaps a bin operator', () => {
      const spec: GeneIrSpec = {
        name: 'm', domain: 'math', fields: NUM_FIELDS,
        body: { t: 'bin', op: '+', a: { t: 'num', v: 1 }, b: { t: 'num', v: 2 } },
      };
      const out = mutateIr(spec, seqRng([0.3, 0.0, 0.5]));
      expect(validateIr(out)).toEqual([]);
    });

    it('op 2 swaps a call builtin', () => {
      const spec: GeneIrSpec = {
        name: 'm', domain: 'math', fields: NUM_FIELDS,
        body: { t: 'call', fn: 'Math.abs', args: [{ t: 'num', v: 1 }] },
      };
      const out = mutateIr(spec, seqRng([0.5, 0.0, 0.0]));
      expect(validateIr(out)).toEqual([]);
    });

    it('op 3 wraps a numeric node in Math.abs', () => {
      const spec: GeneIrSpec = { name: 'm', domain: 'math', fields: NUM_FIELDS, body: { t: 'num', v: 5 } };
      const out = mutateIr(spec, seqRng([0.7, 0.0]));
      expect(validateIr(out)).toEqual([]);
    });

    it('op 4 regrows a number node', () => {
      const spec: GeneIrSpec = { name: 'm', domain: 'math', fields: NUM_FIELDS, body: { t: 'num', v: 5 } };
      const out = mutateIr(spec, seqRng([0.9, 0.0]));
      expect(validateIr(out)).toEqual([]);
    });

    it('op 4 regrows an object node (object randomExpr branch)', () => {
      const spec: GeneIrSpec = {
        name: 'm', domain: 'math', fields: NUM_FIELDS,
        body: { t: 'obj', fields: { out0: { t: 'num', v: 5 } } },
      };
      const out = mutateIr(spec, seqRng([0.9, 0.0, 0.0, 0.0, 0.8, 0.3]));
      expect(validateIr(out)).toEqual([]);
    });

    it('falls back to Math.abs absorb when op has no matching node', () => {
      const spec: GeneIrSpec = { name: 'm', domain: 'math', fields: NUM_FIELDS, body: { t: 'num', v: 5 } };
      const out = mutateIr(spec, seqRng([0.3]));
      expect(validateIr(out)).toEqual([]);
      expect(out.body.t).toBe('call');
    });

    it('returns the spec unchanged when body has no nodes', () => {
      const spec: GeneIrSpec = {
        name: 'm', domain: 'math', fields: NUM_FIELDS,
        body: { t: 'obj', fields: {} },
      };
      const out = mutateIr(spec, seqRng([0.5]));
      expect(out).toBe(spec);
    });

    it('mutating a complex tree walks every node kind (collectNodes/replaceNode)', () => {
      for (const opVal of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const out = mutateIr(ALL_KINDS_SPEC, seqRng([opVal, 0.0]));
        expect(validateIr(out)).toEqual([]);
      }
    });
  });

  describe('crossIr', () => {
    it('produces a valid hybrid', () => {
      const a: GeneIrSpec = { name: 'a', domain: 'math', fields: NUM_FIELDS, body: { t: 'num', v: 1 } };
      const b: GeneIrSpec = { name: 'b', domain: 'math', fields: NUM_FIELDS, body: { t: 'num', v: 2 } };
      const out = crossIr(a, b, seqRng([0.0, 0.0]));
      expect(validateIr(out)).toEqual([]);
    });

    it('falls back to mutateIr when no compatible graft is found', () => {
      const a: GeneIrSpec = { name: 'a', domain: 'math', fields: NUM_FIELDS, body: { t: 'obj', fields: {} } };
      const b: GeneIrSpec = { name: 'b', domain: 'math', fields: NUM_FIELDS, body: { t: 'num', v: 2 } };
      const out = crossIr(a, b, seqRng([0.0]));
      expect(validateIr(out)).toEqual([]);
    });

    it('crossing complex trees walks referencedFields over every node kind', () => {
      const out = crossIr(ALL_KINDS_SPEC, ALL_KINDS_SPEC, seqRng([0.0, 0.0, 0.5]));
      expect(validateIr(out)).toEqual([]);
    });
  });

  describe('verifyIrGene', () => {
    it('verifies a valid gene end-to-end', () => {
      const { verified, checks, summary } = verifyIrGene(VALID_SPEC, [{ a: 2, vals: [1, 2, 3] }]);
      expect(verified).toBe(true);
      expect(checks.some((c) => c.name === 'IrWellFormed' && c.passed)).toBe(true);
      expect(checks.some((c) => c.name === 'SandboxSyntaxValid' && c.passed)).toBe(true);
      expect(checks.some((c) => c.name === 'DeterminismUnderReplay' && c.passed)).toBe(true);
      expect(checks.some((c) => c.name === 'FiniteOutputs' && c.passed)).toBe(true);
      expect(summary).toContain('invariants hold');
    });

    it('fails fast on an ill-formed spec', () => {
      const { verified, checks } = verifyIrGene({ ...VALID_SPEC, name: 'bad!' }, [{ a: 1 }]);
      expect(verified).toBe(false);
      expect(checks[0].passed).toBe(false);
    });

    it('runs FiniteOutputs over array and object outputs (collectNumbers recursion)', () => {
      const arrayGene: GeneIrSpec = {
        name: 'arr_gene', domain: 'math', fields: MIX_FIELDS,
        body: { t: 'arr', items: [{ t: 'num', v: 1 }, { t: 'len', arr: { t: 'field', name: 'vals' } }] },
      };
      const objGene: GeneIrSpec = {
        name: 'obj_gene', domain: 'math', fields: MIX_FIELDS,
        body: { t: 'obj', fields: { x: { t: 'num', v: 2 }, y: { t: 'field', name: 'a' } } },
      };
      expect(verifyIrGene(arrayGene, [{ a: 1, vals: [1, 2, 3] }]).verified).toBe(true);
      expect(verifyIrGene(objGene, [{ a: 3, vals: [1] }]).verified).toBe(true);
    });
  });

  describe('seedIrGenes + registry packaging', () => {
    it('seeds three valid genes', () => {
      const seeds = seedIrGenes();
      expect(seeds).toHaveLength(3);
      for (const s of seeds) {
        expect(validateIr(s.spec)).toEqual([]);
      }
    });

    it('packages a verified gene into a registry gene', () => {
      const { spec, vectors } = seedIrGenes()[0];
      const gene = irGeneToRegistryGene(spec, vectors);
      expect(gene.id).toContain('ir_');
      expect(gene.name).toBe(spec.name);
      expect(gene.status).toBe('pending_approval');
      expect(gene.origin).toBe('dream_engine');
      expect(gene.versionHash).toMatch(/^[0-9a-f]{8}$/);
      expect(gene.verifierChecks.length).toBeGreaterThan(0);
    });
  });
});
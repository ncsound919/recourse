import { describe, expect, it } from 'vitest';
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
import type { GeneIrSpec } from '../src/dream/ast-genes';

function numSpec(body: GeneIrSpec['body']): GeneIrSpec {
  return { name: 'g', domain: 'math', fields: [{ name: 'x', kind: 'number' }], body };
}

function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('validateIr', () => {
  it('accepts a well-formed single-char-named spec with no problems', () => {
    const spec: GeneIrSpec = { name: 'g', domain: 'math', fields: [{ name: 'x', kind: 'number' }], body: { t: 'bin', op: '+', a: { t: 'field', name: 'x' }, b: { t: 'num', v: 1 } } };
    expect(validateIr(spec)).toEqual([]);
  });

  it('rejects a multi-character gene name (current VAR_RE behavior)', () => {
    expect(validateIr({ ...numSpec({ t: 'num', v: 1 }), name: 'bad-name!' })).toEqual(['invalid gene name']);
  });

  it('rejects an invalid field name', () => {
    expect(validateIr({ name: 'g', domain: 'math', fields: [{ name: 'bad field', kind: 'number' }], body: { t: 'num', v: 1 } })).toEqual(['invalid field name']);
  });

  it('rejects a reference to an unknown field', () => {
    expect(validateIr(numSpec({ t: 'field', name: 'z' }))).toEqual(["unknown field 'z'"]);
  });

  it('rejects a non-finite constant', () => {
    expect(validateIr(numSpec({ t: 'num', v: Infinity }))).toEqual(['non-finite constant']);
  });

  it('rejects a builtin call with wrong arity', () => {
    expect(validateIr(numSpec({ t: 'call', fn: 'Math.pow', args: [{ t: 'num', v: 2 }] }))).toEqual(['wrong arity for Math.pow']);
  });

  it('rejects an unknown builtin', () => {
    expect(validateIr(numSpec({ t: 'call', fn: 'Foo' as never, args: [] }))).toEqual(["unknown builtin 'Foo'"]);
  });

  it('rejects an invalid map variable', () => {
    const spec = numSpec({ t: 'map', v: 'bad var', arr: { t: 'arr', items: [{ t: 'num', v: 1 }] }, body: { t: 'num', v: 1 } });
    expect(validateIr(spec)).toEqual(['invalid map variable']);
  });

  it('rejects invalid reduce variables', () => {
    const spec = numSpec({ t: 'reduce', v: 'bad var', acc: 's', arr: { t: 'arr', items: [{ t: 'num', v: 1 }] }, init: { t: 'num', v: 0 }, body: { t: 'num', v: 1 } });
    expect(validateIr(spec)).toEqual(['invalid reduce variables']);
  });

  it('rejects depth exceeding the limit', () => {
    let body: GeneIrSpec['body'] = { t: 'num', v: 1 };
    for (let i = 0; i < 15; i++) body = { t: 'un', op: '-', a: body };
    expect(validateIr(numSpec(body))).toEqual(['depth 16 exceeds limit 14']);
  });

  it('rejects node count exceeding the limit', () => {
    const body: GeneIrSpec['body'] = { t: 'arr', items: Array.from({ length: 401 }, () => ({ t: 'num', v: 1 } as const)) };
    expect(validateIr(numSpec(body))).toEqual(['node count 402 exceeds limit 400']);
  });
});

describe('irStats', () => {
  it('counts nodes and depth for a simple tree', () => {
    const spec = numSpec({ t: 'bin', op: '+', a: { t: 'num', v: 1 }, b: { t: 'num', v: 2 } });
    expect(irStats(spec)).toEqual({ nodes: 3, depth: 2 });
  });

  it('counts nested reduce bodies', () => {
    const spec: GeneIrSpec = {
      name: 's',
      domain: 'math',
      fields: [{ name: 'v', kind: 'array' }],
      body: {
        t: 'reduce', v: 'x', acc: 's',
        arr: { t: 'field', name: 'v' },
        init: { t: 'num', v: 0 },
        body: { t: 'bin', op: '+', a: { t: 'field', name: 's' }, b: { t: 'field', name: 'x' } },
      },
    };
    expect(irStats(spec)).toEqual({ nodes: 6, depth: 3 });
  });
});

describe('compileGeneIr', () => {
  it('emits a function shell with __num/__idx/__len guards', () => {
    const code = compileGeneIr(numSpec({ t: 'bin', op: '+', a: { t: 'num', v: 5 }, b: { t: 'num', v: 3 } }));
    expect(code).toContain('function g(input)');
    expect(code).toContain('const __num');
    expect(code).toContain('const __idx');
    expect(code).toContain('const __len');
    expect(code).toContain('__num(((5)) + ((3)))');
  });

  it('emits source fragments for every node kind', () => {
    const field = numSpec({ t: 'field', name: 'x' });
    expect(compileGeneIr(field)).toContain('(input["x"])');

    const un = numSpec({ t: 'un', op: '-', a: { t: 'num', v: 2 } });
    expect(compileGeneIr(un)).toContain('__num(-((2)))');

    // oxlint-disable-next-line unicorn/no-thenable -- `then` is the IrNode conditional-arm field, not a promise thenable
    const cond = numSpec({ t: 'cond', test: { t: 'num', v: 1 }, then: { t: 'num', v: 2 }, else: { t: 'num', v: 3 } });
    const ccode = compileGeneIr(cond);
    expect(ccode).toContain('? (');
    expect(ccode).toContain(': ((');

    const call = numSpec({ t: 'call', fn: 'Math.abs', args: [{ t: 'num', v: -4 }] });
    expect(compileGeneIr(call)).toContain('__num(Math.abs(');

    const obj = numSpec({ t: 'obj', fields: { k: { t: 'num', v: 1 } } });
    expect(compileGeneIr(obj)).toContain('({ ');

    const arr = numSpec({ t: 'arr', items: [{ t: 'num', v: 1 }, { t: 'num', v: 2 }] });
    expect(compileGeneIr(arr)).toContain('[');

    const idx = numSpec({ t: 'idx', arr: { t: 'arr', items: [{ t: 'num', v: 7 }] }, i: { t: 'num', v: 0 } });
    expect(compileGeneIr(idx)).toContain('__idx(');

    const len = numSpec({ t: 'len', arr: { t: 'arr', items: [] } });
    expect(compileGeneIr(len)).toContain('__len(');

    const map = numSpec({ t: 'map', v: 'm', arr: { t: 'arr', items: [] }, body: { t: 'num', v: 1 } });
    expect(compileGeneIr(map)).toContain('.map((');

    const red = numSpec({ t: 'reduce', v: 'm', acc: 's', arr: { t: 'arr', items: [] }, init: { t: 'num', v: 0 }, body: { t: 'field', name: 's' } });
    expect(compileGeneIr(red)).toContain('.reduce((');
  });

  it('throws on an invalid spec', () => {
    expect(() => compileGeneIr(numSpec({ t: 'field', name: 'z' }))).toThrow('invalid gene IR');
  });
});

describe('randomIrGene', () => {
  it('produces a valid spec preserving name/domain/fields', () => {
    const spec = randomIrGene('r', 'systemic', [{ name: 'x', kind: 'number' }], () => 0.2);
    expect(spec.name).toBe('r');
    expect(spec.domain).toBe('systemic');
    expect(spec.fields).toEqual([{ name: 'x', kind: 'number' }]);
    expect(validateIr(spec)).toEqual([]);
  });

  it('hits each number-kind switch arm with crafted rng sequences', () => {
    const fields = [{ name: 'x', kind: 'number' as const }];
    const cases: Array<[number[], string]> = [
      [[0.5, 0.0, 0.1, 0.1, 0.1], 'bin'],
      [[0.5, 0.143, 0.1, 0.1], 'un'],
      [[0.5, 0.286, 0.1, 0.1, 0.1, 0.1], 'cond'],
      [[0.5, 0.429, 0.2, 0.1, 0.1], 'call'],
      [[0.5, 0.572, 0.4, 0.1, 0.1, 0.1, 0.1], 'call'],
      [[0.5, 0.715, 0.1, 0.1, 0.1], 'len'],
      [[0.5, 0.86, 0.1, 0.1, 0.1, 0.1], 'idx'],
    ];
    for (const [seq, kind] of cases) {
      const spec = randomIrGene('r', 'math', fields, seqRng(seq));
      expect(validateIr(spec)).toEqual([]);
      expect(spec.body.t).toBe(kind);
    }
  });
});

describe('mutateIr', () => {
  it('nudges a numeric constant (op 0)', () => {
    const spec = numSpec({ t: 'num', v: 5 });
    const out = mutateIr(spec, () => 0);
    expect(out.body).toEqual({ t: 'num', v: 2.5 });
  });

  it('swaps a binary operator (op 1)', () => {
    const spec = numSpec({ t: 'bin', op: '+', a: { t: 'num', v: 1 }, b: { t: 'num', v: 2 } });
    const out = mutateIr(spec, () => 0.3);
    expect(out.body.t).toBe('bin');
    expect((out.body as { t: 'bin'; op: string }).op).toBe('*');
  });

  it('swaps a builtin function (op 2)', () => {
    const spec = numSpec({ t: 'call', fn: 'Math.abs', args: [{ t: 'num', v: 1 }] });
    const out = mutateIr(spec, () => 0.5);
    expect(out.body).toMatchObject({ t: 'call', fn: 'Math.ceil' });
  });

  it('wraps a number node in Math.abs (op 3)', () => {
    const spec = numSpec({ t: 'num', v: 7 });
    const out = mutateIr(spec, () => 0.6);
    expect(out.body).toEqual({ t: 'call', fn: 'Math.abs', args: [{ t: 'num', v: 7 }] });
  });

  it('regrows a subtree (op 4) into a valid spec', () => {
    const spec = numSpec({ t: 'num', v: 1 });
    const out = mutateIr(spec, () => 0.8);
    expect(validateIr(out)).toEqual([]);
    expect(out.name).toBe('g');
  });

  it('regrows an array-kind target (map) through the array branch', () => {
    const spec: GeneIrSpec = {
      name: 'g', domain: 'math',
      fields: [{ name: 'x', kind: 'array' }],
      body: { t: 'map', v: 'm', arr: { t: 'field', name: 'x' }, body: { t: 'num', v: 1 } },
    };
    const out = mutateIr(spec, seqRng([0.8, 0.0, 0.5, 0.1, 0.5]));
    expect(validateIr(out)).toEqual([]);
  });

  it('regrows an object-kind target through the object branch', () => {
    const spec = numSpec({ t: 'obj', fields: { out0: { t: 'num', v: 1 } } });
    const out = mutateIr(spec, seqRng([0.8, 0.0, 0.0, 0.1, 0.5, 0.5]));
    expect(validateIr(out)).toEqual([]);
    expect(out.body.t).toBe('obj');
  });

  it('falls back to absorbing a numeric node in Math.abs when no op matches', () => {
    const spec = numSpec({ t: 'num', v: 3 });
    const out = mutateIr(spec, () => 0.3);
    expect(out.body).toEqual({ t: 'call', fn: 'Math.abs', args: [{ t: 'num', v: 3 }] });
  });

  it('returns the original spec when there is no number-kind node to mutate', () => {
    const spec: GeneIrSpec = { name: 'g', domain: 'math', fields: [{ name: 'x', kind: 'array' }], body: { t: 'arr', items: [] } };
    const out = mutateIr(spec, () => 0.3);
    expect(out).toBe(spec);
  });

  it('recursively replaces a numeric descendant through every node type', () => {
    const field = () => ({ t: 'field', name: 'x' } as const);
    const bodies: GeneIrSpec['body'][] = [
      { t: 'bin', op: '+', a: { t: 'num', v: 1 }, b: field() },
      { t: 'un', op: '-', a: { t: 'num', v: 1 } },
// oxlint-disable-next-line unicorn/no-thenable -- `then` is the IrNode conditional-arm field, not a promise thenable
      { t: 'cond', test: { t: 'num', v: 1 }, then: field(), else: field() },
      { t: 'call', fn: 'Math.abs', args: [{ t: 'num', v: 1 }] },
      { t: 'obj', fields: { k: { t: 'num', v: 1 } } },
      { t: 'arr', items: [{ t: 'num', v: 1 }] },
      { t: 'idx', arr: { t: 'arr', items: [field()] }, i: { t: 'num', v: 1 } },
      { t: 'len', arr: { t: 'arr', items: [{ t: 'num', v: 1 }] } },
      { t: 'map', v: 'm', arr: { t: 'arr', items: [] }, body: { t: 'num', v: 1 } },
      { t: 'reduce', v: 'm', acc: 's', arr: { t: 'arr', items: [] }, init: { t: 'num', v: 1 }, body: field() },
    ];
    for (const body of bodies) {
      const out = mutateIr(numSpec(body), seqRng([0.0, 0.5, 0.5]));
      expect(validateIr(out)).toEqual([]);
      expect(out.body.t).toBe(body.t);
    }
  });
});

describe('crossIr walks donor referencedFields across every node type', () => {
  const field = () => ({ t: 'field', name: 'x' } as const);
  const bodies: GeneIrSpec['body'][] = [
    { t: 'bin', op: '+', a: { t: 'num', v: 1 }, b: field() },
    { t: 'un', op: '-', a: { t: 'num', v: 1 } },
// oxlint-disable-next-line unicorn/no-thenable -- `then` is the IrNode conditional-arm field, not a promise thenable
    { t: 'cond', test: { t: 'num', v: 1 }, then: field(), else: field() },
    { t: 'call', fn: 'Math.abs', args: [{ t: 'num', v: 1 }] },
    { t: 'obj', fields: { k: { t: 'num', v: 1 } } },
    { t: 'arr', items: [{ t: 'num', v: 1 }] },
    { t: 'idx', arr: { t: 'arr', items: [field()] }, i: { t: 'num', v: 1 } },
    { t: 'len', arr: { t: 'arr', items: [{ t: 'num', v: 1 }] } },
    { t: 'map', v: 'm', arr: { t: 'arr', items: [] }, body: { t: 'num', v: 1 } },
    { t: 'reduce', v: 'm', acc: 's', arr: { t: 'arr', items: [] }, init: { t: 'num', v: 1 }, body: field() },
  ];

  it('runs referencedFields and collectNodes over trees containing every node type', () => {
    const a = numSpec({ t: 'num', v: 1 });
    for (const body of bodies) {
      const b: GeneIrSpec = { name: 'b', domain: 'math', fields: [{ name: 'x', kind: 'number' }], body };
      const out = crossIr(a, b, () => 0.5);
      expect(validateIr(out)).toEqual([]);
    }
  });
});

describe('irStats covers every node type', () => {
  it('counts a tree containing all node kinds', () => {
    const spec: GeneIrSpec = {
      name: 'g', domain: 'math', fields: [{ name: 'x', kind: 'number' }],
      body: {
        t: 'obj', fields: {
          // oxlint-disable-next-line unicorn/no-thenable -- `then` is the IrNode conditional-arm field, not a promise thenable
          u: { t: 'cond', test: { t: 'num', v: 5 }, then: { t: 'num', v: 6 }, else: { t: 'num', v: 7 } },
          c: { t: 'call', fn: 'Math.abs', args: [{ t: 'idx', arr: { t: 'arr', items: [{ t: 'num', v: 2 }] }, i: { t: 'num', v: 0 } }] },
          m: { t: 'map', v: 'm', arr: { t: 'arr', items: [{ t: 'num', v: 3 }] }, body: { t: 'bin', op: '+', a: { t: 'field', name: 'x' }, b: { t: 'len', arr: { t: 'arr', items: [{ t: 'num', v: 4 }] } } } },
        },
      },
    };
    expect(irStats(spec)).toEqual({ nodes: 18, depth: 6 });
  });
});

describe('crossIr', () => {
  it('splices a compatible donor subtree into the target', () => {
    const a = numSpec({ t: 'field', name: 'x' });
    const b: GeneIrSpec = { name: 'b', domain: 'math', fields: [{ name: 'x', kind: 'number' }], body: { t: 'num', v: 3 } };
    const out = crossIr(a, b, () => 0.1);
    expect(out.body).toEqual({ t: 'num', v: 3 });
    expect(validateIr(out)).toEqual([]);
  });

  it('falls back to mutateIr when no donor is field-compatible', () => {
    const a = numSpec({ t: 'num', v: 1 });
    const b: GeneIrSpec = { name: 'b', domain: 'math', fields: [{ name: 'y', kind: 'number' }], body: { t: 'field', name: 'y' } };
    const out = crossIr(a, b, () => 0.9);
    expect(out.name).toBe('g');
    expect(validateIr(out)).toEqual([]);
  });
});

describe('verifyIrGene', () => {
  it('compiles, runs, and fully verifies a well-formed gene end-to-end', () => {
    const valid = numSpec({ t: 'bin', op: '+', a: { t: 'field', name: 'x' }, b: { t: 'num', v: 1 } });
    const r = verifyIrGene(valid, [{ x: 2 }, { x: 9 }]);
    expect(r.verified).toBe(true);
    expect(r.checks).toHaveLength(5);
    expect(r.checks[0]).toMatchObject({ name: 'IrWellFormed', passed: true });
    expect(r.checks[1]).toMatchObject({ name: 'SandboxSyntaxValid', passed: true });
    expect(r.checks[2]).toMatchObject({ name: 'SandboxExecutionClean', passed: true });
    expect(r.checks[3]).toMatchObject({ name: 'DeterminismUnderReplay', passed: true });
    expect(r.checks[4]).toMatchObject({ name: 'FiniteOutputs', passed: true });
    expect(r.summary).toBe('5/5 invariants hold · structurally total');
  });

  it('reports an invalid spec as unverified with IrWellFormed failing', () => {
    const r = verifyIrGene(numSpec({ t: 'field', name: 'z' }), [{}]);
    expect(r.verified).toBe(false);
    expect(r.checks[0]).toMatchObject({ name: 'IrWellFormed', passed: false });
    expect(r.summary).toContain('IR validation failed');
  });
});

describe('seedIrGenes', () => {
  it('returns the three intended seed parents', () => {
    const seeds = seedIrGenes();
    expect(seeds).toHaveLength(3);
    expect(seeds.map((s) => s.spec.name)).toEqual(['bounded_mean_gene', 'clamped_pressure_gene', 'spread_signal_gene']);
    expect(seeds[0].spec.domain).toBe('math');
    expect(seeds[1].spec.domain).toBe('coding');
    expect(seeds[2].spec.domain).toBe('systemic');
    for (const { vectors } of seeds) expect(vectors.length).toBeGreaterThan(0);
  });

  it('all seed specs are now valid after the VAR_RE fix', () => {
    for (const { spec } of seedIrGenes()) {
      expect(validateIr(spec)).toEqual([]);
    }
  });
});

describe('irGeneToRegistryGene', () => {
  it('packages a verified gene into a pending registry entry with all 5 checks green', () => {
    const valid = numSpec({ t: 'bin', op: '+', a: { t: 'field', name: 'x' }, b: { t: 'num', v: 1 } });
    const g = irGeneToRegistryGene(valid, [{ x: 2 }]);
    expect(g.id).toMatch(/^ir_g_v1_[0-9a-f]{6}$/);
    expect(g.name).toBe('g');
    expect(g.domain).toBe('math');
    expect(g.version).toBe(1);
    expect(g.generation).toBe(1);
    expect(g.origin).toBe('dream_engine');
    expect(g.status).toBe('pending_approval');
    expect(g.code).toContain('function g(input)');
    expect(g.testVectors).toEqual([{ x: 2 }]);
    expect(g.versionHash).toMatch(/^[0-9a-f]{8}$/);
    expect(g.description).toContain('nodes, depth');
    expect(g.verifierChecks).toHaveLength(5);
    expect(Number.isNaN(Date.parse(g.createdAt))).toBe(false);
  });

  it('compiled gene code actually executes and returns the expected values end-to-end', () => {
    const g = irGeneToRegistryGene(numSpec({ t: 'bin', op: '+', a: { t: 'field', name: 'x' }, b: { t: 'num', v: 1 } }), [{ x: 2 }, { x: 9 }]);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(`return (${g.code})`)() as (input: { x: number }) => number;
    expect(fn({ x: 2 })).toBe(3);
    expect(fn({ x: 9 })).toBe(10);
  });
});

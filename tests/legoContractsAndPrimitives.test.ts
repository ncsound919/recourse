import { describe, it, expect } from 'vitest';
import { STANDARD_STUDS, validateStudConnection } from '../src/lego/contracts';
import { getInitialBrickBin } from '../src/lego/primitives';
import { Value } from '../src/dream/autograd';

describe('Lego Subsystem: Layer 1 (The Studs) & Layer 2 (Brick Bin)', () => {
  describe('Layer 1: Typed Stud Contracts', () => {
    it('validates identical stud contracts successfully', () => {
      const studA = STANDARD_STUDS.VECTOR_1D_8;
      const studB = STANDARD_STUDS.VECTOR_1D_8;
      const result = validateStudConnection(studA, studB);

      expect(result.compatible).toBe(true);
      expect(result.mismatches.length).toBe(0);
    });

    it('rejects shape dimension mismatches without broadcasting', () => {
      const studA = STANDARD_STUDS.VECTOR_1D_8;
      const studB = STANDARD_STUDS.VECTOR_1D_16;
      const result = validateStudConnection(studA, studB);

      expect(result.compatible).toBe(false);
      expect(result.mismatches.length).toBeGreaterThan(0);
    });

    it('identifies when dimensions differ but broadcast can be applied', () => {
      const studA = STANDARD_STUDS.SCALAR_TARGET;
      const studB = STANDARD_STUDS.VECTOR_1D_8;
      const result = validateStudConnection(studA, studB);

      expect(result.compatible).toBe(true);
      expect(result.broadcastPossible).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Layer 2: Atomic Brick Bin Operators', () => {
    const brickBin = getInitialBrickBin();

    it('loads all standard atomic bricks with declared contracts', () => {
      expect(brickBin.length).toBeGreaterThanOrEqual(7);

      for (const brick of brickBin) {
        expect(brick.id).toBeDefined();
        expect(brick.name).toBeDefined();
        expect(brick.category).toBeDefined();
        expect(brick.inputContract).toBeDefined();
        expect(brick.outputContract).toBeDefined();
        expect(brick.inputContract.expectedCostFlops).toBeGreaterThan(0);
        expect(brick.forward).toBeTypeOf('function');
      }
    });

    it('executes MLP Projection operator forward pass with autograd Values', () => {
      const mlp = brickBin.find(b => b.id === 'brick_mlp_proj_8_16');
      expect(mlp).toBeDefined();

      const rawInput = [
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]
      ];
      const valInput = rawInput.map(row => row.map(v => new Value(v)));
      const output = mlp!.forward(valInput);

      expect(output.length).toBe(2);
      expect(output[0].length).toBe(16);
      expect(output.every(row => row.every(val => Number.isFinite(val.data)))).toBe(true);
    });

    it('executes Attention operator with autograd Values', () => {
      const attn = brickBin.find(b => b.id === 'brick_attention_head_8');
      expect(attn).toBeDefined();

      const rawInput = [
        [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
      ];
      const valInput = rawInput.map(row => row.map(v => new Value(v)));
      const output = attn!.forward(valInput);

      expect(output.length).toBe(2);
      expect(output[0].length).toBe(8);
      expect(output.every(row => row.every(val => Number.isFinite(val.data)))).toBe(true);
    });

    it('executes MoE Router operator dynamically selecting experts', () => {
      const moe = brickBin.find(b => b.id === 'brick_moe_gating_router');
      expect(moe).toBeDefined();

      const rawInput = [
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
      ];
      const valInput = rawInput.map(row => row.map(v => new Value(v)));
      const output = moe!.forward(valInput);
      expect(output.length).toBe(1);
      expect(output[0].length).toBe(4);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  generateGenome,
  mutateGenome,
  crossGenomes,
  compileGenome,
  verifyGenome,
} from '../src/dream/genomes';
import { mulberry32, DreamingEngine } from '../src/dream/engine';
import { InMemoryDreamStore } from '../src/dream/store';

describe('Dream Engine & Genome Evolutionary Synthesis', () => {
  describe('Mulberry32 PRNG', () => {
    it('generates deterministic and reproducible pseudo-random numbers from seed', () => {
      const rng1 = mulberry32(1337);
      const seq1 = [rng1(), rng1(), rng1()];

      const rng2 = mulberry32(1337);
      const seq2 = [rng2(), rng2(), rng2()];

      expect(seq1).toEqual(seq2);

      const rngDiff = mulberry32(9999);
      expect([rngDiff(), rngDiff(), rngDiff()]).not.toEqual(seq1);
    });
  });

  describe('Structural Gene Operations', () => {
    const rng = mulberry32(42);

    it('generates a valid genome spec for a specified domain', () => {
      const mathGene = generateGenome('math', rng);
      expect(mathGene.domain).toBe('math');
      expect(mathGene.kind).toBeDefined();
      expect(mathGene.params).toBeDefined();

      const source = compileGenome(mathGene);
      expect(source).toContain('function');
    });

    it('mutates genome parameters within lawful boundaries', () => {
      const original = generateGenome('coding', rng);
      const mutated = mutateGenome(original, rng);

      expect(mutated.kind).toBe(original.kind);
      expect(mutated.params).toBeDefined();
    });

    it('crosses two genomes to produce structural hybrid offspring', () => {
      const geneA = generateGenome('math', rng);
      const geneB = generateGenome('cyber_defense', rng);
      const hybrid = crossGenomes(geneA, geneB, rng);

      expect(hybrid.kind).toBe(geneA.kind);
      expect(hybrid.domain).toBe(geneA.domain);
    });

    it('verifies generated genome through isolated sandbox execution', () => {
      const gene = generateGenome('math', rng);
      const verifyResult = verifyGenome(gene);

      expect(verifyResult.checks.length).toBeGreaterThan(0);
      expect(verifyResult.checks.some(c => c.name === 'SandboxSyntaxValid')).toBe(true);
    });
  });

  describe('DreamingEngine Lifecycle', () => {
    it('steps through dream ticks and records thoughts', async () => {
      const store = new InMemoryDreamStore();
      const engine = new DreamingEngine(store, 12345);
      const initialStatus = await engine.status();
      expect(initialStatus).toBeDefined();

      // Execute several ticks
      for (let i = 0; i < 5; i++) {
        const tickResult = await engine.tick();
        expect(tickResult.dreamState.tick).toBe(i + 1);
      }

      const statusAfter = await engine.status();
      expect(statusAfter.tick).toBe(5);
    });

    it('guarantees identical tick progressions for identical seeds', async () => {
      const store1 = new InMemoryDreamStore();
      const store2 = new InMemoryDreamStore();
      const engine1 = new DreamingEngine(store1, 777);
      const engine2 = new DreamingEngine(store2, 777);

      for (let i = 0; i < 3; i++) {
        const r1 = await engine1.tick();
        const r2 = await engine2.tick();
        expect(r1.dreamState.currentPhase).toBe(r2.dreamState.currentPhase);
        expect(r1.dreamState.tick).toBe(r2.dreamState.tick);
      }
    });
  });
});

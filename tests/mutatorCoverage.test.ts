import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Episode } from '../src/lib/memory/types';

const h = vi.hoisted(() => ({
  chatCompleteProfile: vi.fn(),
  lintSource: vi.fn(),
}));

vi.mock('../src/lib/modelProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/modelProvider')>();
  return { ...actual, chatCompleteProfile: h.chatCompleteProfile };
});
vi.mock('../src/lib/lintGate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/lintGate')>();
  return { ...actual, lintSource: h.lintSource };
});

import {
  getActiveModel,
  getActivePolicy,
  setActivePolicy,
  createGeneRegistryStore,
  runSandboxVerification,
  evolveGene,
  approveGene,
} from '../src/dream/mutator';
import type { MutationCandidate } from '../src/dream/mutator-types';
import type { GeneRegistryStore } from '../src/dream/mutator';

const VALID_SOURCE = `export function mutate(input) {
  const n = typeof input === 'number' ? input : 1;
  return { result: n * 2 };
}`;
const UNDEFINED_SOURCE = 'export function mutate(input) { }';
const SYNTACTICALLY_BAD = 'export function mutate(input) { this is not valid js !!! }';
const NON_DETERMINISTIC = 'export function mutate(input) { return Math.random(); }';

const ok = (content: string) => ({ ok: true, content, status: 'online', model: 'm', latencyMs: 1 });
const fail = { ok: false, content: null, status: 'error', model: 'm', error: 'down', latencyMs: 1 };

const EPISODES: Episode[] = [{
  id: 'e1', timestamp: 1,
  // With targetToolName set, fingerprintForMutation short-circuits to
  // 'mutate/coding/mutate', so the episode fingerprint must match that.
  problemFingerprint: 'mutate/coding/mutate',
  toolName: 't', outcome: 'loss', score: 0,
  geneIds: ['g'], summary: 'tool crashed on null input while parsing json',
}];

class CaptureStore implements GeneRegistryStore {
  saved: any[] = [];
  async list() { return this.saved; }
  async get(id: string) { return this.saved.find((g) => g.id === id); }
  async save(gene: any) { this.saved.push(gene); }
  async updateStatus(id: string, status: any) { const g = this.saved.find((x) => x.id === id); if (g) g.status = status; return g; }
}

describe('mutator.ts coverage', () => {
  beforeEach(() => {
    h.chatCompleteProfile.mockReset();
    h.lintSource.mockReset();
    // lintSource is synchronous in the real module -> use mockReturnValue.
    h.lintSource.mockReturnValue({ available: true, clean: true, errors: 0, warnings: 0, details: [] });
  });

  describe('model/policy accessors', () => {
    const keep = { api: process.env.API_MODEL_NAME, model: process.env.MODEL_NAME };
    afterEach(() => {
      if (keep.api === undefined) delete process.env.API_MODEL_NAME; else process.env.API_MODEL_NAME = keep.api;
      if (keep.model === undefined) delete process.env.MODEL_NAME; else process.env.MODEL_NAME = keep.model;
    });

    it('getActiveModel prefers API_MODEL_NAME, then MODEL_NAME, then default', () => {
      process.env.API_MODEL_NAME = 'api-model'; delete process.env.MODEL_NAME;
      expect(getActiveModel()).toBe('api-model');
      delete process.env.API_MODEL_NAME; process.env.MODEL_NAME = 'local-model';
      expect(getActiveModel()).toBe('local-model');
      delete process.env.API_MODEL_NAME; delete process.env.MODEL_NAME;
      expect(getActiveModel()).toBe('deepseek-v4-flash-0731');
    });

    it('getActivePolicy/setActivePolicy round-trip', () => {
      setActivePolicy('manual_approval');
      expect(getActivePolicy()).toBe('manual_approval');
      setActivePolicy('auto_promote');
      expect(getActivePolicy()).toBe('auto_promote');
    });
  });

  describe('gene registry store', () => {
    it('is a singleton with seeded genes and CRUD', async () => {
      const a = createGeneRegistryStore();
      const b = createGeneRegistryStore();
      expect(a).toBe(b);
      const genes = await a.list();
      expect(genes.length).toBeGreaterThan(0);
      expect(genes.every((g) => g.versionHash)).toBe(true);

      const first = genes[0];
      expect(await a.get(first.id)).toBe(first);
      expect(await a.get('missing')).toBeUndefined();

      await a.save({ ...first, id: 'new_gene' });
      expect(await a.get('new_gene')).toBeDefined();

      const updated = await a.updateStatus('new_gene', 'retired');
      expect(updated?.status).toBe('retired');
      expect(await a.updateStatus('does_not_exist', 'retired')).toBeUndefined();
    });
  });

  describe('runSandboxVerification', () => {
    const cand = (source: string, testVectors?: unknown[]): MutationCandidate =>
      ({ toolName: 'mutate', description: '', source, testVectors: testVectors ?? [1, 2, 3] });

    it('rejects empty/truncated source', () => {
      const r = runSandboxVerification(cand('short'));
      expect(r.verified).toBe(false);
      expect(r.checks[0].name).toBe('code_integrity');
    });

    it('verifies a valid candidate (lint available & clean)', () => {
      const r = runSandboxVerification(cand(VALID_SOURCE));
      expect(r.verified).toBe(true);
      expect(r.checks.map((c) => c.name)).toContain('executable_syntax');
      expect(r.checks.map((c) => c.name)).toContain('deterministic_purity');
      expect(r.checks.map((c) => c.name)).toContain('sandbox_boundary_isolation');
      expect(r.checks.map((c) => c.name)).toContain('oxlint_safety_gate');
    });

    it('reports lint unavailable branch', () => {
      h.lintSource.mockReturnValue({ available: false, clean: false, errors: 0, warnings: 0, details: [] });
      const r = runSandboxVerification(cand(VALID_SOURCE));
      expect(r.checks.find((c) => c.name === 'oxlint_safety_gate')?.passed).toBe(true);
    });

    it('reports lint errors branch', () => {
      h.lintSource.mockReturnValue({
        available: true, clean: false, errors: 2, warnings: 1,
        details: ['[error] no-eval:1:1 eval is evil', '[error] no-debugger:2:2 debugger', '[warning] x'],
      });
      const r = runSandboxVerification(cand(VALID_SOURCE));
      expect(r.checks.find((c) => c.name === 'oxlint_safety_gate')?.passed).toBe(false);
    });

    it('rejects a syntax error in the source', () => {
      const r = runSandboxVerification(cand(SYNTACTICALLY_BAD));
      expect(r.verified).toBe(false);
      expect(r.checks.find((c) => c.name === 'executable_syntax')?.passed).toBe(false);
    });

    it('rejects a non-deterministic source', () => {
      const r = runSandboxVerification(cand(NON_DETERMINISTIC));
      expect(r.verified).toBe(false);
      expect(r.checks.find((c) => c.name === 'deterministic_purity')?.passed).toBe(false);
    });

    it('rejects a source that returns undefined', () => {
      const r = runSandboxVerification(cand(UNDEFINED_SOURCE));
      expect(r.verified).toBe(false);
    });

    it('uses default vectors when none are provided', () => {
      const r = runSandboxVerification(cand(VALID_SOURCE, []));
      expect(r.verified).toBe(true);
    });
  });

  describe('evolveGene', () => {
    async function evolve(store: GeneRegistryStore, params: any) {
      return evolveGene(store, params);
    }

    it('promotes via api_model when the model returns a valid gene', async () => {
      h.chatCompleteProfile.mockResolvedValue(ok(JSON.stringify({
        source: VALID_SOURCE,
        testVectors: [1, 2],
        description: 'doubler',
      })));
      const store = new CaptureStore();
      setActivePolicy('auto_promote');
      const res = await evolve(store, { domain: 'math', instructions: 'double numbers', targetToolName: 'mutate' });
      expect(res.success).toBe(true);
      expect(res.outcome).toBe('promoted');
      expect(res.engine).toBe('api_model');
      expect(res.geneId).toBeDefined();
      expect(store.saved[0].status).toBe('active');
    });

    it('lands pending_approval under manual_approval policy', async () => {
      h.chatCompleteProfile.mockResolvedValue(ok(JSON.stringify({
        source: VALID_SOURCE, testVectors: [1], description: 'd',
      })));
      const store = new CaptureStore();
      setActivePolicy('manual_approval');
      const res = await evolve(store, { domain: 'math', instructions: 'x', targetToolName: 'mutate' });
      expect(res.outcome).toBe('pending_approval');
      expect(store.saved[0].status).toBe('pending_approval');
    });

    it('rejects when the model gene fails verification', async () => {
      h.chatCompleteProfile.mockResolvedValue(ok(JSON.stringify({
        source: UNDEFINED_SOURCE, testVectors: [1], description: 'd',
      })));
      const store = new CaptureStore();
      setActivePolicy('auto_promote');
      const res = await evolve(store, { domain: 'math', instructions: 'x', targetToolName: 'mutate' });
      expect(res.success).toBe(false);
      expect(res.outcome).toBe('rejected');
      expect(res.engine).toBe('api_model');
      expect(store.saved[0].status).toBe('rejected');
    });

    it('falls back to deterministic synthesizer when the model is offline', async () => {
      h.chatCompleteProfile.mockResolvedValue(fail);
      const store = new CaptureStore();
      setActivePolicy('auto_promote');
      const res = await evolve(store, { domain: 'coding', instructions: 'lexical density' });
      expect(res.engine).toBe('deterministic_fallback');
      expect(res.success).toBe(true);
      expect(store.saved[0].origin).toBe('deterministic_fallback');
    });

    it.each(['math', 'biotech', 'systemic'])(
      'uses the %s deterministic fallback synthesizer branch',
      async (domain) => {
        h.chatCompleteProfile.mockResolvedValue(fail);
        const store = new CaptureStore();
        setActivePolicy('auto_promote');
        const res = await evolve(store, { domain, instructions: 'some instructions' });
        expect(res.engine).toBe('deterministic_fallback');
        expect(res.success).toBe(true);
        expect(store.saved[0].origin).toBe('deterministic_fallback');
      },
    );

    it('falls back when the model returns an unparsable JSON block', async () => {
      // extractJsonBlock finds a '{' but JSON.parse throws -> parsed stays null.
      h.chatCompleteProfile.mockResolvedValue(ok('here is {"source": not valid json'));
      const store = new CaptureStore();
      setActivePolicy('auto_promote');
      const res = await evolve(store, { domain: 'coding', instructions: 'x' });
      expect(res.engine).toBe('deterministic_fallback');
    });

    it('falls back when the model returns non-JSON content', async () => {
      h.chatCompleteProfile.mockResolvedValue(ok('no json here at all'));
      const store = new CaptureStore();
      setActivePolicy('auto_promote');
      const res = await evolve(store, { domain: 'coding', instructions: 'x' });
      expect(res.engine).toBe('deterministic_fallback');
    });

    it('falls back when the model returns too-short source', async () => {
      h.chatCompleteProfile.mockResolvedValue(ok(JSON.stringify({ source: 'short', testVectors: [], description: '' })));
      const store = new CaptureStore();
      setActivePolicy('auto_promote');
      const res = await evolve(store, { domain: 'coding', instructions: 'x' });
      expect(res.engine).toBe('deterministic_fallback');
    });

    it('throws when deterministic fallback is disabled and model is offline', async () => {
      h.chatCompleteProfile.mockResolvedValue(fail);
      process.env.ALLOW_DETERMINISTIC_FALLBACK = '0';
      try {
        const store = new CaptureStore();
        await expect(evolve(store, { domain: 'coding', instructions: 'x' })).rejects.toThrow(/fallback disabled/);
      } finally {
        delete process.env.ALLOW_DETERMINISTIC_FALLBACK;
      }
    });

    it('survives a model provider throw by using the fallback', async () => {
      h.chatCompleteProfile.mockRejectedValue(new Error('boom'));
      const store = new CaptureStore();
      setActivePolicy('auto_promote');
      const res = await evolve(store, { domain: 'coding', instructions: 'x' });
      expect(res.engine).toBe('deterministic_fallback');
    });

    it('records failure-memory accounting when memory is provided', async () => {
      h.chatCompleteProfile.mockResolvedValue(ok(JSON.stringify({
        source: VALID_SOURCE, testVectors: [1], description: 'd',
      })));
      const store = new CaptureStore();
      setActivePolicy('auto_promote');
      const res = await evolve(store, {
        domain: 'coding', instructions: 'tool crashed on null input while parsing json',
        targetToolName: 'mutate',
        memory: { episodes: [{
          id: 'e1', timestamp: 1,
          problemFingerprint: 'mutate/coding/mutate',
          toolName: 'mutate', outcome: 'loss', score: 0, geneIds: ['g'],
          summary: 'tool crashed on null input while parsing json',
        }], maxAvoidLines: 5, bias: { epsilon: 0.1 } },
      });
      expect(res.memory).toBeDefined();
      expect(res.memory!.fingerprint).toMatch(/^mutate\/coding\//);
      expect(res.memory!.avoidedCount).toBeGreaterThan(0);
      expect(res.memory!.biasWeight).toBeDefined();
      expect(res.memory!.episode.outcome).toBe('win');
    });

    it('handles synthesizeWithModel testVector edge cases', async () => {
      h.chatCompleteProfile.mockResolvedValue(ok(JSON.stringify({
        source: VALID_SOURCE,
        testVectors: ['[1,2,3]', 'not-json', 42],
        description: 'd',
      })));
      const store = new CaptureStore();
      setActivePolicy('auto_promote');
      const res = await evolve(store, { domain: 'math', instructions: 'x', targetToolName: 'mutate' });
      expect(res.success).toBe(true);

      h.chatCompleteProfile.mockResolvedValue(ok(JSON.stringify({ source: VALID_SOURCE, description: 'd' })));
      const res2 = await evolve(store, { domain: 'math', instructions: 'x', targetToolName: 'mutate' });
      expect(res2.success).toBe(true);
      expect(store.saved[1].testVectors).toEqual(['sample_input']);
    });
  });

  describe('approveGene', () => {
    it('approves an existing gene', async () => {
      const store = new CaptureStore();
      await store.save({ id: 'g1', status: 'pending_approval', name: 'x' });
      const res = await approveGene(store, 'g1');
      expect(res.success).toBe(true);
      expect(res.gene?.status).toBe('active');
    });

    it('errors when the gene does not exist', async () => {
      const store = new CaptureStore();
      const res = await approveGene(store, 'missing');
      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
    });
  });
});

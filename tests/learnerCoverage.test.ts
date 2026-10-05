import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  RecursiveLearner,
  InMemoryLearnerStore,
  FileLearnerStore,
  SupabaseLearnerStore,
  createLearnerStore,
  LEARNER_SCHEMA,
} from '../src/dream/learner';
import type { GeneRegistryStore } from '../src/dream/mutator';
import type { RegistryGene } from '../src/dream/mutator-types';
import type { LearnerState, GeneBelief, LedgerEntry } from '../src/dream/learner-types';

const CODE = `function g(input) { return input; }`;

function makeGene(id: string, name: string, domain: string, code = CODE): RegistryGene {
  return {
    id, name, domain: domain as RegistryGene['domain'], version: 1, generation: 1,
    origin: 'deterministic_fallback', status: 'active', code,
    description: '', testVectors: [1, 2, 3], versionHash: 'abcdef01',
    verifierChecks: [], createdAt: new Date().toISOString(),
  };
}

class MockRegistry implements GeneRegistryStore {
  constructor(private genes: RegistryGene[] = []) {}
  async list() { return this.genes; }
  async get(id: string) { return this.genes.find((g) => g.id === id); }
  async save(gene: RegistryGene) { this.genes.push(gene); }
  async updateStatus(id: string, status: RegistryGene['status']) {
    const g = this.genes.find((x) => x.id === id);
    if (g) g.status = status;
    return g;
  }
}

function genesisState(): LearnerState {
  return {
    schema: LEARNER_SCHEMA, episode: 0,
    meta: { learningRate: 0.2, temperature: 0.5, promotionThreshold: 0.85, decayFactor: 0.5, calibrationGate: 0.20, minForecasts: 10 },
    geneBeliefs: {}, selfScore: 0.5, calibrationError: 0.5, brierScore: 0, ece: 0.5,
    forecastWindow: [], directives: [], ledgerHead: '00000000',
    updatedAt: new Date().toISOString(),
  };
}

function freshLearner(registry: MockRegistry) {
  (globalThis as unknown as Record<string, unknown>).__learnerState = undefined;
  (globalThis as unknown as Record<string, unknown>).__learnerLedger = undefined;
  return new RecursiveLearner(new InMemoryLearnerStore(), registry, 0x1234);
}

/** Build a learner against an already-seeded __learnerState (no clearing). */
function learnerOnSeededState(registry: MockRegistry) {
  return new RecursiveLearner(new InMemoryLearnerStore(), registry, 0x1234);
}

function seedState(partial: Partial<LearnerState>) {
  (globalThis as unknown as Record<string, unknown>).__learnerState = { ...genesisState(), ...partial };
}

function belief(id: string, opts: Partial<GeneBelief> = {}): GeneBelief {
  return {
    geneId: id, geneName: id, domain: 'coding', alpha: 1, beta: 1, attempts: 0,
    meanReward: 0.5, weight: 0.5, lastEpisode: 0, ...opts,
  };
}

describe('learner.ts coverage', () => {
  it('serializes concurrent episodes so none is lost or forked', async () => {
    const registry = new MockRegistry([makeGene('g1', 'Gene', 'coding')]);
    const learner = freshLearner(registry);
    const [a, b] = await Promise.all([learner.runEpisode(0.5), learner.runEpisode(0.5)]);
    expect(a.episode).not.toBe(b.episode);
    expect(new Set([a.episode, b.episode])).toEqual(new Set([1, 2]));
    const state = await learner.status();
    expect(state.episode).toBe(2);
    const replay = await learner.replayFromGenesis();
    expect(replay.replayed).toBe(2);
    expect(replay.matchesHead).toBe(true);
  });
  describe('InMemoryLearnerStore', () => {
    it('load/save state and append/list ledger', async () => {
      (globalThis as unknown as Record<string, unknown>).__learnerState = undefined;
      (globalThis as unknown as Record<string, unknown>).__learnerLedger = undefined;
      const store = new InMemoryLearnerStore();
      expect(await store.loadState()).toBeNull();
      const s = genesisState();
      await store.saveState(s);
      expect(await store.loadState()).toBe(s);

      const e: LedgerEntry = { episode: 1, prevHash: '0', inputHash: 'i', stateHash: 's', summary: '', createdAt: '' };
      await store.appendLedger(e);
      await store.appendLedger(e); // duplicate episode ignored
      await store.appendLedger({ ...e, episode: 2 });
      expect(await store.listLedger(1)).toEqual([{ ...e, episode: 1 }]);
      expect((await store.listLedger(10)).length).toBe(2);
    });
  });

  describe('FileLearnerStore', () => {
    const dir = path.join(os.tmpdir(), `learner_file_${Date.now()}`);
    beforeEach(() => fs.mkdirSync(dir, { recursive: true }));
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('loads null when file missing; round-trips state and ledger', async () => {
      const file = path.join(dir, 'l.json');
      const store = new FileLearnerStore(file);
      expect(await store.loadState()).toBeNull();
      expect(await store.listLedger(5)).toEqual([]);

      const s = genesisState();
      await store.saveState(s);
      expect(await store.loadState()).toEqual(s);

      const e: LedgerEntry = { episode: 1, prevHash: '0', inputHash: 'i', stateHash: 's', summary: '', createdAt: '' };
      await store.appendLedger(e);
      await store.appendLedger({ ...e, episode: 2 });
      expect((await store.listLedger(10)).length).toBe(2);
      expect((await store.listLedger(1)).length).toBe(1);
    });

    it('parses a partially-populated ledger file', async () => {
      const file = path.join(dir, 'l2.json');
      const s = genesisState();
      fs.writeFileSync(file, JSON.stringify({ state: s, ledger: 'not-an-array' }), 'utf-8');
      const store = new FileLearnerStore(file);
      expect(await store.loadState()).toEqual(s);
    });

    it('swallows write failures', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const store = new FileLearnerStore(path.join(dir, 'no', 'dir', 'x.json'));
      await store.saveState(genesisState());
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('SupabaseLearnerStore', () => {
    const origFetch = globalThis.fetch;
    function mockFetch(result: { ok: boolean; status: number; json: () => Promise<unknown> }) {
      globalThis.fetch = vi.fn(async () => result) as unknown as typeof fetch;
    }
    afterEach(() => { globalThis.fetch = origFetch; });

    it('loadState returns row or null, throws on error', async () => {
      const store = new SupabaseLearnerStore('https://x', 'k');
      // Compare against the exact row we served — calling genesisState() twice
      // makes the assertion depend on both new Date() calls landing in the same ms.
      const row = genesisState();
      mockFetch({ ok: true, status: 200, json: async () => [{ state: row }] });
      expect(await store.loadState()).toEqual(row);
      mockFetch({ ok: true, status: 200, json: async () => [] });
      expect(await store.loadState()).toBeNull();
      mockFetch({ ok: false, status: 500, json: async () => [] });
      await expect(store.loadState()).rejects.toThrow(/load failed/);
    });

    it('saveState accepts ok/201 and throws otherwise', async () => {
      const store = new SupabaseLearnerStore('https://x', 'k');
      mockFetch({ ok: true, status: 200, json: async () => ({}) });
      await expect(store.saveState(genesisState())).resolves.toBeUndefined();
      mockFetch({ ok: false, status: 201, json: async () => ({}) });
      await expect(store.saveState(genesisState())).resolves.toBeUndefined();
      mockFetch({ ok: false, status: 500, json: async () => ({}) });
      await expect(store.saveState(genesisState())).rejects.toThrow(/save failed/);
    });

    it('appendLedger and listLedger', async () => {
      const store = new SupabaseLearnerStore('https://x', 'k');
      const e: LedgerEntry = { episode: 1, prevHash: '0', inputHash: 'i', stateHash: 's', summary: '', createdAt: '' };
      mockFetch({ ok: false, status: 500, json: async () => ({}) });
      await expect(store.appendLedger(e)).rejects.toThrow(/append failed/);
      mockFetch({ ok: true, status: 200, json: async () => [{ entry: e }] });
      expect(await store.listLedger(5)).toEqual([e]);
      mockFetch({ ok: false, status: 500, json: async () => [] });
      await expect(store.listLedger(5)).rejects.toThrow(/list failed/);
    });
  });

  describe('createLearnerStore', () => {
    const keep = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, anon: process.env.SUPABASE_ANON_KEY };
    afterEach(() => {
      if (keep.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = keep.url;
      if (keep.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = keep.key;
      if (keep.anon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = keep.anon;
    });
    it('returns Supabase when creds set, else File', () => {
      process.env.SUPABASE_URL = 'https://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; delete process.env.SUPABASE_ANON_KEY;
      expect(createLearnerStore()).toBeInstanceOf(SupabaseLearnerStore);
      delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
      expect(createLearnerStore()).toBeInstanceOf(FileLearnerStore);
    });
  });

  describe('RecursiveLearner.runEpisode / execute', () => {
    it('runs an episode with external score and UCB-active genes', async () => {
      const reg = new MockRegistry([makeGene('g1', 'g1', 'coding'), makeGene('g2', 'g2', 'math')]);
      const learner = freshLearner(reg);
      const report = await learner.runEpisode(0.9);
      expect(report.episode).toBe(1);
      expect(report.genesEvaluated).toBe(2);
      expect(report.replayable).toBe(true);
      expect(learner.lastReport).toBe(report);
    });

    it('runs an episode without external score (property-based reward)', async () => {
      const reg = new MockRegistry([makeGene('g1', 'g1', 'coding')]);
      const learner = freshLearner(reg);
      const report = await learner.runEpisode();
      expect(report.episode).toBe(1);
      expect(report.genesEvaluated).toBe(1);
    });

    it('decays the learning rate when calibration is low', async () => {
      // externalScore == priorMean (0.5) -> prediction error ~0 -> calibration
      // <= 0.15 -> learningRate *= 0.95 (line 469).
      const reg = new MockRegistry([makeGene('g1', 'g1', 'coding')]);
      const learner = freshLearner(reg);
      await learner.runEpisode(0.5);
      const s = await learner.status();
      expect(s.meta.learningRate).toBeLessThan(0.2);
    });

    it('runs multiple episodes via runEpisodes', async () => {
      const reg = new MockRegistry([makeGene('g1', 'g1', 'coding')]);
      const learner = freshLearner(reg);
      const reports = await learner.runEpisodes(3);
      expect(reports).toHaveLength(3);
      expect(reports[2].episode).toBe(3);
    });

    it('handles an empty registry (no genes, no external score)', async () => {
      const learner = freshLearner(new MockRegistry([]));
      const report = await learner.runEpisode();
      expect(report.genesEvaluated).toBe(0);
      const s = await learner.status();
      expect(s.episode).toBe(1);
    });

    it('status returns existing state', async () => {
      const learner = freshLearner(new MockRegistry([]));
      await learner.status();
      await learner.status(); // second call returns persisted state
    });
  });

  describe('RecursiveLearner.learnRealTools', () => {
    it('returns {} for empty tools', async () => {
      const learner = freshLearner(new MockRegistry([]));
      expect(await learner.learnRealTools([])).toEqual({});
    });

    it('updates per-tool beliefs from real rewards', async () => {
      const learner = freshLearner(new MockRegistry([]));
      const means = await learner.learnRealTools([
        { name: 'tool_a', domain: 'coding', reward: 1 },
        { name: 'tool_b', reward: 0 },
        { name: 'tool_c', reward: NaN },
      ]);
      expect(means.tool_a).toBeGreaterThan(means.tool_b);
      expect(typeof means.tool_c).toBe('number');
      const s = await learner.status();
      expect(s.geneBeliefs['real:tool_a']).toBeDefined();
      expect(learner.lastReport?.genesEvaluated).toBe(3);
    });
  });

  describe('RecursiveLearner.replayFromGenesis', () => {
    it('replays ledger bit-for-bit', async () => {
      const reg = new MockRegistry([makeGene('g1', 'g1', 'coding')]);
      const learner = freshLearner(reg);
      await learner.runEpisode(0.7);
      await learner.runEpisode(0.3);
      const report = await learner.replayFromGenesis();
      expect(report.replayed).toBe(2);
      expect(report.divergedAtEpisode).toBeNull();
      expect(report.schemaChangedAtEpisode).toBeNull();
      expect(report.matchesHead).toBe(true);
    });

    it('reports a divergence when the stored chain is corrupted', async () => {
      const reg = new MockRegistry([makeGene('g1', 'g1', 'coding')]);
      const learner = freshLearner(reg);
      await learner.runEpisode();
      const ledger = (globalThis as unknown as { __learnerLedger: LedgerEntry[] }).__learnerLedger;
      ledger[0] = { ...ledger[0], stateHash: 'ffffffff' };
      const report = await learner.replayFromGenesis();
      expect(report.divergedAtEpisode).toBe(1);
      expect(report.matchesHead).toBe(false);
    });

    it('stops at an entry written by an older algorithm instead of claiming divergence', async () => {
      const reg = new MockRegistry([makeGene('g1', 'g1', 'coding')]);
      const learner = freshLearner(reg);
      await learner.runEpisode();
      await learner.runEpisode();
      const ledger = (globalThis as unknown as { __learnerLedger: LedgerEntry[] }).__learnerLedger;
      // Episode 2 pretends to come from the pre-versionHash algorithm.
      ledger[1] = { ...ledger[1], schema: 1 };
      const report = await learner.replayFromGenesis();
      expect(report.schemaChangedAtEpisode).toBe(2);
      // Reproducing it would produce a hash mismatch, but that mismatch would
      // mean "the code changed", not "the chain diverged".
      expect(report.divergedAtEpisode).toBeNull();
      expect(report.partial).toBe(true);
      expect(report.replayed).toBe(1);
      expect(report.matchesHead).toBe(false);
    });
  });

  describe('gene beliefs are keyed by version, not just id', () => {
    /**
     * A gene with no test vectors, so its reward is exactly the external score
     * the test supplies. With vectors present the reward is a 50/50 blend with
     * the property score and the controlled values below would not hold.
     */
    function rewardOnlyGene(id: string, versionHash = 'abcdef01'): RegistryGene {
      return { ...makeGene(id, id, 'coding'), testVectors: [], versionHash };
    }

    async function warm(reg: MockRegistry, reward: number, episodes: number) {
      const learner = freshLearner(reg);
      for (let i = 0; i < episodes; i++) await learner.runEpisode(reward);
      return learner;
    }

    it('shrinks toward the prior when a gene is mutated under its belief', async () => {
      const gene = rewardOnlyGene('g1');
      const reg = new MockRegistry([gene]);
      const learner = await warm(reg, 0.95, 30);
      const before = (await learner.status()).geneBeliefs.g1;
      expect(before.alpha).toBeGreaterThan(10);
      expect(before.versionHash).toBe('abcdef01');

      // Same id, new code.
      gene.versionHash = 'ffff9999';
      await learner.runEpisode(0.05);
      const after = (await learner.status()).geneBeliefs.g1;

      expect(after.versionHash).toBe('ffff9999');
      expect(after.alpha + after.beta).toBeLessThan(before.alpha + before.beta);
      // The attempt count resets: the new version has not been evaluated yet.
      expect(after.attempts).toBe(1);
    });

    it('forecasts the new version closer to its own results than the old version would', async () => {
      // 30 high-reward episodes, then a mutation that always fails.
      const gene = rewardOnlyGene('g1');
      const reg = new MockRegistry([gene]);
      const learner = await warm(reg, 0.95, 30);
      gene.versionHash = 'ffff9999';

      // Baseline: what the OLD belief would have predicted for the new version.
      const stalePosterior = (await learner.status()).geneBeliefs.g1;
      const baselinePrediction = stalePosterior.alpha / (stalePosterior.alpha + stalePosterior.beta);
      const actual = 0.05;

      await learner.runEpisode(actual);
      const ledger = (globalThis as unknown as { __learnerLedger: LedgerEntry[] }).__learnerLedger;
      const forecast = ledger[ledger.length - 1].forecasts![0];

      expect(forecast.realized).toBe(actual);
      // The shrink must move the prediction away from the old version's ~0.96.
      expect(baselinePrediction).toBeGreaterThan(0.9);
      expect(Math.abs(forecast.predicted - actual)).toBeLessThan(
        Math.abs(baselinePrediction - actual),
      );
    });

    it('leaves an unversioned belief alone on its first sighting', async () => {
      const reg = new MockRegistry([rewardOnlyGene('g1')]);
      freshLearner(reg);
      seedState({
        geneBeliefs: {
          g1: belief('g1', { alpha: 20, beta: 1, attempts: 19, versionHash: undefined }),
        },
      });
      const seeded = learnerOnSeededState(reg);
      await seeded.runEpisode(0.5);
      const after = (await seeded.status()).geneBeliefs.g1;
      // No shrink: the evidence is still valid for the version it was
      // collected against, so it only gained this episode's outcome. A shrink
      // would have pulled alpha down to roughly 7.
      expect(after.alpha).toBeCloseTo(20.5, 3);
      expect(after.beta).toBeCloseTo(1.5, 3);
      expect(after.versionHash).toBe('abcdef01');
    });

    it('caps effective sample size so a regressed gene can still be shown to regress', async () => {
      const reg = new MockRegistry([rewardOnlyGene('g1')]);
      const learner = freshLearner(reg);
      for (let i = 0; i < 62; i++) await learner.runEpisode(0.99);
      const locked = (await learner.status()).geneBeliefs.g1;
      expect(locked.alpha + locked.beta).toBeLessThanOrEqual(40.001);
      expect(locked.alpha / (locked.alpha + locked.beta)).toBeGreaterThan(0.95);

      // With the cap in place, a run of failures can still move the posterior.
      for (let i = 0; i < 30; i++) await learner.runEpisode(0.0);
      const after = (await learner.status()).geneBeliefs.g1;
      expect(after.alpha / (after.alpha + after.beta)).toBeLessThan(0.6);
    });
  });

  describe('RecursiveLearner directives (deriveDirectives)', () => {
    it('emits retire/refine/amplify and synthesize_template directives', async () => {
      const beliefs: Record<string, GeneBelief> = {
        b_retire: belief('b_retire', { domain: 'math', attempts: 10, weight: 0.1, meanReward: 0.9, lastEpisode: 0 }),
        b_refine: belief('b_refine', { domain: 'coding', attempts: 10, weight: 0.5, meanReward: 0.5, lastEpisode: 0 }),
        b_amplify: belief('b_amplify', { domain: 'systemic', attempts: 10, weight: 0.9, meanReward: 0.9, lastEpisode: 0 }),
        b_young: belief('b_young', { domain: 'biotech', attempts: 3, weight: 0.5, meanReward: 0.5, lastEpisode: 0 }),
      };
      // Seed a calibrated state so the amplify gate fires (ECE < 0.20, enough forecasts)
      const calibratedForecasts = Array.from({ length: 20 }, (_, i) => ({
        predicted: 0.5,
        realized: i < 10 ? 0.4 : 0.6,
      }));
      seedState({
        geneBeliefs: beliefs,
        ece: 0.05,
        brierScore: 0.01,
        forecastWindow: calibratedForecasts,
      });
      const learner = learnerOnSeededState(new MockRegistry([makeGene('g1', 'g1', 'coding')]));
      const report = await learner.runEpisode();
      const kinds = report.directives.map((d) => d.kind);
      expect(kinds).toContain('retire');
      expect(kinds).toContain('refine');
      expect(kinds).toContain('amplify');
      // biotech domain has b_young (attempts 3, meanReward 0.5 < 0.6) and b_retire is math...
      // empty domains (cyber_defense, neuro_symbolic, quantum_sim) also synthesize.
      expect(kinds).toContain('synthesize_template');
      // b_young has attempts<5 -> no directive for it.
      expect(report.directives.some((d) => d.geneName === 'b_young')).toBe(false);
    });

    it('defers amplify when learner is not calibrated', async () => {
      const beliefs: Record<string, GeneBelief> = {
        b_amplify: belief('b_amplify', { domain: 'systemic', attempts: 10, weight: 0.9, meanReward: 0.9, lastEpisode: 0 }),
      };
      seedState({
        geneBeliefs: beliefs,
        ece: 0.5,
        brierScore: 0.25,
        forecastWindow: [],
      });
      const learner = learnerOnSeededState(new MockRegistry([makeGene('g1', 'g1', 'coding')]));
      const report = await learner.runEpisode();
      const amplifyDirective = report.directives.find((d) => d.geneName === 'b_amplify');
      expect(amplifyDirective?.kind).toBe('refine');
      expect(amplifyDirective?.reason).toContain('not calibrated');
    });

    it('avoids synthesize_template when a domain is healthy', async () => {
      const beliefs: Record<string, GeneBelief> = {
        b_ok: belief('b_ok', { domain: 'math', attempts: 10, weight: 0.9, meanReward: 0.9, lastEpisode: 0 }),
      };
      seedState({ geneBeliefs: beliefs });
      const learner = learnerOnSeededState(new MockRegistry([]));
      const report = await learner.runEpisode();
      // math is healthy (meanReward 0.9 >= 0.6) but all other domains are empty
      // so they still synthesize; math itself is not among them.
      expect(report.directives.some((d) => d.kind === 'synthesize_template' && d.targetDomain === 'math')).toBe(false);
    });

    it('covers betaEntropy boundary (p=1 via zero beta)', async () => {
      const beliefs: Record<string, GeneBelief> = {
        b_edge: belief('b_edge', { domain: 'math', alpha: 1, beta: 0, attempts: 5, weight: 0.9, meanReward: 1, lastEpisode: 0 }),
      };
      seedState({ geneBeliefs: beliefs });
      const learner = learnerOnSeededState(new MockRegistry([]));
      await learner.runEpisode();
      const s = await learner.status();
      // avgEntropy = 0 -> temperature clamped to the 0.2 floor
      expect(s.meta.temperature).toBe(0.2);
    });
  });
});

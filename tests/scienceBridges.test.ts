import { describe, it, expect } from 'vitest';
import { oncologyManifest, oncologySimulate } from '../src/lib/oncologyEngineBridge.js';
import { scientificHealth, dnaAnalyze, geneLookup } from '../src/lib/scientificApiBridge.js';
import { integrityStatus, verifyWork } from '../src/lib/integrityBridge.js';
import { orchestratorHealth, submitStudy } from '../src/lib/studyOrchestratorBridge.js';
import { foldingHealth, submitFold } from '../src/lib/proteinFoldingBridge.js';
import {
  PATHOSPHERE_CONTRACTS,
  buildBounty,
  buildCurationVote,
  buildFeeSplit,
  chainBundle,
} from '../src/lib/pathosphereBridge.js';
import { umoeHealth, umoeRun } from '../src/lib/umoeBridge.js';
import { chemlabHealth, moleculeProperties } from '../src/lib/chemlabBridge.js';
import { foresightStatus, foresightSimulate } from '../src/lib/oncoforesightBridge.js';
import { DEFAULT_TRUSTED_DOMAINS } from '../src/lib/deterministicResearch.js';

// Unroutable base forces fast, deterministic failure without live services.
const DOWN = 'http://127.0.0.1:1';

describe('science bridges fail soft (no fabrication when services down)', () => {
  it('oncology manifest/simulate report ok:false', async () => {
    const m = await oncologyManifest(DOWN, 1500);
    expect(m.ok).toBe(false);
    expect(typeof m.error).toBe('string');
    const s = await oncologySimulate({ cells: 100 }, DOWN, 1500);
    expect(s.ok).toBe(false);
  });

  it('scientific api health/dna/gene report ok:false', async () => {
    const h = await scientificHealth(DOWN, 1500);
    expect(h.ok).toBe(false);
    const d = await dnaAnalyze('ATGC', DOWN, 1500);
    expect(d.ok).toBe(false);
    const g = await geneLookup('BRCA1', DOWN, 1500);
    expect(g.ok).toBe(false);
  });

  it('integrity status/verify report ok:false', async () => {
    const s = await integrityStatus(DOWN, 1500);
    expect(s.ok).toBe(false);
    const v = await verifyWork({ tool: 'x' }, DOWN, 1500);
    expect(v.ok).toBe(false);
  });

  it('orchestrator health/submit report ok:false', async () => {
    const h = await orchestratorHealth(DOWN, 1500);
    expect(h.ok).toBe(false);
    const s = await submitStudy({ objective: 'test objective for suite' }, DOWN, 1500);
    expect(s.ok).toBe(false);
  });
});

describe('folding / UMOE / chemlab / foresight fail soft', () => {
  it('folding health/submit report ok:false', async () => {
    const h = await foldingHealth(DOWN, 1500);
    expect(h.ok).toBe(false);
    const s = await submitFold({ fastas: ['ACDEFGHIK'] }, DOWN, 1500);
    expect(s.ok).toBe(false);
  });

  it('UMOE health/run report ok:false', async () => {
    const h = await umoeHealth(DOWN, 1500);
    expect(h.ok).toBe(false);
    const r = await umoeRun({ tumor_id: 'T1' }, DOWN, 1500);
    expect(r.ok).toBe(false);
  });

  it('chemlab health/properties report ok:false', async () => {
    const h = await chemlabHealth(DOWN, 1500);
    expect(h.ok).toBe(false);
    const p = await moleculeProperties('CCO', DOWN, 1500);
    expect(p.ok).toBe(false);
  });

  it('foresight status/simulate report ok:false', async () => {
    const s = await foresightStatus(DOWN, 1500);
    expect(s.ok).toBe(false);
    const r = await foresightSimulate({ cohort: 'test' }, DOWN, 1500);
    expect(r.ok).toBe(false);
  });
});

describe('pathosphere off-chain adapter (in-process, deterministic)', () => {
  it('catalogs all 7 contracts', () => {
    expect(PATHOSPHERE_CONTRACTS).toHaveLength(7);
    for (const c of PATHOSPHERE_CONTRACTS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.keyFunctions.length).toBeGreaterThan(0);
    }
  });

  it('builds and rejects bounties honestly', () => {
    const good = buildBounty({ title: 'Curate BRCA1 variant set' });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.bounty.status).toMatch(/offchain/i);
    const bad = buildBounty({ title: 'short' });
    expect(bad.ok).toBe(false);
    // deterministic ids
    const again = buildBounty({ title: 'Curate BRCA1 variant set' });
    if (good.ok && again.ok) expect(again.bounty.id).toBe(good.bounty.id);
  });

  it('validates votes and fee splits', () => {
    expect(buildCurationVote({ artifactId: 'A1', decision: 'approve' }).ok).toBe(true);
    expect(buildCurationVote({ artifactId: '', decision: 'approve' }).ok).toBe(false);
    expect(
      buildFeeSplit({ recipients: [{ addressOrLabel: 'lab', bps: 6000 }, { addressOrLabel: 'curator', bps: 4000 }] }).ok,
    ).toBe(true);
    expect(buildFeeSplit({ recipients: [{ addressOrLabel: 'lab', bps: 5000 }] }).ok).toBe(false);
  });

  it('chain bundles are explicitly NOT_SUBMITTED', () => {
    const b = chainBundle('bounty', { title: 'x' });
    expect(b.status).toBe('NOT_SUBMITTED');
    expect(b.network).toMatch(/base/i);
  });
});

describe('Overlay Science wiring enhances researcher trust', () => {
  it('trusted domains include oncology/literature registries', () => {
    for (const d of ['biorxiv.org', 'europepmc.org', 'clinicaltrials.gov', 'cbioportal.org', 'ensembl.org', 'uniprot.org']) {
      expect(DEFAULT_TRUSTED_DOMAINS).toContain(d);
    }
  });
});

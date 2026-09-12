import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  fleetBackupDir,
  readFleetJournal,
  listFleetPatches,
  revertAppliedPatch,
  probeDriverOnline,
  auditorStatuses,
  registerFleetDriver,
  installDefaultFleetDrivers,
  getFleetDriver,
  computeHealthDossier,
  topWeaknessScore,
  buildRepairRows,
  submitToRepairEndpoint,
  askDeterministicBrain,
  buildBrainAnalyzeQuery,
  buildPatchIntakeQuery,
  isPathWithinRoot,
  verifyAndApplyPatch,
  buildDevBrainBody,
  callDevBrain,
  devBrainTriageWeaknesses,
  extractPatchCandidates,
  applyDriverProposal,
} from '../src/lib/fleetDevelopment';
import type { AuditorDriver, DossierInput } from '../src/lib/fleetDevelopment';

const tmpRoots: string[] = [];
function freshRoot(): string {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdev-ext-'));
  tmpRoots.push(r);
  return r;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const r of tmpRoots.splice(0)) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

beforeAll(() => {
  installDefaultFleetDrivers();
  for (const id of ['revert-driver', 'gate-driver']) {
    try {
      registerFleetDriver({
        id, name: id, kind: 'audit', schema: 'specified',
        baseUrl: () => null, healthRoute: () => '/x', note: 'test',
      });
    } catch { /* already */ }
  }
});

function baseDossier(over: Partial<DossierInput> = {}): DossierInput {
  return {
    registry: [{ name: 'ok', domain: 'coding', currentVersion: '1.0.0', versions: [{ promoted: true, version: '1.0.0', passed_verifier: true, test_suite_code: 'x' }] }],
    liveSelfHostedTools: 1,
    openAnomalies: 0,
    verifierPassRate: 1,
    repoUrl: 'https://example.test/recourse.git',
    ...over,
  };
}

function registerDriver(d: AuditorDriver): void {
  try { registerFleetDriver(d); } catch { /* already registered */ }
}

const row = (i: number) => ({ component_slug: `recourse:slug${i}`, component_name: `Recourse: Row ${i}`, weakness_score: 60, reasons: ['r'], repo_url: 'https://x.test' });

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function abortingFetch() {
  return vi.fn((_url: string, init: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
  }));
}

describe('fleet journal + backup dir + rollback', () => {
  it('honors RECOURSE_FLEET_DIR and the default .recourse/fleet path', () => {
    vi.stubEnv('RECOURSE_FLEET_DIR', '/custom/fleet');
    expect(fleetBackupDir('/repo')).toBe('/custom/fleet');
    vi.unstubAllEnvs();
    expect(fleetBackupDir('/repo')).toBe(path.join('/repo', '.recourse', 'fleet'));
  });

  it('readFleetJournal returns empty journal for missing/corrupt/invalid files', () => {
    const root = freshRoot();
    expect(readFleetJournal(root)).toEqual({ entries: [] });
    const dir = path.join(root, '.recourse', 'fleet');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'journal.json'), '{ not json', 'utf-8');
    expect(readFleetJournal(root)).toEqual({ entries: [] });
    fs.writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ nope: 1 }), 'utf-8');
    expect(readFleetJournal(root)).toEqual({ entries: [] });
    fs.writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ entries: [{ token: 'a' }] }), 'utf-8');
    expect(readFleetJournal(root).entries).toEqual([{ token: 'a' }]);
  });

  it('revertAppliedPatch: unknown token is an honest failure', async () => {
    const root = freshRoot();
    const res = await revertAppliedPatch('missing', root);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no applied patch with token missing/);
  });

  it('revertAppliedPatch: restores previous source of an overwritten file', async () => {
    const root = freshRoot();
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'existing.ts'), 'export const before = 1;\n', 'utf-8');
    const res = await verifyAndApplyPatch(
      { driverId: 'revert-driver', file: 'src/existing.ts', source: 'export const after = 2;\n' },
      { root },
    );
    expect(res.applied).toBe(true);
    const journal = readFleetJournal(root);
    expect(journal.entries).toHaveLength(1);
    const token = journal.entries[0].token;
    expect(token).toBeTruthy();

    const reverted = await revertAppliedPatch(token, root);
    expect(reverted.ok).toBe(true);
    if (reverted.ok) expect(reverted.restoredSource).toBe('export const before = 1;\n');
    expect(fs.readFileSync(path.join(root, 'src', 'existing.ts'), 'utf-8')).toBe('export const before = 1;\n');
    expect(readFleetJournal(root).entries[0].reverted).toBe(true);
    expect(readFleetJournal(root).entries[0].revertedAt).toBeTypeOf('number');

    const again = await revertAppliedPatch(token, root);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/already reverted/);
    if (!again.ok) expect(again.file).toBe('src/existing.ts');
  });

  it('revertAppliedPatch: removes a brand-new file and cleans empty parent dirs', async () => {
    const root = freshRoot();
    const res = await verifyAndApplyPatch(
      { driverId: 'revert-driver', file: 'deep/nested/new.mjs', source: 'export const n = 1;\n' },
      { root },
    );
    expect(res.applied).toBe(true);
    const token = readFleetJournal(root).entries[0].token;
    const reverted = await revertAppliedPatch(token, root);
    expect(reverted.ok).toBe(true);
    if (reverted.ok) expect(reverted.restoredSource).toBe(null);
    expect(fs.existsSync(path.join(root, 'deep', 'nested', 'new.mjs'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'deep', 'nested'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'deep'))).toBe(false);
  });

  it('revertAppliedPatch: refuses a journal entry that escapes the repo root', async () => {
    const root = freshRoot();
    const dir = path.join(root, '.recourse', 'fleet');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({
      entries: [{ token: 'esc', driverId: 'x', file: '../../evil.txt', appliedHash: 'h', prevSource: 'old', prevExisted: true, ts: 0, reverted: false }],
    }), 'utf-8');
    const res = await revertAppliedPatch('esc', root);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/path escapes repo root/);
  });

  it('listFleetPatches returns applied patch entries', async () => {
    const root = freshRoot();
    await verifyAndApplyPatch({ driverId: 'revert-driver', file: 'x.mjs', source: 'export const x = 1;\n' }, { root });
    const entries = listFleetPatches(root);
    expect(entries).toHaveLength(1);
    expect(entries[0].file).toBe('x.mjs');
    expect(entries[0].reverted).toBe(false);
  });

  it('journal is truncated to the newest 200 entries', async () => {
    const root = freshRoot();
    const dir = path.join(root, '.recourse', 'fleet');
    fs.mkdirSync(dir, { recursive: true });
    const filler = Array.from({ length: 200 }, (_, i) => ({
      token: `t${i}`, driverId: 'revert-driver', file: `f${i}.mjs`, appliedHash: 'h', prevSource: null, prevExisted: false, ts: i, reverted: false,
    }));
    fs.writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ entries: filler }), 'utf-8');
    const res = await verifyAndApplyPatch({ driverId: 'revert-driver', file: 'newest.mjs', source: 'export const n = 1;\n' }, { root });
    expect(res.applied).toBe(true);
    const entries = readFleetJournal(root).entries;
    expect(entries).toHaveLength(200);
    if (res.applied) expect(entries[0].token).toBe(res.revertToken);
    expect(entries.some((e) => e.file === 'newest.mjs')).toBe(true);
  });
});

describe('health probing (real fetch boundary)', () => {
  const probeDriver = (base: string | null): AuditorDriver => ({
    id: 'probe-test', name: 'Probe', kind: 'audit', schema: 'health-probe',
    baseUrl: () => base, healthRoute: () => '/health', note: 'probe',
  });

  it('reports offline when there is no base URL, without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeDriverOnline(probeDriver(null))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns res.ok for a reachable health route and trims trailing slashes', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await probeDriverOnline(probeDriver('http://host.test/'), 500)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://host.test/health');
    expect(init.method).toBe('GET');
  });

  it('returns false on a non-ok health route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    expect(await probeDriverOnline(probeDriver('http://host.test'), 500)).toBe(false);
  });

  it('never throws — network failures become offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await probeDriverOnline(probeDriver('http://host.test'), 500)).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'plain failure'; }));
    expect(await probeDriverOnline(probeDriver('http://host.test'), 500)).toBe(false);
  });

  it('aborts a hung health probe after the timeout and reports offline', async () => {
    vi.stubGlobal('fetch', abortingFetch());
    expect(await probeDriverOnline(probeDriver('http://host.test'), 50)).toBe(false);
  });

  it('auditorStatuses reports configured/online and unconfigured/offline per driver', async () => {
    installDefaultFleetDrivers();
    registerDriver({
      id: 'status-online', name: 'Online', kind: 'repair', schema: 'specified',
      baseUrl: () => 'http://st.test/', healthRoute: () => '/probe', note: 'n1',
    });
    registerDriver({
      id: 'status-offline', name: 'Offline', kind: 'audit', schema: 'health-probe',
      baseUrl: () => null, healthRoute: () => '/x', note: 'n2',
    });
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({})));
    const statuses = await auditorStatuses();
    const online = statuses.find((s) => s.id === 'status-online');
    expect(online).toBeDefined();
    if (online) {
      expect(online.configured).toBe(true);
      expect(online.online).toBe(true);
      expect(online.healthRoute).toBe('/probe');
      expect(online.baseUrl).toBe('http://st.test/');
      expect(online.kind).toBe('repair');
      expect(online.note).toBe('n1');
    }
    const offline = statuses.find((s) => s.id === 'status-offline');
    expect(offline).toBeDefined();
    if (offline) {
      expect(offline.configured).toBe(false);
      expect(offline.online).toBe(false);
    }
  });
});

describe('health dossier: every finding branch with hand-computed scores', () => {
  it('emits degraded/missing-suite/anomaly/pass-rate findings with exact scores', () => {
    const dossier = computeHealthDossier({
      registry: [
        { name: 't1', domain: 'coding', healthStatus: 'degraded', versions: [] },
        { name: 't2', domain: 'math', healthStatus: 'corrupted', versions: [] },
        { name: 't3', domain: 'systemic', healthStatus: 'healing', versions: [] },
      ],
      liveSelfHostedTools: 2,
      openAnomalies: 2,
      verifierPassRate: 0.85,
      repoUrl: 'x',
    });
    expect(dossier.registryTools).toBe(3);
    expect(dossier.domainCount).toBe(3);
    expect(dossier.liveSelfHostedTools).toBe(2);
    expect(dossier.verifierPassRate).toBe(0.85);
    expect(dossier.openAnomalies).toBe(2);
    expect(dossier.repoUrl).toBe('x');
    expect(dossier.findings).toHaveLength(4);

    const degraded = dossier.findings.find((f) => f.slug === 'degraded:t1')!;
    expect(degraded.name).toBe('Degraded registry tools');
    expect(degraded.weaknessScore).toBe(95);
    expect(degraded.reasons).toEqual([
      'tool t1 (degraded) is not verified-healthy',
      'tool t2 (corrupted) is not verified-healthy',
      'tool t3 (healing) is not verified-healthy',
    ]);
    expect(degraded.proposedAction).toContain('Repair the failing tools');

    const noSuite = dossier.findings.find((f) => f.slug === 'missing-regression-suites')!;
    expect(noSuite.weaknessScore).toBe(70);
    expect(noSuite.reasons[0]).toContain('t1 has no test suite');

    const anomalies = dossier.findings.find((f) => f.slug === 'open-anomalies')!;
    expect(anomalies.weaknessScore).toBe(80);
    expect(anomalies.reasons[0]).toContain('2 detected/unevaluated anomalies');

    const passRate = dossier.findings.find((f) => f.slug === 'verifier-pass-rate')!;
    expect(passRate.weaknessScore).toBe(30);
    expect(passRate.reasons[0]).toContain('current verifier pass rate is 85%');

    expect(dossier.healthIndex).toBe(0.465);
    expect(topWeaknessScore(dossier)).toBe(95);
  });

  it('caps degraded reasons at 5 and the degraded score at 100', () => {
    const registry = Array.from({ length: 7 }, (_, i) => ({
      name: `d${i}`, domain: 'coding' as const, healthStatus: 'degraded' as const, versions: [],
    }));
    const dossier = computeHealthDossier({ registry, liveSelfHostedTools: 1, openAnomalies: 0, verifierPassRate: 1 });
    const degraded = dossier.findings.find((f) => f.slug.startsWith('degraded:'))!;
    expect(degraded.weaknessScore).toBe(100);
    expect(degraded.reasons).toHaveLength(5);
    expect(dossier.healthIndex).toBe(0.4);
  });

  it('clamps healthIndex at 0 when faults exceed the index', () => {
    const dossier = computeHealthDossier(baseDossier({ openAnomalies: 50 }));
    expect(dossier.findings.find((f) => f.slug === 'open-anomalies')?.weaknessScore).toBe(90);
    expect(dossier.healthIndex).toBe(0);
  });

  it('reports no self-hosted tools and treats missing pass-rate as 0', () => {
    const dossier = computeHealthDossier({ registry: [], liveSelfHostedTools: 0, openAnomalies: 0, verifierPassRate: 0 });
    expect(dossier.findings.find((f) => f.slug === 'no-self-hosted-tools')?.weaknessScore).toBe(70);
    const passRate = dossier.findings.find((f) => f.slug === 'verifier-pass-rate')!;
    expect(passRate.weaknessScore).toBe(100);
    expect(passRate.reasons[0]).toContain('current verifier pass rate is 0%');
    expect(dossier.verifierPassRate).toBe(0);
    expect(dossier.repoUrl).toBe(null);
  });

  it('produces a perfect dossier and a zero top weakness score for a healthy registry', () => {
    const dossier = computeHealthDossier(baseDossier());
    expect(dossier.findings).toHaveLength(0);
    expect(dossier.healthIndex).toBe(1);
    expect(topWeaknessScore(dossier)).toBe(0);
    expect(buildRepairRows(dossier)).toHaveLength(0);
  });

  it('a promoted version without a test suite still counts as missing a suite', () => {
    const dossier = computeHealthDossier(baseDossier({
      registry: [{
        name: 'v', domain: 'math', currentVersion: '2.0.0',
        versions: [
          { promoted: false, version: '2.0.0', test_suite_code: 'x' },
          { promoted: true, version: '1.0.0', test_suite_code: 'y' },
        ],
      }],
    }));
    const noSuite = dossier.findings.find((f) => f.slug === 'missing-regression-suites')!;
    expect(noSuite.weaknessScore).toBe(50);
  });
});

describe('repair rows + brain/patch intake queries', () => {
  function weakDossier(): ReturnType<typeof computeHealthDossier> {
    return computeHealthDossier({
      registry: [
        { name: 't1', domain: 'coding', healthStatus: 'degraded', versions: [] },
        { name: 't2', domain: 'math', healthStatus: 'degraded', versions: [] },
        { name: 't3', domain: 'coding', healthStatus: 'degraded', versions: [] },
      ],
      liveSelfHostedTools: 0,
      openAnomalies: 1,
      verifierPassRate: 1,
      repoUrl: null,
    });
  }

  it('filters to the >=50 band, rounds scores, and drops sub-band findings', () => {
    const rows = buildRepairRows(weakDossier());
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.weakness_score).toBeGreaterThanOrEqual(50);
      expect(r.repo_url).toBe(null);
      expect(r.component_slug.startsWith('recourse:')).toBe(true);
    }
    expect(rows.some((r) => r.weakness_score === 30)).toBe(false);
    const degradedRow = rows.find((r) => r.component_slug === 'recourse:degraded:t1')!;
    expect(degradedRow.component_name).toBe('Recourse: Degraded registry tools');
    expect(degradedRow.proposed_action).toBeTruthy();
  });

  it('brain query names files, suites and the sandbox; falls back to none-above-threshold', () => {
    const q = buildBrainAnalyzeQuery(weakDossier());
    expect(q).toContain('Health index');
    expect(q).toContain('3 registry tools across 2 domains');
    expect(q).toMatch(/file\(s\)/);
    const healthy = buildBrainAnalyzeQuery(computeHealthDossier(baseDossier()));
    expect(healthy).toContain('(none above threshold)');
  });

  it('patch intake query demands fenced JSON with a suite per file', () => {
    const q = buildPatchIntakeQuery(weakDossier(), 'Axiom OS');
    expect(q).toContain('Axiom OS');
    expect(q).toContain('```json');
    expect(q).toContain('"suite"');
    expect(q).toMatch(/sandbox verifier \+ lint/);
    const healthy = buildPatchIntakeQuery(computeHealthDossier(baseDossier()), 'Deep');
    expect(healthy).toContain('(none above threshold)');
  });
});

describe('submitToRepairEndpoint (real fetch boundary)', () => {
  it('honors the kill switch before anything else', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await submitToRepairEndpoint({ rows: [row(0)], url: 'http://x.test', enabled: false });
    expect(res).toMatchObject({ ok: false, dispatched: 0 });
    if (res.error) expect(res.error).toMatch(/kill switch/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports no weak rows when the band is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await submitToRepairEndpoint({ rows: [], url: 'http://x.test' });
    expect(res).toMatchObject({ ok: false, dispatched: 0 });
    if (res.error) expect(res.error).toMatch(/no weak rows/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to /api/ops/repair-benchmark with bearer auth, capped at 5 rows', async () => {
    const fetchMock = vi.fn(async () => okResponse({ ok: true, dispatched: 3, results: ['a', 'b'] }));
    vi.stubGlobal('fetch', fetchMock);
    const rows = Array.from({ length: 7 }, (_, i) => row(i));
    const res = await submitToRepairEndpoint({ rows, url: 'http://repair.test/', secret: 's3cret', timeoutMs: 200 });
    expect(res.ok).toBe(true);
    expect(res.dispatched).toBe(3);
    expect(res.results).toEqual(['a', 'b']);
    expect(res.status).toBe(200);
    const [callUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(callUrl).toBe('http://repair.test/api/ops/repair-benchmark');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer s3cret');
    const sent = JSON.parse(init.body as string);
    expect(sent.rows).toHaveLength(5);
  });

  it('omits the auth header when no secret is configured', async () => {
    const fetchMock = vi.fn(async () => okResponse({ ok: true, dispatched: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    await submitToRepairEndpoint({ rows: [row(0)], url: 'http://repair.test' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('surfaces an HTTP failure with its status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    const res = await submitToRepairEndpoint({ rows: [row(0)], url: 'http://repair.test' });
    expect(res).toMatchObject({ ok: false, dispatched: 0, status: 503 });
    if (res.error) expect(res.error).toContain('HTTP 503');
  });

  it('reports a non-ok dispatch response as not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ ok: false, dispatched: 0, error: 'crew busy' })));
    const res = await submitToRepairEndpoint({ rows: [row(0)], url: 'http://repair.test' });
    expect(res.ok).toBe(false);
    expect(res.dispatched).toBe(0);
    expect(res.error).toBe('crew busy');
  });

  it('catches thrown errors into an honest failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net down'); }));
    const res = await submitToRepairEndpoint({ rows: [row(0)], url: 'http://repair.test' });
    expect(res).toMatchObject({ ok: false, dispatched: 0 });
    if (res.error) expect(res.error).toBe('net down');
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'bare string'; }));
    const res2 = await submitToRepairEndpoint({ rows: [row(0)], url: 'http://repair.test' });
    expect(res2.error).toBe('bare string');
  });

  it('aborts a hung dispatch after the timeout and reports an honest error', async () => {
    vi.stubGlobal('fetch', abortingFetch());
    const res = await submitToRepairEndpoint({ rows: [row(0)], url: 'http://repair.test', timeoutMs: 50 });
    expect(res).toMatchObject({ ok: false, dispatched: 0 });
    if (res.error) expect(res.error).toBeTruthy();
  });
});

describe('deterministic brain (real fetch boundary)', () => {
  it('fails honestly when BRAIN_URL is not configured', async () => {
    vi.stubEnv('BRAIN_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await askDeterministicBrain({ query: 'analyze' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('BRAIN_URL not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs /task and returns the trimmed final_output', async () => {
    const fetchMock = vi.fn(async () => okResponse({ final_output: '  fix the module  ' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await askDeterministicBrain({ url: 'http://brain.test/', query: 'analyze', lane: 'deep', timeoutMs: 200 });
    expect(res.ok).toBe(true);
    expect(res.output).toBe('fix the module');
    const [taskUrl, taskInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(taskUrl).toBe('http://brain.test/task');
    const sent = JSON.parse(taskInit.body as string);
    expect(sent.query).toBe('analyze');
    expect(sent.lane_override).toBe('deep');
  });

  it('falls back to body and stringifies non-string output', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ body: { plan: ['a'] } })));
    const res = await askDeterministicBrain({ url: 'http://brain.test', query: 'q' });
    expect(res.ok).toBe(true);
    expect(res.output).toBe('{"plan":["a"]}');
  });

  it('surfaces HTTP, payload error, null, and empty-output failures honestly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    let res = await askDeterministicBrain({ url: 'http://brain.test', query: 'q' });
    expect(res).toMatchObject({ ok: false });
    expect(res.error).toContain('HTTP 500');

    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ error: 'model down' })));
    res = await askDeterministicBrain({ url: 'http://brain.test', query: 'q' });
    expect(res.error).toBe('model down');

    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ final_output: null })));
    res = await askDeterministicBrain({ url: 'http://brain.test', query: 'q' });
    expect(res.error).toContain('no output');

    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ final_output: '   ' })));
    res = await askDeterministicBrain({ url: 'http://brain.test', query: 'q' });
    expect(res.error).toContain('empty output');
  });

  it('catches thrown fetch errors into an honest failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('refused'); }));
    const res = await askDeterministicBrain({ url: 'http://brain.test', query: 'q' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('refused');
  });

  it('aborts a hung /task call after the timeout', async () => {
    vi.stubGlobal('fetch', abortingFetch());
    const res = await askDeterministicBrain({ url: 'http://brain.test', query: 'q', timeoutMs: 50 });
    expect(res.ok).toBe(false);
    if (res.error) expect(res.error).toBeTruthy();
  });
});

describe('verified patch gate: lint, boot-green and config paths', () => {
  it('blocks a code patch the real lint gate flags', async () => {
    const root = freshRoot();
    const res = await verifyAndApplyPatch(
      { driverId: 'gate-driver', file: 'src/linty.js', source: 'debugger;\n' },
      { root },
    );
    expect(res.applied).toBe(false);
    if (res.applied === false) expect(res.error).toMatch(/lint gate blocked/);
    expect(fs.existsSync(path.join(root, 'src', 'linty.js'))).toBe(false);
  });

  it('skips the lint gate when lint is explicitly disabled', async () => {
    const root = freshRoot();
    const res = await verifyAndApplyPatch(
      { driverId: 'gate-driver', file: 'src/linty.js', source: 'debugger;\n' },
      { root, lint: false },
    );
    expect(res.applied).toBe(true);
    if (res.applied) {
      expect(res.verified).toBe('config/source change (no suite) written');
      expect(fs.existsSync(path.join(root, 'src', 'linty.js'))).toBe(true);
    }
  });

  it('a red boot-green gate blocks the patch before any write', async () => {
    const root = freshRoot();
    const res = await verifyAndApplyPatch(
      { driverId: 'gate-driver', file: 'src/mono.ts', source: 'export const m = 1;\n', suite: 'assert m === 1;' },
      { root, bootGreen: () => ({ ok: false, error: 'compile failed' }) },
    );
    expect(res.applied).toBe(false);
    if (res.applied === false) expect(res.error).toMatch(/boot-green gate blocked: compile failed/);
    expect(fs.existsSync(path.join(root, 'src', 'mono.ts'))).toBe(false);
  });

  it('a green boot-green gate records bootGateNote and verifier string', async () => {
    const root = freshRoot();
    const res = await verifyAndApplyPatch(
      { driverId: 'gate-driver', file: 'src/ok.mts', source: 'export const ok = 1;\n', suite: 'assert ok === 1;' },
      { root, bootGreen: async () => ({ ok: true }) },
    );
    expect(res.applied).toBe(true);
    if (res.applied) {
      expect(res.bootGateNote).toBe('boot-green gate passed');
      expect(res.verified).toBe('sandbox suite + lint passed before write');
    }
  });

  it('refuses empty relative paths that resolve to the repo root itself', async () => {
    const root = freshRoot();
    expect(isPathWithinRoot('a/b.ts', root)).toBe(true);
    expect(isPathWithinRoot('', root)).toBe(false);
    const res = await verifyAndApplyPatch({ driverId: 'gate-driver', file: '', source: 'x' }, { root });
    expect(res.applied).toBe(false);
    if (res.applied === false) expect(res.error).toMatch(/outside the repo root/);
  });

  it('resolves the repo root from RECOURSE_REPO when no root is passed', async () => {
    const root = freshRoot();
    vi.stubEnv('RECOURSE_REPO', root);
    const res = await verifyAndApplyPatch({ driverId: 'gate-driver', file: 'envroot.txt', source: 'payload' });
    expect(res.applied).toBe(true);
    expect(fs.existsSync(path.join(root, 'envroot.txt'))).toBe(true);
  });
});

describe('dev-brain gateway (real fetch boundary)', () => {
  it('defaults candidate tags and carries optional fields into the body', () => {
    const body = buildDevBrainBody('pick', [
      { name: 'a', description: 'da' },
      { name: 'b', description: 'db', tags: ['keep'], license: 'MIT', stars: 4, language: 'ts', platform: 'web' },
    ], 'risk_containment');
    expect(body.candidates[0].tags).toEqual(['tool']);
    expect(body.candidates[1]).toEqual({ name: 'b', description: 'db', tags: ['keep'], license: 'MIT', stars: 4, language: 'ts', platform: 'web' });
    expect(body.problem).toBe('pick');
    expect(body.strategy).toBe('risk_containment');
  });

  it('returns the recommended option and weight-ordered ids from a matrix', async () => {
    const fetchMock = vi.fn(async () => okResponse({
      recommendedOptionId: 'b',
      options: [
        { id: 'a', name: 'A', description: 'da', weightPercentage: 30 },
        { id: 'c', name: 'C', description: 'dc' },
        { id: 'b', name: 'B', description: 'db', weightPercentage: 70 },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await callDevBrain({ action: 'decide', problem: 'p', url: 'http://db.test/', timeoutMs: 200 });
    expect(res.ok).toBe(true);
    expect(res.recommendedId).toBe('b');
    expect(res.orderedIds).toEqual(['b', 'a', 'c']);
    expect(res.matrix?.options).toHaveLength(3);
    const [decideUrl, decideInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(decideUrl).toBe('http://db.test/api/decide');
    expect(JSON.parse(decideInit.body as string).problem).toBe('p');
  });

  it('maps each action to its documented Dev-Brain path', async () => {
    const fetchMock = vi.fn(async () => okResponse({ options: [{ id: 'x', name: 'X', description: 'dx', weightPercentage: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);
    await callDevBrain({ action: 'triage', problem: 'p', url: 'http://db.test' });
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe('http://db.test/api/repair/triage');
    await callDevBrain({ action: 'fusion', problem: 'p', url: 'http://db.test' });
    expect((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[0]).toBe('http://db.test/api/fusion/decide');
    await callDevBrain({ action: 'strategy', problem: 'p', url: 'http://db.test' });
    expect((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[0]).toBe('http://db.test/api/strategy/decide');
  });

  it('fails honestly when the response carries no matrix options', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({})));
    const res = await callDevBrain({ action: 'decide', problem: 'p', url: 'http://db.test' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('no matrix options');
  });

  it('surfaces HTTP failures and thrown errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    let res = await callDevBrain({ action: 'decide', problem: 'p', url: 'http://db.test' });
    expect(res).toMatchObject({ ok: false, status: 404 });
    if (res.error) expect(res.error).toContain('HTTP 404');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    res = await callDevBrain({ action: 'decide', problem: 'p', url: 'http://db.test' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
  });

  it('aborts a hung Dev-Brain call after the timeout', async () => {
    vi.stubGlobal('fetch', abortingFetch());
    const res = await callDevBrain({ action: 'decide', problem: 'p', url: 'http://db.test', timeoutMs: 50 });
    expect(res.ok).toBe(false);
    if (res.error) expect(res.error).toBeTruthy();
  });

  it('devBrainTriageWeaknesses maps findings into candidate names', async () => {
    const fetchMock = vi.fn(async () => okResponse({
      recommendedOptionId: 'open-anomalies',
      options: [
        { id: 'open-anomalies', name: 'open-anomalies', description: 'r1', weightPercentage: 60 },
        { id: 'degraded:t1', name: 'degraded:t1', description: 'r2', weightPercentage: 40 },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const findings = [
      { slug: 'open-anomalies', name: 'Open anomalies', weaknessScore: 80, reasons: ['r1'] },
      { slug: 'degraded:t1', name: 'Degraded', weaknessScore: 60, reasons: ['r2'] },
    ];
    const res = await devBrainTriageWeaknesses({ problem: 'triage', findings, url: 'http://db.test' });
    expect(res.ok).toBe(true);
    expect(res.recommendedId).toBe('open-anomalies');
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.candidates.map((c: { name: string }) => c.name)).toEqual(['open-anomalies', 'degraded:t1']);
    expect(sent.candidates[0].tags).toEqual(['recourse-weakness']);
    expect(sent.candidates[0].description).toBe('r1');
  });
});

describe('patch candidate extraction edge cases', () => {
  it('empty and whitespace-only output yields no candidates', () => {
    expect(extractPatchCandidates('')).toEqual({ candidates: [], skipped: 0 });
    expect(extractPatchCandidates('   ')).toEqual({ candidates: [], skipped: 0 });
  });

  it('accepts top-level pure JSON objects and arrays', () => {
    const single = extractPatchCandidates(JSON.stringify({ file: 'a.mjs', source: 'x' }));
    expect(single.candidates).toHaveLength(1);
    expect(single.skipped).toBe(0);

    const arr = extractPatchCandidates(JSON.stringify([
      { file: 'a.mjs', source: 'x' },
      { file: 'b.mjs', source: 'y', suite: 'assert 1 === 1;' },
    ]));
    expect(arr.candidates.map((c) => c.file)).toEqual(['a.mjs', 'b.mjs']);
    expect(arr.candidates[1].suite).toBe('assert 1 === 1;');
  });

  it('skips invalid items in a top-level array and counts them', () => {
    const res = extractPatchCandidates(JSON.stringify([{ file: 'a.mjs', source: 'x' }, { file: 5 }]));
    expect(res.candidates).toHaveLength(1);
    expect(res.skipped).toBe(1);
  });

  it('falls through to fence scanning when top-level JSON fails to parse', () => {
    const output = '{"file": "broken\n```json\n{"file": "f.mjs", "source": "s"}\n```';
    const res = extractPatchCandidates(output);
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].file).toBe('f.mjs');
  });

  it('counts an all-invalid top-level array via the push/skip path', () => {
    const res = extractPatchCandidates(JSON.stringify([{ bad: 1 }, { bad: 2 }]));
    expect(res.candidates).toHaveLength(0);
    expect(res.skipped).toBe(2);
  });

  it('ignores a non-JSON prefix and still scans fences', () => {
    const output = '[{"bad":1}]\n```json\n{"file":"f.mjs","source":"s"}\n```';
    const res = extractPatchCandidates(output);
    expect(res.candidates).toHaveLength(1);
    expect(res.skipped).toBe(0);
  });

  it('handles bare fences, empty fence bodies and malformed fence JSON', () => {
    const output = [
      '```',
      '{"file":"a.mjs","source":"x"}',
      '```',
      '```json',
      '',
      '```',
      '```json',
      'not json',
      '```',
    ].join('\n');
    const res = extractPatchCandidates(output);
    expect(res.candidates.map((c) => c.file)).toEqual(['a.mjs']);
    expect(res.skipped).toBe(1);
  });

  it('toCandidate normalizes backslashes and trims optional fields', () => {
    const res = extractPatchCandidates(JSON.stringify({
      file: 'sub\\dir\\win.mjs',
      source: 'export const w = 1;',
      suite: '  ',
      domain: 'math',
      note: '  apply me  ',
    }));
    const c = res.candidates[0];
    expect(c.file).toBe('sub/dir/win.mjs');
    expect(c.suite).toBeUndefined();
    expect(c.domain).toBe('math');
    expect(c.note).toBe('apply me');
  });

  it('rejects structurally invalid candidates without crashing', () => {
    const invalid = [null, 42, 'text', { file: '' }, { file: 'x' }, { source: 'y' }, { file: 5, source: 'z' }];
    const res = extractPatchCandidates(JSON.stringify(invalid));
    expect(res.candidates).toHaveLength(0);
    expect(res.skipped).toBe(invalid.length);
  });

  it('counts a structurally invalid top-level object as skipped', () => {
    const res = extractPatchCandidates(JSON.stringify({ file: 5, source: 'x' }));
    expect(res.candidates).toHaveLength(0);
    expect(res.skipped).toBe(1);
  });
});

describe('applyDriverProposal no-op and skip accounting', () => {
  beforeAll(() => {
    try { registerFleetDriver({
      id: 'prose-driver', name: 'Prose', kind: 'audit', schema: 'specified',
      baseUrl: () => null, healthRoute: () => '/x', note: 'prose',
    }); } catch { /* already */ }
  });

  it('reports an honest no-op when a registered driver returns prose', async () => {
    const root = freshRoot();
    const res = await applyDriverProposal({ driverId: 'prose-driver', output: 'No actionable weaknesses found.', root });
    expect(res.applied).toBe(false);
    expect(res.appliedCount).toBe(0);
    expect(res.rejectedCount).toBe(0);
    expect(res.skippedCount).toBe(0);
    expect(res.results).toHaveLength(0);
  });

  it('counts skipped malformed blocks and still applies valid ones', async () => {
    const root = freshRoot();
    const output = '```json\nnot parseable\n```\n```json\n{"file":"good.mjs","source":"export const g = 1;","suite":"assert g === 1;"}\n```';
    const res = await applyDriverProposal({ driverId: 'prose-driver', output, root });
    expect(res.applied).toBe(true);
    expect(res.appliedCount).toBe(1);
    expect(res.skippedCount).toBe(1);
    expect(res.results[0].applied).toBe(true);
  });
});

describe('default fleet drivers contract', () => {
  it('reporank/grader/codegang forward the dossier via ingest-forward schema', () => {
    installDefaultFleetDrivers();
    for (const id of ['reporank', 'grader', 'codegang']) {
      const d = getFleetDriver(id)!;
      expect(d.schema).toBe('ingest-forward');
      expect(d.kind).toBe('audit');
      expect(d.baseUrl()).toBeTruthy();
      expect(d.healthRoute()).toBeTruthy();
    }
    const draymond = getFleetDriver('draymond-repair')!;
    expect(draymond.kind).toBe('repair');
    expect(draymond.healthRoute()).toBe('/');
  });

  it('requires an id before a driver can be registered', () => {
    expect(() => registerFleetDriver({} as unknown as AuditorDriver)).toThrow(/requires an id/);
    expect(() => registerFleetDriver(undefined as unknown as AuditorDriver)).toThrow(/requires an id/);
  });
});
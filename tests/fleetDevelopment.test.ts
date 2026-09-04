import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  installDefaultFleetDrivers,
  registerFleetDriver,
  getFleetDriver,
  fleetDrivers,
  computeHealthDossier,
  topWeaknessScore,
  buildRepairRows,
  buildBrainAnalyzeQuery,
  verifyAndApplyPatch,
  isPathWithinRoot,
  FLEET_AUDITORS,
  buildDevBrainBody,
  callDevBrain,
  devBrainTriageWeaknesses,
  buildPatchIntakeQuery,
  extractPatchCandidates,
  applyDriverProposal,
} from '../src/lib/fleetDevelopment';
import type { DossierInput } from '../src/lib/fleetDevelopment';

const tmpRoots: string[] = [];
function freshRoot(): string {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdev-test-'));
  tmpRoots.push(r);
  return r;
}
afterEach(() => {
  for (const r of tmpRoots.splice(0)) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function baseDossier(over: Partial<DossierInput> = {}): DossierInput {
  return {
    registry: [],
    liveSelfHostedTools: 1,
    openAnomalies: 0,
    verifierPassRate: 1,
    repoUrl: 'https://example.test/recourse.git',
    ...over,
  };
}

describe('fleet driver registry', () => {
  it('installs the built-in audit/repair drivers with no duplicates', () => {
    installDefaultFleetDrivers();
    const ids = fleetDrivers().map((d) => d.id);
    for (const expected of ['reporank', 'grader', 'codegang', 'deterministic-brain', 'axiom', 'dev-brain', 'draymond-repair']) {
      expect(ids).toContain(expected);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(getFleetDriver('deterministic-brain')?.schema).toBe('specified');
    expect(getFleetDriver('axiom')?.schema).toBe('specified');
    expect(getFleetDriver('axiom')?.baseUrl()).toBe('http://localhost:3198');
    expect(getFleetDriver('dev-brain')?.schema).toBe('specified');
    expect(getFleetDriver('reporank')?.schema).toBe('ingest-forward');
    expect(FLEET_AUDITORS.length).toBeGreaterThanOrEqual(7);
  });

  it('rejects duplicate driver registration loudly', () => {
    installDefaultFleetDrivers();
    expect(() => registerFleetDriver(getFleetDriver('reporank')!)).toThrow(/already registered/);
  });
});

describe('health dossier', () => {
  it('scores degraded tools, missing suites and zero self-hosted tools honestly', () => {
    const dossier = computeHealthDossier(
      baseDossier({
        registry: [
          { name: 'ok_tool', domain: 'coding', currentVersion: '1.0.0', versions: [{ promoted: true, version: '1.0.0', passed_verifier: true, test_suite_code: 'x' }] },
          { name: 'sick_tool', domain: 'math', healthStatus: 'degraded', currentVersion: '1.0.0', versions: [{ promoted: true, version: '1.0.0', passed_verifier: false }] },
        ],
        liveSelfHostedTools: 0,
      }),
    );
    expect(dossier.registryTools).toBe(2);
    expect(dossier.findings.some((f) => f.slug.startsWith('degraded:'))).toBe(true);
    expect(dossier.findings.some((f) => f.slug === 'no-self-hosted-tools')).toBe(true);
    expect(dossier.healthIndex).toBeLessThan(1);
    expect(topWeaknessScore(dossier)).toBeGreaterThanOrEqual(50);
  });

  it('returns a high health index when everything is verified and self-hosted', () => {
    const dossier = computeHealthDossier(
      baseDossier({
        registry: [
          { name: 'a', domain: 'coding', currentVersion: '1.0.0', versions: [{ promoted: true, version: '1.0.0', passed_verifier: true, test_suite_code: 'x' }] },
          { name: 'b', domain: 'math', currentVersion: '1.0.0', versions: [{ promoted: true, version: '1.0.0', passed_verifier: true, test_suite_code: 'x' }] },
        ],
        liveSelfHostedTools: 2,
      }),
    );
    expect(dossier.findings.filter((f) => f.weaknessScore >= 50)).toHaveLength(0);
    expect(dossier.healthIndex).toBe(1);
  });
});

describe('repair row building + brain query', () => {
  it('only emits rows at/above the >=50 remediation band, in the exact contract shape', () => {
    const dossier = computeHealthDossier(
      baseDossier({ registry: [{ name: 'sick', domain: 'coding', healthStatus: 'degraded', versions: [] }], liveSelfHostedTools: 0 }),
    );
    const rows = buildRepairRows(dossier);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.weakness_score).toBeGreaterThanOrEqual(50);
      expect(r.component_slug.startsWith('recourse:')).toBe(true);
      expect(r.repo_url).toBe('https://example.test/recourse.git');
      expect(Array.isArray(r.reasons)).toBe(true);
    }
  });

  it('emits no rows when nothing is weak', () => {
    const dossier = computeHealthDossier(baseDossier());
    expect(buildRepairRows(dossier)).toHaveLength(0);
  });

  it('brain query is a concrete repair ask referencing files + suites, not prose', () => {
    const dossier = computeHealthDossier(
      baseDossier({ registry: [{ name: 'sick', domain: 'coding', healthStatus: 'degraded', versions: [] }], liveSelfHostedTools: 0 }),
    );
    const q = buildBrainAnalyzeQuery(dossier);
    expect(q).toContain('Health index');
    expect(q).toMatch(/file\(s\)/);
    expect(q).toMatch(/regression suite/);
    expect(q).toMatch(/real sandbox verifier/);
  });
});

describe('safe verified-patch gate', () => {
  const TEST_DRIVER = {
    id: 'test-driver', name: 'Test', kind: 'audit' as const, schema: 'specified' as const,
    baseUrl: () => null, healthRoute: () => '/x', note: 'test',
  };
  beforeAll(() => {
    try { registerFleetDriver(TEST_DRIVER); } catch { /* already */ }
  });

  it('refuses patches from unregistered drivers', async () => {
    const root = freshRoot();
    const res = await verifyAndApplyPatch({ driverId: 'nope', file: 'a.js', source: 'export function x(){return 1;}' }, { root });
    expect(res.applied).toBe(false);
    if (!res.applied) expect('error' in res ? res.error : '').toMatch(/unknown driver/);
  });

  it('refuses path traversal outside the repo root', async () => {
    const root = freshRoot();
    expect(isPathWithinRoot('../../evil.txt', root)).toBe(false);
    const res = await verifyAndApplyPatch({ driverId: 'test-driver', file: '../../evil.txt', source: 'x' }, { root });
    expect(res.applied).toBe(false);
    if (!res.applied) expect('error' in res ? res.error : '').toMatch(/outside the repo root/);
  });

  it('writes a code patch only after it passes the real sandbox suite', async () => {
    const root = freshRoot();
    const res = await verifyAndApplyPatch(
      {
        driverId: 'test-driver',
        file: 'src/dev_add.mjs',
        source: 'export function add(a, b) { return a + b; }',
        suite: 'assert add(1, 2) === 3;\nassert add(-1, 1) === 0;',
      },
      { root },
    );
    expect(res.applied).toBe(true);
    if (res.applied) {
      expect(res.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(fs.existsSync(path.join(root, 'src/dev_add.mjs'))).toBe(true);
    }
  });

  it('refuses a code patch whose source fails its own suite', async () => {
    const root = freshRoot();
    const res = await verifyAndApplyPatch(
      {
        driverId: 'test-driver',
        file: 'src/dev_bad.mjs',
        source: 'export function add(a, b) { return a - b; }',
        suite: 'assert add(1, 2) === 3;',
      },
      { root },
    );
    expect(res.applied).toBe(false);
    if (!res.applied) expect('error' in res ? res.error : '').toMatch(/sandbox suite failed/);
  });

  it('allows a config/data change with no code + no suite', async () => {
    const root = freshRoot();
    const res = await verifyAndApplyPatch(
      { driverId: 'test-driver', file: 'config/dev-note.json', source: '{ "note": "hello" }' },
      { root },
    );
    expect(res.applied).toBe(true);
    if (res.applied) expect(fs.existsSync(path.join(root, 'config/dev-note.json'))).toBe(true);
  });
});

describe('brain gateway (Dev-Brain + deterministic-brain contracts)', () => {
  it('builds the exact Dev-Brain POST body', () => {
    const body = buildDevBrainBody('choose', [{ name: 'a', description: 'do a', tags: ['x'] }], 'risk_containment');
    expect(body.problem).toBe('choose');
    expect(body.strategy).toBe('risk_containment');
    expect(body.candidates).toEqual([{ name: 'a', description: 'do a', tags: ['x'] }]);
  });

  it('fails honestly when Dev-Brain is unreachable (no fake matrix)', async () => {
    const res = await callDevBrain({ action: 'decide', problem: 'p', candidates: [{ name: 'a', description: 'x' }], url: 'http://127.0.0.1:59998' });
    expect(res.ok).toBe(false);
    expect(res.recommendedId).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it('triage helper maps findings into candidate names', async () => {
    const dossier = computeHealthDossier(
      baseDossier({ registry: [{ name: 'sick', domain: 'coding', healthStatus: 'degraded', versions: [] }], liveSelfHostedTools: 0 }),
    );
    const body = buildDevBrainBody(
      'recourse repair triage',
      dossier.findings.map((f) => ({ name: f.slug, description: f.reasons.join('; ') })),
    );
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates[0].name).toBeTruthy();
    expect(devBrainTriageWeaknesses).toBeTypeOf('function');
  });
});

describe('verified patch intake (driver output -> gate-safe applied code)', () => {
  const TEST_DRIVER = {
    id: 'intake-driver', name: 'Intake', kind: 'repair' as const, schema: 'specified' as const,
    baseUrl: () => 'http://localhost:9', healthRoute: () => '/health', note: 'test intake',
  };
  beforeAll(() => {
    try { registerFleetDriver(TEST_DRIVER); } catch { /* already */ }
  });

  it('builds an intake query that demands JSON fence blocks with suites', () => {
    const dossier = computeHealthDossier(
      baseDossier({ registry: [{ name: 'sick', domain: 'coding', healthStatus: 'degraded', versions: [] }], liveSelfHostedTools: 0 }),
    );
    const q = buildPatchIntakeQuery(dossier, 'Axiom OS');
    expect(q).toContain('Axiom OS');
    expect(q).toContain('```json');
    expect(q).toContain('"file"');
    expect(q).toContain('"suite"');
    expect(q).toMatch(/sandbox verifier \+ lint/);
  });

  it('extracts candidates from fenced JSON objects and arrays', () => {
    const output = [
      'Some prose first.',
      '```json',
      JSON.stringify({ file: 'src/a.mjs', source: 'export const a = 1;', suite: 'assert a === 1;', note: 'one' }),
      '```',
      '```json',
      JSON.stringify([
        { file: 'src/b.mjs', source: 'export const b = 2;' },
        { file: 'src/c.mjs', source: 'export const c = 3;', suite: 'assert c === 3;' },
      ]),
      '```',
      '```json',
      'not json at all',
      '```',
    ].join('\n');
    const { candidates, skipped } = extractPatchCandidates(output);
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.file)).toEqual(['src/a.mjs', 'src/b.mjs', 'src/c.mjs']);
    expect(candidates[0].suite).toBe('assert a === 1;');
    expect(skipped).toBe(1);
  });

  it('ignores pure prose with no parseable patch (honest no-op)', () => {
    const { candidates, skipped } = extractPatchCandidates('The brain found no actionable weakness. Nothing to change.');
    expect(candidates).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it('applies only candidates that pass the real sandbox gate, writes others as rejected', async () => {
    const root = freshRoot();
    const good = { file: 'lib/good.mjs', source: 'export function mul(a,b){return a*b;}', suite: 'assert mul(2,3) === 6;' };
    const bad = { file: 'lib/bad.mjs', source: 'export function mul(a,b){return a-b;}', suite: 'assert mul(2,3) === 6;' };
    const output = `proposal\n\`\`\`json\n${JSON.stringify([good, bad])}\n\`\`\``;
    const res = await applyDriverProposal({ driverId: 'intake-driver', output, root });
    expect(res.applied).toBe(true);
    expect(res.appliedCount).toBe(1);
    expect(res.rejectedCount).toBe(1);
    expect(res.results.find((r) => r.applied)?.file).toBe('lib/good.mjs');
    expect(fs.existsSync(path.join(root, 'lib/good.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'lib/bad.mjs'))).toBe(false);
  });

  it('refuses intake from an unregistered driver', async () => {
    const root = freshRoot();
    const output = '```json\n' + JSON.stringify({ file: 'x.mjs', source: 'export const x=1;', suite: 'assert x === 1;' }) + '\n```';
    const res = await applyDriverProposal({ driverId: 'not-a-driver', output, root });
    expect(res.applied).toBe(false);
    expect(res.appliedCount).toBe(0);
    expect(res.results).toHaveLength(0);
  });
});

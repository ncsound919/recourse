import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  fieldbridgeManifest,
  fieldbridgeMatrix,
  fieldbridgeHealth,
  FIELDBRIDGE_DEFAULT_ARTIFACT_DIR,
} from '../src/lib/fieldbridgeBridge';
import { createFieldbridgeRouter } from '../src/routes/fieldbridge';

afterEach(() => {
  vi.unstubAllGlobals();
});

const MATRIX_FIXTURE = {
  manifest: {
    engine: 'fieldbridge@0.2.0',
    configHash: 'abc123',
    generatedAt: '2026-09-22T04:00:00.000Z',
    snapshot: 'python/phase1/phase1_results.json',
    works: 12480,
  },
  fields: ['Physics', 'Mathematics'],
  years: [2014, 2017, 2020, 2023],
  gaps: { surfaced: [{ pair: 'Physics x Mathematics', score: 0.9 }], suppressed: [], signalCount: 1 },
};

const BENCHMARK_FIXTURE = {
  manifest: { engine: 'fieldbridge@0.2.0', method: 'rolling-origin' },
  primary: {
    verdict: {
      passed: false,
      state: 'PENDING',
      reason: 'only 1 held-out window(s) exist; 2 consecutive held-out windows required before a predictive claim',
    },
  },
};

function fixtureDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fieldbridge-test-'));
}

describe('fieldbridge bridge — reads the batch artifact, never fabricates', () => {
  it('defaults to a local artifact dir, NOT an HTTP URL (FieldBridge is a batch tool)', () => {
    expect(FIELDBRIDGE_DEFAULT_ARTIFACT_DIR.startsWith('http')).toBe(false);
    expect(FIELDBRIDGE_DEFAULT_ARTIFACT_DIR).toContain('fieldbridge');
  });

  it('returns ok:false reason=unavailable when the artifact is missing', async () => {
    const dir = fixtureDir();
    const res = await fieldbridgeManifest({ artifactDir: dir });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unavailable');
    expect(res.data).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it('reads the real manifest from the matrix artifact', async () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'fieldbridge-matrix.json'), JSON.stringify(MATRIX_FIXTURE));
    const res = await fieldbridgeManifest({ artifactDir: dir });
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({
      engine: 'fieldbridge@0.2.0',
      configHash: 'abc123',
      works: 12480,
      fields: ['Physics', 'Mathematics'],
      years: [2014, 2017, 2020, 2023],
    });
  });

  it('returns ok:false unavailable on invalid JSON', async () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'fieldbridge-matrix.json'), '{ not json');
    const res = await fieldbridgeMatrix({ artifactDir: dir });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unavailable');
  });

  it('returns the full matrix artifact', async () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'fieldbridge-matrix.json'), JSON.stringify(MATRIX_FIXTURE));
    const res = await fieldbridgeMatrix({ artifactDir: dir });
    expect(res.ok).toBe(true);
    expect((res.data as any).manifest.engine).toBe('fieldbridge@0.2.0');
    expect((res.data as any).gaps.surfaced[0].pair).toBe('Physics x Mathematics');
  });

  it('falls back to the data/ snapshot dir when public/ is missing', async () => {
    const dir = fixtureDir();
    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'fieldbridge-matrix.json'), JSON.stringify(MATRIX_FIXTURE));
    const res = await fieldbridgeMatrix({ artifactDir: dir, dataDir });
    expect(res.ok).toBe(true);
    expect((res.data as any).manifest.engine).toBe('fieldbridge@0.2.0');
  });

  it('health reports the benchmark gate VERBATIM (PENDING per README)', async () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'fieldbridge-matrix.json'), JSON.stringify(MATRIX_FIXTURE));
    fs.writeFileSync(path.join(dir, 'benchmark.json'), JSON.stringify(BENCHMARK_FIXTURE));
    const res = await fieldbridgeHealth({ artifactDir: dir });
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({
      artifactPresent: true,
      benchmarkPresent: true,
      benchmarkStatus: 'PENDING',
      benchmarkPassed: false,
    });
    expect(res.data?.note).toContain('PENDING');
  });

  it('health is honest when the benchmark artifact is absent', async () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'fieldbridge-matrix.json'), JSON.stringify(MATRIX_FIXTURE));
    const res = await fieldbridgeHealth({ artifactDir: dir });
    expect(res.ok).toBe(true);
    expect(res.data?.benchmarkPresent).toBe(false);
    expect(res.data?.benchmarkStatus).toBeNull();
  });

  it('health returns unavailable when the matrix artifact is missing', async () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'benchmark.json'), JSON.stringify(BENCHMARK_FIXTURE));
    const res = await fieldbridgeHealth({ artifactDir: dir });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unavailable');
  });
});

describe('fieldbridge router (extracted server surface)', () => {
  it('registers /status /matrix /health', () => {
    const router = createFieldbridgeRouter();
    const paths = ((router as any).stack ?? [])
      .map((l: any) => l?.route?.path)
      .filter(Boolean)
      .sort();
    expect(paths).toEqual(['/health', '/matrix', '/status']);
  });

  it('/status reports online:false honestly when the artifact is missing', async () => {
    vi.stubEnv('FIELDBRIDGE_ARTIFACT_DIR', fixtureDir());
    const router = createFieldbridgeRouter();
    const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === '/status');
    expect(layer).toBeTruthy();
    const handler = layer.route.stack[0].handle;
    const res = { json: vi.fn() } as any;
    await handler({} as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.online).toBe(false);
    expect(payload.manifest).toBeNull();
    expect(payload.error).toBeTruthy();
  });

  it('/health forwards the real benchmark state from the artifact', async () => {
    const dir = fixtureDir();
    fs.writeFileSync(path.join(dir, 'fieldbridge-matrix.json'), JSON.stringify(MATRIX_FIXTURE));
    fs.writeFileSync(path.join(dir, 'benchmark.json'), JSON.stringify(BENCHMARK_FIXTURE));
    vi.stubEnv('FIELDBRIDGE_ARTIFACT_DIR', dir);
    const router = createFieldbridgeRouter();
    const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === '/health');
    const handler = layer.route.stack[0].handle;
    const res = { json: vi.fn() } as any;
    await handler({} as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.online).toBe(true);
    expect(payload.data.benchmarkStatus).toBe('PENDING');
  });
});
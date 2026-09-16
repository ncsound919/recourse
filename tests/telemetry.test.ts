import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  machineSnapshot,
  parseGitStatusCount,
  pickWorkWindow,
  gitSnapshot,
  collectTelemetry,
  type MachineSnapshot,
} from '../src/lib/telemetry';
import { transcribeSidecarHealth, transcribeBytes } from '../src/lib/transcribeSidecarClient';

const dirs: string[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-tel-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  vi.unstubAllGlobals();
});

function snap(overrides: Partial<MachineSnapshot> = {}): MachineSnapshot {
  return {
    cpus: 4,
    loadAvg: [0.5, 0.4, 0.3],
    freeMemBytes: 8_000,
    totalMemBytes: 10_000,
    usedMemPct: 20,
    uptimeSec: 100,
    platform: 'test',
    ...overrides,
  };
}

describe('machine + git telemetry', () => {
  it('reads a real machine snapshot', () => {
    const m = machineSnapshot();
    expect(m.cpus).toBeGreaterThan(0);
    expect(m.totalMemBytes).toBeGreaterThan(0);
    expect(m.usedMemPct).toBeGreaterThanOrEqual(0);
    expect(m.usedMemPct).toBeLessThanOrEqual(100);
  });

  it('counts git porcelain lines', () => {
    expect(parseGitStatusCount('')).toBe(0);
    expect(parseGitStatusCount(' M a.ts\n?? b.ts\n')).toBe(2);
  });

  it('reports git state honestly for a non-repo directory', () => {
    const g = gitSnapshot(freshDir());
    expect(g.ok).toBe(false);
    expect(typeof g.error).toBe('string');
  });

  it('collects a full snapshot with a work-window decision', () => {
    const t = collectTelemetry(freshDir(), 1234);
    expect(t.at).toBe(1234);
    expect(t.machine.cpus).toBeGreaterThan(0);
    expect(typeof t.workWindow.allowHeavy).toBe('boolean');
  });
});

describe('pickWorkWindow', () => {
  it('allows heavy work when the machine is idle', () => {
    expect(pickWorkWindow(snap()).allowHeavy).toBe(true);
  });

  it('blocks heavy work on high load or low free memory', () => {
    expect(pickWorkWindow(snap({ loadAvg: [8, 7, 6] })).allowHeavy).toBe(false);
    expect(pickWorkWindow(snap({ usedMemPct: 95 })).allowHeavy).toBe(false);
    expect(pickWorkWindow(snap({ loadAvg: [8, 0, 0] })).reason).toMatch(/load/);
    expect(pickWorkWindow(snap({ usedMemPct: 95 })).reason).toMatch(/memory/);
  });

  it('honors custom thresholds', () => {
    const m = snap({ loadAvg: [2, 0, 0] }); // 0.5/cpu
    expect(pickWorkWindow(m, { maxLoadPerCpu: 0.4 }).allowHeavy).toBe(false);
    expect(pickWorkWindow(m, { maxLoadPerCpu: 0.6 }).allowHeavy).toBe(true);
  });
});

describe('transcription sidecar client (stubbed transport)', () => {
  it('reports health when the sidecar responds', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ ok: true, service: 'transcribe', whisper_available: false, default_model: 'base' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const h = await transcribeSidecarHealth('http://127.0.0.1:9', 500);
    expect(h.ok).toBe(true);
    expect(h.whisper_available).toBe(false);
  });

  it('reports an honest failure when the sidecar is down', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('ECONNREFUSED'); });
    const r = await transcribeBytes('AAAA', { base: 'http://127.0.0.1:9', timeoutMs: 500 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unreachable|ECONNREFUSED/);
  });

  it('surfaces the sidecar ok:false reason (ASR backend missing) without pretending', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ ok: false, reason: 'faster-whisper is not installed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const r = await transcribeBytes('AAAA', { base: 'http://127.0.0.1:9', timeoutMs: 500 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/faster-whisper/);
  });
});

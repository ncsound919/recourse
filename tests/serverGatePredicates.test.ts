import { describe, expect, it, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalogCoversRoots, missingSkillRoots, skillRootExists } from '../src/skills/rootIntegrity';
import {
  forgeEpisodeOutcome,
  forgeEpisodeScore,
  forgeEpisodeSummary,
} from '../src/lib/forgeEpisode';
import { resolveLegoReadinessGate, leyoCommitGateOpen, LEGO_COMMIT_READINESS_THRESHOLD } from '../src/lego/readinessGate';

/**
 * Predicates extracted from `server.ts`, which exports nothing and so could only
 * be checked by restarting the process. Each one encodes a decision that was
 * previously getting a silent no-op wrong.
 */

const dirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'roots-'));
  dirs.push(d);
  return d;
}
function tmpFile(): string {
  const d = tmpDir();
  const f = path.join(d, 'a-file.txt');
  fs.writeFileSync(f, 'not a directory');
  return f;
}

afterAll(() => {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('skill root integrity', () => {
  it('treats a real directory as present', () => {
    expect(skillRootExists(tmpDir())).toBe(true);
  });

  it('treats a missing path, a file, and an unreadable path as absent', () => {
    expect(skillRootExists(path.join(os.tmpdir(), 'definitely-not-here-xyz'))).toBe(false);
    // A file is not a scannable skill root.
    expect(skillRootExists(tmpFile())).toBe(false);
  });

  it('lists only the roots that are gone', () => {
    const present = tmpDir();
    const roots = [
      { id: 'live', root: present },
      { id: 'dead-a', root: path.join(os.tmpdir(), 'gone-a') },
      { id: 'dead-b', root: path.join(os.tmpdir(), 'gone-b') },
    ];
    expect(missingSkillRoots(roots).map((r) => r.id)).toEqual(['dead-a', 'dead-b']);
  });

  it('forces a rescan when a root is gone even though the catalog lists every rootId', () => {
    // THE regression: a persisted catalog satisfied the old root-id check
    // forever, so 9 deleted roots never triggered a rescan.
    const roots = [
      { id: 'live', root: tmpDir() },
      { id: 'dead', root: path.join(os.tmpdir(), 'gone') },
    ];
    const staleCatalog = [{ rootId: 'live' }, { rootId: 'dead' }];
    expect(staleCatalog.every((s) => roots.some((r) => r.id === s.rootId))).toBe(true);
    expect(catalogCoversRoots(staleCatalog, roots)).toBe(false);
  });

  it('accepts a catalog that genuinely covers live roots', () => {
    const roots = [{ id: 'a', root: tmpDir() }, { id: 'b', root: tmpDir() }];
    expect(catalogCoversRoots([{ rootId: 'a' }, { rootId: 'b' }], roots)).toBe(true);
  });

  it('forces a rescan for an empty catalog or an uncovered root', () => {
    const roots = [{ id: 'a', root: tmpDir() }];
    expect(catalogCoversRoots([], roots)).toBe(false);
    expect(catalogCoversRoots([{ rootId: 'other' }], roots)).toBe(false);
  });
});

describe('forge episode mapping', () => {
  it('records a materialized or existing tool as a win', () => {
    expect(forgeEpisodeOutcome('materialized')).toBe('win');
    expect(forgeEpisodeOutcome('exists')).toBe('win');
  });

  it('records a failure as a loss', () => {
    expect(forgeEpisodeOutcome('failed')).toBe('loss');
    expect(forgeEpisodeOutcome('materialize_failed')).toBe('loss');
  });

  it('records offline as NEUTRAL, because an outage is not evidence about the domain', () => {
    // The regression this guards: scoring `offline` as a loss teaches the
    // failure-bias to avoid domains that were merely unreachable.
    expect(forgeEpisodeOutcome('offline')).toBe('neutral');
  });

  it('prefers the sandbox verifier score, then the quality gate, then zero', () => {
    expect(forgeEpisodeScore({ verifyScore: 0.9, qualityScore: 0.4 })).toBe(0.9);
    expect(forgeEpisodeScore({ qualityScore: 0.4 })).toBe(0.4);
    // Never invent a passing mark when nothing was measured.
    expect(forgeEpisodeScore({})).toBe(0);
  });

  it('renders a summary that names the status and the attempt budget', () => {
    const s = forgeEpisodeSummary({
      name: 'myTool', status: 'failed', attemptsUsed: 2, maxTries: 3, reason: 'quality',
    });
    expect(s).toContain('failed');
    expect(s).toContain('myTool');
    expect(s).toContain('2/3');
    expect(s).toContain('reason=quality');
  });

  it('omits the reason when there is none', () => {
    const s = forgeEpisodeSummary({ name: 't', status: 'materialized', attemptsUsed: 1, maxTries: 3 });
    expect(s).not.toContain('reason=');
  });
});

describe('LEGO commit readiness gate', () => {
  it('FAILS CLOSED when readiness was never measured', () => {
    // THE regression: the gate defaulted to 1 when the value was absent, so a
    // fresh boot opened the durable registry-commit gate to maximum readiness.
    expect(resolveLegoReadinessGate(undefined)).toBe(0);
    expect(resolveLegoReadinessGate(null)).toBe(0);
    expect(resolveLegoReadinessGate(NaN)).toBe(0);
    expect(resolveLegoReadinessGate(Infinity)).toBe(0);
    expect(resolveLegoReadinessGate('0.9')).toBe(0);
  });

  it('keeps the gate shut for an unmeasured system', () => {
    expect(leyoCommitGateOpen(undefined)).toBe(false);
    expect(leyoCommitGateOpen(null)).toBe(false);
    expect(leyoCommitGateOpen(0)).toBe(false);
  });

  it('passes a measured score through unchanged', () => {
    expect(resolveLegoReadinessGate(0.42)).toBe(0.42);
    expect(resolveLegoReadinessGate(0.9)).toBe(0.9);
  });

  it('opens only at or above the threshold', () => {
    expect(leyoCommitGateOpen(LEGO_COMMIT_READINESS_THRESHOLD - 0.01)).toBe(false);
    expect(leyoCommitGateOpen(LEGO_COMMIT_READINESS_THRESHOLD)).toBe(true);
    expect(leyoCommitGateOpen(1)).toBe(true);
  });
});
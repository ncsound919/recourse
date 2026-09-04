import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  applyDriverProposal,
  listFleetPatches,
  registerFleetDriver,
  revertAppliedPatch,
  verifyAndApplyPatch,
} from '../src/lib/fleetDevelopment';

const tmpRoots: string[] = [];
function freshRoot(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'));
  tmpRoots.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpRoots.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const DRIVER = { id: 'harness-driver', name: 'Harness', kind: 'audit' as const, schema: 'specified' as const, baseUrl: () => null, healthRoute: () => '/x', note: 'test' };
beforeAll(() => {
  try { registerFleetDriver(DRIVER); } catch { /* already registered */ }
});

describe('harness evolution (Phase 5 item 16) rollback', () => {
  it('snapshots prior content and exposes a revert token on overwrite', async () => {
    const root = freshRoot();
    const file = 'src/harness_evolve.ts';
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'const before = 1;\n', 'utf-8');

    const res = await verifyAndApplyPatch({ driverId: DRIVER.id, file, source: 'const after = 2;\n' }, { root });
    expect(res.applied).toBe(true);
    expect('revertToken' in res && res.revertToken).toBeTruthy();

    // Disk now has the new source.
    expect(fs.readFileSync(path.join(root, file), 'utf-8')).toContain('after');
    const patches = listFleetPatches(root);
    expect(patches.length).toBe(1);
    expect(patches[0].prevSource).toContain('before');
    expect(patches[0].prevExisted).toBe(true);

    // Rollback restores the original.
    const token = ('revertToken' in res ? res.revertToken : undefined)!;
    const rev = await revertAppliedPatch(token, root);
    expect(rev.ok).toBe(true);
    expect(rev.file).toBe(file);
    expect(fs.readFileSync(path.join(root, file), 'utf-8')).toContain('before');
    expect(listFleetPatches(root)[0].reverted).toBe(true);
  });

  it('removes files a patch created when reverted', async () => {
    const root = freshRoot();
    const file = 'src/brand_new.ts';
    const res = await verifyAndApplyPatch({ driverId: DRIVER.id, file, source: 'const created = 1;\n' }, { root });
    expect(res.applied).toBe(true);
    expect(fs.existsSync(path.join(root, file))).toBe(true);
    const token = ('revertToken' in res ? res.revertToken : undefined)!;
    const rev = await revertAppliedPatch(token, root);
    expect(rev.ok).toBe(true);
    expect(fs.existsSync(path.join(root, file))).toBe(false);
  });

  it('is idempotent — a second revert reports already reverted', async () => {
    const root = freshRoot();
    const file = 'src/idempotent.ts';
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'const a = 1;\n');
    const res = await verifyAndApplyPatch({ driverId: DRIVER.id, file, source: 'const b = 2;\n' }, { root });
    const token = ('revertToken' in res ? res.revertToken : undefined)!;
    await revertAppliedPatch(token, root);
    const again = await revertAppliedPatch(token, root);
    expect(again.ok).toBe(false);
    expect(again.error).toContain('already reverted');
  });

  it('refuses an unknown token', async () => {
    const rev = await revertAppliedPatch('nope', freshRoot());
    expect(rev.ok).toBe(false);
    expect(rev.error).toContain('no applied patch');
  });

  it('journal survives across reads (persisted to disk)', async () => {
    const root = freshRoot();
    await verifyAndApplyPatch({ driverId: DRIVER.id, file: 'x.ts', source: 'const x = 1;\n' }, { root });
    // A fresh read of the journal sees the same entries.
    expect(listFleetPatches(root).length).toBe(1);
    expect(fs.existsSync(path.join(root, '.recourse', 'fleet', 'journal.json'))).toBe(true);
  });
});

describe('boot-green gate', () => {
  it('blocks the write when the CI-green gate returns red', async () => {
    const root = freshRoot();
    const file = 'src/mono_module.ts';
    const res = await verifyAndApplyPatch(
      { driverId: DRIVER.id, file, source: 'const x = 1;\n' },
      { root, bootGreen: async () => ({ ok: false, error: 'tsc --noEmit failed (exit 2)' }) },
    );
    if (res.applied) throw new Error('boot-green gate should have blocked');
    expect((res as { applied: false; error: string }).error).toContain('boot-green gate blocked');
    expect(fs.existsSync(path.join(root, file))).toBe(false);
  });

  it('allows the write when the CI-green gate passes', async () => {
    const root = freshRoot();
    const file = 'src/green_module.ts';
    const res = await verifyAndApplyPatch(
      { driverId: DRIVER.id, file, source: 'const x = 1;\n' },
      { root, bootGreen: async () => ({ ok: true }) },
    );
    expect(res.applied).toBe(true);
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  });

  it('applyDriverProposal forwards the gate to every candidate', async () => {
    const root = freshRoot();
    const output = JSON.stringify([{ file: 'src/cand_a.ts', source: 'const a = 1;' }]);
    const res = await applyDriverProposal({
      driverId: DRIVER.id,
      output,
      root,
      bootGreen: async () => ({ ok: false, error: 'red' }),
    });
    expect(res.applied).toBe(false);
    expect(res.rejectedCount).toBe(1);
    expect(fs.existsSync(path.join(root, 'src/cand_a.ts'))).toBe(false);
  });
});

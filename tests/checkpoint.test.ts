import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FileCheckpointStore, buildCheckpoint, evaluateCheckpointTimeout, resolveCheckpoint } from '../src/autopilot/checkpoint';
import type { CheckpointT } from '../src/autopilot/loopTypes';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'checkpoint-test-'));
  tmpDirs.push(dir);
  return dir;
}

type BuildCheckpointInput = Omit<CheckpointT, 'createdAt'>;

function buildBaseCheckpoint(overrides: Partial<BuildCheckpointInput> = {}): BuildCheckpointInput {
  return {
    id: 'ckpt_test_1',
    profileSlug: 'testbiz',
    prNumber: 42,
    proposalId: 'upgrade-gap-1-1',
    status: 'pending',
    ...overrides,
  };
}

describe('buildCheckpoint', () => {
  it('creates a checkpoint with default pending status and ISO timestamp', () => {
    const input = buildBaseCheckpoint();
    const now = new Date('2026-09-04T12:00:00.000Z');
    const checkpoint = buildCheckpoint(input, now);

    expect(checkpoint.status).toBe('pending');
    expect(checkpoint.createdAt).toBe('2026-09-04T12:00:00.000Z');
    expect(checkpoint.profileSlug).toBe('testbiz');
    expect(checkpoint.prNumber).toBe(42);
    expect(checkpoint.proposalId).toBe('upgrade-gap-1-1');
  });

  it('respects explicit expiresAt', () => {
    const input = buildBaseCheckpoint({
      expiresAt: '2026-09-05T12:00:00.000Z',
    });
    const checkpoint = buildCheckpoint(input);
    expect(checkpoint.expiresAt).toBe('2026-09-05T12:00:00.000Z');
  });

  it('parses status when provided', () => {
    const input = buildBaseCheckpoint({ status: 'approved' });
    const checkpoint = buildCheckpoint(input);
    expect(checkpoint.status).toBe('approved');
  });
});

describe('evaluateCheckpointTimeout', () => {
  it('returns false when no expiresAt', () => {
    const cp = buildCheckpoint(buildBaseCheckpoint());
    expect(evaluateCheckpointTimeout(cp, new Date('2026-09-10'))).toBe(false);
  });

  it('returns false when expiresAt is in the future', () => {
    const cp = buildCheckpoint(buildBaseCheckpoint({ expiresAt: '2026-09-10T00:00:00.000Z' }));
    expect(evaluateCheckpointTimeout(cp, new Date('2026-09-05T00:00:00.000Z'))).toBe(false);
  });

  it('returns true when expiresAt has passed', () => {
    const cp = buildCheckpoint(buildBaseCheckpoint({ expiresAt: '2026-09-01T00:00:00.000Z' }));
    expect(evaluateCheckpointTimeout(cp, new Date('2026-09-05T00:00:00.000Z'))).toBe(true);
  });

  it('returns true when expiresAt equals now', () => {
    const cp = buildCheckpoint(buildBaseCheckpoint({ expiresAt: '2026-09-05T12:00:00.000Z' }));
    expect(evaluateCheckpointTimeout(cp, new Date('2026-09-05T12:00:00.000Z'))).toBe(true);
  });
});

describe('FileCheckpointStore', () => {
  let store: FileCheckpointStore;
  let baseDir: string;

  beforeEach(() => {
    baseDir = makeTmpDir();
    store = new FileCheckpointStore(baseDir);
  });

  afterEach(() => {
    for (const d of tmpDirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('saves and loads a checkpoint', async () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    const cp = buildCheckpoint(buildBaseCheckpoint({ id: 'ckpt_save_load' }), now);
    await store.save(cp);

    const loaded = await store.load('ckpt_save_load');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('ckpt_save_load');
    expect(loaded!.prNumber).toBe(42);
    expect(loaded!.status).toBe('pending');
  });

  it('returns undefined for unknown id', async () => {
    const loaded = await store.load('nonexistent');
    expect(loaded).toBeUndefined();
  });

  it('lists checkpoints for a slug', async () => {
    const cp1 = buildCheckpoint(buildBaseCheckpoint({ id: 'ckpt_list_1' }));
    const cp2 = buildCheckpoint(buildBaseCheckpoint({ id: 'ckpt_list_2' }));
    await store.save(cp1);
    await store.save(cp2);

    const list = await store.list('testbiz');
    expect(list.length).toBe(2);
    const ids = list.map((c) => c.id).sort();
    expect(ids).toEqual(['ckpt_list_1', 'ckpt_list_2']);
  });

  it('returns empty array for slug with no checkpoints', async () => {
    const list = await store.list('unknown_slug');
    expect(list).toEqual([]);
  });

  it('removes a checkpoint by id', async () => {
    const cp = buildCheckpoint(buildBaseCheckpoint({ id: 'ckpt_remove' }));
    await store.save(cp);
    await store.remove('ckpt_remove');

    const loaded = await store.load('ckpt_remove');
    expect(loaded).toBeUndefined();
  });

  it('load searches all slug dirs', async () => {
    // Save a checkpoint under a specific slug
    const cp = buildCheckpoint(buildBaseCheckpoint({ id: 'ckpt_cross_slug', profileSlug: 'biz_a' }));
    await store.save(cp);

    // Load should find it even when we call from a different base dir
    const store2 = new FileCheckpointStore(baseDir);
    const loaded = await store2.load('ckpt_cross_slug');
    expect(loaded).not.toBeNull();
    expect(loaded!.profileSlug).toBe('biz_a');
  });
});

describe('resolveCheckpoint', () => {
  let store: FileCheckpointStore;
  let baseDir: string;

  beforeEach(() => {
    baseDir = makeTmpDir();
    store = new FileCheckpointStore(baseDir);
  });

  afterEach(() => {
    for (const d of tmpDirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('approves a pending checkpoint and sets approvedAt', async () => {
    const cp = buildCheckpoint(buildBaseCheckpoint({ id: 'ckpt_approve' }));
    await store.save(cp);

    const result = await resolveCheckpoint({
      checkpointId: 'ckpt_approve',
      action: 'approve',
      store,
      reviewerNotes: 'looks good',
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('approved');
    expect(result!.approvedAt).toBeDefined();
    expect(result!.reviewerNotes).toBe('looks good');
    expect(result!.rejectedAt).toBeUndefined();
  });

  it('rejects a pending checkpoint and sets rejectedAt', async () => {
    const cp = buildCheckpoint(buildBaseCheckpoint({ id: 'ckpt_reject' }));
    await store.save(cp);

    const result = await resolveCheckpoint({
      checkpointId: 'ckpt_reject',
      action: 'reject',
      store,
      reviewerNotes: 'not ready',
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('rejected');
    expect(result!.rejectedAt).toBeDefined();
    expect(result!.reviewerNotes).toBe('not ready');
    expect(result!.approvedAt).toBeUndefined();
  });

  it('returns null for nonexistent checkpoint', async () => {
    const result = await resolveCheckpoint({
      checkpointId: 'nonexistent',
      action: 'approve',
      store,
    });
    expect(result).toBeNull();
  });

  it('returns the checkpoint unchanged if already approved', async () => {
    const cp = buildCheckpoint(buildBaseCheckpoint({ id: 'ckpt_already_approved', status: 'approved' }));
    await store.save(cp);

    const result = await resolveCheckpoint({
      checkpointId: 'ckpt_already_approved',
      action: 'reject',
      store,
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('approved'); // unchanged
  });

  it('returns the checkpoint unchanged if already rejected', async () => {
    const cp = buildCheckpoint(buildBaseCheckpoint({ id: 'ckpt_already_rejected', status: 'rejected' }));
    await store.save(cp);

    const result = await resolveCheckpoint({
      checkpointId: 'ckpt_already_rejected',
      action: 'approve',
      store,
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('rejected'); // unchanged
  });
});
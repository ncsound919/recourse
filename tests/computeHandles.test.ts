import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  COMPUTE_HANDLE_CAP,
  ComputeHandleStore,
  computeHandlesFile,
  readComputeHandles,
  writeComputeHandles,
} from '../src/lib/computeHandles.js';
import type { ComputeJobHandle } from '../src/lib/computePlatforms.js';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'compute-handles-'));
}

const dirs: string[] = [];
function handleFile(): string {
  const dir = tempDir();
  dirs.push(dir);
  return path.join(dir, 'compute-handles.json');
}

function handle(overrides: Partial<ComputeJobHandle> = {}): ComputeJobHandle {
  return {
    id: 'kaggle_1750000000000_abcd12',
    platform: 'kaggle',
    externalId: 'djoochie/kernel-slug',
    submittedAt: 1_750_000_000_000,
    status: 'running',
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('compute handle store', () => {
  it('replays a submitted kernel ref after a restart', () => {
    const file = handleFile();
    const first = new ComputeHandleStore(file);
    first.remember(handle());

    // A new process constructs a new store over the same file.
    const restarted = new ComputeHandleStore(file);
    expect(restarted.lookup('kaggle_1750000000000_abcd12')?.externalId).toBe('djoochie/kernel-slug');
    // The external id is a valid key too, matching the old Map behaviour.
    expect(restarted.lookup('djoochie/kernel-slug')?.id).toBe('kaggle_1750000000000_abcd12');
  });

  it('persists status updates from poll/result', () => {
    const file = handleFile();
    const store = new ComputeHandleStore(file);
    store.remember(handle({ status: 'pending' }));
    expect(store.update('djoochie/kernel-slug', { status: 'completed' })?.status).toBe('completed');

    const restarted = new ComputeHandleStore(file);
    expect(restarted.lookup('kaggle_1750000000000_abcd12')?.status).toBe('completed');
  });

  it('ignores unknown ids instead of inventing a handle', () => {
    const store = new ComputeHandleStore(handleFile());
    expect(store.lookup('missing')).toBeNull();
    expect(store.update('missing', { status: 'completed' })).toBeNull();
    expect(store.size).toBe(0);
  });

  it('treats a corrupt file as empty and recovers on the next write', () => {
    const file = handleFile();
    fs.writeFileSync(file, '{ this is not json', 'utf-8');

    const store = new ComputeHandleStore(file);
    expect(store.size).toBe(0);

    store.remember(handle());
    const restarted = new ComputeHandleStore(file);
    expect(restarted.size).toBe(1);
    expect(restarted.lookup('djoochie/kernel-slug')?.status).toBe('running');
  });

  it('drops malformed and half-written records without dropping good ones', () => {
    const file = handleFile();
    fs.writeFileSync(
      file,
      JSON.stringify([
        { id: '', externalId: 'x', platform: 'kaggle', submittedAt: 1, status: 'pending' },
        { id: 'a', externalId: '', platform: 'kaggle', submittedAt: 1, status: 'pending' },
        { id: 'b', externalId: 'b-ref', platform: 'kaggle', submittedAt: 'yesterday', status: 'pending' },
        { id: 'c', externalId: 'c-ref', platform: 'kaggle', submittedAt: 2, status: 'exploded' },
        null,
        handle({ id: 'good', externalId: 'good-ref', submittedAt: 3 }),
      ]),
      'utf-8',
    );

    const handles = readComputeHandles(file);
    expect(handles.map((h) => h.id)).toEqual(['good']);
  });

  it('keeps the newest record when an id appears twice', () => {
    const file = handleFile();
    fs.writeFileSync(
      file,
      JSON.stringify([
        handle({ id: 'same', externalId: 'old-ref', submittedAt: 10, status: 'pending' }),
        handle({ id: 'same', externalId: 'new-ref', submittedAt: 20, status: 'running' }),
      ]),
      'utf-8',
    );

    const handles = readComputeHandles(file);
    expect(handles).toHaveLength(1);
    expect(handles[0].externalId).toBe('new-ref');
    expect(handles[0].status).toBe('running');
  });

  it('caps the persisted file and keeps the newest jobs', () => {
    const file = handleFile();
    const store = new ComputeHandleStore(file);
    for (let i = 0; i < COMPUTE_HANDLE_CAP + 5; i++) {
      store.remember(
        handle({
          id: `job-${i}`,
          externalId: `ref-${i}`,
          submittedAt: 1_750_000_000_000 + i,
        }),
      );
    }

    expect(store.size).toBe(COMPUTE_HANDLE_CAP);
    const restarted = new ComputeHandleStore(file);
    expect(restarted.size).toBe(COMPUTE_HANDLE_CAP);
    expect(restarted.lookup('ref-0')).toBeNull();
    expect(restarted.lookup(`ref-${COMPUTE_HANDLE_CAP + 4}`)?.id).toBe(`job-${COMPUTE_HANDLE_CAP + 4}`);
  });

  it('writes atomically and leaves no temp file behind', () => {
    const file = handleFile();
    writeComputeHandles([handle()], file);

    expect(fs.readdirSync(path.dirname(file))).toEqual(['compute-handles.json']);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toHaveLength(1);
  });

  it('honours COMPUTE_HANDLES_FILE for the default path', () => {
    const file = handleFile();
    const previous = process.env.COMPUTE_HANDLES_FILE;
    process.env.COMPUTE_HANDLES_FILE = file;
    try {
      expect(computeHandlesFile()).toBe(file);
    } finally {
      if (previous === undefined) delete process.env.COMPUTE_HANDLES_FILE;
      else process.env.COMPUTE_HANDLES_FILE = previous;
    }
  });
});

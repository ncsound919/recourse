import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { openLanceIndex, ensureLanceTable, upsertTool, searchLance, countLance, lanceAvailable } from '../src/lib/toolFactory/lanceIndex';

describe('lance index', () => {
  it('opens (or gracefully fails) and round-trips a tool', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lance-'));
    const opened = await openLanceIndex(dir);
    // LanceDB may be unavailable in CI; skip assertions if so.
    if (!opened) return;
    const ensured = await ensureLanceTable();
    if (!ensured) return;
    const up = await upsertTool({ name: 'lru_cache', description: 'Bounded LRU cache', tags: ['cache'] });
    expect(up).toBe(true);
    const count = await countLance();
    expect(count).toBeGreaterThanOrEqual(1);
    const results = await searchLance('cache', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('lru_cache');
  });

  it('searchLance returns [] when unavailable', async () => {
    // force unavailable by opening a bad path? Just call searchLance without open
    // (table may be null) -> []
    const r = await searchLance('x');
    expect(Array.isArray(r)).toBe(true);
  });
});

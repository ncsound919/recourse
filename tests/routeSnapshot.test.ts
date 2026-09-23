import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - .mjs helper without types
import { computeRouteTable, diffRouteTables } from '../scripts/lib/routeTable.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, 'fixtures', 'route-snapshot.json');

describe('route table snapshot', () => {
  it('matches the recorded route table (no dropped/renamed routes)', () => {
    expect(fs.existsSync(fixture), `missing fixture: ${fixture}`).toBe(true);
    const expected: string[] = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    const actual = computeRouteTable(path.resolve(__dirname, '..'));
    const { missing, added } = diffRouteTables(expected, actual);
    expect(
      { missing, added },
      `Route drift detected.\nMissing:\n${missing.join('\n')}\nAdded:\n${added.join('\n')}`,
    ).toEqual({ missing: [], added: [] });
  });

  it('resolves every mounted router factory', () => {
    const actual = computeRouteTable(path.resolve(__dirname, '..'));
    const unresolved = actual.filter((r) => r.startsWith('!! UNRESOLVED ROUTER'));
    expect(unresolved).toEqual([]);
  });
});

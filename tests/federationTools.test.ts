import { describe, it, expect } from 'vitest';
import { createFederationToolProvider } from '../src/lib/federationTools.js';
import type { SkillRegistry } from '../src/lib/skillRegistry.js';

function registry(entries: any[]): SkillRegistry {
  return {
    list: () => entries,
    get: (id: string) => entries.find((e) => e.id === id),
    publish: () => ({ ok: true, applied: true }),
    importEntry: () => ({ ok: true, applied: true }),
    revoke: () => ({ ok: true, applied: true }),
  } as any;
}

const ENTRIES = [
  { id: 's1', name: 'seo-audit', version: '1.0.0', description: 'Audit SEO', domain: 'marketing', publishedAt: 10, signature: 'sig' },
  { id: 's2', name: 'tool-backed', version: '1.0.0', description: 'Maps to a tool', toolName: 'no_such_live_tool', publishedAt: 20 },
];

describe('createFederationToolProvider', () => {
  it('lists registry entries as tools with mutating when tool-backed', async () => {
    const provider = createFederationToolProvider({ registry: registry(ENTRIES) });
    const specs = await provider.list();
    expect(specs.map((s) => s.name)).toEqual(['seo-audit', 'tool-backed']);
    expect(specs.find((s) => s.name === 'seo-audit')?.mutating).toBe(false);
    expect(specs.find((s) => s.name === 'tool-backed')?.mutating).toBe(true);
  });

  it('returns entry metadata for a prose-only skill (no fabrication)', async () => {
    const provider = createFederationToolProvider({ registry: registry(ENTRIES) });
    const res = await provider.invoke('s1', {});
    expect(res.ok).toBe(true);
    const result = res.result as any;
    expect(result.executed).toBe(false);
    expect(result.skill).toMatchObject({ id: 's1', name: 'seo-audit', signed: true });
    expect(result.note).toMatch(/no executable source/);
  });

  it('notes when a mapped tool is not live here', async () => {
    const provider = createFederationToolProvider({ registry: registry(ENTRIES) });
    const res = await provider.invoke('s2', {});
    expect(res.ok).toBe(true);
    expect((res.result as any).note).toMatch(/not a live self-hosted tool/);
  });

  it('rejects unknown entries', async () => {
    const provider = createFederationToolProvider({ registry: registry(ENTRIES) });
    const res = await provider.invoke('nope', {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown federated skill/);
  });
});

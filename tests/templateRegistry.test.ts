import { describe, expect, it } from 'vitest';
import {
  COMPONENT_TEMPLATES,
  countRegisteredTemplates,
  getComponentTemplate,
  isTemplateRegistered,
  listComponentTemplates,
  registerComponentTemplatePlugin,
} from '../src/lib/componentTemplates';
import type { TemplatePlugin } from '../src/lib/templatePlugin';

describe('plugin template registry (Phase 4 item 15)', () => {
  it('is seeded with a real, countable set of templates across domains', () => {
    const all = listComponentTemplates();
    expect(all.length).toBeGreaterThanOrEqual(16); // 10 built-ins + add-on plugins + artifact kinds
    expect(countRegisteredTemplates()).toBe(all.length);
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length); // ids unique
    const categories = new Set(all.map((t) => t.category));
    expect(categories.size).toBeGreaterThan(3); // more than one domain family
  });

  it('exposes a registered bloom-filter plugin as a synthesizing template', () => {
    expect(isTemplateRegistered('tpl_bloom_filter')).toBe(true);
    const tpl = getComponentTemplate('tpl_bloom_filter');
    expect(tpl).toBeTruthy();
    const out = tpl!.synthesizer({ capacity: 1000, numHashes: 3 }, { withSelfHealing: true });
    expect(typeof out.sourceCode).toBe('string');
    expect(out.sourceCode.length).toBeGreaterThan(0);
    expect(typeof out.testSuiteCode).toBe('string');
    expect(out.testSuiteCode.length).toBeGreaterThan(0);
  });

  it('lists templates filtered by domain and category', () => {
    const coding = listComponentTemplates('coding');
    expect(Array.isArray(coding)).toBe(true);
    // Every returned row must match the filter when domain present.
    for (const t of coding) expect(t.domain).toBe('coding');
  });

  it('refuses to silently overwrite an existing template id', () => {
    const existing = getComponentTemplate('tpl_bloom_filter')!;
    const dup: TemplatePlugin = { ...existing, name: 'clone' };
    expect(() => registerComponentTemplatePlugin(dup)).toThrow();
    // Registry unchanged.
    expect(countRegisteredTemplates()).toBe(COMPONENT_TEMPLATES ? Object.keys(COMPONENT_TEMPLATES).length : 0);
  });
});

import { describe, expect, it } from 'vitest';
import { isTemplateRegistered, buildComponentFromTemplate } from '../src/lib/componentTemplates';

describe('factory-composed template integration', () => {
  it('registers tpl_lru_cache_factory', () => {
    expect(isTemplateRegistered('tpl_lru_cache_factory')).toBe(true);
  });

  it('builds composed LRU cache with user params', () => {
    const res = buildComponentFromTemplate('tpl_lru_cache_factory', { capacity: 5, ttlMs: 1000 });
    expect(res.success).toBe(true);
    expect(res.synthesizedCode).toContain('class LRUCache');
    expect(res.synthesizedCode).toContain('capacity = 5');
    expect(res.testSuiteCode.length).toBeGreaterThan(0);
  });
});

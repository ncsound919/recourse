import { describe, expect, it, beforeEach } from 'vitest';

import { registerBuiltinChunks } from '../src/lib/toolFactory/builtinChunks';
import { isChunkRegistered, getChunk, countRegisteredChunks, clearChunksForTests } from '../src/lib/toolFactory/chunks';
import { isTemplateRegistered, buildComponentFromTemplate, getComponentTemplate } from '../src/lib/componentTemplates';
import { executeTestSuite } from '../src/lib/executionSandbox';

describe('builtin chunks', () => {
  beforeEach(() => clearChunksForTests());

  it('registers all three built-in chunks', () => {
    registerBuiltinChunks();
    expect(isChunkRegistered('chk_lru_cache_core')).toBe(true);
    expect(isChunkRegistered('chk_token_bucket_core')).toBe(true);
    expect(isChunkRegistered('chk_hmac_sanitizer_core')).toBe(true);
    expect(countRegisteredChunks()).toBe(3);
  });

  it('is idempotent', () => {
    registerBuiltinChunks();
    registerBuiltinChunks();
    expect(countRegisteredChunks()).toBe(3);
  });

  it('chunks have non-empty bodies', () => {
    registerBuiltinChunks();
    for (const id of ['chk_lru_cache_core', 'chk_token_bucket_core', 'chk_hmac_sanitizer_core']) {
      expect(getChunk(id)!.body.length).toBeGreaterThan(50);
    }
  });
});

describe('builtin recipes (factory templates)', () => {
  for (const id of ['tpl_lru_cache_factory', 'tpl_token_bucket_factory', 'tpl_hmac_sanitizer_factory']) {
    it(`registers ${id}`, () => {
      expect(isTemplateRegistered(id)).toBe(true);
    });

    it(`${id} builds from defaults`, () => {
      const res = buildComponentFromTemplate(id, {});
      expect(res.success).toBe(true);
      expect(res.synthesizedCode.length).toBeGreaterThan(0);
    });

    it(`${id} emitted suite passes`, () => {
      const res = buildComponentFromTemplate(id, {});
      expect(res.success).toBe(true);
      const run = executeTestSuite(res.synthesizedCode, res.testSuiteCode);
      expect(run.passed).toBe(true);
    });
  }

  it('lru factory respects user params in source', () => {
    const res = buildComponentFromTemplate('tpl_lru_cache_factory', { capacity: 7, ttlMs: 1234 });
    expect(res.success).toBe(true);
    expect(res.synthesizedCode).toContain('capacity = 7');
  });

  it('token bucket factory respects user params', () => {
    const res = buildComponentFromTemplate('tpl_token_bucket_factory', { burstCapacity: 9, refillRatePerSec: 2 });
    expect(res.success).toBe(true);
    expect(res.synthesizedCode).toContain('capacity: number = 9');
  });
});

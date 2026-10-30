import { registerComponentTemplatePlugin, isTemplateRegistered } from '../templatePlugin.js';
import { registerBuiltinChunks } from './builtinChunks.js';
import { composeTool } from './composer.js';
import type { ToolRecipe } from './types.js';
import type { ComponentTemplateParam } from '../../types.js';

registerBuiltinChunks();

const LRU_PARAMS: ComponentTemplateParam[] = [
  { id: 'capacity', label: 'Max Capacity', type: 'number', default: 20, min: 2, max: 1000, step: 1, description: 'Maximum active keys before LRU eviction' },
  { id: 'ttlMs', label: 'Default TTL (ms)', type: 'number', default: 60000, min: 1000, max: 3600000, step: 1000, description: 'Default key time-to-live' }
];

function makeRecipe(userParams: Record<string, any> = {}): ToolRecipe {
  const params = LRU_PARAMS.map((p) => ({
    ...p,
    default: userParams[p.id] !== undefined ? userParams[p.id] : p.default
  }));
  return {
    id: 'tpl_lru_cache_factory',
    name: 'LRUCache',
    domain: 'coding',
    category: 'algorithmic',
    description: 'O(1) bounded LRU cache composed by the tool factory (Handlebars + Prettier).',
    params,
    chunks: ['chk_lru_cache_core'],
    snippets: [],
    tags: ['data-structures', 'cache', 'factory-composed'],
    sizeBudget: 200,
    selfHost: {
      stateful: true,
      ctorParamIds: ['capacity'],
      methods: [
        { method: 'get', label: 'Read key' },
        { method: 'set', label: 'Write key' },
        { method: 'getTelemetry', label: 'Read telemetry' }
      ]
    }
  };
}

if (!isTemplateRegistered('tpl_lru_cache_factory')) {
  registerComponentTemplatePlugin({
    id: 'tpl_lru_cache_factory',
    name: 'LRU Cache (Factory Composed)',
    domain: 'coding',
    category: 'algorithmic',
    description: 'O(1) bounded LRU cache composed by the tool factory (Handlebars + Prettier).',
    params: LRU_PARAMS,
    defaultScore: 0.98,
    benchmarkFlops: 1200,
    complexity: 'O(1)',
    tags: ['data-structures', 'cache', 'factory-composed'],
    artifactKind: 'function',
    selfHost: {
      stateful: true,
      ctorParamIds: ['capacity'],
      methods: [
        { method: 'get', label: 'Read key' },
        { method: 'set', label: 'Write key' },
        { method: 'getTelemetry', label: 'Read telemetry' }
      ]
    },
    synthesizer: (userParams, _options) => {
      const recipe = makeRecipe(userParams);
      const composed = composeTool(recipe);
      return {
        sourceCode: composed.sourceCode,
        testSuiteCode: `const c = new LRUCache(2);
c.set('k1', 100);
c.set('k2', 200);
assert c.get('k1') === 100;
c.set('k3', 300);
assert c.get('k2') === undefined;
assert c.get('k1') === 100;
assert c.get('k3') === 300;`,
        entrypointName: composed.entrypointName,
        summary: composed.summary,
        selfHealingGuards: []
      };
    }
  });
}

// ---- Token bucket (factory composed) ----
const TB_PARAMS: ComponentTemplateParam[] = [
  { id: 'burstCapacity', label: 'Burst Capacity', type: 'number', default: 50, min: 5, max: 1000, step: 5, description: 'Maximum tokens permitted in bucket' },
  { id: 'refillRatePerSec', label: 'Refill Rate (tokens/sec)', type: 'number', default: 10, min: 1, max: 500, step: 1, description: 'Tokens regenerated per second' }
];

function makeTbRecipe(userParams: Record<string, any> = {}): ToolRecipe {
  const params = TB_PARAMS.map((p) => ({
    ...p,
    default: userParams[p.id] !== undefined ? userParams[p.id] : p.default
  }));
  return {
    id: 'tpl_token_bucket_factory',
    name: 'TokenBucketRateLimiter',
    domain: 'coding',
    category: 'infrastructure',
    description: 'Deterministic token bucket rate limiter composed by the tool factory.',
    params,
    chunks: ['chk_token_bucket_core'],
    snippets: [],
    tags: ['rate-limiter', 'factory-composed'],
    sizeBudget: 200,
    selfHost: {
      stateful: true,
      ctorParamIds: ['burstCapacity', 'refillRatePerSec'],
      methods: [
        { method: 'tryAcquire', label: 'Acquire tokens' },
        { method: 'getAvailableTokens', label: 'Read available tokens' }
      ]
    }
  };
}

if (!isTemplateRegistered('tpl_token_bucket_factory')) {
  registerComponentTemplatePlugin({
    id: 'tpl_token_bucket_factory',
    name: 'Token Bucket (Factory Composed)',
    domain: 'coding',
    category: 'infrastructure',
    description: 'Deterministic token bucket rate limiter composed by the tool factory.',
    params: TB_PARAMS,
    defaultScore: 0.99,
    benchmarkFlops: 800,
    complexity: 'O(1)',
    tags: ['rate-limiter', 'factory-composed'],
    artifactKind: 'function',
    selfHost: {
      stateful: true,
      ctorParamIds: ['burstCapacity', 'refillRatePerSec'],
      methods: [
        { method: 'tryAcquire', label: 'Acquire tokens' },
        { method: 'getAvailableTokens', label: 'Read available tokens' }
      ]
    },
    synthesizer: (userParams) => {
      const recipe = makeTbRecipe(userParams);
      const composed = composeTool(recipe);
      return {
        sourceCode: composed.sourceCode,
        testSuiteCode: `const tb = new TokenBucketRateLimiter(10, 5);
assert tb.tryAcquire(5) === true;
assert tb.tryAcquire(5) === true;
assert tb.tryAcquire(1) === false;
assert tb.getAvailableTokens() <= 10;`,
        entrypointName: composed.entrypointName,
        summary: composed.summary,
        selfHealingGuards: []
      };
    }
  });
}

// ---- HMAC sanitizer (factory composed) ----
const HMAC_PARAMS: ComponentTemplateParam[] = [];

function makeHmacRecipe(): ToolRecipe {
  return {
    id: 'tpl_hmac_sanitizer_factory',
    name: 'HMACMemorySanitizer',
    domain: 'cyber_defense',
    category: 'security',
    description: 'Constant-time memory sanitizer composed by the tool factory.',
    params: HMAC_PARAMS,
    chunks: ['chk_hmac_sanitizer_core'],
    snippets: [],
    tags: ['security', 'factory-composed'],
    sizeBudget: 200,
    selfHost: {
      stateful: false,
      methods: [
        { method: 'constantTimeCompare', label: 'Compare two byte buffers in constant time', argCoercions: ['uint8', 'uint8'] },
        { method: 'sanitizeBuffer', label: 'Sanitize a byte buffer', argCoercions: ['uint8'] }
      ]
    }
  };
}

if (!isTemplateRegistered('tpl_hmac_sanitizer_factory')) {
  registerComponentTemplatePlugin({
    id: 'tpl_hmac_sanitizer_factory',
    name: 'HMAC Sanitizer (Factory Composed)',
    domain: 'cyber_defense',
    category: 'security',
    description: 'Constant-time memory sanitizer composed by the tool factory.',
    params: HMAC_PARAMS,
    defaultScore: 1.0,
    benchmarkFlops: 1800,
    complexity: 'O(N)',
    tags: ['security', 'factory-composed'],
    artifactKind: 'function',
    selfHost: {
      stateful: false,
      methods: [
        { method: 'constantTimeCompare', label: 'Compare two byte buffers in constant time', argCoercions: ['uint8', 'uint8'] },
        { method: 'sanitizeBuffer', label: 'Sanitize a byte buffer', argCoercions: ['uint8'] }
      ]
    },
    synthesizer: () => {
      const recipe = makeHmacRecipe();
      const composed = composeTool(recipe);
      return {
        sourceCode: composed.sourceCode,
        testSuiteCode: `const b1 = new Uint8Array([10, 20, 30, 40]);
const b2 = new Uint8Array([10, 20, 30, 40]);
const b3 = new Uint8Array([10, 20, 30, 41]);
assert HMACMemorySanitizer.constantTimeCompare(b1, b2) === true;
assert HMACMemorySanitizer.constantTimeCompare(b1, b3) === false;
const clean = HMACMemorySanitizer.sanitizeBuffer(b1);
assert clean.length === 4;`,
        entrypointName: composed.entrypointName,
        summary: composed.summary,
        selfHealingGuards: []
      };
    }
  });
}

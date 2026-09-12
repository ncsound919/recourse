import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FORGE_AGENDA,
  forgeSpecById,
  forgeConfig,
  generateForgeSource,
  verifyForgeSource,
  attemptForgeSpec,
} from '../src/lib/capabilityForge';
import { setActiveProviderProfile } from '../src/lib/modelProvider';

// Axiom is an external autonomous-builder HTTP service (127.0.0.1:3198). It is
// mocked as a boundary so the forge's offline/Axiom fallback logic can be
// exercised deterministically without a live service.
vi.mock('../src/lib/axiomBridge.js', () => ({
  axiomReachable: vi.fn(async () => false),
  integrateAxiomTool: vi.fn(async () => ({ ok: false, error: 'mock-unused' })),
}));
import { axiomReachable, integrateAxiomTool } from '../src/lib/axiomBridge.js';

const ORIG = { ...process.env };

// --- controllable HTTP boundary ---------------------------------------------
let networkDown = false;
let modelReply = '';
let chatStatus: number | null = null; // if set, /chat/completions returns it
let chatFailuresRemaining = 0;

function fetchImpl(url: any, init?: any): Promise<Response> {
  const u = String(url);
  if (networkDown) return Promise.reject(new Error('network down'));
  if (u.endsWith('/models')) {
    return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
  }
  if (u.endsWith('/chat/completions')) {
    if (chatFailuresRemaining > 0) {
      chatFailuresRemaining--;
      return Promise.resolve(new Response('boom', { status: 500 }));
    }
    if (chatStatus !== null) {
      return Promise.resolve(new Response('boom', { status: chatStatus }));
    }
    const payload = JSON.stringify({ choices: [{ message: { content: modelReply } }] });
    return Promise.resolve(new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return Promise.resolve(new Response('{}', { status: 200 }));
}

function resetConfig() {
  networkDown = false;
  modelReply = '';
  chatStatus = null;
  chatFailuresRemaining = 0;
  (axiomReachable as any).mockResolvedValue(false);
  (integrateAxiomTool as any).mockResolvedValue({ ok: false, error: 'mock-unused' });
}

function setHappyEnv() {
  process.env.API_MODEL_BASE_URL = 'https://forge.test/v1';
  process.env.API_MODEL_NAME = 'forge-model';
  delete process.env.FORGE_MODEL_BASE_URL;
  delete process.env.FORGE_MODEL_NAME;
  delete process.env.FORGE_MODEL_API_KEY;
  delete process.env.FORGE_MODEL_TIMEOUT_MS;
  delete process.env.MODEL_BASE_URL;
  delete process.env.LOCAL_MODEL_BASE_URL;
}

const DEDUPE_CORRECT =
  'export function dedupeStable(arr) {\n' +
  '  const seen = new Set();\n' +
  '  const out = [];\n' +
  '  for (const x of arr) { if (!seen.has(x)) { seen.add(x); out.push(x); } }\n' +
  '  return out;\n' +
  '}';

const DEDUPE_WRONG = 'export function dedupeStable(arr) { return arr; }';

beforeEach(() => {
  vi.stubGlobal('fetch', fetchImpl as unknown as typeof fetch);
  setActiveProviderProfile('api'); // reset provider online-cache slot
  setHappyEnv();
  resetConfig();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIG };
  vi.clearAllMocks();
});

describe('forgeConfig resolution', () => {
  it('defaults to the API provider', () => {
    delete process.env.FORGE_MODEL_BASE_URL;
    delete process.env.API_MODEL_BASE_URL;
    delete process.env.MODEL_BASE_URL;
    delete process.env.API_MODEL_NAME;
    delete process.env.MODEL_NAME;
    delete process.env.MODEL_TIMEOUT_MS;
    const cfg = forgeConfig();
    expect(cfg.baseUrl).toBe('https://api.pgsgrove.com/v1');
    expect(cfg.model).toBe('deepseek-v4-flash-0731');
    expect(cfg.apiKey).toBe('');
    expect(cfg.timeoutMs).toBe(240000);
  });

  it('prefers FORGE_* over API_MODEL_* and MODEL_* and strips trailing slashes', () => {
    process.env.FORGE_MODEL_BASE_URL = 'https://forge.test/v1///';
    process.env.FORGE_MODEL_NAME = 'forge-name';
    process.env.FORGE_MODEL_API_KEY = 'forge-key';
    process.env.FORGE_MODEL_TIMEOUT_MS = '1234';
    process.env.API_MODEL_NAME = 'api-name';
    process.env.MODEL_NAME = 'model-name';
    const cfg = forgeConfig();
    expect(cfg.baseUrl).toBe('https://forge.test/v1');
    expect(cfg.model).toBe('forge-name');
    expect(cfg.apiKey).toBe('forge-key');
    expect(cfg.timeoutMs).toBe(1234);
  });

  it('falls back to API_MODEL_* then MODEL_* and MODEL_TIMEOUT_MS', () => {
    process.env.FORGE_MODEL_NAME = '';
    process.env.API_MODEL_NAME = 'api-model';
    process.env.MODEL_TIMEOUT_MS = '999';
    let cfg = forgeConfig();
    expect(cfg.model).toBe('api-model');
    expect(cfg.timeoutMs).toBe(999);

    process.env.API_MODEL_NAME = '';
    process.env.MODEL_NAME = 'plain-model';
    cfg = forgeConfig();
    expect(cfg.model).toBe('plain-model');
  });
});

describe('forgeSpecById', () => {
  it('looks up agenda items and returns undefined for unknown ids', () => {
    const spec = forgeSpecById('forge_dedupe_stable');
    expect(spec).toBeDefined();
    expect(spec!.name).toBe('dedupeStable');
    expect(forgeSpecById('nope')).toBeUndefined();
  });
});

describe('generateForgeSource', () => {
  it('reports offline honestly when the endpoint is unreachable', async () => {
    networkDown = true;
    const spec = FORGE_AGENDA[0];
    const r = await generateForgeSource(spec);
    expect(r.ok).toBe(false);
    expect(r.offline).toBe(true);
    expect(r.error).toContain('unreachable');
  });

  it('returns cleaned source on the happy path (fences stripped)', async () => {
    modelReply = '```js\n' + DEDUPE_CORRECT + '\n```';
    const r = await generateForgeSource(FORGE_AGENDA[0]);
    expect(r.ok).toBe(true);
    expect(r.source).toContain('function dedupeStable');
    expect(r.source).not.toContain('```');
  });

  it('uses the class system prompt for class specs', async () => {
    modelReply = 'export class LRUCache { constructor(c) { this.c = c; this.m = new Map(); } }';
    const spec = forgeSpecById('forge_lru_cache')!;
    const r = await generateForgeSource(spec);
    expect(r.ok).toBe(true);
    expect(r.source).toContain('class LRUCache');
  });

  it('uses a builder-overridden system prompt and temperature', async () => {
    modelReply = DEDUPE_CORRECT;
    const r = await generateForgeSource(FORGE_AGENDA[0], { systemPrompt: 'BE CONCISE.', temperature: 0.7 });
    expect(r.ok).toBe(true);
  });

  it('rejects a near-empty model reply honestly', async () => {
    modelReply = 'x';
    const r = await generateForgeSource(FORGE_AGENDA[0]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('near-empty');
  });

  it('surfaces a non-offline chat error (HTTP failure)', async () => {
    chatStatus = 500;
    const r = await generateForgeSource(FORGE_AGENDA[0]);
    expect(r.ok).toBe(false);
    expect(r.offline).not.toBe(true);
    expect(r.error).toContain('HTTP 500');
  });

  it('routes to the local profile and reports offline when no local model is configured', async () => {
    process.env.FORGE_MODEL_BASE_URL = 'http://127.0.0.1:11434/v1';
    const r = await generateForgeSource(FORGE_AGENDA[0]);
    expect(r.ok).toBe(false);
    expect(r.offline).toBe(true);
  });

  it('routes to the api profile when FORGE base URL is not the local port', async () => {
    process.env.FORGE_MODEL_BASE_URL = 'https://forge.test/v1';
    process.env.API_MODEL_BASE_URL = 'https://forge.test/v1';
    modelReply = DEDUPE_CORRECT;
    const r = await generateForgeSource(FORGE_AGENDA[0]);
    expect(r.ok).toBe(true);
  });
});

describe('verifyForgeSource', () => {
  it('passes a correct implementation and rejects a wrong one', () => {
    const spec = FORGE_AGENDA[0];
    expect(verifyForgeSource(DEDUPE_CORRECT, spec.refSuite).passed).toBe(true);
    expect(verifyForgeSource(DEDUPE_WRONG, spec.refSuite).passed).toBe(false);
  });
});

describe('attemptForgeSpec', () => {
  it('promotes a source that passes the reference suite on the first attempt', async () => {
    modelReply = DEDUPE_CORRECT;
    const out = await attemptForgeSpec(FORGE_AGENDA[0]);
    expect(out.ok).toBe(true);
    expect(out.source).toContain('function dedupeStable');
    expect(out.attemptsUsed).toBe(1);
    expect(out.verifyScore).toBe(1);
    expect(Array.isArray(out.verifyDetails)).toBe(true);
  });

  it('retries past a transient generate error and then succeeds', async () => {
    chatFailuresRemaining = 1; // first POST -> HTTP 500, second -> source
    modelReply = DEDUPE_CORRECT;
    const out = await attemptForgeSpec(FORGE_AGENDA[0], 3);
    expect(out.ok).toBe(true);
    expect(out.attemptsUsed).toBe(2);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0].note).toContain('generate error');
  });

  it('records honest failure when the generated source never passes', async () => {
    modelReply = DEDUPE_WRONG;
    const out = await attemptForgeSpec(FORGE_AGENDA[0], 3);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('failed');
    expect(out.attemptsUsed).toBe(3);
    expect(out.failures).toHaveLength(3);
  });

  it('falls back to the Axiom bridge and promotes on success when offline', async () => {
    networkDown = true;
    (axiomReachable as any).mockResolvedValue(true);
    (integrateAxiomTool as any).mockResolvedValue({
      ok: true,
      selfHosted: { sourceCode: DEDUPE_CORRECT },
    });
    const out = await attemptForgeSpec(FORGE_AGENDA[0]);
    expect(out.ok).toBe(true);
    expect(out.source).toContain('function dedupeStable');
    expect(out.verifyScore).toBe(1);
    expect(out.verifyDetails![0]).toContain('Axiom bridge');
  });

  it('records offline failure when the Axiom bridge itself fails', async () => {
    networkDown = true;
    (axiomReachable as any).mockResolvedValue(true);
    (integrateAxiomTool as any).mockResolvedValue({ ok: false, error: 'axiom boom' });
    const out = await attemptForgeSpec(FORGE_AGENDA[0]);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('offline');
    expect(out.failures.some((f) => f.note.includes('Axiom bridge failed'))).toBe(true);
  });

  it('records offline failure when Axiom is unreachable', async () => {
    networkDown = true;
    (axiomReachable as any).mockResolvedValue(false);
    const out = await attemptForgeSpec(FORGE_AGENDA[0]);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('offline');
  });
});

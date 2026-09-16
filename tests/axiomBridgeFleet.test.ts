import { describe, it, expect, vi, afterEach } from 'vitest';
import { axiomBridgeStatus, dispatchAxiomRepair, launchAxiomLoop, waitForAxiomLoop } from '../src/lib/axiomBridge.js';

const BRIDGE = 'http://127.0.0.1:3198/api/recourse/bridge/repair';

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('axiomBridgeStatus', () => {
  it('reports online + the configured auth posture', async () => {
    vi.stubEnv('AXIOM_API_TOKEN', 'pre-minted');
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ status: 'ok' })));
    const s = await axiomBridgeStatus();
    expect(s.online).toBe(true);
    expect(s.auth).toBe('token');
    expect(s.url).toContain('3198');
  });

  it('reports honest offline + auth none', async () => {
    vi.stubEnv('AXIOM_API_TOKEN', '');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const s = await axiomBridgeStatus();
    expect(s.online).toBe(false);
    expect(s.auth).toBe('none');
  });
});

describe('dispatchAxiomRepair', () => {
  it('POSTs findings to the bridge repair route with a bearer token', async () => {
    vi.stubEnv('AXIOM_API_TOKEN', 'tok-123');
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(BRIDGE);
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
      const body = JSON.parse(String(init?.body));
      expect(body.targetDir).toBe('C:/repo');
      expect(body.findings[0]).toEqual({ slug: 'degraded', name: 'Degraded tools', weaknessScore: 70, reasons: ['not healthy'], proposedAction: undefined });
      expect(body.maxIterations).toBe(4);
      return okJson({ ok: true, id: 'proj_xyz', maxIterations: 4 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await dispatchAxiomRepair({
      targetDir: 'C:/repo',
      maxIterations: 4,
      findings: [{ slug: 'degraded', name: 'Degraded tools', weaknessScore: 70, reasons: ['not healthy'] }],
    });
    expect(r).toEqual({ ok: true, id: 'proj_xyz', maxIterations: 4 });
  });

  it('surfaces the server error on a non-2xx response', async () => {
    vi.stubEnv('AXIOM_API_TOKEN', 'tok');
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ error: 'outside workspace' }, 403)));
    const r = await dispatchAxiomRepair({ findings: [] });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.error).toBe('outside workspace');
  });

  it('degrades honestly when Axiom is unreachable', async () => {
    vi.stubEnv('AXIOM_API_TOKEN', 'tok');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await dispatchAxiomRepair({ findings: [] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('ECONNREFUSED');
  });
});

describe('launchAxiomLoop', () => {
  it('POSTs goal + targetDir and returns the loop id', async () => {
    vi.stubEnv('AXIOM_API_TOKEN', 'tok');
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:3198/api/project/run');
      const body = JSON.parse(String(init?.body));
      expect(body.goal).toBe('do x');
      expect(body.targetDir).toBe('C:/ws/repo');
      expect(body.mode).toBe('existing');
      return okJson({ ok: true, id: 'proj_1', maxIterations: 4 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await launchAxiomLoop({ goal: 'do x', targetDir: 'C:/ws/repo', maxIterations: 4 });
    expect(r).toEqual({ ok: true, id: 'proj_1', maxIterations: 4 });
  });

  it('surfaces a 403 workspace refusal', async () => {
    vi.stubEnv('AXIOM_API_TOKEN', 'tok');
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ error: 'path outside workspace root' }, 403)));
    const r = await launchAxiomLoop({ goal: 'g', targetDir: 'C:/nope' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.error).toContain('outside workspace');
  });
});

describe('waitForAxiomLoop', () => {
  it('polls until the status leaves running', async () => {
    vi.stubEnv('AXIOM_API_TOKEN', 'tok');
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(okJson({ status: 'running', iteration: 1 }))
        .mockResolvedValueOnce(okJson({ status: 'done', iteration: 2 })),
    );
    const r = await waitForAxiomLoop('proj_1', { pollMs: 1, timeoutMs: 5000 });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('done');
    expect(r.iterations).toBe(2);
  });

  it('times out honestly when the loop never finishes', async () => {
    vi.stubEnv('AXIOM_API_TOKEN', 'tok');
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ status: 'running' })));
    const r = await waitForAxiomLoop('proj_x', { pollMs: 1, timeoutMs: 20 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('timed out');
  });
});

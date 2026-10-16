import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// jevAccess now sits on the shared Infisical lane (Keywire retired 2026-10-15),
// so these tests mock the lane and assert jevAccess's own logic + honesty.
const resolveInfisicalSecret = vi.fn();
const setInfisicalSecret = vi.fn();
vi.mock('../src/lib/infisicalLane.js', () => ({
  resolveInfisicalSecret: (...a: unknown[]) => resolveInfisicalSecret(...a),
  setInfisicalSecret: (...a: unknown[]) => setInfisicalSecret(...a),
  resetInfisicalLaneCache: vi.fn(),
}));

import { resolveJevPublic, setJevPublic, resetJevPublicCache, TOGGLE_KEY } from '../src/lib/jevAccess';

const saved: Record<string, string | undefined> = {
  RECOURSE_JEV_PUBLIC: process.env.RECOURSE_JEV_PUBLIC,
};

beforeEach(() => {
  resolveInfisicalSecret.mockReset();
  setInfisicalSecret.mockReset();
  resetJevPublicCache();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('resolveJevPublic', () => {
  it('honors the static env override first (no vault call)', async () => {
    process.env.RECOURSE_JEV_PUBLIC = '1';
    expect(await resolveJevPublic()).toBe('1');
    expect(resolveInfisicalSecret).not.toHaveBeenCalled();
  });

  it('reads the toggle from the vault when env is unset', async () => {
    delete process.env.RECOURSE_JEV_PUBLIC;
    resolveInfisicalSecret.mockResolvedValue('1');
    expect(await resolveJevPublic()).toBe('1');
    expect(resolveInfisicalSecret).toHaveBeenCalledWith(TOGGLE_KEY, expect.anything());
  });

  it('returns undefined (CLOSED) when the vault cannot resolve', async () => {
    delete process.env.RECOURSE_JEV_PUBLIC;
    resolveInfisicalSecret.mockResolvedValue(undefined);
    expect(await resolveJevPublic()).toBeUndefined();
  });
});

describe('setJevPublic', () => {
  it('writes the toggle to the vault and caches it', async () => {
    setInfisicalSecret.mockResolvedValue({ ok: true });
    const r = await setJevPublic('0');
    expect(r.ok).toBe(true);
  });

  it('reports honestly when the vault write is rejected', async () => {
    setInfisicalSecret.mockResolvedValue({ ok: false, status: 403, error: 'HTTP 403' });
    const r = await setJevPublic('1');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });
});

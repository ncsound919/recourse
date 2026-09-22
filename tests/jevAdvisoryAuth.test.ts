import { describe, expect, it, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { requireJevAdvisoryAuth } from '../src/lib/mutationAuth';

const saved = {
  RECOURSE_API_SECRET: process.env.RECOURSE_API_SECRET,
  RECOURSE_JEV_PUBLIC: process.env.RECOURSE_JEV_PUBLIC,
  KEYWIRE_URL: process.env.KEYWIRE_URL,
};

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function req(auth?: string): Request {
  return { headers: auth ? { authorization: `Bearer ${auth}` } : {} } as unknown as Request;
}

function res(): Response & { statusCode: number; body: unknown } {
  const r = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  } as unknown as Response & { statusCode: number; body: unknown };
  return r;
}

describe('requireJevAdvisoryAuth (paid-call GET guard)', () => {
  it('stays open when no RECOURSE_API_SECRET is configured (local dev)', async () => {
    delete process.env.RECOURSE_API_SECRET;
    delete process.env.RECOURSE_JEV_PUBLIC;
    expect(await requireJevAdvisoryAuth(req(), res())).toBe(true);
  });

  it('fails closed (401) when a secret is configured, not presented, and the toggle is off', async () => {
    process.env.RECOURSE_API_SECRET = 's3cret';
    process.env.RECOURSE_JEV_PUBLIC = '0'; // explicit closed (no Keywire fetch)
    const r = res();
    expect(await requireJevAdvisoryAuth(req(), r)).toBe(false);
    expect(r.statusCode).toBe(401);
  });

  it('allows when the secret is presented', async () => {
    process.env.RECOURSE_API_SECRET = 's3cret';
    process.env.RECOURSE_JEV_PUBLIC = '0';
    expect(await requireJevAdvisoryAuth(req('s3cret'), res())).toBe(true);
  });

  it('allows public access when the toggle is on', async () => {
    process.env.RECOURSE_API_SECRET = 's3cret';
    process.env.RECOURSE_JEV_PUBLIC = '1';
    expect(await requireJevAdvisoryAuth(req(), res())).toBe(true);
  });
});
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  matchPathGlob,
  classifySelfModTarget,
  evaluateSelfModification,
  runHarnessChecks,
  makeHarnessGate,
  applySelfModification,
} from '../src/lib/selfModification';

afterEach(() => {
  delete process.env.RECOURSE_HARNESS_GATE_CHECKS;
});

describe('self-modification classification', () => {
  it('globs across separators only for **', () => {
    expect(matchPathGlob('.github/**', '.github/workflows/ci.yml')).toBe(true);
    expect(matchPathGlob('src/**/*.ts', 'src/lib/a/b.ts')).toBe(true);
    expect(matchPathGlob('src/*.ts', 'src/lib/a.ts')).toBe(false);
    expect(matchPathGlob('**/*.md', 'docs/deep/a.md')).toBe(true);
    expect(matchPathGlob('README.md', 'README.md')).toBe(true);
    expect(matchPathGlob('server.ts', 'src/server.ts')).toBe(true); // basename segment match
  });

  it('classifies safety, harness and auto targets', () => {
    for (const f of ['.github/workflows/ci.yml', 'src/lib/policy.ts', 'src/autopilot/preMergeGate.ts', '.env', 'package-lock.json', 'src/lib/selfModification.ts']) {
      expect(classifySelfModTarget(f), f).toBe('safety');
    }
    for (const f of ['server.ts', 'src/lib/foo.ts', 'src/components/X.tsx', 'package.json', 'tsconfig.json']) {
      expect(classifySelfModTarget(f), f).toBe('harness');
    }
    for (const f of ['README.md', 'docs/a/b.md', 'data/reports/x.json']) {
      expect(classifySelfModTarget(f), f).toBe('auto');
    }
  });

  it('denies safety targets absolutely, even with autoApprove', () => {
    const d = evaluateSelfModification({ file: '.github/workflows/ci.yml', autoApprove: true });
    expect(d.allowed).toBe(false);
    expect(d.requiresApproval).toBe(false);
    expect(d.targetClass).toBe('safety');
  });

  it('requires approval for harness targets unless unattended mode is armed', () => {
    const gated = evaluateSelfModification({ file: 'server.ts' });
    expect(gated.allowed).toBe(true);
    expect(gated.requiresApproval).toBe(true);

    const armed = evaluateSelfModification({ file: 'server.ts', autoApprove: true });
    expect(armed.allowed).toBe(true);
    expect(armed.requiresApproval).toBe(false);

    const auto = evaluateSelfModification({ file: 'README.md' });
    expect(auto.allowed).toBe(true);
    expect(auto.requiresApproval).toBe(false);
  });
});

describe('composite harness gate', () => {
  it('runs the configured checks and short-circuits on failure', async () => {
    const runner = vi.fn(async (_cmd: string, args: string[]) => ({ code: 0, stdout: args.join(' '), stderr: '' }));
    const ok = await runHarnessChecks({ checks: ['typecheck', 'lint'], runner, cwd: '/repo' });
    expect(ok.ok).toBe(true);
    expect(ok.checks.map((c) => c.name)).toEqual(['typecheck', 'lint']);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls[0][1]).toEqual(['run', 'typecheck']);

    const failing = vi.fn(async (_cmd: string, args: string[]) => ({ code: args.includes('lint') ? 1 : 0, stdout: '', stderr: 'lint boom' }));
    const bad = await runHarnessChecks({ checks: ['typecheck', 'lint', 'test'], runner: failing, cwd: '/repo' });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/lint failed/);
    expect(bad.checks).toHaveLength(2); // test never ran
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('reads default checks from env', async () => {
    process.env.RECOURSE_HARNESS_GATE_CHECKS = 'typecheck, lint , test';
    const runner = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
    const r = await runHarnessChecks({ runner, cwd: '/repo' });
    expect(r.ok).toBe(true);
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it('makeHarnessGate returns a BootGreenGate result', async () => {
    const gate = makeHarnessGate({ checks: ['typecheck'], runner: async () => ({ code: 1, stdout: '', stderr: 'nope' }) });
    expect(await gate({ file: 'server.ts', source: '', root: '/repo' })).toEqual({ ok: false, error: 'typecheck failed' });

    const okGate = makeHarnessGate({ checks: ['typecheck'], runner: async () => ({ code: 0, stdout: '', stderr: '' }) });
    expect((await okGate({ file: 'server.ts', source: '', root: '/repo' })).ok).toBe(true);
  });
});

describe('gated application', () => {
  const patch = { driverId: 'deterministic-brain', file: 'server.ts', source: 'export {};\n' };

  it('denies safety targets without touching the verifier', async () => {
    const apply = vi.fn();
    const r = await applySelfModification({ patch: { ...patch, file: 'src/lib/policy.ts' }, apply });
    expect(r.status).toBe('denied');
    expect(apply).not.toHaveBeenCalled();
  });

  it('withholds harness targets until approved', async () => {
    const apply = vi.fn();
    const r = await applySelfModification({ patch, apply });
    expect(r.status).toBe('awaiting_approval');
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies when approval is given or unattended mode is armed', async () => {
    const applied = { applied: true as const, file: 'server.ts', hash: 'h', verified: 'sandbox + lint passed' };
    const apply = vi.fn(async () => applied);
    const approved = await applySelfModification({ patch, apply, approvalApproved: true });
    expect(approved.status).toBe('applied');
    expect(approved.patch).toEqual(applied);

    const armed = await applySelfModification({ patch, apply, autoApprove: true });
    expect(armed.status).toBe('applied');
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('reports a rejected patch honestly', async () => {
    const apply = vi.fn(async () => ({ applied: false as const, file: 'server.ts', error: 'sandbox suite failed' }));
    const r = await applySelfModification({ patch, apply, autoApprove: true });
    expect(r.status).toBe('rejected');
    expect(r.reason).toMatch(/sandbox suite failed/);
  });
});

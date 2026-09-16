import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MetricsRegistry } from '../src/lib/metrics';
import { globMatch, evaluatePolicy, defaultPolicyRules, openPolicyEngine } from '../src/lib/policy';
import { openApprovalStore } from '../src/lib/approvals';
import { runDeployPlan, waitForHealthy, type CommandRunner, type DeployPlan } from '../src/lib/deploy';

const dirs: string[] = [];
function freshFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-w2-'));
  dirs.push(dir);
  return path.join(dir, name);
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  vi.unstubAllGlobals();
});

describe('metrics registry', () => {
  it('renders counters, gauges and histograms in Prometheus format', () => {
    const reg = new MetricsRegistry();
    const c = reg.counter('recourse_jobs_total', 'jobs run');
    c.inc({ kind: 'forge' });
    c.inc({ kind: 'forge' }, 2);
    reg.gauge('recourse_queue_depth', 'depth').set(5, { group: 'autonomy' });
    const h = reg.histogram('recourse_job_seconds', 'job latency', [0.1, 1]);
    h.observe(0.05);
    h.observe(2);
    const out = reg.render();
    expect(out).toContain('# TYPE recourse_jobs_total counter');
    expect(out).toContain('recourse_jobs_total{kind="forge"} 3');
    expect(out).toContain('recourse_queue_depth{group="autonomy"} 5');
    expect(out).toContain('recourse_job_seconds_bucket{le="0.1"} 1');
    expect(out).toContain('recourse_job_seconds_bucket{le="1"} 1');
    expect(out).toContain('recourse_job_seconds_bucket{le="+Inf"} 2');
    expect(out).toContain('recourse_job_seconds_count 2');
    expect(out).toContain('recourse_job_seconds_sum 2.05');
  });

  it('escapes label values', () => {
    const reg = new MetricsRegistry();
    reg.counter('m', 'h').inc({ note: 'a"b\\c' });
    expect(reg.render()).toContain('note="a\\"b\\\\c"');
  });
});

describe('policy engine', () => {
  it('glob match', () => {
    expect(globMatch('deploy.*', 'deploy.run')).toBe(true);
    expect(globMatch('*spend*', 'wallet.spend')).toBe(true);
    expect(globMatch('read', 'write')).toBe(false);
  });

  it('is most-restrictive-first and denies unmatched actions', () => {
    const rules = defaultPolicyRules();
    expect(evaluatePolicy({ kind: 'read' }, rules).allowed).toBe(true);
    expect(evaluatePolicy({ kind: 'deploy.run' }, rules).requiresApproval).toBe(true);
    expect(evaluatePolicy({ kind: 'wallet.spend', cents: 500_000 }, rules).effect).toBe('deny');
    expect(evaluatePolicy({ kind: 'totally.unknown' }, rules).effect).toBe('deny');
    // Deny beats an allow on the same action.
    const d = evaluatePolicy({ kind: 'wallet.spend', cents: 200_000 }, [
      { id: 'a', effect: 'allow', match: { kind: '*spend*' } },
      { id: 'd', effect: 'deny', match: { kind: '*spend*', minCents: 100_000 } },
    ]);
    expect(d.effect).toBe('deny');
    expect(d.ruleId).toBe('d');
  });

  it('persists rule changes durably', () => {
    const file = freshFile('policy.json');
    const engine = openPolicyEngine(file);
    engine.setRules([{ id: 'only-allow-ping', effect: 'allow', match: { kind: 'ping' } }]);
    const reopened = openPolicyEngine(file);
    expect(reopened.evaluate({ kind: 'ping' }).allowed).toBe(true);
    expect(reopened.evaluate({ kind: 'deploy.run' }).effect).toBe('deny');
  });
});

describe('approval store', () => {
  it('queues, decides, and persists approvals', () => {
    const file = freshFile('approvals.json');
    const store = openApprovalStore(file);
    const req = store.request({ action: { kind: 'deploy.run', target: 'recourse' }, requestedBy: 'agent' });
    expect(req.status).toBe('pending');
    expect(store.pendingCount()).toBe(1);

    const decided = store.decide(req.id, 'approved', 'operator', 'looks good');
    expect('error' in decided).toBe(false);
    if ('error' in decided) return;
    expect(decided.status).toBe('approved');
    expect(decided.decidedBy).toBe('operator');
    expect(store.pendingCount()).toBe(0);

    // Re-deciding is refused.
    const again = store.decide(req.id, 'rejected');
    expect('error' in again).toBe(true);

    const reopened = openApprovalStore(file);
    expect(reopened.get(req.id)?.status).toBe('approved');
  });
});

describe('deploy plan', () => {
  const plan = (): DeployPlan => ({
    service: 'recourse',
    cwd: '/tmp',
    steps: [
      { name: 'build', run: async (ctx) => { const r = await ctx.run(['docker', 'build'], { cwd: ctx.cwd }); if (!r.ok) throw new Error('build failed'); } },
      { name: 'up', run: async (ctx) => { const r = await ctx.run(['docker', 'up'], { cwd: ctx.cwd }); if (!r.ok) throw new Error('up failed'); } },
    ],
    rollback: [{ name: 'rollback', run: async (ctx) => { await ctx.run(['docker', 'down'], { cwd: ctx.cwd }); } }],
  });

  it('runs to completion on success', async () => {
    const calls: string[] = [];
    const runner: CommandRunner = async (argv) => { calls.push(argv.join(' ')); return { ok: true, stdout: '', stderr: '', code: 0 }; };
    const res = await runDeployPlan(plan(), runner, { now: () => 0 });
    expect(res.ok).toBe(true);
    expect(res.steps.every((s) => s.ok)).toBe(true);
    expect(calls).toEqual(['docker build', 'docker up']);
  });

  it('rolls back when a step fails', async () => {
    const calls: string[] = [];
    const runner: CommandRunner = async (argv) => {
      calls.push(argv.join(' '));
      return { ok: argv[1] === 'up', stdout: '', stderr: 'boom', code: argv[1] === 'up' ? 0 : 1 };
    };
    const res = await runDeployPlan(plan(), runner, { now: () => 0 });
    expect(res.ok).toBe(false);
    expect(res.rolledBack).toBe(true);
    expect(calls).toContain('docker down');
    expect(res.error).toContain('build failed');
  });

  it('dry run plans without executing', async () => {
    const runner = vi.fn();
    const res = await runDeployPlan(plan(), runner as unknown as CommandRunner, { dryRun: true });
    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(true);
    expect(runner).not.toHaveBeenCalled();
  });

  it('health gate reports failure after exhausting attempts', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }));
    const h = await waitForHealthy('http://x/health', { attempts: 2, intervalMs: 0 });
    expect(h.ok).toBe(false);
    expect(h.detail).toContain('503');
  });
});

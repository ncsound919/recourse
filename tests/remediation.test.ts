import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPolicyEngine } from '../src/lib/policy';
import { openApprovalStore } from '../src/lib/approvals';
import {
  attemptRemediation,
  resolveRemediationService,
  parseRemediationMap,
} from '../src/lib/remediation';
import type { CommandRunner } from '../src/lib/deploy';

const dirs: string[] = [];
function freshFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-rem-'));
  dirs.push(dir);
  return path.join(dir, name);
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function engineWith(effect: 'allow' | 'deny' | 'require_approval') {
  const engine = openPolicyEngine(freshFile('policy.json'));
  engine.setRules([{ id: 'r', effect, match: { kind: 'deploy.run' } }]);
  return engine;
}

const okRunner = (calls: string[]): CommandRunner => async (argv) => {
  calls.push(argv.join(' '));
  return { ok: true, stdout: '', stderr: '', code: 0 };
};
const failRunner = (): CommandRunner => async () => ({ ok: false, stdout: '', stderr: 'docker: not found', code: 127 });

const baseReq = { issueId: 'oncology:host', service: 'overlay-oncology', cwd: '/tmp', reason: 'host unreachable' };

describe('remediation service mapping', () => {
  it('resolves only explicitly configured services', () => {
    expect(parseRemediationMap('{"oncology:host":"overlay-oncology"}')).toEqual({ 'oncology:host': 'overlay-oncology' });
    expect(parseRemediationMap('not json')).toBeNull();
    expect(parseRemediationMap(undefined)).toBeNull();
    expect(resolveRemediationService('oncology:host', { 'oncology:host': 'overlay-oncology' })).toBe('overlay-oncology');
    expect(resolveRemediationService('unknown:id', { 'oncology:host': 'overlay-oncology' })).toBeNull();
    expect(resolveRemediationService('oncology:host', null)).toBeNull();
  });
});

describe('attemptRemediation', () => {
  it('denies when policy denies, without queueing or running', async () => {
    const approvals = openApprovalStore(freshFile('approvals.json'));
    const calls: string[] = [];
    const out = await attemptRemediation(baseReq, { policy: engineWith('deny'), approvals, runner: okRunner(calls) });
    expect(out.status).toBe('denied');
    expect(approvals.pendingCount()).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('queues an approval and does not run until approved', async () => {
    const approvals = openApprovalStore(freshFile('approvals.json'));
    const calls: string[] = [];
    const first = await attemptRemediation(baseReq, { policy: engineWith('require_approval'), approvals, runner: okRunner(calls) });
    expect(first.status).toBe('pending_approval');
    expect(first.approvalId).toBeDefined();
    expect(calls).toHaveLength(0);

    // Not yet approved: still no execution.
    const still = await attemptRemediation(baseReq, { policy: engineWith('require_approval'), approvals, runner: okRunner(calls) });
    expect(still.status).toBe('pending_approval');
    expect(calls).toHaveLength(0);

    // Approve, then run with the approval id.
    approvals.decide(first.approvalId!, 'approved', 'operator');
    const run = await attemptRemediation(
      { ...baseReq, approvalId: first.approvalId },
      { policy: engineWith('require_approval'), approvals, runner: okRunner(calls) },
    );
    expect(run.status).toBe('applied');
    expect(run.feedback.outcome).toBe('win');
    expect(calls).toEqual(['docker compose restart overlay-oncology']);
  });

  it('applies directly when policy allows, using restart by default', async () => {
    const approvals = openApprovalStore(freshFile('approvals.json'));
    const calls: string[] = [];
    const out = await attemptRemediation(baseReq, { policy: engineWith('allow'), approvals, runner: okRunner(calls) });
    expect(out.status).toBe('applied');
    expect(out.feedback.outcome).toBe('win');
    expect(calls[0]).toContain('docker compose restart');
  });

  it('reports a failed remediation as a loss (feeds escalation)', async () => {
    const approvals = openApprovalStore(freshFile('approvals.json'));
    const out = await attemptRemediation(baseReq, { policy: engineWith('allow'), approvals, runner: failRunner() });
    expect(out.status).toBe('failed');
    expect(out.feedback.outcome).toBe('loss');
    expect(out.reason).toMatch(/restart failed/);
  });

  it('uses a redeploy (build + up) plan when requested', async () => {
    const approvals = openApprovalStore(freshFile('approvals.json'));
    const calls: string[] = [];
    const out = await attemptRemediation(
      { ...baseReq, kind: 'redeploy' },
      { policy: engineWith('allow'), approvals, runner: okRunner(calls) },
    );
    expect(out.status).toBe('applied');
    expect(calls).toEqual(['docker compose build overlay-oncology', 'docker compose up -d overlay-oncology']);
  });
});

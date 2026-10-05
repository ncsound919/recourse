import { describe, it, expect } from 'vitest';

import { nightlyVerdict } from '../scripts/nightly-self-improvement';
import type { LoopOutcome } from '../src/autopilot/loopStateMachine';

function base(): LoopOutcome {
  return {
    state: { status: 'idle' },
    context: {
      profileSlug: 'testbiz', scorecard: null, queue: null,
      currentProposal: null, prState: null, checkpoint: null,
    },
  };
}

describe('nightlyVerdict', () => {
  it('fails when every proposal was skipped', () => {
    const skipped = [
      { ...base(), skipped: [{ gapId: 'g1', reason: 'planner_unavailable' }] },
      { ...base(), skipped: [{ gapId: 'g2', reason: 'planner_invalid' }] },
    ];
    const verdict = nightlyVerdict(skipped);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('skipped');
  });

  it('fails when nothing merged a non-doc file', () => {
    // A proposal was selected and gated, but it is a markdown stub.
    const docsOnly: LoopOutcome = {
      ...base(),
      context: {
        ...base().context,
        currentProposal: {
          id: 'p', gapId: 'g', tier: 'A', title: 't', description: 'd',
          files: [{ path: 'docs/upgrades/x.md', action: 'create', content: 'stub' }],
          expectedScoreDelta: {}, generatedAt: new Date().toISOString(),
          requiresSandboxVerify: false,
        },
      },
    };
    const verdict = nightlyVerdict([docsOnly]);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('non-doc');
  });

  it('passes when at least one outcome carries non-doc files', () => {
    const merged: LoopOutcome = {
      ...base(),
      state: { status: 'pr_open', prNumber: 7 },
      context: {
        ...base().context,
        currentProposal: {
          id: 'p', gapId: 'g', tier: 'A', title: 't', description: 'd',
          files: [{ path: 'src/sanitize.ts', action: 'create', content: 'export const a = 1;' }],
          expectedScoreDelta: {}, generatedAt: new Date().toISOString(),
          requiresSandboxVerify: true,
        },
      },
    };
    expect(nightlyVerdict([merged]).ok).toBe(true);
  });

  it('fails on zero outcomes rather than calling that a pass', () => {
    const verdict = nightlyVerdict([]);
    expect(verdict.ok).toBe(false);
  });
});

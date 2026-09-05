import { describe, it, expect } from 'vitest';
import {
  SystemSnapshot,
  diffSnapshots,
  snapshotFingerprint,
  renderUpgradeMarkdown,
  renderPlainLanguageSummary,
  plainToolLine,
  toolKindLabel,
} from '../src/lib/systemDiff';

function tool(name: string, hash: string, extra: any = {}): any {
  return {
    name,
    domain: 'coding',
    version: '1.0.0',
    hash,
    score: 0.9,
    passed: true,
    healthStatus: 'healthy',
    selfHosted: false,
    ...extra,
  };
}

function snap(over: any = {}): SystemSnapshot {
  return {
    label: 'test',
    ts: 1,
    gen: 1,
    tools: [],
    capabilities: [],
    benchmarkSolved: null,
    selfhostedHealthy: 0,
    selfhostedTotal: 0,
    ...over,
  };
}

describe('system diff', () => {
  it('fingerprint changes only when content changes', () => {
    const a = snap({ tools: [tool('x', 'h1')] });
    const b = snap({ tools: [tool('x', 'h1')] });
    const c = snap({ tools: [tool('x', 'h2')] });
    expect(snapshotFingerprint(a)).toBe(snapshotFingerprint(b));
    expect(snapshotFingerprint(a)).not.toBe(snapshotFingerprint(c));
  });

  it('classifies an upgraded tool with old vs new state', () => {
    const oldS = snap({ tools: [tool('x', 'h1', { version: '1.0.0', score: 0.8 })] });
    const newS = snap({ tools: [tool('x', 'h2', { version: '1.0.1', score: 0.95 })] });
    const diff = diffSnapshots(oldS, newS);
    expect(diff.upgradedTools).toHaveLength(1);
    const u = diff.upgradedTools[0];
    expect(u.old?.hash).toBe('h1');
    expect(u.next?.hash).toBe('h2');
    expect(u.old?.score).toBe(0.8);
    expect(u.next?.score).toBe(0.95);
    expect(diff.totals).toEqual({ before: 1, after: 1 });
  });

  it('classifies added/removed tools', () => {
    const oldS = snap({ tools: [tool('a', 'h1')] });
    const newS = snap({ tools: [tool('a', 'h1'), tool('b', 'h2')] });
    const diff = diffSnapshots(oldS, newS);
    expect(diff.addedTools).toHaveLength(1);
    expect(diff.addedTools[0].name).toBe('b');
    expect(diff.removedTools).toHaveLength(0);
  });

  it('detects a health-only change when hash is unchanged', () => {
    const oldS = snap({ tools: [tool('x', 'h1', { passed: true, selfHosted: false, healthStatus: 'healthy' })] });
    const newS = snap({ tools: [tool('x', 'h1', { passed: true, selfHosted: true, healthStatus: 'healthy' })] });
    const diff = diffSnapshots(oldS, newS);
    expect(diff.healthChangedTools).toHaveLength(1);
    expect(diff.upgradedTools).toHaveLength(0);
    expect(diff.healthChangedTools[0].next?.selfHosted).toBe(true);
  });

  it('reports capability (dogfood) adoption deltas', () => {
    const oldS = snap({ capabilities: [{ capability: 'provenance_merkle', source: 'builtin' }] });
    const newS = snap({
      capabilities: [{ capability: 'provenance_merkle', source: 'selfhosted', toolName: 'm1', score: 0.99 }],
    });
    const diff = diffSnapshots(oldS, newS);
    expect(diff.capabilityChanges).toHaveLength(1);
    expect(diff.capabilityChanges[0].to).toContain('m1');
  });

  it('renders a truthful markdown summary incl. a noop note when nothing changed', () => {
    const oldS = snap({ tools: [tool('x', 'h1')] });
    const same = snap({ tools: [tool('x', 'h1')] });
    const noop = renderUpgradeMarkdown(diffSnapshots(oldS, same), { fromLabel: 'boot', toLabel: 'now' });
    expect(noop).toContain('No material change');
    const diff = diffSnapshots(oldS, snap({ tools: [tool('x', 'h2', { score: 0.98 })] }));
    const md = renderUpgradeMarkdown(diff, { fromLabel: 'boot', toLabel: 'now' });
    expect(md).toContain('Upgraded tools');
    expect(md).toContain('x');
  });
});

describe('plain-language upgrade summary', () => {
  it('explains additions and upgrades in everyday terms with no hashes/scores', () => {
    const oldS = snap({ tools: [tool('solver', 'h1', { domain: 'math', version: '1.0.0' })], benchmarkSolved: 4 });
    const newS = snap({
      tools: [
        tool('solver', 'h2', { domain: 'math', version: '1.0.1' }),
        tool('CODI_CYCLOMATIC_481c', 'h3', { domain: 'coding' }),
        tool('BIOT_GC_9e0f', 'h4', { domain: 'biotech', passed: false, healthStatus: 'degraded' }),
      ],
      benchmarkSolved: 5,
      selfhostedHealthy: 2,
      selfhostedTotal: 2,
    });
    const diff = diffSnapshots(oldS, newS);
    const describe = (n: string) =>
      ({ solver: 'a root-finding solver', CODI_CYCLOMATIC_481c: 'a code-complexity checker', BIOT_GC_9e0f: 'a DNA sequence analyzer' })[n] ?? n;
    const out = renderPlainLanguageSummary(diff, { describe });
    expect(out).toContain('plain terms');
    expect(out).toContain('Added');
    expect(out).toContain('a code-complexity checker');
    expect(out).toContain('biology / drug-discovery logic');
    expect(out).toContain('a DNA sequence analyzer');
    expect(out).toContain('Improved');
    expect(out).toContain('a root-finding solver');
    expect(out).not.toMatch(/h[1-4]/);
    expect(out).toContain('1 more external benchmark problem');
  });

  it('says plainly when nothing material changed', () => {
    const s = snap({ tools: [tool('x', 'h1')] });
    const out = renderPlainLanguageSummary(diffSnapshots(s, s));
    expect(out).toContain('no measurable change');
  });

  it('derives a human tool label from the name kind when no description given', () => {
    expect(plainToolLine('added', 'QUAN_QUBIT_8f62', 'quantum_sim')).toContain('quantum-computing simulations');
    expect(toolKindLabel('CODI_CYCLOMATIC_481c')).toContain('code-complexity');
  });
});

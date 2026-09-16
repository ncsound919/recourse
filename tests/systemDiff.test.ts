import { describe, it, expect } from 'vitest';
import {
  type SystemSnapshot,
  type SystemDiff,
  diffSnapshots,
  snapshotFingerprint,
  renderUpgradeMarkdown,
  renderPlainLanguageSummary,
  plainToolLine,
  toolKindLabel,
} from '../src/lib/systemDiff.js';

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

function emptyDiff(over: Partial<SystemDiff> = {}): SystemDiff {
  return {
    addedTools: [],
    removedTools: [],
    upgradedTools: [],
    healthChangedTools: [],
    capabilityChanges: [],
    benchmarkSolvedDelta: null,
    selfhostedDelta: 0,
    totals: { before: 0, after: 0 },
    ...over,
  };
}

describe('snapshotFingerprint', () => {
  it('is stable for identical content and order-independent', () => {
    const a = snap({ tools: [tool('x', 'h1'), tool('y', 'h2')], capabilities: [{ capability: 'c', source: 'builtin' }] });
    const b = snap({ tools: [tool('y', 'h2'), tool('x', 'h1')], capabilities: [{ capability: 'c', source: 'builtin' }] });
    expect(snapshotFingerprint(a)).toBe(snapshotFingerprint(b));
  });

  it('changes when a tool hash, pass flag, score, capability, benchmark, or selfhost count changes', () => {
    const base = snap({ tools: [tool('x', 'h1')] });
    expect(snapshotFingerprint(base)).not.toBe(snapshotFingerprint(snap({ tools: [tool('x', 'h2')] })));
    expect(snapshotFingerprint(base)).not.toBe(snapshotFingerprint(snap({ tools: [tool('x', 'h1', { passed: false })] })));
    expect(snapshotFingerprint(base)).not.toBe(snapshotFingerprint(snap({ tools: [tool('x', 'h1', { score: 0.1 })] })));
    expect(snapshotFingerprint(base)).not.toBe(snapshotFingerprint(snap({ tools: [tool('x', 'h1')], benchmarkSolved: 3 })));
    expect(snapshotFingerprint(base)).not.toBe(snapshotFingerprint(snap({ tools: [tool('x', 'h1')], selfhostedHealthy: 1 })));
    expect(snapshotFingerprint(base)).not.toBe(
      snapshotFingerprint(snap({ tools: [tool('x', 'h1')], capabilities: [{ capability: 'c', source: 'selfhosted', toolName: 't', score: 1 }] })),
    );
  });
});

describe('diffSnapshots classification', () => {
  it('classifies an upgraded tool with old vs new state', () => {
    const oldS = snap({ tools: [tool('x', 'h1', { version: '1.0.0', score: 0.8 })] });
    const newS = snap({ tools: [tool('x', 'h2', { version: '1.0.1', score: 0.95 })] });
    const diff = diffSnapshots(oldS, newS);
    expect(diff.upgradedTools).toHaveLength(1);
    expect(diff.upgradedTools[0].old?.hash).toBe('h1');
    expect(diff.upgradedTools[0].next?.hash).toBe('h2');
    expect(diff.totals).toEqual({ before: 1, after: 1 });
  });

  it('treats a version-only change as an upgrade (hash unchanged)', () => {
    const diff = diffSnapshots(
      snap({ tools: [tool('x', 'h1', { version: '1.0.0' })] }),
      snap({ tools: [tool('x', 'h1', { version: '1.0.1' })] }),
    );
    expect(diff.upgradedTools).toHaveLength(1);
  });

  it('classifies added and removed tools', () => {
    const diff = diffSnapshots(
      snap({ tools: [tool('a', 'h1')] }),
      snap({ tools: [tool('a', 'h1'), tool('b', 'h2')] }),
    );
    expect(diff.addedTools.map((t) => t.name)).toEqual(['b']);
    expect(diff.removedTools).toHaveLength(0);

    const removed = diffSnapshots(
      snap({ tools: [tool('a', 'h1'), tool('b', 'h2')] }),
      snap({ tools: [tool('a', 'h1')] }),
    );
    expect(removed.removedTools).toHaveLength(1);
    expect(removed.removedTools[0].name).toBe('b');
    expect(removed.removedTools[0].old?.version).toBe('1.0.0');
    expect(removed.addedTools).toHaveLength(0);
    expect(removed.totals).toEqual({ before: 2, after: 1 });
  });

  it('detects health-only changes (passed / selfHosted / healthStatus)', () => {
    const passed = diffSnapshots(
      snap({ tools: [tool('x', 'h1', { passed: false, healthStatus: 'degraded' })] }),
      snap({ tools: [tool('x', 'h1', { passed: true, healthStatus: 'healthy' })] }),
    );
    expect(passed.healthChangedTools).toHaveLength(1);
    expect(passed.upgradedTools).toHaveLength(0);

    const selfHosted = diffSnapshots(
      snap({ tools: [tool('x', 'h1', { selfHosted: false })] }),
      snap({ tools: [tool('x', 'h1', { selfHosted: true })] }),
    );
    expect(selfHosted.healthChangedTools).toHaveLength(1);
  });

  it('leaves an unchanged tool in no bucket', () => {
    const s = snap({ tools: [tool('x', 'h1')] });
    const diff = diffSnapshots(s, snap({ tools: [tool('x', 'h1')] }));
    expect(
      diff.addedTools.length + diff.removedTools.length + diff.upgradedTools.length + diff.healthChangedTools.length,
    ).toBe(0);
  });

  it('reports capability adoption deltas including absent on one side', () => {
    const oldS = snap({ capabilities: [{ capability: 'provenance_merkle', source: 'builtin' }] });
    const newS = snap({ capabilities: [{ capability: 'provenance_merkle', source: 'selfhosted', toolName: 'm1', score: 0.99 }] });
    const diff = diffSnapshots(oldS, newS);
    expect(diff.capabilityChanges).toHaveLength(1);
    expect(diff.capabilityChanges[0].from).toBe('builtin:-@-');
    expect(diff.capabilityChanges[0].to).toBe('selfhosted:m1@0.99');

    const dropped = diffSnapshots(newS, snap({ capabilities: [] }));
    expect(dropped.capabilityChanges[0].to).toBe('absent');
  });

  it('computes benchmark + self-hosted deltas, null when a benchmark side is missing', () => {
    const diff = diffSnapshots(
      snap({ benchmarkSolved: 4, selfhostedHealthy: 1 }),
      snap({ benchmarkSolved: 9, selfhostedHealthy: 4 }),
    );
    expect(diff.benchmarkSolvedDelta).toBe(5);
    expect(diff.selfhostedDelta).toBe(3);

    expect(diffSnapshots(snap({ benchmarkSolved: null }), snap({ benchmarkSolved: 9 })).benchmarkSolvedDelta).toBeNull();
    expect(diffSnapshots(snap({ benchmarkSolved: 4 }), snap({ benchmarkSolved: null })).benchmarkSolvedDelta).toBeNull();
  });
});

describe('renderUpgradeMarkdown', () => {
  it('renders every section and a signed benchmark delta', () => {
    const oldS = snap({ tools: [tool('a', 'h1'), tool('d', 'h5')], benchmarkSolved: 4, selfhostedHealthy: 0 });
    const newS = snap({
      tools: [
        tool('a', 'h2', { version: '1.0.1', score: 0.95, selfHosted: true }),
        tool('b', 'h3'),
        tool('d', 'h5', { passed: false, healthStatus: 'degraded' }),
      ],
      benchmarkSolved: 6,
      selfhostedHealthy: 1,
    });
    const md = renderUpgradeMarkdown(diffSnapshots(oldS, newS), { fromLabel: 'boot', toLabel: 'now' });
    expect(md).toContain('# Recourse Upgrade Delta — boot → now');
    expect(md).toContain('Tools: 2 → 3 (net 1)');
    expect(md).toContain('Benchmark solved Δ: +2');
    expect(md).toContain('Self-hosted healthy Δ: +1');
    expect(md).toContain('## Upgraded tools');
    expect(md).toContain('## Added');
    expect(md).toContain('## Health changes');
    expect(md).not.toContain('No material change');
  });

  it('lists removed tools and says when nothing material changed', () => {
    const md = renderUpgradeMarkdown(
      diffSnapshots(snap({ tools: [tool('gone', 'h1')] }), snap({ tools: [] })),
    );
    expect(md).toContain('## Removed (1)');
    expect(md).toContain('**gone**');

    const noop = renderUpgradeMarkdown(diffSnapshots(snap({ tools: [tool('x', 'h1')] }), snap({ tools: [tool('x', 'h1')] })));
    expect(noop).toContain('No material change');
  });

  it('renders capability changes section', () => {
    const md = renderUpgradeMarkdown(
      diffSnapshots(
        snap({ capabilities: [{ capability: 'c', source: 'builtin' }] }),
        snap({ capabilities: [{ capability: 'c', source: 'selfhosted', toolName: 't' }] }),
      ),
    );
    expect(md).toContain('## Capability adoption (dogfood) changes');
    expect(md).toContain('c: builtin:-@- → selfhosted:t@-');
  });
});

describe('toolKindLabel / plainToolLine', () => {
  it('derives a human label from the encoded tool name kind', () => {
    expect(toolKindLabel('CODI_CYCLOMATIC_481c')).toContain('code-complexity');
    expect(toolKindLabel('QUAN_QUBIT_8f62')).toContain('quantum');
    expect(toolKindLabel('BIOT_SKEW_9e0f')).toContain('DNA');
    expect(toolKindLabel('some unknown thing')).toBe('a tool');
  });

  it('renders each change kind, including the fixed/health distinction', () => {
    expect(plainToolLine('added', 'x', 'math')).toBe('- **Added** — math & formulas: a tool.');
    expect(plainToolLine('upgraded', 'x', 'coding')).toContain('was rebuilt to a newer version');
    expect(plainToolLine('removed', 'x', 'biotech')).toContain('is no longer in the registry');

    const fixed = plainToolLine('fixed', 'x', 'coding', { healthNow: 'healthy', healthBefore: 'degraded' });
    expect(fixed).toContain('**Fixed**');
    expect(fixed).toContain('(was degraded)');
    const fixedSame = plainToolLine('fixed', 'x', 'coding', { healthNow: 'healthy', healthBefore: 'healthy' });
    expect(fixedSame).not.toContain('(was');

    const health = plainToolLine('health', 'x', 'systemic', { healthNow: 'degraded' });
    expect(health).toContain('now reports degraded health');
  });

  it('falls back to a provided describe() and falls back for unknown domains', () => {
    expect(plainToolLine('added', 'x', 'quantum_sim', { describe: () => 'a special thing' })).toContain('a special thing');
    expect(plainToolLine('added', 'x', 'my_custom_domain')).toContain('my custom domain');
  });
});

describe('renderPlainLanguageSummary', () => {
  it('explains additions/upgrades/health and benchmark gains in plain terms', () => {
    const diff = emptyDiff({
      addedTools: [{ name: 'BIOT_GC_9e0f', domain: 'biotech', kind: 'added', next: tool('BIOT_GC_9e0f', 'h') }],
      upgradedTools: [{ name: 'solver', domain: 'math', kind: 'upgraded', old: tool('solver', 'h1'), next: tool('solver', 'h2') }],
      healthChangedTools: [
        { name: 'c', domain: 'coding', kind: 'health_changed', old: tool('c', 'h', { passed: false }), next: tool('c', 'h', { passed: true }) },
      ],
      benchmarkSolvedDelta: 2,
      totals: { before: 1, after: 3 },
    });
    const out = renderPlainLanguageSummary(diff);
    expect(out).toContain('plain terms');
    expect(out).toContain('The tool library went from 1 to 3 tools (net +2).');
    expect(out).toContain('Added');
    expect(out).toContain('Improved');
    expect(out).toContain('Fixed');
    expect(out).toContain('2 more external benchmark problems');
  });

  it('reports benchmark losses and self-hosted declines', () => {
    const diff = emptyDiff({ benchmarkSolvedDelta: -1, selfhostedDelta: -2, removedTools: [{ name: 'gone', domain: 'coding', kind: 'removed', old: tool('gone', 'h') }] });
    const out = renderPlainLanguageSummary(diff);
    expect(out).toContain('1 fewer external benchmark problem');
    expect(out).toContain('2 fewer of its own functions');
    expect(out).toContain('Removed: **gone**.');
  });

  it('truncates long lists with a "...and N more" note', () => {
    const added = Array.from({ length: 10 }, (_, i) => ({ name: `t${i}`, domain: 'coding' as const, kind: 'added' as const, next: tool(`t${i}`, `h${i}`) }));
    const out = renderPlainLanguageSummary(emptyDiff({ addedTools: added, totals: { before: 0, after: 10 } }), { maxItems: 3 });
    expect(out).toContain('...and 7 more.');
  });

  it('handles changes with no tool-count delta and no benchmark/selfhost movement', () => {
    const diff = emptyDiff({
      healthChangedTools: [{ name: 'x', domain: 'coding', kind: 'health_changed', old: tool('x', 'h', { healthStatus: 'degraded' }), next: tool('x', 'h', { healthStatus: 'healthy' }) }],
      totals: { before: 1, after: 1 },
    });
    const out = renderPlainLanguageSummary(diff);
    expect(out).not.toContain('tool library went');
    expect(out).toContain('1 tools are present in the registry.');
  });

  it('says plainly when nothing material changed', () => {
    const s = snap({ tools: [tool('x', 'h1')] });
    const out = renderPlainLanguageSummary(diffSnapshots(s, s));
    expect(out).toContain('no measurable change');
  });

  it('ignores a zero benchmark delta and zero selfhosted delta', () => {
    const out = renderPlainLanguageSummary(emptyDiff({ benchmarkSolvedDelta: 0, selfhostedDelta: 0 }));
    expect(out).toContain('no measurable change');
  });
});

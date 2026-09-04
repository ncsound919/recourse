import { describe, it, expect } from 'vitest';
import { buildDevelopmentReadout } from '../src/intake/readout';
import type { ReadoutContext } from '../src/intake/readout';
import { makeSignal } from '../src/intake/util';
import { BENCHMARK_PROBLEMS } from '../src/benchmark/benchmark';

function ctx(): ReadoutContext {
  return {
    status: {
      uptimeSeconds: 3600,
      generation: 5,
      activePolicy: 'non_regressing',
      isAutoEvolving: false,
      autoIntervalSeconds: 30,
      totalUpgrades: 12,
      verifierPassRate: 0.95,
      hashChainIntegrity: true,
      registeredToolsCount: 3,
      pendingApprovalsCount: 0,
      lastTickTime: Date.now(),
      aiStudioModel: 'qwen3.8-4b-distill:q4_k_m',
      providerStatus: { kind: 'x', baseUrl: 'http://localhost:11434/v1', model: 'qwen', online: true },
      selfRepair: { isAutoHealingEnabled: true, totalHealedCount: 2, activeAnomaliesCount: 0, meanTimeToRepairMs: 120, repairSuccessRate: 1 },
      hyperParams: {} as any,
      domainCoverage: {
        coding: { activeGenes: 1, passRate: 1 }, math: { activeGenes: 1, passRate: 1 }, biotech: { activeGenes: 1, passRate: 1 },
        systemic: { activeGenes: 0, passRate: 0 }, neuro_symbolic: { activeGenes: 0, passRate: 0 }, cyber_defense: { activeGenes: 0, passRate: 0 }, quantum_sim: { activeGenes: 0, passRate: 0 },
      },
    } as any,
    registry: [{ name: 'a', domain: 'math', entrypoint: '', description: '', currentVersion: '1', healthStatus: 'healthy', versions: [] }],
    provenanceEvents: [{ prev: '0', hash: '1', type: 'tool_promoted', ts: 1, data: {} }, { prev: '1', hash: '2', type: 'signal_grounded', ts: 2, data: {} }],
    intake: (() => {
      const sig = makeSignal('arxiv', 'https://arxiv.org/abs/1', 'A paper', 'abs', ['math']);
      return {
        total: 1,
        unconsumed: 0,
        consumed: 1,
        bySource: { arxiv: 1 },
        lastPollAt: 1,
        lastPollResults: [{ source: 'arxiv', ok: true, count: 1 }],
        lastGroundAt: 2,
        lastGroundSummary: 'arxiv:A paper → ground_tool (verified)',
        groundedTools: ['ground_tool'],
      };
    })(),
    benchmark: { problems: BENCHMARK_PROBLEMS, history: [{ at: 1, solved: 1, total: 7, solvedIds: ['p_fizzbuzz'] }], lastRunAt: 1, lastRun: { at: 1, solved: 1, total: 7, solvedIds: ['p_fizzbuzz'] } },
    generation: 5,
    chainIntegrity: true,
  };
}

describe('development readout', () => {
  it('renders a full honest digest with every section', () => {
    const md = buildDevelopmentReadout(ctx());
    expect(md).toContain('## Recourse Development Readout');
    expect(md).toContain('Registered tools: 1');
    expect(md).toContain('1 signals (0 pending, 1 grounded)');
    expect(md).toContain('solved (14%)');
    expect(md).toContain('signal_grounded: 1');
    expect(md).toContain('Total healed: 2');
  });

  it('degrades to "not run yet" benchmark and no-signal wording', () => {
    const c = ctx();
    c.benchmark = { problems: BENCHMARK_PROBLEMS, history: [], lastRunAt: null, lastRun: null };
    c.intake = { total: 0, unconsumed: 0, consumed: 0, bySource: {}, lastPollAt: null, lastPollResults: [], lastGroundAt: null, lastGroundSummary: null, groundedTools: [] };
    const md = buildDevelopmentReadout(c);
    expect(md).toContain('not run yet');
    expect(md).toContain('no signals ingested yet');
  });
});

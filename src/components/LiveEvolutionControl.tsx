import React from 'react';
import { Pause, Play } from 'lucide-react';
import { SystemStatus, PromotionPolicy, ToolDomain } from '../types';

interface LiveEvolutionControlProps {
  status: SystemStatus;
  onToggleAuto: (enabled: boolean) => void;
  onStepEvolution: (domain: ToolDomain) => void;
  onPolicyChange: (policy: PromotionPolicy) => void;
  isStepping: boolean;
}

const DOMAINS: Array<{ id: ToolDomain; label: string }> = [
  { id: 'coding', label: 'Coding' },
  { id: 'math', label: 'Math' },
  { id: 'biotech', label: 'Biotech' },
  { id: 'systemic', label: 'Systemic' },
  { id: 'neuro_symbolic', label: 'Neuro-symbolic' },
  { id: 'cyber_defense', label: 'Cyber defense' },
  { id: 'quantum_sim', label: 'Quantum sim' },
];

const POLICY_TEXT: Partial<Record<PromotionPolicy, string>> = {
  non_regressing: 'A candidate is promoted when its score is at least the current score.',
  strict_improve: 'A candidate must beat the current score to be promoted.',
  human_approval: 'Candidates that pass verification wait in the approval queue.',
  any_pass: 'Any candidate that passes verification is promoted.',
};

export const LiveEvolutionControl: React.FC<LiveEvolutionControlProps> = ({
  status,
  onToggleAuto,
  onStepEvolution,
  onPolicyChange,
  isStepping,
}) => {
  const running = status.isAutoEvolving;
  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900/60 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-[65ch]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink-50">Autonomous loop</h2>
            <span className={`rounded px-1.5 py-0.5 text-xs ${running ? 'bg-ok-500/15 text-ok-300' : 'bg-ink-800 text-ink-300'}`}>
              {running ? 'Running' : 'Paused'}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-400">
            Finds bottlenecks, mutates candidate code and promotes only what passes the verifier and the gate policy.
          </p>
        </div>
        <button
          onClick={() => onToggleAuto(!running)}
          className={`flex h-9 shrink-0 items-center gap-2 self-start rounded-md px-3.5 text-sm font-medium transition-colors active:translate-y-px ${
            running ? 'border border-ink-700 text-ink-200 hover:bg-ink-800' : 'bg-accent-600 text-white hover:bg-accent-500'
          }`}
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? 'Pause loop' : 'Start loop'}
        </button>
      </div>

      <div className="mt-5 grid gap-5 border-t border-ink-800 pt-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div className="mb-2 text-xs text-ink-500">Run one step in a domain</div>
          <div className="flex flex-wrap gap-1.5">
            {DOMAINS.map((d) => (
              <button
                key={d.id}
                disabled={isStepping}
                onClick={() => onStepEvolution(d.id)}
                className="rounded-md border border-ink-800 bg-ink-950 px-2.5 py-1.5 text-sm text-ink-300 transition-colors hover:border-ink-700 hover:text-ink-50 disabled:opacity-50"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="gate-policy" className="mb-2 block text-xs text-ink-500">Promotion gate</label>
          <select
            id="gate-policy"
            value={status.activePolicy}
            onChange={(e) => onPolicyChange(e.target.value as PromotionPolicy)}
            className="w-full rounded-md border border-ink-800 bg-ink-950 px-2.5 py-1.5 text-sm text-ink-200 focus:border-accent-500 focus:outline-none"
          >
            <option value="non_regressing">Non-regressing</option>
            <option value="strict_improve">Strict improve</option>
            <option value="human_approval">Human approval</option>
            <option value="any_pass">Any pass</option>
          </select>
          <p className="mt-1.5 text-xs text-ink-500">{POLICY_TEXT[status.activePolicy] ?? ''}</p>
        </div>
      </div>
    </section>
  );
};

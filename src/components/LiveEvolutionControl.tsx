import React from 'react';
import { Play, Pause, FastForward, Shield, Sparkles, Sliders, RefreshCw, Layers } from 'lucide-react';
import { SystemStatus, PromotionPolicy, ToolDomain } from '../types';

interface LiveEvolutionControlProps {
  status: SystemStatus;
  onToggleAuto: (enabled: boolean) => void;
  onStepEvolution: (domain: ToolDomain) => void;
  onPolicyChange: (policy: PromotionPolicy) => void;
  isStepping: boolean;
}

export const LiveEvolutionControl: React.FC<LiveEvolutionControlProps> = ({
  status,
  onToggleAuto,
  onStepEvolution,
  onPolicyChange,
  isStepping
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-mono font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>24/7 Autonomous Development Control Center</span>
            </h2>
            <span className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full ${
              status.isAutoEvolving
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
            }`}>
              {status.isAutoEvolving ? '● 24/7 AUTO RUNNING' : 'PAUSED'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Recourse automatically evaluates architectural bottlenecks, mutates candidate code, and gates promotions through policy verifiers.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onToggleAuto(!status.isAutoEvolving)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all ${
              status.isAutoEvolving
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
            }`}
          >
            {status.isAutoEvolving ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{status.isAutoEvolving ? 'PAUSE 24/7 RUNNER' : 'START 24/7 AUTO-DEVELOPER'}</span>
          </button>
        </div>
      </div>

      {/* Domain Quick Step Trigger Bar */}
      <div className="mt-4 pt-1 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
          <FastForward className="w-3.5 h-3.5 text-cyan-400" />
          <span>Manual Step Evolution Across 7 Frontier Domains:</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            { id: 'coding', label: 'Coding', color: 'text-indigo-400' },
            { id: 'math', label: 'Math', color: 'text-emerald-400' },
            { id: 'biotech', label: 'Biotech', color: 'text-rose-400' },
            { id: 'systemic', label: 'Systemic', color: 'text-amber-400' },
            { id: 'neuro_symbolic', label: 'Neuro-Symbolic', color: 'text-purple-400' },
            { id: 'cyber_defense', label: 'Cyber Defense', color: 'text-red-400' },
            { id: 'quantum_sim', label: 'Quantum Sim', color: 'text-cyan-400' }
          ] as Array<{ id: ToolDomain; label: string; color: string }>).map(item => (
            <button
              key={item.id}
              disabled={isStepping}
              onClick={() => onStepEvolution(item.id)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-indigo-500/50 text-slate-300 font-mono text-xs transition-all disabled:opacity-50 hover:text-white cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${item.color} ${isStepping ? 'animate-spin' : ''}`} />
              <span>Step {item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Promotion Policy Explanation Banner */}
      <div className="mt-4 p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-xs font-mono flex items-start gap-2 text-slate-400">
        <Shield className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="text-slate-200 font-bold uppercase">Active Policy Gate ({status.activePolicy}):</span>{' '}
          {status.activePolicy === 'non_regressing' && 'Candidates are promoted if score \u2265 current score.'}
          {status.activePolicy === 'strict_improve' && 'Candidates must strictly improve score (\u003E current) to promote.'}
          {status.activePolicy === 'human_approval' && 'Candidates pass verification but sit in pending queue for human review.'}
          {status.activePolicy === 'any_pass' && 'Any candidate passing verification auto-promotes.'}
        </div>
      </div>
    </div>
  );
};

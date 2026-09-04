import React, { useState } from 'react';
import { Sparkles, Cpu, ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Code, RefreshCw, X } from 'lucide-react';
import { ToolDomain, PromotionPolicy } from '../types';

interface AiMutatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEvolve: (domain: ToolDomain, instructions: string, targetToolName?: string) => Promise<any>;
  activePolicy: PromotionPolicy;
}

export const AiMutatorModal: React.FC<AiMutatorModalProps> = ({
  isOpen,
  onClose,
  onEvolve,
  activePolicy
}) => {
  const [domain, setDomain] = useState<ToolDomain>('coding');
  const [targetToolName, setTargetToolName] = useState<string>('');
  const [instructions, setInstructions] = useState<string>(
    'Optimize mathematical algorithm or system reliability for multi-threaded execution'
  );
  const [isEvolving, setIsEvolving] = useState<boolean>(false);
  const [evolutionResult, setEvolutionResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleEvolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEvolving(true);
    setEvolutionResult(null);

    try {
      const res = await onEvolve(domain, instructions, targetToolName || undefined);
      setEvolutionResult(res);
    } catch (err: any) {
      setEvolutionResult({
        success: false,
        error: err.message || 'AI Evolution failed'
      });
    } finally {
      setIsEvolving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-mono text-base font-bold text-white">
                Architectural Mutator (Open-Source Local Model)
              </h3>
              <p className="font-mono text-xs text-slate-400">
                Candidates are produced by the configured local model provider, then real-verified in the sandbox before promotion.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-mono p-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mutation Form */}
        <form onSubmit={handleEvolveSubmit} className="mt-5 space-y-4 font-mono text-xs">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1">Domain Target:</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as ToolDomain)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-indigo-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="coding">Coding (Algorithm / Refactoring)</option>
                <option value="math">Math (Vieta / Symbolic Equivalence)</option>
                <option value="biotech">Biotech (4-Leg Oncology Grounding)</option>
                <option value="systemic">Systemic (Multi-agent / Memory)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">Target Tool Gene Name (Optional):</label>
              <input
                type="text"
                value={targetToolName}
                onChange={(e) => setTargetToolName(e.target.value)}
                placeholder="e.g. fizzbuzz_solver or new_gene_id"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">Mutation Prompt & Architectural Goals:</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              placeholder="Specify the exact optimization, bug fix, or feature enhancement required..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-400 text-[11px] flex items-center justify-between">
            <span>Gate Policy: <strong className="text-indigo-400">{activePolicy}</strong></span>
            <span>Server Model: <strong className="text-amber-400">configured MODEL_NAME (OpenAI-compatible/Ollama)</strong></span>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isEvolving}
              className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
            >
              {isEvolving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
              <span>{isEvolving ? 'SYNTHESIZING & VERIFYING...' : 'SYNTHESIZE ARCHITECTURAL MUTATION'}</span>
            </button>
          </div>
        </form>

        {/* Live Result View */}
        {evolutionResult && (
          <div className="mt-5 p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-white flex items-center gap-1.5">
                {evolutionResult.outcome === 'promoted' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : evolutionResult.outcome === 'pending_approval' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
                Outcome: <strong className="uppercase text-indigo-300">{evolutionResult.outcome}</strong>
              </span>

              <span className="text-[10px] text-slate-400">
                Gen #{evolutionResult.generation} • Hash: {evolutionResult.versionHash}
              </span>
            </div>

            <div className="mt-2 text-slate-300">
              <p>Tool: <strong className="text-white">{evolutionResult.toolName}</strong> (v{evolutionResult.version})</p>
              <p className="text-slate-400 mt-1">{evolutionResult.verifierResult?.summary}</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

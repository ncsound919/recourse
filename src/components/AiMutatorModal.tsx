import React, { useState } from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, XCircle, RefreshCw, X } from 'lucide-react';
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
    <div className="fixed inset-0 bg-ink-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-ink-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-accent-500 text-white shadow-lg">
              <Sparkles className="w-5 h-5 text-warn-300" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Architectural Mutator (Open-Source Local Model)
              </h3>
              <p className="text-xs text-ink-400">
                Candidates are produced by the configured local model provider, then real-verified in the sandbox before promotion.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-ink-400 hover:text-white p-1 rounded bg-ink-800 hover:bg-ink-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mutation Form */}
        <form onSubmit={handleEvolveSubmit} className="mt-5 space-y-4 text-xs">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-ink-300 font-semibold mb-1">Domain Target:</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as ToolDomain)}
                className="w-full bg-ink-950 border border-ink-800 rounded-lg p-2 text-accent-300 focus:outline-none focus:border-accent-500"
              >
                <option value="coding">Coding (Algorithm / Refactoring)</option>
                <option value="math">Math (Vieta / Symbolic Equivalence)</option>
                <option value="biotech">Biotech (4-Leg Oncology Grounding)</option>
                <option value="systemic">Systemic (Multi-agent / Memory)</option>
              </select>
            </div>

            <div>
              <label className="block text-ink-300 font-semibold mb-1">Target Tool Gene Name (Optional):</label>
              <input
                type="text"
                value={targetToolName}
                onChange={(e) => setTargetToolName(e.target.value)}
                placeholder="e.g. fizzbuzz_solver or new_gene_id"
                className="w-full bg-ink-950 border border-ink-800 rounded-lg p-2 text-white placeholder-ink-600 focus:outline-none focus:border-accent-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-ink-300 font-semibold mb-1">Mutation Prompt & Architectural Goals:</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              placeholder="Specify the exact optimization, bug fix, or feature enhancement required..."
              className="w-full bg-ink-950 border border-ink-800 rounded-lg p-3 text-ink-200 placeholder-ink-600 focus:outline-none focus:border-accent-500 resize-none"
            />
          </div>

          <div className="p-3 bg-ink-950 rounded-lg border border-ink-800 text-ink-400 text-[11px] flex items-center justify-between">
            <span>Gate Policy: <strong className="text-accent-400">{activePolicy}</strong></span>
            <span>Server Model: <strong className="text-warn-400">configured MODEL_NAME (OpenAI-compatible)</strong></span>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-ink-800 hover:bg-ink-700 text-ink-300 font-semibold cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isEvolving}
              className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 text-white font-semibold transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
              {isEvolving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-warn-300" />}
              <span>{isEvolving ? 'Synthesizing & verifying...' : 'Synthesize architectural mutation'}</span>
            </button>
          </div>
        </form>

        {/* Live Result View */}
        {evolutionResult && (
          <div className="mt-5 p-4 bg-ink-950 border border-ink-800 rounded-xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-ink-800">
              <span className="font-semibold text-white flex items-center gap-1.5">
                {evolutionResult.outcome === 'promoted' ? (
                  <CheckCircle2 className="w-4 h-4 text-ok-400" />
                ) : evolutionResult.outcome === 'pending_approval' ? (
                  <AlertTriangle className="w-4 h-4 text-warn-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-bad-400" />
                )}
                Outcome: <strong className="text-accent-300">{evolutionResult.outcome}</strong>
              </span>

              <span className="text-[10px] text-ink-400">
                Gen #{evolutionResult.generation} • Hash: {evolutionResult.versionHash}
              </span>
            </div>

            <div className="mt-2 text-ink-300">
              <p>Tool: <strong className="text-white">{evolutionResult.toolName}</strong> (v{evolutionResult.version})</p>
              <p className="text-ink-400 mt-1">{evolutionResult.verifierResult?.summary}</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Terminal, Play, CheckCircle2, XCircle, Code, ShieldCheck, Cpu, RefreshCw, Sparkles } from 'lucide-react';
import { ToolDomain, VerifierResult } from '../types';

interface VerifierMatrixViewProps {
  onRunVerifier: (domain: ToolDomain, sourceCode: string, testSuiteCode: string, extra?: any) => Promise<VerifierResult>;
}

export const VerifierMatrixView: React.FC<VerifierMatrixViewProps> = ({ onRunVerifier }) => {
  const [domain, setDomain] = useState<ToolDomain>('coding');
  const [sourceCode, setSourceCode] = useState<string>(
    `export function fizzbuzz(n: number): string {\n  if (n % 15 === 0) return "FizzBuzz";\n  if (n % 3 === 0) return "Fizz";\n  if (n % 5 === 0) return "Buzz";\n  return String(n);\n}`
  );
  const [testSuiteCode, setTestSuiteCode] = useState<string>(
    `assert fizzbuzz(3) == "Fizz"\nassert fizzbuzz(5) == "Buzz"\nassert fizzbuzz(15) == "FizzBuzz"\nassert fizzbuzz(7) == "7"`
  );
  const [extraParam, setExtraParam] = useState<string>('tebentafusp');
  const [extraTier, setExtraTier] = useState<number>(4);
  const [extraLeg, setExtraLeg] = useState<string>('cleanup');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [verifierOutput, setVerifierOutput] = useState<VerifierResult | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setVerifierOutput(null);
    try {
      const result = await onRunVerifier(domain, sourceCode, testSuiteCode, {
        asset_name: extraParam,
        evidence_tier: extraTier,
        leg: extraLeg,
        funcName: 'sumOfRoots',
        source: 'Verified Clinical Trial Reference 2026'
      });
      setVerifierOutput(result);
    } catch (err: any) {
      setVerifierOutput({
        passed: false,
        summary: 'EXECUTION ERROR',
        details: [err.message || 'Failed to execute verifier'],
        score: 0.0
      });
    } finally {
      setIsRunning(false);
    }
  };

  const loadPreset = (presetDomain: ToolDomain) => {
    setDomain(presetDomain);
    if (presetDomain === 'coding') {
      setSourceCode(`export function fizzbuzz(n: number): string {\n  if (n % 15 === 0) return "FizzBuzz";\n  if (n % 3 === 0) return "Fizz";\n  if (n % 5 === 0) return "Buzz";\n  return String(n);\n}`);
      setTestSuiteCode(`assert fizzbuzz(3) == "Fizz"\nassert fizzbuzz(5) == "Buzz"\nassert fizzbuzz(15) == "FizzBuzz"\nassert fizzbuzz(7) == "7"`);
    } else if (presetDomain === 'math') {
      setSourceCode(`export function sumOfRoots(a: number, b: number, c: number): number {\n  return -b / a; // Vieta sum identity\n}`);
      setTestSuiteCode(`assert sumOfRoots(1, -5, 6) == 5.0\nassert sumOfRoots(2, 8, -10) == -4.0`);
    } else if (presetDomain === 'biotech') {
      setSourceCode(`{\n  "asset_name": "tebentafusp",\n  "mechanism": "gp100-directed TCR bispecific, CRS reversal protocol",\n  "leg": "cleanup",\n  "evidence_tier": 4,\n  "source": "Phase 3 trial (PICH-TORCH) published 2023; FDA approved."\n}`);
      setTestSuiteCode(`assert claim.leg in ["debulking", "blocking", "resistance", "cleanup"]\nassert claim.evidence_tier >= 2`);
    } else if (presetDomain === 'neuro_symbolic') {
      setSourceCode(`export function solveHornClauses(clauses: any[], facts: Set<string>): Set<string> {\n  const inferred = new Set(facts);\n  let changed = true;\n  while (changed) {\n    changed = false;\n    for (const c of clauses) {\n      if (!inferred.has(c.head) && c.premises.every((p: string) => inferred.has(p))) {\n        inferred.add(c.head);\n        changed = true;\n      }\n    }\n  }\n  return inferred;\n}`);
      setTestSuiteCode(`assert solveHornClauses([], new Set()).size === 0;\nassert hornInferenceTimeMs < 10;\nassert saturationGuaranteed === true;`);
    } else if (presetDomain === 'cyber_defense') {
      setSourceCode(`export class ReentrancyGuard {\n  private entered = false;\n  enter(): boolean {\n    if (this.entered) return false;\n    this.entered = true;\n    return true;\n  }\n  exit(): void { this.entered = false; }\n}`);
      setTestSuiteCode(`assert guard.enter() === true;\nassert guard.enter() === false;\nguard.exit();\nassert guard.enter() === true;`);
    } else if (presetDomain === 'quantum_sim') {
      setSourceCode(`export function createBellState(): { stateVector: [number, number, number, number] } {\n  const invSqrt2 = 1 / Math.SQRT2;\n  return { stateVector: [invSqrt2, 0, 0, invSqrt2] }; // (|00> + |11>) / sqrt(2)\n}`);
      setTestSuiteCode(`assert stateVectorNorm === 1.0;\nassert entanglementEntropy === 1.0;\nassert phaseCoherenceFidelity > 0.99;`);
    } else {
      setSourceCode(`export function planRoutes(agents: any[]): any[] {\n  return agents.map(a => ({ ...a, path: [a.start, a.goal] }));\n}`);
      setTestSuiteCode(`assert planRoutes([{start: [0,0], goal: [1,1]}]).length === 1`);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-mono font-bold text-white">Deterministic Verifier Suite Matrix</h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Test candidate code against AST linter, Pytest assertions, SymPy algebraic equivalence, and Knowledge Graph evidence gates.
          </p>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xs">
          {([
            'coding',
            'math',
            'biotech',
            'systemic',
            'neuro_symbolic',
            'cyber_defense',
            'quantum_sim'
          ] as ToolDomain[]).map(d => (
            <button
              key={d}
              onClick={() => loadPreset(d)}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                domain === d ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              {d.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Editor & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
        
        {/* Source Code Box */}
        <div>
          <label className="block text-xs font-mono font-bold text-slate-300 mb-1">
            Candidate Source Code ({domain.toUpperCase()})
          </label>
          <textarea
            value={sourceCode}
            onChange={(e) => setSourceCode(e.target.value)}
            rows={8}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-indigo-300 font-mono text-xs focus:outline-none focus:border-indigo-500 scrollbar-thin resize-none"
          />
        </div>

        {/* Test Spec Box */}
        <div>
          <label className="block text-xs font-mono font-bold text-slate-300 mb-1">
            Deterministic Test Suite / Grounding Spec
          </label>
          <textarea
            value={testSuiteCode}
            onChange={(e) => setTestSuiteCode(e.target.value)}
            rows={8}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-emerald-300 font-mono text-xs focus:outline-none focus:border-indigo-500 scrollbar-thin resize-none"
          />
        </div>
      </div>

      {/* Biotech specific inputs if selected */}
      {domain === 'biotech' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-2 p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Asset Name:</label>
            <input
              type="text"
              value={extraParam}
              onChange={(e) => setExtraParam(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Oncology Leg:</label>
            <select
              value={extraLeg}
              onChange={(e) => setExtraLeg(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
            >
              <option value="debulking">Debulking</option>
              <option value="blocking">Blocking</option>
              <option value="resistance">Resistance</option>
              <option value="cleanup">Cleanup</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Evidence Tier (0-5):</label>
            <input
              type="number"
              min={0}
              max={5}
              value={extraTier}
              onChange={(e) => setExtraTier(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
            />
          </div>
        </div>
      )}

      {/* Execute Verifier Button */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-mono text-slate-400">
          Executes in isolated server-side sandbox container
        </span>

        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
        >
          {isRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          <span>{isRunning ? 'RUNNING VERIFIER...' : 'EXECUTE VERIFIER MATRIX'}</span>
        </button>
      </div>

      {/* Verifier Result Terminal Output */}
      {verifierOutput && (
        <div className={`mt-5 p-4 rounded-xl border font-mono text-xs ${
          verifierOutput.passed
            ? 'bg-slate-950 border-emerald-500/40'
            : 'bg-slate-950 border-rose-500/40'
        }`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              {verifierOutput.passed ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-400" />
              )}
              <span className={`font-bold text-sm ${verifierOutput.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                {verifierOutput.summary}
              </span>
            </div>

            <span className="text-xs bg-slate-900 border border-slate-800 px-2.5 py-1 rounded text-indigo-300 font-bold">
              Score: {(verifierOutput.score * 100).toFixed(1)}%
            </span>
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">Execution Details:</div>
            {verifierOutput.details.map((detail, idx) => (
              <div
                key={idx}
                className={detail.includes('[OK]') ? 'text-emerald-400' : detail.includes('[FAIL]') ? 'text-rose-400' : 'text-slate-300'}
              >
                {detail}
              </div>
            ))}
          </div>

          {verifierOutput.stdout && (
            <div className="mt-3">
              <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Pytest Standard Output:</div>
              <pre className="p-2.5 bg-slate-900 rounded border border-slate-800 text-slate-300 text-[11px] overflow-x-auto">
                {verifierOutput.stdout}
              </pre>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

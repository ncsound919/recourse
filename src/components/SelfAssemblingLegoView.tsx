// src/components/SelfAssemblingLegoView.tsx
// Visualizer and interactive workbench for the 5 Layers of Self-Assembling Learning Systems.

import React, { useState, useEffect, useRef } from 'react';
import { 
  Layers, 
  Cpu, 
  Sparkles, 
  ShieldCheck, 
  GitBranch, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Terminal, 
  Binary, 
  ArrowRight, 
  Compass, 
  Zap, 
  Maximize2,
  Box,
  Puzzle,
  Network
} from 'lucide-react';
import type { 
  LegoSystemState, 
  BrickOperator, 
  StudContract, 
  AssembledDAG,
  BenchmarkReport 
} from '../lego/types';
import { validateStudConnection } from '../lego/contracts';

interface Props {
  onNotify?: (msg: string) => void;
}

export const SelfAssemblingLegoView: React.FC<Props> = ({ onNotify }) => {
  const [legoState, setLegoState] = useState<LegoSystemState | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeLayerTab, setActiveLayerTab] = useState<'studs' | 'bricks' | 'hands' | 'brain' | 'rulebook'>('hands');
  const [executing, setExecuting] = useState(false);
  const [lastExecResult, setLastExecResult] = useState<any>(null);
  const [selectedBrick, setSelectedBrick] = useState<BrickOperator | null>(null);
  const [testInputToken, setTestInputToken] = useState<string>('0.4, 0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.5');
  const [moeRouteResult, setMoeRouteResult] = useState<any>(null);

  // Connection tester state for Layer 1 (The Studs)
  const [testStudA, setTestStudA] = useState<string>('stud_vec_1d_8');
  const [testStudB, setTestStudB] = useState<string>('stud_vec_1d_16');

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    fetchLegoState();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchLegoState = async () => {
    try {
      const res = await fetch('/api/lego/state');
      if (res.ok && isMountedRef.current) {
        const data = await res.json();
        setLegoState(data.state);
        if (!selectedBrick && data.state?.brickBin?.length > 0) {
          setSelectedBrick(data.state.brickBin[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch lego state', err);
    }
  };

  const handleTriggerSelfAssembly = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/lego/assemble', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onNotify?.(`NAS Policy assembled new DAG ${data.result.assembly.name} (${(data.result.benchmarkScore * 100).toFixed(1)}% score)`);
        await fetchLegoState();
      } else {
        onNotify?.(`Assembly rollback: ${data.error || 'Failed validation'}`);
      }
    } catch (err: any) {
      onNotify?.(`Assembly error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunPipeline = async () => {
    setExecuting(true);
    try {
      const res = await fetch('/api/lego/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: [
            [0.2, 0.8, 0.1, 0.9, 0.3, 0.7, 0.4, 0.6],
            [0.5, 0.5, 0.2, 0.8, 0.1, 0.9, 0.0, 1.0]
          ]
        })
      });
      const data = await res.json();
      setLastExecResult(data.result);
      if (data.success) {
        onNotify?.(`Forward & backward autograd completed in ${data.result.traces?.reduce((a: number, t: any) => a + t.latencyMs, 0).toFixed(2)}ms`);
      }
    } catch (err: any) {
      onNotify?.(`Execution error: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const handleTestMoERouting = async () => {
    try {
      const vec = testInputToken.split(',').map(s => parseFloat(s.trim()) || 0);
      const res = await fetch('/api/lego/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputVector: vec })
      });
      const data = await res.json();
      if (data.success) {
        setMoeRouteResult(data.result);
        onNotify?.(`MoE dynamically routed token to ${data.result.chosenExperts.length} expert bricks`);
      }
    } catch (err: any) {
      onNotify?.(`MoE error: ${err.message}`);
    }
  };

  if (!legoState) {
    return (
      <div className="p-12 text-center text-slate-400 font-mono flex items-center justify-center gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
        <span>Initializing 5-Layer Composable ML Subsystem...</span>
      </div>
    );
  }

  const currentDAG = legoState.currentAssembly;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs font-mono font-bold flex items-center gap-1.5">
                <Puzzle className="w-3.5 h-3.5" />
                LEGO ARCHITECTURE FOR COMPOSABLE ML
              </span>
              <span className="text-xs font-mono text-slate-400">
                • Standardized Studs & Autonomous Assembly
              </span>
            </div>
            <h2 className="text-xl font-bold font-mono text-white tracking-tight">
              Self-Assembling Learning System
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl mt-1">
              The magic isn't the bricks, it's the studs. Standardized machine-readable contracts enable autonomous assembly through a 3-part NAS engine: component search space, RL policy search strategy, and held-out benchmark evaluation.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerSelfAssembly}
              disabled={loading}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 text-amber-300" />
              )}
              <span>TRIGGER NAS CYCLE</span>
            </button>

            <button
              onClick={handleRunPipeline}
              disabled={executing || !currentDAG}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {executing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>RUN AUTOGRAD PASS</span>
            </button>
          </div>
        </div>

        {/* Global Stack Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5 pt-4 border-t border-slate-800/80 font-mono text-xs">
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">Active Bricks</span>
            <span className="text-emerald-400 font-bold text-sm">
              {legoState.brickBin.length} Atomic Ops
            </span>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">Stud Schemas</span>
            <span className="text-indigo-400 font-bold text-sm">
              {legoState.studCatalog.length} Typed Contracts
            </span>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">NAS Proposals</span>
            <span className="text-amber-400 font-bold text-sm">
              {legoState.nasController.candidateProposalsCount} Episodes
            </span>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">Registry Lineage</span>
            <span className="text-purple-400 font-bold text-sm">
              {legoState.registry.length} Promoted DAGs
            </span>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase">System Integrity</span>
            <span className="text-cyan-400 font-bold text-sm">
              {(legoState.systemIntegrityScore * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Mission-Control: Readiness Gate & NAS Policy */}
      {legoState && (
        <div className="rounded-xl border border-cyan-800/50 bg-slate-950 overflow-hidden">
          <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono text-slate-500 uppercase tracking-widest">MISSION CONTROL — REGISTRY GATE</span>
              <span className="text-[10px] font-mono text-slate-500">
                NAS PROPOSALS <span className="text-amber-300 font-bold">{legoState.nasController?.candidateProposalsCount ?? 0}</span>
                <span className="text-slate-600 mx-2">│</span>
                COMMITTED <span className="text-emerald-400 font-bold">{legoState.registry?.length ?? 0}</span>
                <span className="text-slate-600 mx-2">│</span>
                SELF-ASSEMBLED <span className="text-amber-300 font-bold">{legoState.totalSelfAssembledCount ?? 0}</span>
              </span>
            </div>

            {(() => {
              const readiness = legoState.readinessGate ?? 0;
              const gate = 0.7;
              const eligible = readiness >= gate;
              return (
                <>
                  <div className="flex items-center justify-between font-mono text-[11px] mb-1.5">
                    <span className="text-slate-500 uppercase tracking-wider text-[10px]">READINESS GATE (math engine)</span>
                    <div className="flex items-center gap-2">
                      <span className={readiness >= gate ? 'text-emerald-400' : 'text-rose-400'}>
                        {readiness.toFixed(3)} <span className="text-slate-600">/ {gate.toFixed(2)}</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        eligible ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}>
                        {eligible ? '✓ COMMIT ELIGIBLE' : '✗ GATE BLOCKED'}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div className="absolute top-0 bottom-0 left-0 z-10 w-px bg-slate-500" style={{ left: `${gate * 100}%` }} title="0.70 gate" />
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        eligible ? 'bg-gradient-to-r from-cyan-600 to-emerald-500' : 'bg-rose-600'
                      }`}
                      style={{ width: `${Math.min(100, readiness * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] font-mono text-slate-600">
                    Passing assemblies are only committed when math readiness is at or above the gate. Below it, even sandbox-passing candidates are held back.
                  </p>
                </>
              );
            })()}

            {(legoState.nasController?.policyGradients?.length ?? 0) > 0 && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-800/70">
                <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider shrink-0">NAS POLICY GRADIENT</span>
                <div className="flex items-end gap-0.5 h-5">
                  {legoState.nasController.policyGradients.slice(-10).map((g: number, i: number) => {
                    const vals = legoState.nasController.policyGradients.slice(-10);
                    const max = Math.max(...vals.map((v: number) => Math.abs(v)), 0.001);
                    const h = (Math.abs(g) / max) * 20;
                    return (
                      <div
                        key={i}
                        className={`w-1.5 rounded-sm ${g >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                        style={{ height: `${Math.max(2, h)}px` }}
                        title={g.toFixed(3)}
                      />
                    );
                  })}
                </div>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">
                  trend →
                  {legoState.nasController.policyGradients.length > 1
                    ? (legoState.nasController.policyGradients[legoState.nasController.policyGradients.length - 1] >= legoState.nasController.policyGradients[legoState.nasController.policyGradients.length - 2] ? ' up' : ' down')
                    : ' —'}
                </span>
              </div>
            )}
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
        </div>
      )}

      {/* Layer Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-900/80 border border-slate-800 rounded-xl font-mono text-xs">
        <button
          onClick={() => setActiveLayerTab('studs')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'studs'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Puzzle className="w-3.5 h-3.5" />
          <span>LAYER 1: THE STUDS (CONTRACTS)</span>
        </button>

        <button
          onClick={() => setActiveLayerTab('bricks')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'bricks'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>LAYER 2: THE BRICK BIN (LIBRARY)</span>
        </button>

        <button
          onClick={() => setActiveLayerTab('hands')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'hands'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>LAYER 3: THE HANDS (COMPOSITION DAG)</span>
        </button>

        <button
          onClick={() => setActiveLayerTab('brain')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'brain'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>LAYER 4: THE BRAIN (NAS & MOE)</span>
        </button>

        <button
          onClick={() => setActiveLayerTab('rulebook')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'rulebook'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>LAYER 5: THE RULEBOOK (SANDBOX & REGISTRY)</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* LAYER 1: THE STUDS (TYPED CONTRACTS)                                  */}
      {/* ==================================================================== */}
      {activeLayerTab === 'studs' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
                  <Puzzle className="w-4 h-4 text-amber-400" />
                  Machine-Readable Input/Output Contracts
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Standardized interface schemas: tensor shapes, data types, runtime preconditions, computational cost, and latency budgets.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-amber-950/60 border border-amber-800/80 rounded text-[11px] font-mono text-amber-300">
                Snappable Interoperability
              </span>
            </div>

            {/* Stud Catalog Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {legoState.studCatalog.map((stud) => (
                <div key={stud.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-bold text-amber-300">{stud.name}</span>
                      <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-mono">
                        {stud.dtype}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mb-3">{stud.schemaDescription}</p>

                    <div className="space-y-1.5 text-[11px] font-mono">
                      <div className="flex justify-between text-slate-500">
                        <span>Shape:</span>
                        <span className="text-slate-300 font-bold">[{stud.shape.dims.join(', ')}]</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Preconditions:</span>
                        <span className="text-emerald-400">{stud.preconditions.join(', ')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-900 flex justify-between items-center text-[10px] font-mono text-slate-400">
                    <span>Cost: {stud.expectedCostFlops} FLOPs</span>
                    <span>Lat: {stud.expectedLatencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive Stud Snapping Compatibility Checker */}
            <div className="mt-6 p-4 bg-slate-950 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                Interactive Stud Compatibility Verifier (Snap Test)
              </h4>
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex-1 w-full">
                  <label className="text-[10px] font-mono text-slate-500 block mb-1">Brick A Output Stud:</label>
                  <select 
                    value={testStudA} 
                    onChange={e => setTestStudA(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-slate-200"
                  >
                    {legoState.studCatalog.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                    ))}
                  </select>
                </div>

                <div className="p-2 bg-slate-900 rounded-full border border-slate-800 text-amber-400">
                  <ArrowRight className="w-4 h-4" />
                </div>

                <div className="flex-1 w-full">
                  <label className="text-[10px] font-mono text-slate-500 block mb-1">Brick B Input Stud:</label>
                  <select 
                    value={testStudB} 
                    onChange={e => setTestStudB(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-slate-200"
                  >
                    {legoState.studCatalog.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Verification Output */}
              {(() => {
                const studA = legoState.studCatalog.find(s => s.id === testStudA);
                const studB = legoState.studCatalog.find(s => s.id === testStudB);
                if (!studA || !studB) return null;
                const result = validateStudConnection(studA, studB);

                return (
                  <div className={`mt-4 p-3 rounded-lg border font-mono text-xs flex items-center justify-between ${
                    result.compatible 
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' 
                      : 'bg-red-950/40 border-red-800 text-red-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      {result.compatible ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      )}
                      <span>
                        {result.compatible 
                          ? (result.broadcastPossible ? 'Compatible via Tensor Broadcasting' : 'Direct Stud-to-Stud Match (Snappable)') 
                          : 'Incompatible Contracts: Cannot snap safely'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {result.warnings.concat(result.mismatches).join(' | ') || 'Zero contract violations'}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* LAYER 2: THE BRICK BIN (PRIMITIVE OPERATORS)                          */}
      {/* ==================================================================== */}
      {activeLayerTab === 'bricks' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
                  <Box className="w-4 h-4 text-blue-400" />
                  The Brick Bin: Atomic Operator Library
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Two cardinal rules: <strong>Independently Trainable</strong> (modules keep working anywhere) and <strong>Pure & Deterministic</strong> (zero hidden global state).
                </p>
              </div>
              <span className="px-2.5 py-1 bg-blue-950/60 border border-blue-800/80 rounded text-[11px] font-mono text-blue-300">
                {legoState.brickBin.length} Atomic Primitives
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {legoState.brickBin.map((brick) => (
                <div 
                  key={brick.id}
                  onClick={() => setSelectedBrick(brick)}
                  className={`p-4 rounded-xl border font-mono transition-all cursor-pointer flex flex-col justify-between ${
                    selectedBrick?.id === brick.id
                      ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-500/10'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white truncate max-w-[180px]">{brick.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded uppercase">
                        {brick.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mb-3">{brick.description}</p>

                    {/* Stud Ports */}
                    <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 text-[10px] mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">In Stud:</span>
                        <span className="text-amber-400 font-bold">{brick.inputContract.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Out Stud:</span>
                        <span className="text-emerald-400 font-bold">{brick.outputContract.name}</span>
                      </div>
                    </div>

                    {/* Quality Badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {brick.isIndependentlyTrainable && (
                        <span className="px-1.5 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-800 rounded text-[9px]">
                          Independently Trainable ({( (brick.isolatedScore || 0.9) * 100).toFixed(0)}%)
                        </span>
                      )}
                      {brick.isPureDeterministic && (
                        <span className="px-1.5 py-0.5 bg-purple-950/80 text-purple-300 border border-purple-800 rounded text-[9px]">
                          Pure & Deterministic
                        </span>
                      )}
                      {brick.isDifferentiable && (
                        <span className="px-1.5 py-0.5 bg-indigo-950/80 text-indigo-300 border border-indigo-800 rounded text-[9px]">
                          Differentiable Autograd
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-900 flex justify-between text-[10px] text-slate-500">
                    <span>Trainable Params: {Object.keys(brick.params).length}</span>
                    <span>Ver: {brick.version}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Brick Parameter Inspector */}
            {selectedBrick && (
              <div className="mt-6 p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-200">
                    Internal Parameter Inspection: {selectedBrick.name}
                  </span>
                  <span className="text-slate-500">Version {selectedBrick.version}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  {Object.entries(selectedBrick.params).slice(0, 8).map(([key, param]: [string, any]) => (
                    <div key={key} className="p-2 bg-slate-900 rounded border border-slate-800/80">
                      <span className="text-slate-500 block text-[10px]">{key}</span>
                      <span className="text-indigo-300 font-bold">{param?.value?.data !== undefined ? param.value.data.toFixed(4) : '0.0000'}</span>
                      <span className="text-[9px] text-slate-600 block">Grad: {param?.value?.grad !== undefined ? param.value.grad.toFixed(4) : '0.0000'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* LAYER 3: THE HANDS (COMPOSITION GRAPH & AUTOGRAD ENGINE)              */}
      {/* ==================================================================== */}
      {activeLayerTab === 'hands' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
                  <Network className="w-4 h-4 text-indigo-400" />
                  Layer 3: The Hands (Composition DAG Engine)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Wires bricks into a validated computation graph, checks type compatibility at every connection, topologically orders execution, and threads reverse autograd backpropagation.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-indigo-950/80 border border-indigo-800 text-indigo-300 rounded text-[11px] font-mono font-bold">
                {currentDAG ? currentDAG.name : 'No Active Assembly'}
              </span>
            </div>

            {/* Active DAG Flow Visualization */}
            {currentDAG ? (
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-4 text-xs font-mono text-slate-400">
                  <span>Topological Execution Flow:</span>
                  <span>Total Compute: ~{currentDAG.totalFlops} FLOPs | Latency: ~{currentDAG.totalLatencyMs.toFixed(2)}ms</span>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-3 overflow-x-auto pb-2">
                  {currentDAG.topologicalOrder.map((brickId, idx) => {
                    const brick = currentDAG.bricks.find(b => b.id === brickId);
                    if (!brick) return null;

                    return (
                      <React.Fragment key={brickId}>
                        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl min-w-[200px] flex-1 shadow-lg relative">
                          <div className="text-[10px] font-mono text-indigo-400 font-bold mb-1">
                            STEP {idx + 1}: {brick.category.toUpperCase()}
                          </div>
                          <div className="text-xs font-mono font-bold text-white mb-2 truncate">
                            {brick.name}
                          </div>

                          <div className="space-y-1 text-[10px] font-mono text-slate-400 bg-slate-950/80 p-2 rounded border border-slate-800/80">
                            <div className="flex justify-between">
                              <span className="text-slate-500">In:</span>
                              <span className="text-amber-400 truncate max-w-[110px]">{brick.inputContract.name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Out:</span>
                              <span className="text-emerald-400 truncate max-w-[110px]">{brick.outputContract.name}</span>
                            </div>
                          </div>
                        </div>

                        {idx < currentDAG.topologicalOrder.length - 1 && (
                          <div className="flex flex-col items-center text-indigo-400">
                            <ArrowRight className="w-5 h-5 hidden md:block" />
                            <span className="text-[9px] font-mono text-emerald-400">Snaps</span>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Edge validation details */}
                <div className="mt-4 pt-3 border-t border-slate-900 font-mono text-xs">
                  <div className="text-[10px] text-slate-500 uppercase mb-1.5">Connection Contracts:</div>
                  <div className="space-y-1">
                    {currentDAG.edges.map(e => (
                      <div key={e.id} className="flex items-center justify-between text-[11px] p-2 bg-slate-900/50 rounded border border-slate-800">
                        <span className="text-slate-300">{e.sourceBrickId} → {e.targetBrickId}</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {e.validationMessage}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl">
                No active assembly available. Click "TRIGGER NAS CYCLE" to generate one.
              </div>
            )}

            {/* Execution Trace & Autograd Backward Pass Output */}
            {lastExecResult && (
              <div className="mt-6 p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    Last Forward & Reverse Autograd Execution
                  </span>
                  <span className="text-emerald-400 text-[11px]">
                    Gradients Backpropagated: {lastExecResult.gradientsComputed ? 'YES (Chain Rule)' : 'NO'}
                  </span>
                </div>

                <div className="space-y-2">
                  {lastExecResult.traces?.map((trace: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-slate-900/80 rounded border border-slate-800 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="text-slate-300 font-bold">{trace.brickId}</span>
                        <span className="text-slate-500 ml-2">Latency: {trace.latencyMs.toFixed(2)}ms</span>
                      </div>
                      <span className="text-indigo-400">{trace.flopsConsumed} FLOPs</span>
                    </div>
                  ))}
                </div>

                {lastExecResult.loss !== undefined && (
                  <div className="mt-3 p-2.5 bg-indigo-950/40 border border-indigo-800 rounded flex justify-between items-center text-indigo-300 text-xs">
                    <span>Final Evaluated Scalar Loss:</span>
                    <span className="font-bold text-white">{lastExecResult.loss.toFixed(6)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* LAYER 4: THE BUILDER'S BRAIN (NAS POLICY & MOE ROUTER)                */}
      {/* ==================================================================== */}
      {activeLayerTab === 'brain' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-purple-400" />
                  Layer 4: The Builder's Brain (Assembly Policy)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  NAS Decomposition: Search Space (allowed bricks), Search Strategy (RL Controller with Bellman discounted Q-values), and Dynamic MoE runtime routers.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-purple-950/80 border border-purple-800 text-purple-300 rounded text-[11px] font-mono">
                AutoML Policy Gradients
              </span>
            </div>

            {/* NAS Controller Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 font-mono text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Discount Factor (γ)</span>
                <span className="text-purple-400 font-bold text-sm">
                  {legoState.nasController.gamma.toFixed(2)} (Bellman)
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Exploration Temp</span>
                <span className="text-amber-400 font-bold text-sm">
                  {legoState.nasController.temperature.toFixed(3)}
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Accepted Assemblies</span>
                <span className="text-emerald-400 font-bold text-sm">
                  {legoState.nasController.acceptedAssembliesCount} / {legoState.nasController.candidateProposalsCount}
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-500 block text-[10px]">Learning Rate</span>
                <span className="text-blue-400 font-bold text-sm">
                  {legoState.nasController.learningRate}
                </span>
              </div>
            </div>

            {/* MoE Dynamic Runtime Self-Assembly */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Dynamic Runtime Self-Assembly: MoE Sparse Gating Router
                </span>
                <span className="text-[10px] text-slate-500">
                  Reconfigures architecture per input token (Top-2 Experts)
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">
                    Input Token Embedding (8D vector):
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={testInputToken}
                      onChange={e => setTestInputToken(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded p-2 text-slate-200 text-xs font-mono"
                    />
                    <button
                      onClick={handleTestMoERouting}
                      className="px-3 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded font-bold cursor-pointer transition"
                    >
                      Route Token
                    </button>
                  </div>
                </div>

                {moeRouteResult && (
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                    <div className="text-[11px] text-slate-300">
                      Activated Expert Bricks:
                    </div>
                    <div className="flex gap-2">
                      {moeRouteResult.chosenExperts.map((exp: string) => (
                        <span key={exp} className="px-2 py-1 bg-purple-950 border border-purple-800 text-purple-300 rounded font-bold text-[11px]">
                          {exp}
                        </span>
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Probabilities: {moeRouteResult.routingProbabilities.map((p: number) => (p * 100).toFixed(1) + '%').join(', ')}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Policy Proposal History */}
            <div className="mt-6 p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs">
              <span className="font-bold text-slate-300 block mb-2">Recent NAS Policy Gradient Updates:</span>
              <div className="space-y-1.5">
                {legoState.nasController.history.slice(0, 5).map((h, i) => (
                  <div key={i} className="p-2 bg-slate-900/60 rounded border border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Episode #{h.episode} ({h.assemblyId})</span>
                    <span className="text-emerald-400">Reward: {(h.reward * 100).toFixed(1)}%</span>
                    <span className="text-purple-300">Bellman Q: {h.qEstimate.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* LAYER 5: THE RULEBOOK (EVALUATOR, SANDBOX & REGISTRY)                 */}
      {/* ==================================================================== */}
      {activeLayerTab === 'rulebook' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Layer 5: The Rulebook (Governance & Convergence)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Self-assembly without governance is just entropy. Fixed benchmark evaluator, compute-budgeted sandbox with rollback, and immutable versioned registry.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded text-[11px] font-mono">
                Bounded Self-Refinement
              </span>
            </div>

            {/* 3 Pillars of Governance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Pillar 1: Fixed Benchmark */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs">
                <div className="flex items-center gap-2 mb-2 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Fixed Benchmark Harness</span>
                </div>
                <p className="text-slate-400 text-[11px] mb-3">
                  External test suite the system cannot modify. Scores candidate assemblies on held-out tasks.
                </p>
                <div className="space-y-1.5 text-[10px]">
                  {legoState.fixedBenchmarkTasks.map(t => (
                    <div key={t.id} className="p-1.5 bg-slate-900 rounded border border-slate-800/80 flex justify-between">
                      <span className="text-slate-300 truncate max-w-[120px]">{t.name}</span>
                      <span className="text-emerald-400">{t.metric}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pillar 2: Isolated Sandbox */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs">
                <div className="flex items-center gap-2 mb-2 text-amber-400 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Compute-Budgeted Sandbox</span>
                </div>
                <p className="text-slate-400 text-[11px] mb-3">
                  Isolated execution with strict limits. Failed builds trigger immediate rollback, never merged.
                </p>
                <div className="space-y-1 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span>FLOP Ceiling:</span>
                    <span className="text-amber-300">{legoState.sandboxConfig.maxFlopsLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Execution Timeout:</span>
                    <span className="text-amber-300">{legoState.sandboxConfig.timeoutMs}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pure Execution:</span>
                    <span className="text-emerald-400">ENFORCED</span>
                  </div>
                </div>
              </div>

              {/* Pillar 3: Versioned Registry */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs">
                <div className="flex items-center gap-2 mb-2 text-purple-400 font-bold">
                  <GitBranch className="w-4 h-4" />
                  <span>Versioned Registry</span>
                </div>
                <p className="text-slate-400 text-[11px] mb-3">
                  Cryptographic lineage with SHA-256 hashes. Allows snap-back and sub-assembly reuse as macro-bricks.
                </p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span>Total Registered:</span>
                    <span className="text-purple-300 font-bold">{legoState.registry.length} DAGs</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Reusable Macro-Bricks:</span>
                    <span className="text-emerald-400 font-bold">
                      {legoState.registry.filter(r => r.reusableAsBrick).length} Available
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Versioned Registry Entries */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs">
              <span className="font-bold text-white block mb-3">
                Immutable Registry Provenance Ledger:
              </span>
              <div className="space-y-2">
                {legoState.registry.map(entry => (
                  <div key={entry.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{entry.assembly.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded">
                          {entry.version}
                        </span>
                        {entry.reusableAsBrick && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded">
                            REUSABLE MACRO-BRICK
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        Hash: {entry.hash} • Lineage Root: {entry.provenance.lineageHash}
                      </div>
                    </div>

                    <div className="text-right text-[11px]">
                      <span className="text-emerald-400 font-bold block">
                        {(entry.benchmarkScore * 100).toFixed(1)}% Benchmark
                      </span>
                      <span className="text-slate-500 text-[10px]">
                        {entry.assembly.topologicalOrder.length} Layers Snap
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

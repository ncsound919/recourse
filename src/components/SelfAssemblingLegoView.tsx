// src/components/SelfAssemblingLegoView.tsx
// Visualizer and interactive workbench for the 5 Layers of Self-Assembling Learning Systems.

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  GitBranch,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  ArrowRight,
  Compass,
  Zap,
  Box,
  Puzzle,
  Network
} from 'lucide-react';
import type {
  LegoSystemState,
  BrickOperator
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
      <div className="p-12 text-center text-ink-400 flex items-center justify-center gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-accent-400" />
        <span>Initializing 5-Layer Composable ML Subsystem...</span>
      </div>
    );
  }

  const currentDAG = legoState.currentAssembly;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 shadow-lg relative overflow-hidden">
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-warn-500/20 text-warn-300 border border-warn-500/30 rounded text-xs font-semibold flex items-center gap-1.5">
                <Puzzle className="w-3.5 h-3.5" />
                Lego architecture for composable ML
              </span>
              <span className="text-xs text-ink-400">
                • Standardized Studs & Autonomous Assembly
              </span>
            </div>
            <h2 className="text-xl font-semibold text-white tracking-tight">
              Self-Assembling Learning System
            </h2>
            <p className="text-xs text-ink-400 max-w-2xl mt-1">
              The magic isn't the bricks, it's the studs. Standardized machine-readable contracts enable autonomous assembly through a 3-part NAS engine: component search space, RL policy search strategy, and held-out benchmark evaluation.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerSelfAssembly}
              disabled={loading}
              className="px-3.5 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 text-warn-300" />
              )}
              <span>Trigger NAS cycle</span>
            </button>

            <button
              onClick={handleRunPipeline}
              disabled={executing || !currentDAG}
              className="px-3.5 py-2 bg-ok-700 hover:bg-ok-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {executing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Run autograd pass</span>
            </button>
          </div>
        </div>

        {/* Global Stack Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5 pt-4 border-t border-ink-800/80 text-xs">
          <div className="bg-ink-950/60 p-2.5 rounded-lg border border-ink-800">
            <span className="text-ink-500 block text-[10px] ">Active Bricks</span>
            <span className="text-ok-400 font-semibold text-sm">
              {legoState.brickBin.length} Atomic Ops
            </span>
          </div>
          <div className="bg-ink-950/60 p-2.5 rounded-lg border border-ink-800">
            <span className="text-ink-500 block text-[10px] ">Stud Schemas</span>
            <span className="text-accent-400 font-semibold text-sm">
              {legoState.studCatalog.length} Typed Contracts
            </span>
          </div>
          <div className="bg-ink-950/60 p-2.5 rounded-lg border border-ink-800">
            <span className="text-ink-500 block text-[10px] ">NAS Proposals</span>
            <span className="text-warn-400 font-semibold text-sm">
              {legoState.nasController.candidateProposalsCount} Episodes
            </span>
          </div>
          <div className="bg-ink-950/60 p-2.5 rounded-lg border border-ink-800">
            <span className="text-ink-500 block text-[10px] ">Registry Lineage</span>
            <span className="text-accent-400 font-semibold text-sm">
              {legoState.registry.length} Promoted DAGs
            </span>
          </div>
          <div className="bg-ink-950/60 p-2.5 rounded-lg border border-ink-800">
            <span className="text-ink-500 block text-[10px] ">System Integrity</span>
            <span className="text-accent-400 font-semibold text-sm">
              {(legoState.systemIntegrityScore * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Mission-Control: Readiness Gate & NAS Policy */}
      {legoState && (
        <div className="rounded-xl border border-accent-800/50 bg-ink-950 overflow-hidden">
          <div className="h-px bg-ink-800" />
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-ink-500 ">Mission control - registry gate</span>
              <span className="text-[10px] text-ink-500">
                NAS PROPOSALS <span className="text-warn-300 font-semibold">{legoState.nasController?.candidateProposalsCount ?? 0}</span>
                <span className="text-ink-600 mx-2">│</span>
                COMMITTED <span className="text-ok-400 font-semibold">{legoState.registry?.length ?? 0}</span>
                <span className="text-ink-600 mx-2">│</span>
                SELF-ASSEMBLED <span className="text-warn-300 font-semibold">{legoState.totalSelfAssembledCount ?? 0}</span>
              </span>
            </div>

            {(() => {
              const readiness = legoState.readinessGate ?? 0;
              const gate = 0.7;
              const eligible = readiness >= gate;
              return (
                <>
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-ink-500 text-[10px]">Readiness gate (math engine)</span>
                    <div className="flex items-center gap-2">
                      <span className={readiness >= gate ? 'text-ok-400' : 'text-bad-400'}>
                        {readiness.toFixed(3)} <span className="text-ink-600">/ {gate.toFixed(2)}</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        eligible ? 'bg-ok-950 text-ok-300 border border-ok-800' : 'bg-bad-950 text-bad-300 border border-bad-800'
                      }`}>
                        {eligible ? '✓ COMMIT ELIGIBLE' : '✗ GATE BLOCKED'}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-ink-900 rounded-full overflow-hidden">
                    <div className="absolute top-0 bottom-0 left-0 z-10 w-px bg-ink-500" style={{ left: `${gate * 100}%` }} title="0.70 gate" />
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        eligible ? 'bg-gradient-to-r from-accent-600 to-ok-500' : 'bg-bad-600'
                      }`}
                      style={{ width: `${Math.min(100, readiness * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-ink-600">
                    Passing assemblies are only committed when math readiness is at or above the gate. Below it, even sandbox-passing candidates are held back.
                  </p>
                </>
              );
            })()}

            {(legoState.nasController?.policyGradients?.length ?? 0) > 0 && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-ink-800/70">
                <span className="text-[10px] text-ink-600 shrink-0">NAS policy gradient</span>
                <div className="flex items-end gap-0.5 h-5">
                  {legoState.nasController.policyGradients.slice(-10).map((g: number, i: number) => {
                    const vals = legoState.nasController.policyGradients.slice(-10);
                    const max = Math.max(...vals.map((v: number) => Math.abs(v)), 0.001);
                    const h = (Math.abs(g) / max) * 20;
                    return (
                      <div
                        key={i}
                        className={`w-1.5 rounded-sm ${g >= 0 ? 'bg-ok-500/70' : 'bg-bad-500/70'}`}
                        style={{ height: `${Math.max(2, h)}px` }}
                        title={g.toFixed(3)}
                      />
                    );
                  })}
                </div>
                <span className="text-[10px] text-ink-500 shrink-0">
                  trend →
                  {legoState.nasController.policyGradients.length > 1
                    ? (legoState.nasController.policyGradients[legoState.nasController.policyGradients.length - 1] >= legoState.nasController.policyGradients[legoState.nasController.policyGradients.length - 2] ? ' up' : ' down')
                    : ' -'}
                </span>
              </div>
            )}
          </div>
          <div className="h-px bg-ink-800" />
        </div>
      )}

      {/* Layer Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-ink-900/80 border border-ink-800 rounded-xl text-xs">
        <button
          onClick={() => setActiveLayerTab('studs')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'studs'
              ? 'bg-warn-500/20 text-warn-300 border border-warn-500/40 shadow-sm'
              : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          <Puzzle className="w-3.5 h-3.5" />
          <span>Layer 1: the studs (contracts)</span>
        </button>

        <button
          onClick={() => setActiveLayerTab('bricks')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'bricks'
              ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40 shadow-sm'
              : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>Layer 2: the brick bin (library)</span>
        </button>

        <button
          onClick={() => setActiveLayerTab('hands')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'hands'
              ? 'bg-accent-600 text-white shadow-md'
              : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Layer 3: the hands (composition dag)</span>
        </button>

        <button
          onClick={() => setActiveLayerTab('brain')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'brain'
              ? 'bg-accent-500/20 text-accent-300 border border-accent-500/40 shadow-sm'
              : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Layer 4: the brain (NAS & MOE)</span>
        </button>

        <button
          onClick={() => setActiveLayerTab('rulebook')}
          className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            activeLayerTab === 'rulebook'
              ? 'bg-ok-500/20 text-ok-300 border border-ok-500/40 shadow-sm'
              : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Layer 5: the rulebook (sandbox & registry)</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* LAYER 1: THE STUDS (TYPED CONTRACTS)                                  */}
      {/* ==================================================================== */}
      {activeLayerTab === 'studs' && (
        <div className="space-y-6">
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Puzzle className="w-4 h-4 text-warn-400" />
                  Machine-Readable Input/Output Contracts
                </h3>
                <p className="text-xs text-ink-400 mt-0.5">
                  Standardized interface schemas: tensor shapes, data types, runtime preconditions, computational cost, and latency budgets.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-warn-950/60 border border-warn-800/80 rounded text-[11px] text-warn-300">
                Snappable Interoperability
              </span>
            </div>

            {/* Stud Catalog Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {legoState.studCatalog.map((stud) => (
                <div key={stud.id} className="bg-ink-950 p-4 rounded-xl border border-ink-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-warn-300">{stud.name}</span>
                      <span className="px-1.5 py-0.5 bg-ink-800 text-ink-300 rounded text-[10px]">
                        {stud.dtype}
                      </span>
                    </div>
                    <p className="text-xs text-ink-400 mb-3">{stud.schemaDescription}</p>

                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex justify-between text-ink-500">
                        <span>Shape:</span>
                        <span className="text-ink-300 font-semibold">[{stud.shape.dims.join(', ')}]</span>
                      </div>
                      <div className="flex justify-between text-ink-500">
                        <span>Preconditions:</span>
                        <span className="text-ok-400">{stud.preconditions.join(', ')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-ink-900 flex justify-between items-center text-[10px] text-ink-400">
                    <span>Cost: {stud.expectedCostFlops} FLOPs</span>
                    <span>Lat: {stud.expectedLatencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive Stud Snapping Compatibility Checker */}
            <div className="mt-6 p-4 bg-ink-950 rounded-xl border border-ink-800">
              <h4 className="text-xs font-semibold text-ink-300 mb-3 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-warn-400" />
                Interactive Stud Compatibility Verifier (Snap Test)
              </h4>
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex-1 w-full">
                  <label className="text-[10px] text-ink-500 block mb-1">Brick A Output Stud:</label>
                  <select 
                    value={testStudA} 
                    onChange={e => setTestStudA(e.target.value)}
                    className="w-full bg-ink-900 border border-ink-800 rounded p-2 text-xs text-ink-200"
                  >
                    {legoState.studCatalog.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                    ))}
                  </select>
                </div>

                <div className="p-2 bg-ink-900 rounded-full border border-ink-800 text-warn-400">
                  <ArrowRight className="w-4 h-4" />
                </div>

                <div className="flex-1 w-full">
                  <label className="text-[10px] text-ink-500 block mb-1">Brick B Input Stud:</label>
                  <select 
                    value={testStudB} 
                    onChange={e => setTestStudB(e.target.value)}
                    className="w-full bg-ink-900 border border-ink-800 rounded p-2 text-xs text-ink-200"
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
                      ? 'bg-ok-950/40 border-ok-800 text-ok-300' 
                      : 'bg-bad-950/40 border-bad-800 text-bad-300'
                  }`}>
                    <div className="flex items-center gap-2">
                      {result.compatible ? (
                        <CheckCircle2 className="w-4 h-4 text-ok-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-bad-400" />
                      )}
                      <span>
                        {result.compatible 
                          ? (result.broadcastPossible ? 'Compatible via Tensor Broadcasting' : 'Direct Stud-to-Stud Match (Snappable)') 
                          : 'Incompatible Contracts: Cannot snap safely'}
                      </span>
                    </div>
                    <span className="text-[10px] text-ink-400">
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
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Box className="w-4 h-4 text-accent-400" />
                  The Brick Bin: Atomic Operator Library
                </h3>
                <p className="text-xs text-ink-400 mt-0.5">
                  Two cardinal rules: <strong>Independently Trainable</strong> (modules keep working anywhere) and <strong>Pure & Deterministic</strong> (zero hidden global state).
                </p>
              </div>
              <span className="px-2.5 py-1 bg-accent-950/60 border border-accent-800/80 rounded text-[11px] text-accent-300">
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
                      ? 'bg-accent-950/40 border-accent-500 shadow-md'
                      : 'bg-ink-950 border-ink-800 hover:border-ink-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-white truncate max-w-[180px]">{brick.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-ink-800 text-ink-300 rounded ">
                        {brick.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-400 line-clamp-2 mb-3">{brick.description}</p>

                    {/* Stud Ports */}
                    <div className="space-y-1 bg-ink-900/60 p-2.5 rounded-lg border border-ink-800/80 text-[10px] mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-ink-500">In Stud:</span>
                        <span className="text-warn-400 font-semibold">{brick.inputContract.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-ink-500">Out Stud:</span>
                        <span className="text-ok-400 font-semibold">{brick.outputContract.name}</span>
                      </div>
                    </div>

                    {/* Quality Badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {brick.isIndependentlyTrainable && (
                        <span className="px-1.5 py-0.5 bg-ok-950/80 text-ok-300 border border-ok-800 rounded text-[9px]">
                          Independently Trainable ({( (brick.isolatedScore || 0.9) * 100).toFixed(0)}%)
                        </span>
                      )}
                      {brick.isPureDeterministic && (
                        <span className="px-1.5 py-0.5 bg-accent-950/80 text-accent-300 border border-accent-800 rounded text-[9px]">
                          Pure & Deterministic
                        </span>
                      )}
                      {brick.isDifferentiable && (
                        <span className="px-1.5 py-0.5 bg-accent-950/80 text-accent-300 border border-accent-800 rounded text-[9px]">
                          Differentiable Autograd
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-ink-900 flex justify-between text-[10px] text-ink-500">
                    <span>Trainable Params: {Object.keys(brick.params).length}</span>
                    <span>Ver: {brick.version}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Brick Parameter Inspector */}
            {selectedBrick && (
              <div className="mt-6 p-4 bg-ink-950 rounded-xl border border-ink-800 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-ink-200">
                    Internal Parameter Inspection: {selectedBrick.name}
                  </span>
                  <span className="text-ink-500">Version {selectedBrick.version}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  {Object.entries(selectedBrick.params).slice(0, 8).map(([key, param]: [string, any]) => (
                    <div key={key} className="p-2 bg-ink-900 rounded border border-ink-800/80">
                      <span className="text-ink-500 block text-[10px]">{key}</span>
                      <span className="text-accent-300 font-semibold">{param?.value?.data !== undefined ? param.value.data.toFixed(4) : '0.0000'}</span>
                      <span className="text-[9px] text-ink-600 block">Grad: {param?.value?.grad !== undefined ? param.value.grad.toFixed(4) : '0.0000'}</span>
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
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Network className="w-4 h-4 text-accent-400" />
                  Layer 3: The Hands (Composition DAG Engine)
                </h3>
                <p className="text-xs text-ink-400 mt-0.5">
                  Wires bricks into a validated computation graph, checks type compatibility at every connection, topologically orders execution, and threads reverse autograd backpropagation.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-accent-950/80 border border-accent-800 text-accent-300 rounded text-[11px] font-semibold">
                {currentDAG ? currentDAG.name : 'No Active Assembly'}
              </span>
            </div>

            {/* Active DAG Flow Visualization */}
            {currentDAG ? (
              <div className="p-4 bg-ink-950 rounded-xl border border-ink-800">
                <div className="flex items-center justify-between mb-4 text-xs text-ink-400">
                  <span>Topological Execution Flow:</span>
                  <span>Total Compute: ~{currentDAG.totalFlops} FLOPs | Latency: ~{currentDAG.totalLatencyMs.toFixed(2)}ms</span>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-3 overflow-x-auto pb-2">
                  {currentDAG.topologicalOrder.map((brickId, idx) => {
                    const brick = currentDAG.bricks.find(b => b.id === brickId);
                    if (!brick) return null;

                    return (
                      <React.Fragment key={brickId}>
                        <div className="bg-ink-900 border border-ink-800 p-3.5 rounded-xl min-w-[200px] flex-1 shadow-lg relative">
                          <div className="text-[10px] text-accent-400 font-semibold mb-1">
                            STEP {idx + 1}: {brick.category.toUpperCase()}
                          </div>
                          <div className="text-xs font-semibold text-white mb-2 truncate">
                            {brick.name}
                          </div>

                          <div className="space-y-1 text-[10px] text-ink-400 bg-ink-950/80 p-2 rounded border border-ink-800/80">
                            <div className="flex justify-between">
                              <span className="text-ink-500">In:</span>
                              <span className="text-warn-400 truncate max-w-[110px]">{brick.inputContract.name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-ink-500">Out:</span>
                              <span className="text-ok-400 truncate max-w-[110px]">{brick.outputContract.name}</span>
                            </div>
                          </div>
                        </div>

                        {idx < currentDAG.topologicalOrder.length - 1 && (
                          <div className="flex flex-col items-center text-accent-400">
                            <ArrowRight className="w-5 h-5 hidden md:block" />
                            <span className="text-[9px] text-ok-400">Snaps</span>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Edge validation details */}
                <div className="mt-4 pt-3 border-t border-ink-900 text-xs">
                  <div className="text-[10px] text-ink-500 mb-1.5">Connection Contracts:</div>
                  <div className="space-y-1">
                    {currentDAG.edges.map(e => (
                      <div key={e.id} className="flex items-center justify-between text-[11px] p-2 bg-ink-900/50 rounded border border-ink-800">
                        <span className="text-ink-300">{e.sourceBrickId} → {e.targetBrickId}</span>
                        <span className="text-ok-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {e.validationMessage}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-ink-500 text-xs border border-dashed border-ink-800 rounded-xl">
                No active assembly available. Click "TRIGGER NAS CYCLE" to generate one.
              </div>
            )}

            {/* Execution Trace & Autograd Backward Pass Output */}
            {lastExecResult && (
              <div className="mt-6 p-4 bg-ink-950 rounded-xl border border-ink-800 text-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-ok-400" />
                    Last Forward & Reverse Autograd Execution
                  </span>
                  <span className="text-ok-400 text-[11px]">
                    Gradients Backpropagated: {lastExecResult.gradientsComputed ? 'YES (Chain Rule)' : 'NO'}
                  </span>
                </div>

                <div className="space-y-2">
                  {lastExecResult.traces?.map((trace: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-ink-900/80 rounded border border-ink-800 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="text-ink-300 font-semibold">{trace.brickId}</span>
                        <span className="text-ink-500 ml-2">Latency: {trace.latencyMs.toFixed(2)}ms</span>
                      </div>
                      <span className="text-accent-400">{trace.flopsConsumed} FLOPs</span>
                    </div>
                  ))}
                </div>

                {lastExecResult.loss !== undefined && (
                  <div className="mt-3 p-2.5 bg-accent-950/40 border border-accent-800 rounded flex justify-between items-center text-accent-300 text-xs">
                    <span>Final Evaluated Scalar Loss:</span>
                    <span className="font-semibold text-white">{lastExecResult.loss.toFixed(6)}</span>
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
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-accent-400" />
                  Layer 4: The Builder's Brain (Assembly Policy)
                </h3>
                <p className="text-xs text-ink-400 mt-0.5">
                  NAS Decomposition: Search Space (allowed bricks), Search Strategy (RL Controller with Bellman discounted Q-values), and Dynamic MoE runtime routers.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-accent-950/80 border border-accent-800 text-accent-300 rounded text-[11px]">
                AutoML Policy Gradients
              </span>
            </div>

            {/* NAS Controller Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 text-xs">
              <div className="p-3 bg-ink-950 rounded-xl border border-ink-800">
                <span className="text-ink-500 block text-[10px]">Discount Factor (γ)</span>
                <span className="text-accent-400 font-semibold text-sm">
                  {legoState.nasController.gamma.toFixed(2)} (Bellman)
                </span>
              </div>
              <div className="p-3 bg-ink-950 rounded-xl border border-ink-800">
                <span className="text-ink-500 block text-[10px]">Exploration Temp</span>
                <span className="text-warn-400 font-semibold text-sm">
                  {legoState.nasController.temperature.toFixed(3)}
                </span>
              </div>
              <div className="p-3 bg-ink-950 rounded-xl border border-ink-800">
                <span className="text-ink-500 block text-[10px]">Accepted Assemblies</span>
                <span className="text-ok-400 font-semibold text-sm">
                  {legoState.nasController.acceptedAssembliesCount} / {legoState.nasController.candidateProposalsCount}
                </span>
              </div>
              <div className="p-3 bg-ink-950 rounded-xl border border-ink-800">
                <span className="text-ink-500 block text-[10px]">Learning Rate</span>
                <span className="text-accent-400 font-semibold text-sm">
                  {legoState.nasController.learningRate}
                </span>
              </div>
            </div>

            {/* MoE Dynamic Runtime Self-Assembly */}
            <div className="p-4 bg-ink-950 rounded-xl border border-ink-800 text-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-warn-400" />
                  Dynamic Runtime Self-Assembly: MoE Sparse Gating Router
                </span>
                <span className="text-[10px] text-ink-500">
                  Reconfigures architecture per input token (Top-2 Experts)
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-ink-500 block mb-1">
                    Input Token Embedding (8D vector):
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={testInputToken}
                      onChange={e => setTestInputToken(e.target.value)}
                      className="flex-1 bg-ink-900 border border-ink-800 rounded p-2 text-ink-200 text-xs"
                    />
                    <button
                      onClick={handleTestMoERouting}
                      className="px-3 py-2 bg-accent-700 hover:bg-accent-600 text-white rounded font-semibold cursor-pointer transition"
                    >
                      Route Token
                    </button>
                  </div>
                </div>

                {moeRouteResult && (
                  <div className="p-3 bg-ink-900 rounded-lg border border-ink-800 space-y-2">
                    <div className="text-[11px] text-ink-300">
                      Activated Expert Bricks:
                    </div>
                    <div className="flex gap-2">
                      {moeRouteResult.chosenExperts.map((exp: string) => (
                        <span key={exp} className="px-2 py-1 bg-accent-950 border border-accent-800 text-accent-300 rounded font-semibold text-[11px]">
                          {exp}
                        </span>
                      ))}
                    </div>
                    <div className="text-[10px] text-ink-500">
                      Probabilities: {moeRouteResult.routingProbabilities.map((p: number) => (p * 100).toFixed(1) + '%').join(', ')}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Policy Proposal History */}
            <div className="mt-6 p-4 bg-ink-950 rounded-xl border border-ink-800 text-xs">
              <span className="font-semibold text-ink-300 block mb-2">Recent NAS Policy Gradient Updates:</span>
              <div className="space-y-1.5">
                {legoState.nasController.history.slice(0, 5).map((h, i) => (
                  <div key={i} className="p-2 bg-ink-900/60 rounded border border-ink-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-ink-400">Episode #{h.episode} ({h.assemblyId})</span>
                    <span className="text-ok-400">Reward: {(h.reward * 100).toFixed(1)}%</span>
                    <span className="text-accent-300">Bellman Q: {h.qEstimate.toFixed(2)}</span>
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
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-ok-400" />
                  Layer 5: The Rulebook (Governance & Convergence)
                </h3>
                <p className="text-xs text-ink-400 mt-0.5">
                  Self-assembly without governance is just entropy. Fixed benchmark evaluator, compute-budgeted sandbox with rollback, and immutable versioned registry.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-ok-950/80 border border-ok-800 text-ok-300 rounded text-[11px]">
                Bounded Self-Refinement
              </span>
            </div>

            {/* 3 Pillars of Governance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Pillar 1: Fixed Benchmark */}
              <div className="bg-ink-950 p-4 rounded-xl border border-ink-800 text-xs">
                <div className="flex items-center gap-2 mb-2 text-ok-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Fixed Benchmark Harness</span>
                </div>
                <p className="text-ink-400 text-[11px] mb-3">
                  External test suite the system cannot modify. Scores candidate assemblies on held-out tasks.
                </p>
                <div className="space-y-1.5 text-[10px]">
                  {legoState.fixedBenchmarkTasks.map(t => (
                    <div key={t.id} className="p-1.5 bg-ink-900 rounded border border-ink-800/80 flex justify-between">
                      <span className="text-ink-300 truncate max-w-[120px]">{t.name}</span>
                      <span className="text-ok-400">{t.metric}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pillar 2: Isolated Sandbox */}
              <div className="bg-ink-950 p-4 rounded-xl border border-ink-800 text-xs">
                <div className="flex items-center gap-2 mb-2 text-warn-400 font-semibold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Compute-Budgeted Sandbox</span>
                </div>
                <p className="text-ink-400 text-[11px] mb-3">
                  Isolated execution with strict limits. Failed builds trigger immediate rollback, never merged.
                </p>
                <div className="space-y-1 text-[11px] text-ink-300">
                  <div className="flex justify-between">
                    <span>FLOP Ceiling:</span>
                    <span className="text-warn-300">{legoState.sandboxConfig.maxFlopsLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Execution Timeout:</span>
                    <span className="text-warn-300">{legoState.sandboxConfig.timeoutMs}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pure Execution:</span>
                    <span className="text-ok-400">Enforced</span>
                  </div>
                </div>
              </div>

              {/* Pillar 3: Versioned Registry */}
              <div className="bg-ink-950 p-4 rounded-xl border border-ink-800 text-xs">
                <div className="flex items-center gap-2 mb-2 text-accent-400 font-semibold">
                  <GitBranch className="w-4 h-4" />
                  <span>Versioned Registry</span>
                </div>
                <p className="text-ink-400 text-[11px] mb-3">
                  Cryptographic lineage with SHA-256 hashes. Allows snap-back and sub-assembly reuse as macro-bricks.
                </p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span>Total Registered:</span>
                    <span className="text-accent-300 font-semibold">{legoState.registry.length} DAGs</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Reusable Macro-Bricks:</span>
                    <span className="text-ok-400 font-semibold">
                      {legoState.registry.filter(r => r.reusableAsBrick).length} Available
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Versioned Registry Entries */}
            <div className="p-4 bg-ink-950 rounded-xl border border-ink-800 text-xs">
              <span className="font-semibold text-white block mb-3">
                Immutable Registry Provenance Ledger:
              </span>
              <div className="space-y-2">
                {legoState.registry.map(entry => (
                  <div key={entry.id} className="p-3 bg-ink-900 rounded-lg border border-ink-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{entry.assembly.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-accent-950 text-accent-300 border border-accent-800 rounded">
                          {entry.version}
                        </span>
                        {entry.reusableAsBrick && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-ok-950 text-ok-300 border border-ok-800 rounded">
                            Reusable macro-brick
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-ink-500 mt-1">
                        Hash: {entry.hash} • Lineage Root: {entry.provenance.lineageHash}
                      </div>
                    </div>

                    <div className="text-right text-[11px]">
                      <span className="text-ok-400 font-semibold block">
                        {(entry.benchmarkScore * 100).toFixed(1)}% Benchmark
                      </span>
                      <span className="text-ink-500 text-[10px]">
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

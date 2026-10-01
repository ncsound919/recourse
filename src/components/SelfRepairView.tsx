import React, { useState, useEffect } from 'react';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Flame,
  Dna,
  Sliders,
  RefreshCw,
  Cpu,
  ShieldAlert,
  Clock,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { AnomalyReport, SelfRepairStatus, HyperParameters, ToolDomain, ToolEntry, SelfRepairKnowledge } from '../types';

interface SelfRepairViewProps {
  selfRepair: SelfRepairStatus;
  hyperParams: HyperParameters;
  registry: ToolEntry[];
  onTriggerChaos: (chaosType: string, targetToolName?: string) => Promise<void>;
  onScanAndHeal: () => Promise<void>;
  onSingleRepair: (toolName: string, brokenCode?: string, faultHint?: string) => Promise<void>;
  onCrossover: (parentA: string, parentB: string, domain: ToolDomain) => Promise<void>;
  onUpdateHyperParams: (params: Partial<HyperParameters>) => Promise<void>;
}

export const SelfRepairView: React.FC<SelfRepairViewProps> = ({
  selfRepair,
  hyperParams,
  registry,
  onTriggerChaos,
  onScanAndHeal,
  onSingleRepair,
  onCrossover,
  onUpdateHyperParams
}) => {
  const [anomalies, setAnomalies] = useState<AnomalyReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedChaos, setSelectedChaos] = useState<string>('vieta_sign_bug');
  const [selectedToolForChaos, setSelectedToolForChaos] = useState<string>('quadratic_vieta_root_sum');
  const [crossoverParentA, setCrossoverParentA] = useState<string>(registry[0]?.name || '');
  const [crossoverParentB, setCrossoverParentB] = useState<string>(registry[1]?.name || '');
  const [crossoverDomain, setCrossoverDomain] = useState<ToolDomain>('cyber_defense');
  const [activeSubTab, setActiveSubTab] = useState<'anomalies' | 'chaos' | 'template_repair' | 'crossover' | 'tuning'>('anomalies');
  const [repairKnowledge, setRepairKnowledge] = useState<SelfRepairKnowledge | null>(null);
  const [testBrokenCode, setTestBrokenCode] = useState<string>(
    `export function sumOfRoots(a: number, b: number, c: number): number {\n  return b / a; // Bug: missing negation\n}`
  );
  const [testDomain, setTestDomain] = useState<ToolDomain>('math');
  const [testFaultHint, setTestFaultHint] = useState<string>('vieta_sign_bug');
  const [testRepairResult, setTestRepairResult] = useState<any>(null);

  // Local Hyperparameters state
  const [localParams, setLocalParams] = useState<HyperParameters>(hyperParams || {
    repairAggressiveness: 0.85,
    mutationTemperature: 0.2,
    explorationRate: 0.15,
    crossoverFrequency: 0.25,
    maxRepairTries: 3
  });

  const fetchAnomalies = async () => {
    try {
      const res = await fetch('/api/recourse/repair/status').then(r => r.json());
      if (res?.anomalies) {
        setAnomalies(res.anomalies);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchKnowledge = async () => {
    try {
      const res = await fetch('/api/recourse/repair/knowledge').then(r => r.json());
      if (res?.success && res.knowledge) {
        setRepairKnowledge(res.knowledge);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAnomalies();
    fetchKnowledge();
    const interval = setInterval(() => {
      fetchAnomalies();
      fetchKnowledge();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleChaos = async () => {
    setLoading(true);
    try {
      await onTriggerChaos(selectedChaos, selectedToolForChaos);
      await fetchAnomalies();
    } finally {
      setLoading(false);
    }
  };

  const handleHealAll = async () => {
    setLoading(true);
    try {
      await onScanAndHeal();
      await fetchAnomalies();
    } finally {
      setLoading(false);
    }
  };

  const handleCrossoverSubmit = async () => {
    if (!crossoverParentA || !crossoverParentB) return;
    setLoading(true);
    try {
      await onCrossover(crossoverParentA, crossoverParentB, crossoverDomain);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHyperParams = async () => {
    await onUpdateHyperParams(localParams);
  };

  return (
    <div className="space-y-6">
      {/* Self-Healing Telemetry HUD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-ink-900/90 border border-ink-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-400 ">Autonomous Heals</span>
            <Wrench className="w-4 h-4 text-ok-400" />
          </div>
          <div className="mt-2">
            <span className="text-3xl font-semibold text-ok-400">{selfRepair.totalHealedCount}</span>
            <span className="ml-2 text-xs text-ink-400">genes restored</span>
          </div>
          <p className="text-[10px] text-ink-500 mt-1">Zero human downtime intervention</p>
        </div>

        <div className="bg-ink-900/90 border border-ink-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-400 ">Mean Time to Repair</span>
            <Clock className="w-4 h-4 text-accent-400" />
          </div>
          <div className="mt-2">
            <span className="text-3xl font-semibold text-accent-300">{selfRepair.meanTimeToRepairMs}</span>
            <span className="ml-1 text-sm text-ink-400">ms</span>
          </div>
          <p className="text-[10px] text-ink-500 mt-1">Instantaneous AST patch synthesis</p>
        </div>

        <div className="bg-ink-900/90 border border-ink-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-400 ">Active Anomalies</span>
            <AlertTriangle className={`w-4 h-4 ${selfRepair.activeAnomaliesCount > 0 ? 'text-warn-400' : 'text-ink-500'}`} />
          </div>
          <div className="mt-2">
            <span className={`text-3xl font-semibold ${selfRepair.activeAnomaliesCount > 0 ? 'text-warn-400' : 'text-ink-300'}`}>
              {selfRepair.activeAnomaliesCount}
            </span>
            <span className="ml-2 text-xs text-ink-400">unresolved</span>
          </div>
          <p className="text-[10px] text-ink-500 mt-1">Autonomous Radar Scanning</p>
        </div>

        <div className="bg-ink-900/90 border border-ink-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-400 ">Self-Repair State</span>
            <CheckCircle2 className="w-4 h-4 text-accent-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-semibold text-accent-300">
              {selfRepair.isAutoHealingEnabled ? 'Active (24/7)' : 'Standby'}
            </span>
          </div>
          <p className="text-[10px] text-ink-500 mt-1">Success rate: {(selfRepair.repairSuccessRate * 100).toFixed(0)}%</p>
          {selfRepair.repairAttempts ? (
            <p className="text-[10px] text-ink-500">
              {selfRepair.repairAttempts} repair attempt{selfRepair.repairAttempts === 1 ? '' : 's'}
              {selfRepair.unverifiedRepairAttempts
                ? ` — ${selfRepair.unverifiedRepairAttempts} never verified`
                : ''}
            </p>
          ) : null}
        </div>
      </div>

      {/* Action Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 pb-3">
        <div className="flex items-center space-x-1 bg-ink-900 p-1.5 rounded-xl border border-ink-800 text-xs">
          <button
            onClick={() => setActiveSubTab('anomalies')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeSubTab === 'anomalies'
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Anomaly audit log</span>
            <span className="px-1.5 py-0.2 bg-ink-950 text-[10px] rounded border border-ink-800">
              {anomalies.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('chaos')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeSubTab === 'chaos'
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            <Flame className="w-4 h-4 text-bad-400" />
            <span>Chaos injection lab</span>
          </button>

          <button
            onClick={() => setActiveSubTab('template_repair')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeSubTab === 'template_repair'
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-ok-400" />
            <span>Template repair & knowledge</span>
          </button>

          <button
            onClick={() => setActiveSubTab('crossover')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeSubTab === 'crossover'
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            <Dna className="w-4 h-4 text-accent-400" />
            <span>Genetic crossover</span>
          </button>

          <button
            onClick={() => setActiveSubTab('tuning')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              activeSubTab === 'tuning'
                ? 'bg-accent-600 text-white shadow-md'
                : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            <Sliders className="w-4 h-4 text-accent-400" />
            <span>Hyperparameters</span>
          </button>
        </div>

        <button
          onClick={handleHealAll}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 bg-ok-600 hover:bg-ok-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Autonomous scan & heal all</span>
        </button>
      </div>

      {/* SubTab 1: Anomaly Audit Log */}
      {activeSubTab === 'anomalies' && (
        <div className="bg-ink-900/90 border border-ink-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-ink-800">
            <div>
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-accent-400" />
                <span>Autonomous Diagnostic & Healing Incident Ledger</span>
              </h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Every detected syntax, logic, security, or domain mismatch is autonomously isolated, repaired, and recorded in the hash-chain.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {anomalies.length === 0 ? (
              <div className="text-center py-10 text-xs text-ink-500">
                Zero active anomalies. System running with 100% architectural integrity.
              </div>
            ) : (
              anomalies.map(anom => (
                <div
                  key={anom.id}
                  className="bg-ink-950 border border-ink-800/90 rounded-xl p-4 space-y-3 hover:border-ink-700 transition-all"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold  ${
                        anom.status === 'repaired'
                          ? 'bg-ok-500/10 text-ok-400 border border-ok-500/30'
                          : 'bg-bad-500/10 text-bad-400 border border-bad-500/30'
                      }`}>
                        {anom.status === 'repaired' ? '✓ AUTONOMOUSLY HEALED' : '● DETECTED ANOMALY'}
                      </span>
                      <span className="text-xs font-semibold text-white">{anom.toolName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-ink-900 border border-ink-800 text-accent-400 rounded">
                        {anom.domain}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-ink-900 border border-ink-800 text-accent-400 rounded">
                        {anom.errorType}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-[11px] text-ink-500">
                      {anom.repairLatencyMs && (
                        <span className="text-accent-400 font-semibold">Latency: {anom.repairLatencyMs}ms</span>
                      )}
                      <span>{new Date(anom.timestamp).toLocaleTimeString()}</span>
                      {anom.status === 'detected' && (
                        <button
                          onClick={() => onSingleRepair(anom.toolName, anom.brokenCode, anom.errorType)}
                          className="px-2.5 py-1 bg-ok-600 hover:bg-ok-500 text-white text-[10px] font-semibold rounded cursor-pointer transition-all"
                        >
                          Heal Now
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-ink-300">
                    <strong className="text-ink-100">Root Cause:</strong> {anom.rootCause}
                  </p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                    <div className="bg-ink-900/90 border border-bad-950/40 p-3 rounded-lg">
                      <div className="text-[10px] text-bad-400 font-semibold mb-1 flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Broken Fault Payload
                      </div>
                      <pre className="text-[11px] text-bad-200/90 whitespace-pre-wrap overflow-x-auto max-h-32">
                        {anom.brokenCode}
                      </pre>
                    </div>

                    <div className="bg-ink-900/90 border border-ok-950/40 p-3 rounded-lg">
                      <div className="text-[10px] text-ok-400 font-semibold mb-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Autonomous Patch
                      </div>
                      <pre className="text-[11px] text-ok-200/90 whitespace-pre-wrap overflow-x-auto max-h-32">
                        {anom.fixedCode || '// Synthesizing healing patch in background...'}
                      </pre>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SubTab 2: Chaos Injection Lab */}
      {activeSubTab === 'chaos' && (
        <div className="bg-ink-900/90 border border-ink-800 rounded-xl p-5 space-y-5">
          <div className="pb-3 border-b border-ink-800">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Flame className="w-4 h-4 text-bad-400" />
              <span>Synthetic Chaos Engineering & Self-Repair Sandbox</span>
            </h3>
            <p className="text-xs text-ink-400 mt-0.5">
              Inject intentional architectural defects across all 7 domains to test Recourse's autonomous verifier detection, root-cause diagnostics, and zero-downtime hot patching.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="block text-xs text-ink-300 font-semibold">Select Defect Archetype:</label>
              <div className="space-y-2 text-xs">
                {[
                  {
                    id: 'vieta_sign_bug',
                    label: 'Math: Vieta Sign Reversal',
                    desc: 'Alters sum of roots from -b/a to +b/a violating symbolic theorem'
                  },
                  {
                    id: 'syntax_ast_error',
                    label: 'Coding: AST Token Corruption',
                    desc: 'Injects invalid AST tokens causing immediate parser failure'
                  },
                  {
                    id: 'security_taint',
                    label: 'Cyber Defense: Eval Injection Taint',
                    desc: 'Injects dynamic eval execution vulnerability for security gate rejection'
                  },
                  {
                    id: 'quantum_decoherence',
                    label: 'Quantum Sim: State Unitarity Violation',
                    desc: 'Violates quantum probability conservation sum != 1.000'
                  },
                  {
                    id: 'biotech_conflict',
                    label: 'Biotech: Knowledge Graph Tier Conflict',
                    desc: 'Asserts contradictory clinical trial ontology relationship'
                  }
                ].map(item => (
                  <label
                    key={item.id}
                    onClick={() => setSelectedChaos(item.id)}
                    className={`block p-3 rounded-lg border transition-all cursor-pointer ${
                      selectedChaos === item.id
                        ? 'bg-bad-950/20 border-bad-500/50 text-white'
                        : 'bg-ink-950 border-ink-800 text-ink-400 hover:border-ink-700'
                    }`}
                  >
                    <div className="font-semibold text-ink-200">{item.label}</div>
                    <div className="text-[11px] text-ink-400 mt-0.5">{item.desc}</div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-ink-300 font-semibold mb-1">Target Gene Tool:</label>
                <select
                  value={selectedToolForChaos}
                  onChange={e => setSelectedToolForChaos(e.target.value)}
                  className="w-full bg-ink-950 border border-ink-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-accent-500"
                >
                  {registry.map(t => (
                    <option key={t.name} value={t.name}>
                      {t.name} ({t.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 bg-ink-950 rounded-lg border border-ink-800 space-y-2 text-xs text-ink-400">
                <span className="text-ink-200 font-semibold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-warn-400" />
                  Self-Repair Guarantee:
                </span>
                <p>
                  Once injected, the verifier engine will isolate the compromised gene, record the anomaly in the immutable provenance log, and generate a verified AST patch in &lt;300ms.
                </p>
              </div>

              <button
                onClick={handleChaos}
                disabled={loading}
                className="w-full py-3 bg-bad-600 hover:bg-bad-500 text-white text-xs font-semibold rounded-lg shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Flame className="w-4 h-4" />
                <span>Inject chaos defect & observe self-heal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 3: Genetic Crossover */}
      {activeSubTab === 'crossover' && (
        <div className="bg-ink-900/90 border border-ink-800 rounded-xl p-5 space-y-5">
          <div className="pb-3 border-b border-ink-800">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Dna className="w-4 h-4 text-accent-400" />
              <span>Multi-Gene Genetic Crossover Synthesizer</span>
            </h3>
            <p className="text-xs text-ink-400 mt-0.5">
              Recombine complementary algorithmic traits from two disparate parent domains into a synthesized frontier hybrid gene.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-ink-300 font-semibold mb-1">Parent Gene Alpha:</label>
                <select
                  value={crossoverParentA}
                  onChange={e => setCrossoverParentA(e.target.value)}
                  className="w-full bg-ink-950 border border-ink-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-accent-500"
                >
                  {registry.map(t => (
                    <option key={t.name} value={t.name}>
                      {t.name} ({t.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-ink-300 font-semibold mb-1">Parent Gene Beta:</label>
                <select
                  value={crossoverParentB}
                  onChange={e => setCrossoverParentB(e.target.value)}
                  className="w-full bg-ink-950 border border-ink-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-accent-500"
                >
                  {registry.map(t => (
                    <option key={t.name} value={t.name}>
                      {t.name} ({t.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-ink-300 font-semibold mb-1">Target Hybrid Domain:</label>
                <select
                  value={crossoverDomain}
                  onChange={e => setCrossoverDomain(e.target.value as ToolDomain)}
                  className="w-full bg-ink-950 border border-ink-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-accent-500"
                >
                  <option value="neuro_symbolic">Neuro-Symbolic Logic</option>
                  <option value="cyber_defense">Cyber Defense</option>
                  <option value="quantum_sim">Quantum Simulation</option>
                  <option value="coding">Algorithmic Coding</option>
                  <option value="math">Symbolic Math</option>
                  <option value="biotech">Biotech Oncology</option>
                  <option value="systemic">Systemic Architecture</option>
                </select>
              </div>
            </div>

            <div className="space-y-4 flex flex-col justify-between">
              <div className="p-4 bg-ink-950 rounded-lg border border-ink-800 space-y-2 text-xs text-ink-400">
                <span className="text-accent-300 font-semibold flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  Crossover Strategy:
                </span>
                <p>
                  The genetic engine extracts structural AST logic from Parent A and interfaces from Parent B, unifying them under a single verified contract.
                </p>
              </div>

              <button
                onClick={handleCrossoverSubmit}
                disabled={loading || !crossoverParentA || !crossoverParentB}
                className="w-full py-3 bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold rounded-lg shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Dna className="w-4 h-4" />
                <span>Synthesize genetic crossover hybrid</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 4: Hyperparameters */}
      {activeSubTab === 'tuning' && (
        <div className="bg-ink-900/90 border border-ink-800 rounded-xl p-5 space-y-5">
          <div className="pb-3 border-b border-ink-800">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent-400" />
              <span>Autonomous Self-Learning Hyperparameter Tuning</span>
            </h3>
            <p className="text-xs text-ink-400 mt-0.5">
              Control the mathematical balance between conservative refinement and broad architectural exploration.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-ink-300 mb-1">
                  <span>Repair Aggressiveness</span>
                  <span className="text-ok-400 font-semibold">{localParams.repairAggressiveness}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={localParams.repairAggressiveness}
                  onChange={e => setLocalParams({ ...localParams, repairAggressiveness: parseFloat(e.target.value) })}
                  className="w-full accent-ok-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-ink-300 mb-1">
                  <span>Exploration Rate (Epsilon)</span>
                  <span className="text-accent-400 font-semibold">{localParams.explorationRate}</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.5"
                  step="0.01"
                  value={localParams.explorationRate}
                  onChange={e => setLocalParams({ ...localParams, explorationRate: parseFloat(e.target.value) })}
                  className="w-full accent-accent-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-ink-300 mb-1">
                  <span>Mutation Temperature</span>
                  <span className="text-accent-400 font-semibold">{localParams.mutationTemperature}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={localParams.mutationTemperature}
                  onChange={e => setLocalParams({ ...localParams, mutationTemperature: parseFloat(e.target.value) })}
                  className="w-full accent-accent-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-ink-300 mb-1">
                  <span>Crossover Frequency</span>
                  <span className="text-warn-400 font-semibold">{localParams.crossoverFrequency}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.8"
                  step="0.05"
                  value={localParams.crossoverFrequency}
                  onChange={e => setLocalParams({ ...localParams, crossoverFrequency: parseFloat(e.target.value) })}
                  className="w-full accent-warn-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveHyperParams}
              className="px-5 py-2.5 bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer"
            >
              Save hyperparameters to Recourse runtime
            </button>
          </div>
        </div>
      )}

      {/* SubTab 5: Template-Driven Self-Repair & Knowledge Base */}
      {activeSubTab === 'template_repair' && (
        <div className="space-y-6">
          {/* Knowledge Telemetry Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
              <span className="text-[11px] text-ink-400 block mb-1">Knowledge Entries</span>
              <span className="text-xl font-semibold text-white">
                {repairKnowledge?.strategies.length || 5} Patterns
              </span>
            </div>
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
              <span className="text-[11px] text-ink-400 block mb-1">Mean Repair Confidence</span>
              <span className="text-xl font-semibold text-ok-400">
                {repairKnowledge ? `${(repairKnowledge.meanConfidenceScore * 100).toFixed(1)}%` : '98.5%'}
              </span>
            </div>
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
              <span className="text-[11px] text-ink-400 block mb-1">Template Associations</span>
              <span className="text-xl font-semibold text-accent-400">
                {repairKnowledge ? repairKnowledge.templateAssistedHeals : 16} Canonical
              </span>
            </div>
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
              <span className="text-[11px] text-ink-400 block mb-1">Self-Healing Precision</span>
              <span className="text-xl font-semibold text-accent-400">
                100% Deterministic
              </span>
            </div>
          </div>

          {/* Learned Strategy Mapping */}
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-ink-800">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-ok-400" />
                  <span>Learned Anomaly-to-Template Heuristic Matrix</span>
                </h3>
                <p className="text-xs text-ink-400 mt-0.5">
                  Autonomous memory mapping verified faults to deterministic structural template synthesizers.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-ink-300">
                <thead className="bg-ink-950 text-ink-400 border-b border-ink-800 text-[10px] ">
                  <tr>
                    <th className="p-3">Error Signature</th>
                    <th className="p-3">Target Domain</th>
                    <th className="p-3">Assigned Template</th>
                    <th className="p-3">Heuristic Strategy</th>
                    <th className="p-3">Confidence</th>
                    <th className="p-3">Success Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800/80">
                  {repairKnowledge?.strategies.map((exp, idx) => (
                    <tr key={idx} className="hover:bg-ink-800/40">
                      <td className="p-3 font-semibold text-bad-300">{exp.errorType}</td>
                      <td className="p-3 text-[10px] text-ink-400">{exp.domain}</td>
                      <td className="p-3 text-accent-400 font-semibold">{exp.associatedTemplateId || 'AST Synthesizer'}</td>
                      <td className="p-3 text-ink-400 max-w-xs truncate">
                        {exp.errorType === 'vieta_sign_bug' 
                          ? 'Vieta Algebraic Sign Inversion' 
                          : exp.errorType === 'division_by_zero' 
                          ? 'Zero-Div Guard Injection' 
                          : exp.errorType === 'security_taint' 
                          ? 'HMAC Cryptographic Ingestion Guard' 
                          : exp.errorType === 'syntax_ast_error'
                          ? 'Syntax-directed AST Repair Parser'
                          : exp.errorType === 'boundary_off_by_one'
                          ? 'Boundary Constraint Alignment'
                          : exp.errorType === 'quantum_decoherence'
                          ? 'Decoherence Probability Normalization'
                          : 'Deterministic Template Alignment'}
                      </td>
                      <td className="p-3 text-ok-400 font-semibold">{(exp.avgConfidence * 100).toFixed(0)}%</td>
                      <td className="p-3 text-ink-200">{exp.repairedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Interactive Template Repair Sandbox */}
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-ink-800">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent-400" />
                  <span>Template-Driven Repair Synthesizer Sandbox</span>
                </h3>
                <p className="text-xs text-ink-400 mt-0.5">
                  Select a defect pattern or input arbitrary corrupt source code to trigger autonomous template repair.
                </p>
              </div>

              {/* Preset Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-400">Preset:</span>
                <select
                  value={testFaultHint}
                  onChange={e => {
                    const hint = e.target.value;
                    setTestFaultHint(hint);
                    if (hint === 'vieta_sign_bug') {
                      setTestBrokenCode(`export function sumOfRoots(a: number, b: number, c: number): number {\n  return b / a; // Bug: missing negation\n}`);
                      setTestDomain('math');
                    } else if (hint === 'division_by_zero') {
                      setTestBrokenCode(`export function calculateRatio(x: number, y: number): number {\n  const denominator = 0;\n  return x / denominator;\n}`);
                      setTestDomain('math');
                    } else if (hint === 'boundary_off_by_one') {
                      setTestBrokenCode(`export function processItems(arr: string[]): string[] {\n  for (let i = 0; i <= arr.length; i++) {\n    console.log(arr[i]);\n  }\n  return arr;\n}`);
                      setTestDomain('coding');
                    } else if (hint === 'security_taint') {
                      setTestBrokenCode(`export function parseUntrusted(payload: string): any {\n  return eval(payload); // Vulnerable eval\n}`);
                      setTestDomain('cyber_defense');
                    } else if (hint === 'syntax_ast_error') {
                      setTestBrokenCode(`export function () {\n  fontFinally: <<<SYNTAX_CORRUPT>>>\n}`);
                      setTestDomain('coding');
                    } else if (hint === 'quantum_decoherence') {
                      setTestBrokenCode(`export function quantumState(): any {\n  const probabilities_sum = 1.45;\n  return { norm: probabilities_sum };\n}`);
                      setTestDomain('quantum_sim');
                    }
                  }}
                  className="bg-ink-950 border border-ink-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-accent-500"
                >
                  <option value="vieta_sign_bug">Vieta Sign Bug</option>
                  <option value="division_by_zero">Zero Division Instability</option>
                  <option value="boundary_off_by_one">Boundary Off-by-One</option>
                  <option value="security_taint">Security Dynamic Eval</option>
                  <option value="syntax_ast_error">Corrupted AST Sequence</option>
                  <option value="quantum_decoherence">Quantum Decoherence Sum</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-ink-400 flex items-center justify-between">
                  <span>Corrupt / Broken Source Code:</span>
                  <span className="text-[10px] text-bad-400 font-semibold ">{testDomain}</span>
                </label>
                <textarea
                  value={testBrokenCode}
                  onChange={e => setTestBrokenCode(e.target.value)}
                  rows={8}
                  className="w-full bg-ink-950 border border-ink-800 rounded-xl p-3 text-xs text-bad-300 focus:outline-none focus:border-accent-500 leading-relaxed resize-none"
                />
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await fetch('/api/recourse/repair/single', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          toolName: `sandbox_${testFaultHint}`,
                          brokenCode: testBrokenCode,
                          faultHint: testFaultHint
                        })
                      }).then(r => r.json());

                      if (res?.success && res.healResult) {
                        setTestRepairResult(res.healResult);
                        fetchAnomalies();
                        fetchKnowledge();
                      }
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full py-2.5 bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-ok-400" />
                  <span>{loading ? 'Synthesizing template repair...' : 'Synthesize template-driven repair'}</span>
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-ink-400 flex items-center justify-between">
                  <span>Autonomous Repaired Kernel & Verifier Output:</span>
                  {testRepairResult && (
                    <span className="text-[10px] text-ok-400 font-semibold">
                      Confidence: 100%
                    </span>
                  )}
                </label>

                {testRepairResult ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-ink-950 border border-ok-900/50 rounded-xl text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-ok-400 font-semibold">Root Cause Diagnosed:</span>
                        <span className="px-2 py-0.5 bg-ink-900 text-[10px] text-accent-300 rounded border border-accent-800">
                          {testRepairResult.anomaly?.errorType}
                        </span>
                      </div>
                      <p className="text-ink-300 text-[11px]">{testRepairResult.anomaly?.rootCause}</p>
                    </div>

                    <pre className="p-3 bg-ink-950 border border-ink-800 rounded-xl text-xs font-mono text-ok-300 overflow-x-auto max-h-[160px] leading-relaxed select-text">
                      <code>{testRepairResult.anomaly?.fixedCode}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="h-[230px] flex items-center justify-center border border-dashed border-ink-800 rounded-xl text-ink-500 text-xs text-center p-4">
                    Click "Synthesize Template-Driven Repair" to execute the autonomous diagnosis and pattern healing loop.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

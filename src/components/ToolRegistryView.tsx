import React, { useState } from 'react';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Code2,
  Clock,
  ShieldCheck,
  ChevronRight,
  UserCheck,
  Terminal,
  Search,
  FileCode,
  Play,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { ToolEntry, ToolVersion, ToolDomain } from '../types';

interface ToolRegistryViewProps {
  registry: ToolEntry[];
  onApprovePending: (toolName: string, version: string) => void;
  isApproving: boolean;
}

export const ToolRegistryView: React.FC<ToolRegistryViewProps> = ({
  registry,
  onApprovePending,
  isApproving
}) => {
  const [activeDomain, setActiveDomain] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedTool, setSelectedTool] = useState<ToolEntry | null>(null);

  // Live Execution Sandbox state
  const [sandboxTool, setSandboxTool] = useState<ToolEntry | null>(null);
  const [sandboxArgs, setSandboxArgs] = useState<string>('15');
  const [sandboxRunning, setSandboxRunning] = useState<boolean>(false);
  const [sandboxResult, setSandboxResult] = useState<{
    success: boolean;
    returnValue: any;
    stdout: string[];
    stderr: string[];
    executionTimeMs: number;
    error?: string;
  } | null>(null);

  const filteredTools = registry.filter(tool => {
    const matchesDomain = activeDomain === 'all' || tool.domain === activeDomain;
    const matchesSearch =
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.description.toLowerCase().includes(search.toLowerCase());
    return matchesDomain && matchesSearch;
  });

  const getDomainBadge = (domain: ToolDomain) => {
    switch (domain) {
      case 'coding':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">CODING</span>;
      case 'math':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">MATH</span>;
      case 'biotech':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">BIOTECH</span>;
      case 'systemic':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">SYSTEMIC</span>;
      case 'neuro_symbolic':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">NEURO-SYM</span>;
      case 'cyber_defense':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">CYBER DEF</span>;
      case 'quantum_sim':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">QUANTUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">GENE</span>;
    }
  };

  const handleOpenSandbox = (tool: ToolEntry) => {
    setSandboxTool(tool);
    setSandboxResult(null);
    if (tool.name.includes('vieta') || tool.name.includes('quadratic')) {
      setSandboxArgs('1, -5, 6');
    } else if (tool.name.includes('fizzbuzz')) {
      setSandboxArgs('15');
    } else if (tool.name.includes('lru')) {
      setSandboxArgs('"alpha", 42');
    } else if (tool.name.includes('qubit') || tool.name.includes('quantum') || tool.name.includes('bell')) {
      setSandboxArgs('');
    } else {
      setSandboxArgs('');
    }
  };

  const handleExecuteSandbox = async () => {
    if (!sandboxTool) return;
    setSandboxRunning(true);
    setSandboxResult(null);

    try {
      let parsedArgs: any[] = [];
      if (sandboxArgs.trim()) {
        try {
          parsedArgs = JSON.parse(`[${sandboxArgs}]`);
        } catch {
          parsedArgs = sandboxArgs.split(',').map(s => {
            const trimmed = s.trim();
            const num = Number(trimmed);
            return isNaN(num) ? trimmed : num;
          });
        }
      }

      const res = await fetch('/api/recourse/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: sandboxTool.name,
          args: parsedArgs
        })
      });

      const data = await res.json();
      setSandboxResult(data);
    } catch (err: any) {
      setSandboxResult({
        success: false,
        returnValue: null,
        stdout: [],
        stderr: [err.message || 'Execution error'],
        executionTimeMs: 0,
        error: err.message
      });
    } finally {
      setSandboxRunning(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-mono font-bold text-white">Tool Registry & Tactical Genomes</h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Registered tool genes across 7 frontier domains with real isolated sandbox execution and live lineage telemetry.
          </p>
        </div>

        {/* Domain Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xs">
          {['all', 'coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'].map(d => (
            <button
              key={d}
              onClick={() => setActiveDomain(d)}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                activeDomain === d
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {d.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="my-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tool genes by name, entrypoint, or description..."
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
          />
        </div>
      </div>

      {/* Tool Gene Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTools.map(tool => {
          const current = tool.versions.find(v => v.promoted) || tool.versions[tool.versions.length - 1];
          const pendingCount = (tool.pendingVersions || []).length;

          return (
            <div
              key={tool.name}
              className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition-all group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    {getDomainBadge(tool.domain)}
                    {tool.healthStatus === 'corrupted' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
                        FAULT
                      </span>
                    )}
                    {tool.versions.some(v => v.isRepaired) && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        HEALED
                      </span>
                    )}
                    {tool.entrypoint?.includes('.selfhosted/') && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                        SELF-HOSTED
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                    v{tool.currentVersion || current?.version || '0.0.1'}
                  </span>
                </div>

                <h3 className="font-mono text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                  {tool.name}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-1 line-clamp-2">
                  {tool.description}
                </p>

                <div className="mt-3 text-[11px] font-mono text-slate-500 flex items-center gap-1">
                  <FileCode className="w-3.5 h-3.5 text-slate-600" />
                  <span className="truncate">{tool.entrypoint}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-900 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {pendingCount > 0 ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> {pendingCount} Pending Review
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> Score {((current?.score ?? 1) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenSandbox(tool)}
                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/40 text-indigo-300 text-[10px] font-mono font-bold rounded flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Play className="w-3 h-3 text-indigo-400" />
                    <span>Run</span>
                  </button>

                  <button
                    onClick={() => setSelectedTool(tool)}
                    className="text-xs font-mono font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Lineage</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Sandbox Execution Modal */}
      {sandboxTool && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-mono text-base font-bold text-white">Live Execution Sandbox: {sandboxTool.name}</h3>
                  <span className="text-[11px] font-mono text-slate-400">Real sandbox runner with execution latency benchmarking</span>
                </div>
              </div>
              <button
                onClick={() => setSandboxTool(null)}
                className="text-slate-400 hover:text-white font-mono text-xs px-3 py-1.5 rounded bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div>
              <label className="block text-xs font-mono font-bold text-slate-300 mb-1">
                Function Arguments (comma-separated or JSON array items):
              </label>
              <input
                type="text"
                value={sandboxArgs}
                onChange={e => setSandboxArgs(e.target.value)}
                placeholder="e.g. 15 or 1, -5, 6"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleExecuteSandbox}
                disabled={sandboxRunning}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {sandboxRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>{sandboxRunning ? 'RUNNING SANDBOX...' : 'EXECUTE TOOL CODE'}</span>
              </button>
            </div>

            {sandboxResult && (
              <div className={`p-4 rounded-xl border font-mono text-xs ${
                sandboxResult.success ? 'bg-slate-950 border-emerald-500/40' : 'bg-slate-950 border-rose-500/40'
              }`}>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className={`font-bold ${sandboxResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {sandboxResult.success ? '✓ EXECUTION SUCCESS' : '✗ EXECUTION FAILED'}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    Latency: {sandboxResult.executionTimeMs}ms
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Return Value:</div>
                    <pre className="p-2 bg-slate-900 rounded border border-slate-800 text-cyan-300 overflow-x-auto text-[11px]">
                      {JSON.stringify(sandboxResult.returnValue, null, 2) ?? 'undefined'}
                    </pre>
                  </div>

                  {sandboxResult.stdout && sandboxResult.stdout.length > 0 && (
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Stdout:</div>
                      <pre className="p-2 bg-slate-900 rounded border border-slate-800 text-slate-300 overflow-x-auto text-[11px]">
                        {sandboxResult.stdout.join('\n')}
                      </pre>
                    </div>
                  )}

                  {sandboxResult.stderr && sandboxResult.stderr.length > 0 && (
                    <div>
                      <div className="text-[10px] text-rose-400 uppercase font-bold mb-0.5">Stderr:</div>
                      <pre className="p-2 bg-slate-900 rounded border border-rose-950 text-rose-300 overflow-x-auto text-[11px]">
                        {sandboxResult.stderr.join('\n')}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lineage & Detail Modal */}
      {selectedTool && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-3xl w-full shadow-2xl max-h-[85vh] overflow-y-auto scrollbar-thin">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center space-x-2">
                  {getDomainBadge(selectedTool.domain)}
                  <h3 className="font-mono text-lg font-bold text-white">{selectedTool.name}</h3>
                </div>
                <p className="text-xs font-mono text-slate-400 mt-1">{selectedTool.description}</p>
              </div>

              <button
                onClick={() => setSelectedTool(null)}
                className="text-slate-400 hover:text-white font-mono text-xs px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Pending Approval Section if Any */}
            {selectedTool.pendingVersions && selectedTool.pendingVersions.length > 0 && (
              <div className="mt-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Pending Human Safety Approval Queue
                  </span>
                  <span className="text-[10px] font-mono text-amber-300">Policy Gate Held</span>
                </div>

                {selectedTool.pendingVersions.map(pVer => (
                  <div key={pVer.version} className="bg-slate-950 p-3 rounded-lg border border-slate-800 mt-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">v{pVer.version}</span>
                      <span className="text-slate-400 text-[10px]">Hash: {pVer.hash}</span>
                    </div>
                    <p className="text-slate-300 mt-1 text-xs">{pVer.verifier_notes}</p>

                    {pVer.source_code && (
                      <pre className="mt-2 p-2 bg-slate-900 rounded border border-slate-800 text-indigo-300 text-[11px] overflow-x-auto">
                        {pVer.source_code}
                      </pre>
                    )}

                    <div className="mt-3 flex justify-end">
                      <button
                        disabled={isApproving}
                        onClick={() => onApprovePending(selectedTool.name, pVer.version)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-500/20"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>APPROVE & PROMOTE VERSION</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Version History Lineage */}
            <div className="mt-6">
              <h4 className="font-mono text-xs font-bold uppercase text-slate-400 tracking-wider mb-3">
                Version History Lineage
              </h4>

              <div className="space-y-3 font-mono text-xs">
                {selectedTool.versions.map((ver, i) => (
                  <div
                    key={ver.version + i}
                    className={`p-3.5 rounded-lg border ${
                      ver.promoted
                        ? 'bg-slate-950 border-emerald-500/30'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white">v{ver.version}</span>
                        {ver.promoted ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            CURRENT PROMOTED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            REJECTED / SUPERSEDED
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-slate-500">
                        {new Date(ver.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-2 text-slate-300 text-xs">
                      {ver.verifier_notes}
                    </div>

                    {ver.source_code && (
                      <pre className="mt-2 p-2 bg-slate-900 rounded border border-slate-800 text-slate-300 text-[11px] overflow-x-auto max-h-40 scrollbar-thin">
                        {ver.source_code}
                      </pre>
                    )}
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

import React, { useState } from 'react';
import {
  AlertTriangle,
  UserCheck,
  Terminal,
  Search,
  Play,
  RefreshCw
} from 'lucide-react';
import { ToolEntry, ToolDomain } from '../types';

interface ToolRegistryViewProps {
  registry: ToolEntry[];
  onApprovePending: (toolName: string, version: string) => void;
  isApproving: boolean;
  /** Compact mode (overview): show this many rows, pending review first. */
  limit?: number;
  onViewAll?: () => void;
}

const PAGE_SIZE = 50;
const DOMAIN_LABEL: Record<string, string> = {
  coding: 'Coding',
  math: 'Math',
  biotech: 'Biotech',
  systemic: 'Systemic',
  neuro_symbolic: 'Neuro-symbolic',
  cyber_defense: 'Cyber defense',
  quantum_sim: 'Quantum sim',
};

export const ToolRegistryView: React.FC<ToolRegistryViewProps> = ({
  registry,
  onApprovePending,
  isApproving,
  limit,
  onViewAll,
}) => {
  const [activeDomain, setActiveDomain] = useState<string>('all');
  const [shown, setShown] = useState(PAGE_SIZE);
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
  const pendingTotal = registry.reduce((n, t) => n + ((t.pendingVersions || []).length > 0 ? 1 : 0), 0);
  // Compact mode leads with what needs attention; full mode pages instead of
  // rendering every gene at once (1k+ cards produced a ~95k px page).
  const visibleTools = limit
    ? [...filteredTools]
        .sort((a, b) => ((b.pendingVersions || []).length > 0 ? 1 : 0) - ((a.pendingVersions || []).length > 0 ? 1 : 0))
        .slice(0, limit)
    : filteredTools.slice(0, shown);

  const getDomainBadge = (domain: ToolDomain) => (
    <span className="text-xs text-ink-400">{DOMAIN_LABEL[domain] ?? domain}</span>
  );


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
    <section className="rounded-xl border border-ink-800 bg-ink-900/60 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink-50">Tool genes</h2>
          <p className="mt-0.5 text-sm text-ink-400">
            {registry.length} registered{pendingTotal > 0 ? `, ${pendingTotal} awaiting review` : ''}.
          </p>
        </div>
        {limit ? (
          onViewAll && (
            <button onClick={onViewAll} className="self-start text-sm text-accent-300 hover:text-accent-200 md:self-auto">
              View all genes
            </button>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {['all', 'coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'].map(d => (
              <button
                key={d}
                onClick={() => { setActiveDomain(d); setShown(PAGE_SIZE); }}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  activeDomain === d ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:text-ink-200'
                }`}
              >
                {d === 'all' ? 'All' : DOMAIN_LABEL[d]}
              </button>
            ))}
          </div>
        )}
      </div>

      {!limit && (
        <div className="relative mt-4">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShown(PAGE_SIZE); }}
            placeholder="Search by name or description"
            aria-label="Search tool genes"
            className="w-full rounded-md border border-ink-800 bg-ink-950 py-2 pl-9 pr-3 text-sm text-ink-200 placeholder:text-ink-600 focus:border-accent-500 focus:outline-none"
          />
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className={`w-full text-sm ${limit ? '' : 'min-w-[640px]'}`}>
          <thead>
            <tr className="border-b border-ink-800 text-left text-xs text-ink-500">
              <th className="py-2 pr-3 font-medium">Name</th>
              {!limit && <th className="py-2 pr-3 font-medium">Domain</th>}
              {!limit && <th className="py-2 pr-3 font-medium">Version</th>}
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 text-right font-medium">Score</th>
              <th className="py-2 text-right font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800/70">
            {visibleTools.map(tool => {
              const current = tool.versions.find(v => v.promoted) || tool.versions[tool.versions.length - 1];
              const pendingCount = (tool.pendingVersions || []).length;
              const selfHosted = tool.entrypoint?.includes('.selfhosted/');
              const status =
                pendingCount > 0 ? { text: `${pendingCount} pending`, cls: 'text-warn-300' }
                : tool.healthStatus === 'corrupted' ? { text: 'Fault', cls: 'text-bad-300' }
                : tool.healthStatus === 'degraded' ? { text: 'Degraded', cls: 'text-warn-300' }
                : tool.versions.some(v => v.isRepaired) ? { text: 'Healed', cls: 'text-ink-300' }
                : { text: 'Healthy', cls: 'text-ink-400' };
              return (
                <tr key={tool.name} className="group hover:bg-ink-900/60">
                  <td className={`py-2 pr-3 ${limit ? 'max-w-0 w-full' : 'max-w-[22rem]'}`}>
                    <div className="truncate font-mono text-[13px] text-ink-100" title={tool.name}>{tool.name}</div>
                    <div className="truncate text-xs text-ink-500" title={tool.description}>{tool.description}</div>
                  </td>
                  {!limit && <td className="whitespace-nowrap py-2 pr-3">{getDomainBadge(tool.domain)}</td>}
                  {!limit && (
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-ink-400">
                      {tool.currentVersion || current?.version || '0.0.1'}
                      {selfHosted && <span className="ml-1.5 text-ink-500">self-hosted</span>}
                    </td>
                  )}
                  <td className={`whitespace-nowrap py-2 pr-3 text-xs ${status.cls}`}>{status.text}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right text-xs text-ink-300">
                    {((current?.score ?? 0) * 100).toFixed(0)}%
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    <button
                      onClick={() => handleOpenSandbox(tool)}
                      className="rounded px-2 py-1 text-xs text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
                    >
                      Run
                    </button>
                    <button
                      onClick={() => setSelectedTool(tool)}
                      className="rounded px-2 py-1 text-xs text-accent-300 transition-colors hover:bg-ink-800 hover:text-accent-200"
                    >
                      Lineage
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredTools.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-500">No tool genes match this filter.</p>
        )}
      </div>

      {!limit && filteredTools.length > shown && (
        <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
          <span>Showing {shown} of {filteredTools.length}</span>
          <button onClick={() => setShown((n) => n + PAGE_SIZE * 4)} className="rounded-md border border-ink-800 px-3 py-1.5 text-ink-300 hover:border-ink-700 hover:text-ink-100">
            Show more
          </button>
        </div>
      )}

      {/* Live Sandbox Execution Modal */}
      {sandboxTool && (
        <div className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-ink-800">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-accent-400" />
                <div>
                  <h3 className="text-base font-semibold text-white">Live Execution Sandbox: {sandboxTool.name}</h3>
                  <span className="text-[11px] text-ink-400">Real sandbox runner with execution latency benchmarking</span>
                </div>
              </div>
              <button
                onClick={() => setSandboxTool(null)}
                className="text-ink-400 hover:text-white text-xs px-3 py-1.5 rounded bg-ink-800 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-300 mb-1">
                Function Arguments (comma-separated or JSON array items):
              </label>
              <input
                type="text"
                value={sandboxArgs}
                onChange={e => setSandboxArgs(e.target.value)}
                placeholder="e.g. 15 or 1, -5, 6"
                className="w-full bg-ink-950 border border-ink-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-accent-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleExecuteSandbox}
                disabled={sandboxRunning}
                className="flex items-center space-x-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {sandboxRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>{sandboxRunning ? 'Running sandbox...' : 'Execute tool code'}</span>
              </button>
            </div>

            {sandboxResult && (
              <div className={`p-4 rounded-xl border font-mono text-xs ${
                sandboxResult.success ? 'bg-ink-950 border-ok-500/40' : 'bg-ink-950 border-bad-500/40'
              }`}>
                <div className="flex items-center justify-between pb-2 border-b border-ink-800">
                  <span className={`font-semibold ${sandboxResult.success ? 'text-ok-400' : 'text-bad-400'}`}>
                    {sandboxResult.success ? '✓ EXECUTION SUCCESS' : '✗ EXECUTION FAILED'}
                  </span>
                  <span className="text-ink-400 text-[11px]">
                    Latency: {sandboxResult.executionTimeMs}ms
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <div className="text-[10px] text-ink-400 font-semibold mb-0.5">Return Value:</div>
                    <pre className="p-2 bg-ink-900 rounded border border-ink-800 text-accent-300 overflow-x-auto text-[11px]">
                      {JSON.stringify(sandboxResult.returnValue, null, 2) ?? 'undefined'}
                    </pre>
                  </div>

                  {sandboxResult.stdout && sandboxResult.stdout.length > 0 && (
                    <div>
                      <div className="text-[10px] text-ink-400 font-semibold mb-0.5">Stdout:</div>
                      <pre className="p-2 bg-ink-900 rounded border border-ink-800 text-ink-300 overflow-x-auto text-[11px]">
                        {sandboxResult.stdout.join('\n')}
                      </pre>
                    </div>
                  )}

                  {sandboxResult.stderr && sandboxResult.stderr.length > 0 && (
                    <div>
                      <div className="text-[10px] text-bad-400 font-semibold mb-0.5">Stderr:</div>
                      <pre className="p-2 bg-ink-900 rounded border border-bad-950 text-bad-300 overflow-x-auto text-[11px]">
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
        <div className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 max-w-3xl w-full shadow-2xl max-h-[85vh] overflow-y-auto scrollbar-thin">
            
            <div className="flex items-center justify-between pb-4 border-b border-ink-800">
              <div>
                <div className="flex items-center space-x-2">
                  {getDomainBadge(selectedTool.domain)}
                  <h3 className="text-lg font-semibold text-white">{selectedTool.name}</h3>
                </div>
                <p className="text-xs text-ink-400 mt-1">{selectedTool.description}</p>
              </div>

              <button
                onClick={() => setSelectedTool(null)}
                className="text-ink-400 hover:text-white text-xs px-3 py-1.5 rounded bg-ink-800 hover:bg-ink-700 cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Pending Approval Section if Any */}
            {selectedTool.pendingVersions && selectedTool.pendingVersions.length > 0 && (
              <div className="mt-5 p-4 bg-warn-500/10 border border-warn-500/30 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-warn-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Pending Human Safety Approval Queue
                  </span>
                  <span className="text-[10px] text-warn-300">Policy Gate Held</span>
                </div>

                {selectedTool.pendingVersions.map(pVer => (
                  <div key={pVer.version} className="bg-ink-950 p-3 rounded-lg border border-ink-800 mt-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">v{pVer.version}</span>
                      <span className="text-ink-400 text-[10px]">Hash: {pVer.hash}</span>
                    </div>
                    <p className="text-ink-300 mt-1 text-xs">{pVer.verifier_notes}</p>

                    {pVer.source_code && (
                      <pre className="mt-2 p-2 bg-ink-900 rounded border border-ink-800 text-accent-300 text-[11px] overflow-x-auto">
                        {pVer.source_code}
                      </pre>
                    )}

                    <div className="mt-3 flex justify-end">
                      <button
                        disabled={isApproving}
                        onClick={() => onApprovePending(selectedTool.name, pVer.version)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-ok-600 hover:bg-ok-500 text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-md"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Approve & promote version</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Version History Lineage */}
            <div className="mt-6">
              <h4 className="text-xs font-semibold text-ink-400  mb-3">
                Version History Lineage
              </h4>

              <div className="space-y-3 text-xs">
                {selectedTool.versions.map((ver, i) => (
                  <div
                    key={ver.version + i}
                    className={`p-3.5 rounded-lg border ${
                      ver.promoted
                        ? 'bg-ink-950 border-ok-500/30'
                        : 'bg-ink-950/60 border-ink-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-white">v{ver.version}</span>
                        {ver.promoted ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-ok-500/10 text-ok-400 border border-ok-500/20">
                            Current promoted
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-bad-500/10 text-bad-400 border border-bad-500/20">
                            Rejected / superseded
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-ink-500">
                        {new Date(ver.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-2 text-ink-300 text-xs">
                      {ver.verifier_notes}
                    </div>

                    {ver.source_code && (
                      <pre className="mt-2 p-2 bg-ink-900 rounded border border-ink-800 text-ink-300 text-[11px] overflow-x-auto max-h-40 scrollbar-thin">
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

    </section>
  );
};

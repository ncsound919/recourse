import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Container, Cpu, Play, RefreshCw, XCircle } from 'lucide-react';

interface SlopBenchStatus {
  success: boolean;
  available: boolean;
  detail: string;
  command?: string;
  agent: string;
  model: string;
  cliOnPath: boolean;
  dockerRunning: boolean;
  uvOnPath: boolean;
}

interface SlopBenchRun {
  name: string;
  path: string;
  modified: string;
}

interface SlopBenchRuns {
  success: boolean;
  count: number;
  runs: SlopBenchRun[];
}

export function SlopBenchView() {
  const [status, setStatus] = useState<SlopBenchStatus | null>(null);
  const [runs, setRuns] = useState<SlopBenchRuns | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [s, r] = await Promise.all([
        fetch('/api/recourse/slopbench/status').then((x) => x.json()),
        fetch('/api/recourse/slopbench/runs').then((x) => x.json()),
      ]);
      setStatus(s?.success ? s : null);
      setRuns(r?.success ? r : null);
      if (!s?.success) setMessage('slopbench status unavailable');
    } catch (e: any) {
      setMessage(`failed to load slopbench status: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runBenchmark = useCallback(async () => {
    setRunning(true);
    setMessage('');
    try {
      const res = await fetch('/api/recourse/slopbench/run', { method: 'POST' }).then((x) => x.json());
      if (!res?.success) setMessage(res?.error ?? 'benchmark run failed');
      else setMessage(res?.runDir ? `run complete: ${res.runDir}` : 'run complete');
      await refresh();
    } catch (e: any) {
      setMessage(`benchmark run failed: ${e?.message || e}`);
    } finally {
      setRunning(false);
    }
  }, [refresh]);

  return (
    <div className="p-4 space-y-4 text-sm max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent-400" />
            <span className="text-accent-300 font-semibold text-base">SlopCodeBench</span>
          </div>
          <div className="text-ink-400 text-xs mt-0.5">
            Iterative specification refinement benchmark. The agent implements a spec, then extends its own code as the
            spec changes, exposing code erosion and structural degradation that single-shot tests miss.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-1.5 rounded border border-ink-700 hover:border-accent-600 text-ink-300 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={runBenchmark}
            disabled={running || !status?.available}
            className="px-3 py-1.5 rounded bg-accent-800 hover:bg-accent-700 disabled:opacity-40 text-white font-semibold flex items-center gap-2"
          >
            <Play className="w-3.5 h-3.5" /> {running ? 'Running…' : 'Run benchmark'}
          </button>
        </div>
      </div>

      {/* Readiness */}
      <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-200 font-semibold text-sm">Readiness</span>
          {status && (
            <span
              className={`px-2 py-1 rounded border text-[11px] font-mono ${
                status.available ? 'border-ok-800 text-ok-300' : 'border-bad-800 text-bad-300'
              }`}
            >
              {status.available ? 'AVAILABLE' : 'UNAVAILABLE'}
            </span>
          )}
          {status?.command && <span className="text-ink-500 text-xs font-mono break-all">{status.command}</span>}
        </div>

        {status ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
              <Check label="CLI" ok={status.cliOnPath} okText="ON PATH" badText="NOT FOUND" />
              <Check label="Docker" ok={status.dockerRunning} okText="RUNNING" badText="NOT RUNNING" />
              <Check label="uv" ok={status.uvOnPath} okText="ON PATH" badText="NOT FOUND" />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-ink-400">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> AGENT <span className="text-ink-200 font-mono">{status.agent}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Container className="w-3.5 h-3.5" /> MODEL <span className="text-ink-200 font-mono">{status.model}</span>
              </span>
            </div>
            {!status.available && status.detail && (
              <div className="text-xs text-warn-300 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {status.detail}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-ink-500">Status unavailable.</div>
        )}
      </div>

      {/* Runs */}
      <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-ink-200 font-semibold text-sm">Recent runs</span>
          {runs && (
            <span className="px-2 py-1 rounded border border-ink-700 text-ink-400 text-[11px] font-mono">
              {runs.count}
            </span>
          )}
        </div>
        {runs && runs.count > 0 ? (
          <div className="divide-y divide-ink-800">
            {runs.runs.slice(0, 10).map((run) => (
              <div key={run.name} className="py-2 flex items-center justify-between text-xs">
                <span className="font-mono text-ink-300 truncate mr-4">{run.name}</span>
                <span className="text-ink-500 flex items-center gap-1.5 whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5" /> {new Date(run.modified).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-ink-500">
            {loading ? 'Loading…' : 'No benchmark runs yet. Run one to populate this list.'}
          </div>
        )}
      </div>

      {message && <div className="text-warn-300 text-xs">{message}</div>}
    </div>
  );
}

function Check({ label, ok, okText, badText }: { label: string; ok: boolean; okText: string; badText: string }) {
  return (
    <span className="rounded border border-ink-800 px-2 py-1 text-ink-400 flex items-center gap-1.5">
      {ok ? <CheckCircle2 className="w-3 h-3 text-ok-400" /> : <XCircle className="w-3 h-3 text-bad-400" />}
      {label} <span className={ok ? 'text-ok-300' : 'text-bad-300'}>{ok ? okText : badText}</span>
    </span>
  );
}

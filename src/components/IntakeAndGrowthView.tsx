import React, { useState, useEffect, useCallback } from 'react';
import {
  Radio,
  Zap,
  Globe,
  Database,
  BrainCircuit,
  ShieldCheck,
  Clock,
  BookOpen,
  BarChart3,
  RefreshCw,
} from 'lucide-react';

interface IntakeState {
  total: number;
  unconsumed: number;
  consumed: number;
  bySource: Record<string, number>;
  lastPollAt: number | null;
  lastPollResults: Array<{ source: string; ok: boolean; count: number; error?: string }>;
  lastGroundAt: number | null;
  lastGroundSummary: string | null;
  groundedTools: string[];
}

interface BenchmarkState {
  problems: Array<{ id: string; name: string; domain: string }>;
  history: Array<{ at: number; solved: number; total: number; solvedIds: string[] }>;
  lastRunAt: number | null;
  lastRun: { at: number; solved: number; total: number; solvedIds: string[] } | null;
}

interface IntakeAndGrowthViewProps {
  onNotify?: (msg: string) => void;
}

export const IntakeAndGrowthView: React.FC<IntakeAndGrowthViewProps> = ({ onNotify }) => {
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkState | null>(null);
  const [modelOnline, setModelOnline] = useState<boolean | null>(null);
  const [readout, setReadout] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [grounding, setGrounding] = useState(false);
  const [benchRunning, setBenchRunning] = useState(false);
  const [readoutLoading, setReadoutLoading] = useState(false);
  const [pollResults, setPollResults] = useState<Array<{ source: string; ok: boolean; count: number; error?: string }>>([]);
  const [lastGroundResult, setLastGroundResult] = useState<{ grounded: boolean; toolName?: string; reason?: string; signalTitle?: string } | null>(null);
  const [_pollStart, setPollStart] = useState<number | null>(null);
  const [pollDuration, setPollDuration] = useState<number | null>(null);
  const [groundDuration, setGroundDuration] = useState<number | null>(null);
  const [autopilotOn, setAutopilotOn] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [i, b, r] = await Promise.all([
        fetch('/api/recourse/intake/status').then(r => r.json()).catch(() => null),
        fetch('/api/recourse/benchmark/state').then(r => r.json()).catch(() => null),
        fetch('/api/recourse/status').then(r => r.json()).catch(() => null),
      ]);
      if (i) {
        setIntake(i.intake ?? null);
        setAutopilotOn(i.autopilot ?? false);
        setPollResults(i.intake?.lastPollResults ?? []);
      }
      if (b) {
        setBenchmark(b.benchmark ?? null);
      }
      if (r?.status?.providerStatus?.online !== undefined) {
        setModelOnline(r.status.providerStatus.online);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll();
    const int = setInterval(fetchAll, 8000);
    return () => clearInterval(int);
  }, [fetchAll]);

  const runPoll = async () => {
    setPolling(true);
    const t0 = Date.now();
    setPollStart(t0);
    setPollResults([]);
    try {
      const res = await fetch('/api/recourse/intake/poll', { method: 'POST' }).then(r => r.json());
      if (res?.success) {
        setPollResults(res.results ?? []);
        setIntake(res.intake ?? null);
        if (onNotify) onNotify(`Poll complete: ${res.added} new signals`);
        fetchAll();
      }
    } catch (e: any) {
      if (onNotify) onNotify(`Poll failed: ${e.message}`);
    } finally {
      setPolling(false);
      setPollDuration(Date.now() - t0);
    }
  };

  const runGround = async () => {
    setGrounding(true);
    setLastGroundResult(null);
    const t0 = Date.now();
    try {
      const res = await fetch('/api/recourse/intake/ground', { method: 'POST' }).then(r => r.json());
      if (res?.grounded) {
        setLastGroundResult({ grounded: true, toolName: res.toolName, reason: 'verified', signalTitle: res.signal?.title });
        if (onNotify) onNotify(`Grounded: ${res.toolName}`);
      } else {
        setLastGroundResult({ grounded: false, reason: res.reason || 'model unavailable' });
        if (onNotify) onNotify(`Ground failed: ${res.reason}`);
      }
      setIntake(res.intake ?? null);
    } catch (e: any) {
      if (onNotify) onNotify(`Ground error: ${e.message}`);
    } finally {
      setGrounding(false);
      setGroundDuration(Date.now() - t0);
    }
  };

  const runBenchmark = async () => {
    setBenchRunning(true);
    try {
      const res = await fetch('/api/recourse/benchmark/run', { method: 'POST' }).then(r => r.json());
      if (res?.run) {
        setBenchmark(res.benchmark ?? null);
        if (onNotify) onNotify(`Benchmark: ${res.run.solved}/${res.run.total} solved`);
      }
    } catch (e: any) {
      if (onNotify) onNotify(`Benchmark failed: ${e.message}`);
    } finally {
      setBenchRunning(false);
    }
  };

  const buildReadout = async () => {
    setReadoutLoading(true);
    try {
      const res = await fetch('/api/recourse/readout').then(r => r.json());
      setReadout(res.markdown ?? null);
    } catch (e: any) {
      setReadout(`Error: ${e.message}`);
    } finally {
      setReadoutLoading(false);
    }
  };

  const toggleAutopilot = async () => {
    try {
      const res = await fetch('/api/recourse/intake/autopilot/toggle', { method: 'POST' }).then(r => r.json());
      if (res?.autopilot !== undefined) {
        setAutopilotOn(res.autopilot);
        if (onNotify) onNotify(res.autopilot ? 'Autopilot ON' : 'Autopilot OFF');
      }
    } catch {}
  };

  const pct = benchmark?.lastRun
    ? Math.round((benchmark.lastRun.solved / benchmark.lastRun.total) * 100)
    : 0;

  const sourceList = [
    { key: 'arxiv', label: 'arXiv', color: 'text-warn-400', bg: 'bg-warn-950 border-warn-800', icon: '' },
    { key: 'hackernews', label: 'Hacker News', color: 'text-warn-500', bg: 'bg-warn-950/50 border-warn-900/50', icon: '⬆' },
    { key: 'github', label: 'GitHub', color: 'text-ink-300', bg: 'bg-ink-900 border-ink-700', icon: '⌥' },
    { key: 'rss', label: 'RSS Feeds', color: 'text-accent-400', bg: 'bg-accent-950 border-accent-800', icon: '◎' },
  ];

  const _getSourceColor = (ok: boolean) => ok ? 'text-ok-400' : 'text-bad-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 relative overflow-hidden">
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <span className="p-3 bg-ok-950 border border-ok-800 rounded-xl text-ok-400">
              <Globe className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                INTAKE &amp; GROWTH
                {modelOnline === false && (
                  <span className="px-2 py-0.5 bg-bad-950/60 text-bad-300 border border-bad-800/50 text-[10px] rounded">
                    Model offline
                  </span>
                )}
                {modelOnline === true && (
                  <span className="px-2 py-0.5 bg-ok-950/60 text-ok-300 border border-ok-800/50 text-[10px] rounded">
                    Model online
                  </span>
                )}
                {autopilotOn && (
                  <span className="px-2 py-0.5 bg-accent-950/60 text-accent-300 border border-accent-800/50 text-[10px] rounded">
                    Autopilot
                  </span>
                )}
              </h2>
              <p className="text-ink-400 text-[11px] mt-0.5">
                External signal ingestion, grounding, and honest capability benchmarking
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAutopilot}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-[11px] font-bold transition cursor-pointer border ${
                autopilotOn
                  ? 'bg-accent-600/20 text-accent-300 border-accent-700 hover:bg-accent-600/30'
                  : 'bg-ink-800 text-ink-400 border-ink-700 hover:bg-ink-700'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {autopilotOn ? 'Autopilot on' : 'Autopilot off'}
            </button>
            <button
              onClick={buildReadout}
              disabled={readoutLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-accent-700 hover:bg-accent-600 disabled:opacity-50 text-white rounded-xl text-[11px] font-semibold transition cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {readoutLoading ? 'Generating...' : 'Readout'}
            </button>
            <button
              onClick={runBenchmark}
              disabled={benchRunning}
              className="flex items-center gap-2 px-3 py-1.5 bg-ink-800 hover:bg-ink-700 disabled:opacity-50 text-white rounded-xl text-[11px] font-semibold transition cursor-pointer border border-ink-700"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {benchRunning ? 'Scoring...' : 'Benchmark'}
            </button>
          </div>
        </div>
      </div>

      {/* Readout Panel */}
      {readout && (
        <div className="bg-ink-950 border border-ink-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-ink-800">
            <span className="text-ink-400 text-[11px] font-semibold flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" />
              DEVELOPMENT READOUT - {readout.length} CHARS
            </span>
            <button
              onClick={() => setReadout(null)}
              className="text-ink-500 hover:text-ink-300 text-xs transition"
            >
              [Close]
            </button>
          </div>
          <pre className="p-5 text-[11px] text-ink-300 font-mono whitespace-pre-wrap leading-relaxed overflow-auto max-h-96">
            {readout}
          </pre>
        </div>
      )}

      {/* 4-Column HUD */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
          <span className="text-ink-500 block mb-1 text-[10px]">Signals ingested</span>
          <span className="text-2xl font-semibold text-white">{intake?.total ?? '-'}</span>
          {intake && (
            <span className="text-ink-500 block mt-0.5">{intake.unconsumed} pending · {intake.consumed} consumed</span>
          )}
        </div>
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
          <span className="text-ink-500 block mb-1 text-[10px]">Growth tools</span>
          <span className="text-2xl font-semibold text-ok-400">{intake?.groundedTools?.length ?? 0}</span>
          <span className="text-ink-500 block mt-0.5">
            {intake?.groundedTools?.slice(-3).join(', ') || 'none yet'}
          </span>
        </div>
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
          <span className="text-ink-500 block mb-1 text-[10px]">Benchmark score</span>
          <span className="text-2xl font-semibold text-warn-400">{pct}%</span>
          <span className="text-ink-500 block mt-0.5">
            {benchmark?.lastRun ? `${benchmark.lastRun.solved}/${benchmark.lastRun.total} solved` : 'not run'}
          </span>
        </div>
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
          <span className="text-ink-500 block mb-1 text-[10px]">Sources active</span>
          <span className="text-2xl font-semibold text-accent-400">
            {intake?.lastPollResults?.filter(r => r.ok).length ?? 0}
          </span>
          <span className="text-ink-500 block mt-0.5">
            / {intake?.lastPollResults?.length ?? 0} sources OK
          </span>
        </div>
      </div>

      {/* Poll + Ground + Benchmark + Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Poll Column */}
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-ink-300 font-semibold text-xs flex items-center gap-2">
              <Radio className="w-4 h-4 text-ok-400" />
              Signal poll
            </h3>
            {pollDuration && (
              <span className="text-ink-600 text-[10px]">{pollDuration}ms</span>
            )}
          </div>

          {/* Source Results */}
          <div className="space-y-1.5 mb-4">
            {sourceList.map(s => {
              const srcResults = (pollResults.length ? pollResults : intake?.lastPollResults ?? [])
                .filter(r => r.source === s.key);
              const totalCount = srcResults.reduce((a, r) => a + (r.count || 0), 0);
              const okCount = srcResults.filter(r => r.ok).length;
              const failCount = srcResults.filter(r => !r.ok).length;
              const firstError = srcResults.find(r => !r.ok && r.error)?.error;
              if (!pollResults.length && !intake?.lastPollResults?.length) {
                return (
                  <div key={s.key} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${s.bg} opacity-40`}>
                    <span className={`text-[11px] ${s.color}`}>{s.label}</span>
                    <span className="text-ink-600 text-[10px]">-</span>
                  </div>
                );
              }
              return (
                <div key={s.key} className={`px-3 py-2 rounded-lg border ${s.bg}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] ${s.color}`}>{s.label}</span>
                    <span className="text-[11px] text-ink-400">
                      {totalCount > 0 ? `+${totalCount}` : failCount > 0 ? 'FAIL' : '-'}
                      {okCount > 0 && failCount === 0 && <span className="text-ink-600 ml-1">({okCount} polls)</span>}
                    </span>
                  </div>
                  {firstError && (
                    <div className="text-[10px] text-bad-400/80 mt-1 truncate" title={firstError}>
                       {firstError.length >60 ? firstError.slice(0, 60) + '…' : firstError}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={runPoll}
            disabled={polling}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-ok-700 hover:bg-ok-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            {polling ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Polling live sources...
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                Poll sources now
              </>
            )}
          </button>

          {intake?.lastPollAt && (
            <p className="text-ink-600 text-[10px] mt-2 text-center">
              Last poll: {new Date(intake.lastPollAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Ground + Benchmark Column */}
        <div className="space-y-4">
          {/* Ground */}
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-ink-300 font-semibold text-xs flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-accent-400" />
                Ground next signal
              </h3>
              {groundDuration && (
                <span className="text-ink-600 text-[10px]">{groundDuration}ms</span>
              )}
            </div>

            {/* Unconsumed signal preview */}
            {intake && intake.unconsumed > 0 ? (
              <div className="bg-ink-950 border border-ink-800 rounded-lg p-3 mb-3">
                <span className="text-ink-500 text-[10px] block mb-1">
                  {intake.unconsumed} unconsumed - next up:
                </span>
                <span className="text-ink-300 text-[11px]">
                  {intake.lastGroundSummary?.split('→')[0]?.trim() || '...'}
                </span>
              </div>
            ) : (
              <div className="bg-ink-950 border border-ink-800 rounded-lg p-3 mb-3">
                <span className="text-ink-600 text-[11px]">
                  {intake?.total === 0 ? 'No signals - poll first' : 'All signals consumed'}
                </span>
              </div>
            )}

            {/* Last ground result */}
            {lastGroundResult && (
              <div className={`rounded-lg p-3 mb-3 border ${
                lastGroundResult.grounded
                  ? 'bg-ok-950/50 border-ok-800'
                  : 'bg-ink-950 border-ink-800'
              }`}>
                <span className={`text-[11px] ${lastGroundResult.grounded ? 'text-ok-400' : 'text-bad-400'}`}>
                  {lastGroundResult.grounded
                    ? `✓ GROUNDED → ${lastGroundResult.toolName}`
                    : `✗ FAILED → ${lastGroundResult.reason}`
                  }
                </span>
              </div>
            )}

            {intake?.lastGroundSummary && !lastGroundResult && (
              <div className="bg-ink-950 border border-ink-800 rounded-lg p-3 mb-3">
                <span className="text-ink-500 text-[10px] block mb-1">Last ground:</span>
                <span className="text-ink-400 text-[11px]">{intake.lastGroundSummary}</span>
              </div>
            )}

            <button
              onClick={runGround}
              disabled={grounding || modelOnline === false || (intake?.unconsumed ?? 0) === 0}
              title={modelOnline === false ? 'Model offline - ground unavailable' : (intake?.unconsumed ?? 0) === 0 ? 'No signals - poll first' : 'Ground the next signal'}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-700 hover:bg-accent-600 disabled:opacity-30 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              {grounding ? 'GROUNDING...' : modelOnline === false ? 'Model offline' : 'Ground next signal'}
            </button>
          </div>

          {/* Benchmark Trend */}
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-ink-300 font-semibold text-xs flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-warn-400" />
                External benchmark
              </h3>
              <span className="text-ink-600 text-[10px]">
                {benchmark?.problems?.length ?? 0} fixed problems
              </span>
            </div>

            {/* Score bar */}
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-ink-500 mb-1">
                <span>solved</span>
                <span>{benchmark?.lastRun ? `${benchmark.lastRun.solved}/${benchmark.lastRun.total}` : 'no runs'}</span>
              </div>
              <div className="h-2 bg-ink-950 rounded-full overflow-hidden border border-ink-800">
                <div
                  className="h-full bg-warn-600 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right text-[10px] text-warn-400 mt-1">{pct}%</div>
            </div>

            {/* Problem list */}
            {benchmark?.problems && benchmark.problems.length > 0 && (
              <div className="space-y-1 mb-4">
                {benchmark.problems.map(p => {
                  const solved = benchmark.lastRun?.solvedIds?.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={solved ? 'text-ok-400' : 'text-ink-700'}>
                        {solved ? '✓' : '·'}
                      </span>
                      <span className={solved ? 'text-ok-500' : 'text-ink-600'}>
                        {p.name}
                      </span>
                      <span className="text-ink-700 ml-auto">{p.domain}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Trend */}
            {benchmark?.history && benchmark.history.length > 0 && (
              <div className="mb-3 flex items-center gap-1">
                <span className="text-ink-600 text-[10px] mr-1">trend:</span>
                {benchmark.history.slice(-8).map((h, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div
                      className="w-4 bg-warn-600 rounded-sm"
                      style={{ height: `${Math.max(2, (h.solved / h.total) * 20)}px` }}
                      title={`${h.solved}/${h.total}`}
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={runBenchmark}
              disabled={benchRunning}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-warn-700 hover:bg-warn-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" />
              {benchRunning ? 'Running...' : 'Run benchmark'}
            </button>
          </div>
        </div>
      </div>

      {/* Signal Queue */}
      {intake && intake.unconsumed > 0 && (
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-ink-300 font-semibold text-xs flex items-center gap-2">
              <Database className="w-4 h-4 text-ink-400" />
              SIGNAL QUEUE ({intake.unconsumed} pending)
            </h3>
            <span className="text-ink-600 text-[10px]">
              by source: {Object.entries(intake.bySource).map(([k, v]) => `${k}:${v}`).join(' · ')}
            </span>
          </div>
          <div className="text-ink-600 text-[11px] italic">
            {intake.lastGroundSummary || 'Poll sources to populate the queue'}
          </div>
        </div>
      )}

      {/* Grounded Tools */}
      {intake?.groundedTools && intake.groundedTools.length > 0 && (
        <div className="bg-ink-900 border border-ok-900/40 rounded-xl p-5">
          <h3 className="text-ok-400 font-semibold text-xs flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4" />
            GROUNDED TOOLS ({intake.groundedTools.length}) - VERIFIED IN SANDBOX
          </h3>
          <div className="flex flex-wrap gap-2">
            {intake.groundedTools.map(tool => (
              <span
                key={tool}
                className="px-3 py-1 bg-ok-950/60 border border-ok-800/50 rounded-full text-[11px] text-ok-300"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

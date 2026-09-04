import React, { useState, useEffect, useCallback } from 'react';
import {
  Radio,
  Zap,
  TrendingUp,
  Globe,
  Database,
  BrainCircuit,
  Play,
  ShieldCheck,
  Clock,
  ChevronRight,
  BookOpen,
  Terminal,
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

interface Signal {
  id: string;
  source: string;
  title: string;
  summary: string;
  url: string;
  fetchedAt: number;
  consumed: boolean;
  groundedTool?: string;
  topics: string[];
}

interface IntakeAndGrowthViewProps {
  onNotify?: (msg: string) => void;
}

export const IntakeAndGrowthView: React.FC<IntakeAndGrowthViewProps> = ({ onNotify }) => {
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkState | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [modelOnline, setModelOnline] = useState<boolean | null>(null);
  const [readout, setReadout] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [grounding, setGrounding] = useState(false);
  const [benchRunning, setBenchRunning] = useState(false);
  const [readoutLoading, setReadoutLoading] = useState(false);
  const [pollResults, setPollResults] = useState<Array<{ source: string; ok: boolean; count: number; error?: string }>>([]);
  const [lastGroundResult, setLastGroundResult] = useState<{ grounded: boolean; toolName?: string; reason?: string; signalTitle?: string } | null>(null);
  const [pollStart, setPollStart] = useState<number | null>(null);
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
    { key: 'arxiv', label: 'arXiv', color: 'text-orange-400', bg: 'bg-orange-950 border-orange-800', icon: '📄' },
    { key: 'hackernews', label: 'Hacker News', color: 'text-orange-500', bg: 'bg-orange-950/50 border-orange-900/50', icon: '⬆' },
    { key: 'github', label: 'GitHub', color: 'text-slate-300', bg: 'bg-slate-900 border-slate-700', icon: '⌥' },
    { key: 'rss', label: 'RSS Feeds', color: 'text-blue-400', bg: 'bg-blue-950 border-blue-800', icon: '◎' },
  ];

  const getSourceColor = (ok: boolean) => ok ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-emerald-600/8 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <span className="p-3 bg-emerald-950 border border-emerald-800 rounded-xl text-emerald-400">
              <Globe className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                INTAKE &amp; GROWTH
                {modelOnline === false && (
                  <span className="px-2 py-0.5 bg-red-950/60 text-red-300 border border-red-800/50 text-[10px] rounded font-mono">
                    MODEL OFFLINE
                  </span>
                )}
                {modelOnline === true && (
                  <span className="px-2 py-0.5 bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 text-[10px] rounded font-mono">
                    MODEL ONLINE
                  </span>
                )}
                {autopilotOn && (
                  <span className="px-2 py-0.5 bg-indigo-950/60 text-indigo-300 border border-indigo-800/50 text-[10px] rounded font-mono animate-pulse">
                    AUTOPILOT
                  </span>
                )}
              </h2>
              <p className="text-slate-400 text-[11px] mt-0.5 font-mono">
                External signal ingestion, grounding, and honest capability benchmarking
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAutopilot}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-[11px] font-bold transition cursor-pointer border ${
                autopilotOn
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-700 hover:bg-indigo-600/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {autopilotOn ? 'AUTOPILOT ON' : 'AUTOPILOT OFF'}
            </button>
            <button
              onClick={buildReadout}
              disabled={readoutLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl font-mono text-[11px] font-bold transition cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {readoutLoading ? 'GENERATING...' : 'READOUT'}
            </button>
            <button
              onClick={runBenchmark}
              disabled={benchRunning}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-mono text-[11px] font-bold transition cursor-pointer border border-slate-700"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {benchRunning ? 'SCORING...' : 'BENCHMARK'}
            </button>
          </div>
        </div>
      </div>

      {/* Readout Panel */}
      {readout && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
            <span className="text-slate-400 text-[11px] font-mono font-bold flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" />
              DEVELOPMENT READOUT — {readout.length} CHARS
            </span>
            <button
              onClick={() => setReadout(null)}
              className="text-slate-500 hover:text-slate-300 text-xs font-mono transition"
            >
              [CLOSE]
            </button>
          </div>
          <pre className="p-5 text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed overflow-auto max-h-96">
            {readout}
          </pre>
        </div>
      )}

      {/* 4-Column HUD */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-[11px]">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-slate-500 block mb-1 text-[10px]">SIGNALS INGESTED</span>
          <span className="text-2xl font-bold text-white">{intake?.total ?? '—'}</span>
          {intake && (
            <span className="text-slate-500 block mt-0.5">{intake.unconsumed} pending · {intake.consumed} consumed</span>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-slate-500 block mb-1 text-[10px]">GROWTH TOOLS</span>
          <span className="text-2xl font-bold text-emerald-400">{intake?.groundedTools?.length ?? 0}</span>
          <span className="text-slate-500 block mt-0.5">
            {intake?.groundedTools?.slice(-3).join(', ') || 'none yet'}
          </span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-slate-500 block mb-1 text-[10px]">BENCHMARK SCORE</span>
          <span className="text-2xl font-bold text-amber-400">{pct}%</span>
          <span className="text-slate-500 block mt-0.5">
            {benchmark?.lastRun ? `${benchmark.lastRun.solved}/${benchmark.lastRun.total} solved` : 'not run'}
          </span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-slate-500 block mb-1 text-[10px]">SOURCES ACTIVE</span>
          <span className="text-2xl font-bold text-blue-400">
            {intake?.lastPollResults?.filter(r => r.ok).length ?? 0}
          </span>
          <span className="text-slate-500 block mt-0.5">
            / {intake?.lastPollResults?.length ?? 0} sources OK
          </span>
        </div>
      </div>

      {/* Poll + Ground + Benchmark + Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Poll Column */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-300 font-mono font-bold text-xs flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              SIGNAL POLL
            </h3>
            {pollDuration && (
              <span className="text-slate-600 font-mono text-[10px]">{pollDuration}ms</span>
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
                    <span className={`font-mono text-[11px] ${s.color}`}>{s.label}</span>
                    <span className="text-slate-600 font-mono text-[10px]">—</span>
                  </div>
                );
              }
              return (
                <div key={s.key} className={`px-3 py-2 rounded-lg border ${s.bg}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-mono text-[11px] ${s.color}`}>{s.label}</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {totalCount > 0 ? `+${totalCount}` : failCount > 0 ? 'FAIL' : '—'}
                      {okCount > 0 && failCount === 0 && <span className="text-slate-600 ml-1">({okCount} polls)</span>}
                    </span>
                  </div>
                  {firstError && (
                    <div className="font-mono text-[10px] text-red-400/80 mt-1 truncate" title={firstError}>
                      ⚠ {firstError.length > 60 ? firstError.slice(0, 60) + '…' : firstError}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={runPoll}
            disabled={polling}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl font-mono text-xs font-bold transition cursor-pointer"
          >
            {polling ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                POLLING LIVE SOURCES...
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                POLL SOURCES NOW
              </>
            )}
          </button>

          {intake?.lastPollAt && (
            <p className="text-slate-600 font-mono text-[10px] mt-2 text-center">
              Last poll: {new Date(intake.lastPollAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Ground + Benchmark Column */}
        <div className="space-y-4">
          {/* Ground */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-300 font-mono font-bold text-xs flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-indigo-400" />
                GROUND NEXT SIGNAL
              </h3>
              {groundDuration && (
                <span className="text-slate-600 font-mono text-[10px]">{groundDuration}ms</span>
              )}
            </div>

            {/* Unconsumed signal preview */}
            {intake && intake.unconsumed > 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-3">
                <span className="text-slate-500 font-mono text-[10px] block mb-1">
                  {intake.unconsumed} unconsumed — next up:
                </span>
                <span className="text-slate-300 font-mono text-[11px]">
                  {intake.lastGroundSummary?.split('→')[0]?.trim() || '...'}
                </span>
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-3">
                <span className="text-slate-600 font-mono text-[11px]">
                  {intake?.total === 0 ? 'No signals — poll first' : 'All signals consumed'}
                </span>
              </div>
            )}

            {/* Last ground result */}
            {lastGroundResult && (
              <div className={`rounded-lg p-3 mb-3 border ${
                lastGroundResult.grounded
                  ? 'bg-emerald-950/50 border-emerald-800'
                  : 'bg-slate-950 border-slate-800'
              }`}>
                <span className={`font-mono text-[11px] ${lastGroundResult.grounded ? 'text-emerald-400' : 'text-red-400'}`}>
                  {lastGroundResult.grounded
                    ? `✓ GROUNDED → ${lastGroundResult.toolName}`
                    : `✗ FAILED → ${lastGroundResult.reason}`
                  }
                </span>
              </div>
            )}

            {intake?.lastGroundSummary && !lastGroundResult && (
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mb-3">
                <span className="text-slate-500 font-mono text-[10px] block mb-1">Last ground:</span>
                <span className="text-slate-400 font-mono text-[11px]">{intake.lastGroundSummary}</span>
              </div>
            )}

            <button
              onClick={runGround}
              disabled={grounding || modelOnline === false || (intake?.unconsumed ?? 0) === 0}
              title={modelOnline === false ? 'Model offline — ground unavailable' : (intake?.unconsumed ?? 0) === 0 ? 'No signals — poll first' : 'Ground the next signal'}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-30 text-white rounded-xl font-mono text-xs font-bold transition cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              {grounding ? 'GROUNDING...' : modelOnline === false ? 'MODEL OFFLINE' : 'GROUND NEXT SIGNAL'}
            </button>
          </div>

          {/* Benchmark Trend */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-300 font-mono font-bold text-xs flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                EXTERNAL BENCHMARK
              </h3>
              <span className="text-slate-600 font-mono text-[10px]">
                {benchmark?.problems?.length ?? 0} fixed problems
              </span>
            </div>

            {/* Score bar */}
            <div className="mb-3">
              <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1">
                <span>solved</span>
                <span>{benchmark?.lastRun ? `${benchmark.lastRun.solved}/${benchmark.lastRun.total}` : 'no runs'}</span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right text-[10px] font-mono text-amber-400 mt-1">{pct}%</div>
            </div>

            {/* Problem list */}
            {benchmark?.problems && benchmark.problems.length > 0 && (
              <div className="space-y-1 mb-4">
                {benchmark.problems.map(p => {
                  const solved = benchmark.lastRun?.solvedIds?.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={solved ? 'text-emerald-400' : 'text-slate-700'}>
                        {solved ? '✓' : '·'}
                      </span>
                      <span className={solved ? 'text-emerald-500' : 'text-slate-600'}>
                        {p.name}
                      </span>
                      <span className="text-slate-700 ml-auto">{p.domain}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Trend */}
            {benchmark?.history && benchmark.history.length > 0 && (
              <div className="mb-3 flex items-center gap-1">
                <span className="text-slate-600 font-mono text-[10px] mr-1">trend:</span>
                {benchmark.history.slice(-8).map((h, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div
                      className="w-4 bg-amber-600 rounded-sm"
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
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl font-mono text-xs font-bold transition cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" />
              {benchRunning ? 'RUNNING...' : 'RUN BENCHMARK'}
            </button>
          </div>
        </div>
      </div>

      {/* Signal Queue */}
      {intake && intake.unconsumed > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-300 font-mono font-bold text-xs flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-400" />
              SIGNAL QUEUE ({intake.unconsumed} pending)
            </h3>
            <span className="text-slate-600 font-mono text-[10px]">
              by source: {Object.entries(intake.bySource).map(([k, v]) => `${k}:${v}`).join(' · ')}
            </span>
          </div>
          <div className="text-slate-600 font-mono text-[11px] italic">
            {intake.lastGroundSummary || 'Poll sources to populate the queue'}
          </div>
        </div>
      )}

      {/* Grounded Tools */}
      {intake?.groundedTools && intake.groundedTools.length > 0 && (
        <div className="bg-slate-900 border border-emerald-900/40 rounded-2xl p-5">
          <h3 className="text-emerald-400 font-mono font-bold text-xs flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4" />
            GROUNDED TOOLS ({intake.groundedTools.length}) — VERIFIED IN SANDBOX
          </h3>
          <div className="flex flex-wrap gap-2">
            {intake.groundedTools.map(tool => (
              <span
                key={tool}
                className="px-3 py-1 bg-emerald-950/60 border border-emerald-800/50 rounded-full font-mono text-[11px] text-emerald-300"
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

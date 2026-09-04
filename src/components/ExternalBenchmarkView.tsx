import React, { useState, useEffect, useCallback } from 'react';
import { Target, CheckCircle2, XCircle, Wrench, ShieldCheck, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react';

interface BenchmarkProblemMeta {
  id: string;
  title: string;
  domain: string;
  solved: boolean;
}
interface BenchLatest {
  solved: number;
  total: number;
  solvedIds: string[];
}
interface BenchHistoryRow {
  at: number;
  solved: number;
  total: number;
}
interface BenchData {
  latest: BenchLatest | null;
  history: BenchHistoryRow[];
  totalProblems: number;
  problems: BenchmarkProblemMeta[];
  realProgress?: { healedTools?: number; openAnomalies?: number; benchmarkSolved?: number; benchmarkTotal?: number } | null;
  rewardWeightBenchmark?: number;
}
interface RepairStatus {
  selfRepair?: { totalHealedCount?: number; activeAnomaliesCount?: number; repairSuccessRate?: number; meanTimeToRepairMs?: number; isAutoHealingEnabled?: boolean };
}
interface SysStatus {
  verifierPassRate?: number;
}

const DOMAIN_COLOR: Record<string, string> = {
  coding: 'text-sky-300 bg-sky-950/50 border-sky-800',
  math: 'text-indigo-300 bg-indigo-950/50 border-indigo-800',
  systemic: 'text-teal-300 bg-teal-950/50 border-teal-800',
  biotech: 'text-emerald-300 bg-emerald-950/50 border-emerald-800',
  cyber_defense: 'text-rose-300 bg-rose-950/50 border-rose-800',
  quantum_sim: 'text-fuchsia-300 bg-fuchsia-950/50 border-fuchsia-800',
};

export const ExternalBenchmarkView: React.FC = () => {
  const [bench, setBench] = useState<BenchData | null>(null);
  const [repair, setRepair] = useState<RepairStatus | null>(null);
  const [sys, setSys] = useState<SysStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [b, r, s] = await Promise.all([
        fetch('/api/recourse/benchmark').then((x) => x.json()),
        fetch('/api/recourse/repair/status').then((x) => x.json()),
        fetch('/api/recourse/status').then((x) => x.json()),
      ]);
      setBench(b?.success ? b : b);
      setRepair(r?.success ? r : {});
      const st = s?.status ?? {};
      setSys({ verifierPassRate: st.verifierPassRate });
    } catch {
      /* keep last data; offline shows stale, never fabricated */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const latest = bench?.latest ?? null;
  const pct = latest && latest.total > 0 ? Math.round((latest.solved / latest.total) * 1000) / 10 : 0;
  const rp = bench?.realProgress ?? {};
  const sr = repair?.selfRepair ?? {};
  const successPct = typeof sr.repairSuccessRate === 'number' ? Math.round(sr.repairSuccessRate * 100) : 0;

  const sorted = [...(bench?.problems ?? [])].sort((a, b) => {
    if (a.solved !== b.solved) return a.solved ? 1 : -1;
    return a.id.localeCompare(b.id);
  });

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header card */}
      <div className="rounded-2xl border border-indigo-900/60 bg-gradient-to-br from-slate-950 via-slate-900/90 to-indigo-950/40 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-300" />
            <h2 className="font-bold tracking-wide">EXTERNAL CAPABILITY BENCHMARK</h2>
          </div>
          <button onClick={refresh} className="text-slate-400 hover:text-white transition" title="Refresh now">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-[12px] text-slate-400 mt-1">
          Each hidden suite runs in the real sandbox against every current promoted gene — a problem is solved only when
          some gene&apos;s live code passes it. No fixtures injected. This real number drives the learner reward (weight{' '}
          {bench?.rewardWeightBenchmark ?? 0.3}). Measured on the server tick regardless of other subsystems.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] font-mono text-slate-500 uppercase">Solved</div>
            <div className="text-2xl font-bold text-emerald-400">
              {latest ? `${latest.solved}/${latest.total}` : '—'}
            </div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] font-mono text-slate-500 uppercase">Coverage</div>
            <div className="text-2xl font-bold text-indigo-300">{latest ? `${pct}%` : '—'}</div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] font-mono text-slate-500 uppercase">Healed (real)</div>
            <div className="text-2xl font-bold text-emerald-300">{rp.healedTools ?? 0}</div>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-[10px] font-mono text-slate-500 uppercase">Open anomalies</div>
            <div className={`text-2xl font-bold ${(rp.openAnomalies ?? 0) > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {rp.openAnomalies ?? 0}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Per-problem solved state */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-sm tracking-wide">PROBLEM SOLVED STATE (hidden suite, real sandbox)</h3>
          </div>
          {sorted.length === 0 && <div className="text-slate-500 text-sm">No benchmark problems to show.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sorted.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {p.solved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[12px] font-mono text-slate-200 truncate">{p.title}</div>
                    <span className={`inline-block mt-0.5 px-1.5 rounded border text-[9px] font-mono ${DOMAIN_COLOR[p.domain] || 'text-slate-300 bg-slate-900 border-slate-700'}`}>
                      {p.domain} · {p.id}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-mono shrink-0 ${p.solved ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {p.solved ? 'SOLVED' : 'OPEN'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {/* Real self-repair telemetry */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-4 h-4 text-slate-400" />
              <h3 className="font-bold text-sm tracking-wide">REAL SELF-REPAIR</h3>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className={`w-4 h-4 ${sr.isAutoHealingEnabled ? 'text-emerald-400' : 'text-slate-600'}`} />
              <span className="text-xs text-slate-300">
                Auto-heal {sr.isAutoHealingEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[12px] font-mono">
              <div className="bg-slate-900/60 rounded border border-slate-800 p-2">
                <div className="text-slate-500 text-[10px]">Healed</div>
                <div className="text-emerald-300 font-bold">{sr.totalHealedCount ?? 0}</div>
              </div>
              <div className="bg-slate-900/60 rounded border border-slate-800 p-2">
                <div className="text-slate-500 text-[10px]">Success rate</div>
                <div className="text-slate-200 font-bold">{successPct}%</div>
              </div>
            </div>
            {sr.totalHealedCount === 0 && (
              <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> A heal is only counted after the repaired code
                passes its real regression suite. Inject chaos on the Self-Repair tab to exercise it.
              </p>
            )}
          </div>

          {/* History */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <h3 className="font-bold text-sm tracking-wide">RUN HISTORY (solved/total)</h3>
            </div>
            <div className="text-[11px] font-mono text-slate-300 space-y-1">
              {!bench?.history?.length && <div className="text-slate-500">No runs yet — measured on the next server tick (~30s).</div>}
              {[...(bench?.history ?? [])].reverse().map((r, i) => (
                <div key={i} className="flex justify-between border-b border-slate-800/60 pb-1">
                  <span>{new Date(r.at).toLocaleTimeString()}</span>
                  <span className={r.solved === r.total ? 'text-emerald-400' : 'text-indigo-300'}>
                    {r.solved}/{r.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-600">
        Verifier pass-rate: {typeof sys?.verifierPassRate === 'number' ? Math.round(sys.verifierPassRate * 100) : '—'}%.
        Honest scope: benchmark problems grade falsifiable function behavior. Claims that cannot be reduced to a hidden
        suite (e.g. fact-checking clinical literature) are intentionally not fabricated here.
      </p>
    </div>
  );
};

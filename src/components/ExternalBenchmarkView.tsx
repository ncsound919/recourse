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
  coding: 'text-accent-300 bg-accent-950/50 border-accent-800',
  math: 'text-accent-300 bg-accent-950/50 border-accent-800',
  systemic: 'text-accent-300 bg-accent-950/50 border-accent-800',
  biotech: 'text-ok-300 bg-ok-950/50 border-ok-800',
  cyber_defense: 'text-bad-300 bg-bad-950/50 border-bad-800',
  quantum_sim: 'text-accent-300 bg-accent-950/50 border-accent-800',
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
      <div className="rounded-xl border border-accent-900/60 bg-ink-950 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-accent-300" />
            <h2 className="font-semibold ">External capability benchmark</h2>
          </div>
          <button onClick={refresh} className="text-ink-400 hover:text-white transition" title="Refresh now">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-[12px] text-ink-400 mt-1">
          Each hidden suite runs in the real sandbox against every current promoted gene - a problem is solved only when
          some gene&apos;s live code passes it. No fixtures injected. This real number drives the learner reward (weight{' '}
          {bench?.rewardWeightBenchmark ?? 0.3}). Measured on the server tick regardless of other subsystems.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="bg-ink-950/60 p-3 rounded-lg border border-ink-800">
            <div className="text-[10px] text-ink-500 ">Solved</div>
            <div className="text-2xl font-semibold text-ok-400">
              {latest ? `${latest.solved}/${latest.total}` : '-'}
            </div>
          </div>
          <div className="bg-ink-950/60 p-3 rounded-lg border border-ink-800">
            <div className="text-[10px] text-ink-500 ">Coverage</div>
            <div className="text-2xl font-semibold text-accent-300">{latest ? `${pct}%` : '-'}</div>
          </div>
          <div className="bg-ink-950/60 p-3 rounded-lg border border-ink-800">
            <div className="text-[10px] text-ink-500 ">Healed (real)</div>
            <div className="text-2xl font-semibold text-ok-300">{rp.healedTools ?? 0}</div>
          </div>
          <div className="bg-ink-950/60 p-3 rounded-lg border border-ink-800">
            <div className="text-[10px] text-ink-500 ">Open anomalies</div>
            <div className={`text-2xl font-semibold ${(rp.openAnomalies ?? 0) > 0 ? 'text-bad-400' : 'text-ink-200'}`}>
              {rp.openAnomalies ?? 0}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Per-problem solved state */}
        <div className="lg:col-span-2 rounded-xl border border-ink-800 bg-ink-950/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-ink-400" />
            <h3 className="font-semibold text-sm ">Problem solved state (hidden suite, real sandbox)</h3>
          </div>
          {sorted.length === 0 && <div className="text-ink-500 text-sm">No benchmark problems to show.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sorted.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 bg-ink-900/60 border border-ink-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {p.solved ? (
                    <CheckCircle2 className="w-4 h-4 text-ok-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-bad-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[12px] text-ink-200 truncate">{p.title}</div>
                    <span className={`inline-block mt-0.5 px-1.5 rounded border text-[9px] ${DOMAIN_COLOR[p.domain] || 'text-ink-300 bg-ink-900 border-ink-700'}`}>
                      {p.domain} · {p.id}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] shrink-0 ${p.solved ? 'text-ok-400' : 'text-bad-400'}`}>
                  {p.solved ? 'SOLVED' : 'OPEN'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {/* Real self-repair telemetry */}
          <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-4 h-4 text-ink-400" />
              <h3 className="font-semibold text-sm ">Real self-repair</h3>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className={`w-4 h-4 ${sr.isAutoHealingEnabled ? 'text-ok-400' : 'text-ink-600'}`} />
              <span className="text-xs text-ink-300">
                Auto-heal {sr.isAutoHealingEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <div className="bg-ink-900/60 rounded border border-ink-800 p-2">
                <div className="text-ink-500 text-[10px]">Healed</div>
                <div className="text-ok-300 font-semibold">{sr.totalHealedCount ?? 0}</div>
              </div>
              <div className="bg-ink-900/60 rounded border border-ink-800 p-2">
                <div className="text-ink-500 text-[10px]">Success rate</div>
                <div className="text-ink-200 font-semibold">{successPct}%</div>
              </div>
            </div>
            {sr.totalHealedCount === 0 && (
              <p className="mt-3 text-[11px] text-ink-500 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-warn-400" /> A heal is only counted after the repaired code
                passes its real regression suite. Inject chaos on the Self-Repair tab to exercise it.
              </p>
            )}
          </div>

          {/* History */}
          <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-ink-400" />
              <h3 className="font-semibold text-sm ">Run history (solved/total)</h3>
            </div>
            <div className="text-[11px] text-ink-300 space-y-1">
              {!bench?.history?.length && <div className="text-ink-500">No runs yet - measured on the next server tick (~30s).</div>}
              {[...(bench?.history ?? [])].reverse().map((r, i) => (
                <div key={i} className="flex justify-between border-b border-ink-800/60 pb-1">
                  <span>{new Date(r.at).toLocaleTimeString()}</span>
                  <span className={r.solved === r.total ? 'text-ok-400' : 'text-accent-300'}>
                    {r.solved}/{r.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-ink-600">
        Verifier pass-rate: {typeof sys?.verifierPassRate === 'number' ? Math.round(sys.verifierPassRate * 100) : '-'}%.
        Honest scope: benchmark problems grade falsifiable function behavior. Claims that cannot be reduced to a hidden
        suite (e.g. fact-checking clinical literature) are intentionally not fabricated here.
      </p>
    </div>
  );
};

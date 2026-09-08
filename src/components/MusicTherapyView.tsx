import React, { useState } from 'react';
import { Activity, Music2, RefreshCw, Scale, AlertTriangle } from 'lucide-react';

interface ContrastRow { parameter: string; tuningHz: number; effect: number | null; significant: boolean; p: number | null; untested: boolean; caveats: string[]; note: string; }
interface RecordRow { parameter: string; comparator: string; effect432: number | null; effectComparator: number | null; between: number | null; betweenP: number | null; significant: boolean; year: number; source: string; detail: string; }
interface BenchmarkRow { parameter: string; effect: number; units: string; n: number; source: string; }
interface TrialCard { id: string; stimulus: any; biomarkers: any[]; tuningContrast: ContrastRow[]; tuningNote: string; claim: string; }

const PARAM_LABEL: Record<string, string> = {
  hr: 'Heart rate', pwv: 'Pulse wave velocity (m/s)', hrvRmssd: 'HRV RMSSD (ms)',
  aorticDbp: 'Aortic diastolic BP (mmHg)', vascularResistance: 'Vascular resistance (%)', bpSystolic: 'Systolic BP',
  bpDiastolic: 'Diastolic BP', vascularStiffness: 'Vascular stiffness', anxiety: 'Anxiety', stress: 'Stress',
  fatigue: 'Fatigue', wellbeing: 'Wellbeing', cortisol: 'Salivary cortisol', sleep: 'Sleep', respRate: 'Respiratory rate',
  anxietySai: 'Anxiety (SAI)', hrv: 'HRV (z)', iga: 'IgA (z)',
};

const EMPTY_CONTRAST: Record<string, ContrastRow[]> = {};

export const MusicTherapyView: React.FC = () => {
  const [tuning, setTuning] = useState(432);
  const [bpm, setBpm] = useState(60);
  const [major, setMajor] = useState(false);
  const [intensity, setIntensity] = useState<'sedative' | 'stimulative'>('sedative');
  const [variants, setVariants] = useState(3);
  const [trials, setTrials] = useState<TrialCard[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [contrast, setContrast] = useState<Record<string, ContrastRow[]>>(EMPTY_CONTRAST);
  const [benchmark, setBenchmark] = useState<BenchmarkRow[]>([]);
  const [benchmarkNote, setBenchmarkNote] = useState('');
  const [caveats, setCaveats] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadTuning = async () => {
    setBusy(true);
    try {
      const j = await fetch('/api/recourse/music-therapy/tuning').then((r) => r.json());
      setRecords(j.records ?? []);
      setContrast(j.detailedContrast ?? {});
      setBenchmark(j.benchmarkRows ?? []);
      setBenchmarkNote(j.benchmarkNote ?? '');
      setCaveats(j.caveats ?? []);
    } catch (e: any) { setMsg(`tuning evidence fetch failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  const design = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch('/api/recourse/music-therapy/design', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bpm, major, intensity, tuningHz: tuning, variants, seed: 42, style: 'jasper-ballad' }),
      }).then((r) => r.json());
      if (!j.success) { setMsg(j.error || 'design failed'); return; }
      setTrials(j.trials ?? []);
    } catch (e: any) { setMsg(`design failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  const refreshFeed = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch('/api/recourse/music-therapy/evidence/refresh', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      }).then((r) => r.json());
      setMsg(j.success ? `feed: ${j.poolableRecords} poolable, ${j.qualitativeRecords} qualitative, ${j.errors?.length ?? 0} errors` : j.error || 'refresh failed');
    } catch (e: any) { setMsg(`refresh failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  const contrastRows = contrast[String(tuning)] ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <Music2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white font-mono">MUSIC-THERAPY RESEARCH INSTRUMENT — TUNING CONTRAST</h2>
        </div>
        <p className="text-[11px] text-slate-500 font-mono mt-1">
          Reproducible trial design + a 432-vs-440/443 tuning-contrast layer. Estimates are literature-prior models with
          uncertainty — never measurements. Supportive intervention, not a cancer treatment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Design studio */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> DESIGN STUDIO</h3>
          <label className="block text-[11px] font-mono text-slate-400">Tuning (Hz)</label>
          <div className="flex gap-2">
            {[415, 432, 440, 443].map((hz) => (
              <button key={hz} onClick={() => setTuning(hz)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border transition ${tuning === hz ? 'bg-indigo-950 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}>
                {hz}
              </button>
            ))}
          </div>
          <label className="block text-[11px] font-mono text-slate-400 mt-2">BPM ({bpm})</label>
          <input type="range" min={60} max={100} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-full" />
          <div className="flex gap-2">
            <button onClick={() => setMajor(false)} className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border ${!major ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>MINOR</button>
            <button onClick={() => setMajor(true)} className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border ${major ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>MAJOR</button>
            <button onClick={() => setIntensity(intensity === 'sedative' ? 'stimulative' : 'sedative')} className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border ${intensity === 'sedative' ? 'bg-indigo-950 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>{intensity.toUpperCase()}</button>
          </div>
          <label className="block text-[11px] font-mono text-slate-400">Variants ({variants})</label>
          <input type="range" min={1} max={8} value={variants} onChange={(e) => setVariants(Number(e.target.value))} className="w-full" />
          <button onClick={design} disabled={busy} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-lg">
            {busy ? 'DESIGNING...' : `DESIGN ${variants === 1 ? 'TRIAL' : 'BATCH'} @ ${tuning}Hz`}
          </button>
        </div>

        {/* Tuning evidence */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono">HEAD-TO-HEAD TUNING EVIDENCE (432 vs 440/443)</h3>
            <button onClick={loadTuning} disabled={busy} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-mono text-[11px] font-bold rounded-lg flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> LOAD
            </button>
          </div>
          {records.length === 0 && contrastRows.length === 0 ? (
            <div className="p-6 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl">No evidence loaded. Press LOAD to pull the seeded tuning-contrast records.</div>
          ) : (
            <div className="space-y-4">
              {contrastRows.length > 0 && (
                <table className="w-full text-[11px] font-mono">
                  <thead><tr className="text-slate-500 border-b border-slate-800 text-left">
                    <th className="py-1.5">Parameter</th><th>Effect (432 vs 443)</th><th>p</th><th>Verdict</th>
                  </tr></thead>
                  <tbody>
                    {contrastRows.map((c) => (
                      <tr key={c.parameter} className="border-b border-slate-900">
                        <td className="py-1.5 text-slate-300">{PARAM_LABEL[c.parameter] ?? c.parameter}</td>
                        <td className="text-slate-400">{c.effect ?? (c.untested ? 'untested' : '—')}</td>
                        <td className="text-slate-400">{c.p ?? '—'}</td>
                        <td>
                          {c.untested ? <span className="text-amber-400 font-bold text-[10px]">UNTESTED (415 Hz dose-finding)</span>
                            : c.significant ? <span className="text-emerald-400 font-bold text-[10px]">SIGNIFICANT</span>
                            : <span className="text-slate-500 text-[10px]">ns</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="space-y-1.5 max-h-64 overflow-auto">
                {records.map((r) => (
                  <div key={`${r.parameter}-${r.year}-${r.comparator}`} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/60 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-300">{PARAM_LABEL[r.parameter] ?? r.parameter} <span className="text-slate-600">(432 vs {r.comparator})</span></span>
                      <span className={r.significant ? 'text-emerald-400 font-bold' : 'text-slate-500'}>{r.significant ? 'SIG' : 'ns'}{r.betweenP != null ? ` p=${r.betweenP}` : ' · no between-p'}</span>
                    </div>
                    <p className="text-slate-500 mt-0.5">{r.detail}</p>
                    <p className="text-slate-600">{r.source} ({r.year})</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Benchmark + caveats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-3"><Scale className="w-4 h-4 text-indigo-400" /> BENCHMARK — STANDARD MUSIC THERAPY (MUSIC vs CONTROL)</h3>
          {benchmark.length === 0 ? <p className="text-slate-500 text-xs font-mono">Load evidence to see the Cochrane benchmark.</p> : (
            <>
              <table className="w-full text-[11px] font-mono">
                <thead><tr className="text-slate-500 border-b border-slate-800 text-left"><th className="py-1.5">Measure</th><th>Effect</th><th>n</th></tr></thead>
                <tbody>
                  {benchmark.map((b) => (
                    <tr key={b.parameter} className="border-b border-slate-900">
                      <td className="py-1.5 text-slate-300">{PARAM_LABEL[b.parameter] ?? b.parameter}</td>
                      <td className="text-emerald-400">{b.effect} {b.units}</td>
                      <td className="text-slate-500">{b.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] font-mono text-slate-500 mt-2">{benchmarkNote}</p>
            </>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-amber-400" /> LIMITATIONS</h3>
          {caveats.length === 0 ? <p className="text-slate-500 text-xs font-mono">Load evidence to see the caveats.</p> : (
            <ul className="space-y-1.5 text-[11px] font-mono text-slate-400">
              {caveats.map((c, i) => <li key={i} className="flex gap-2"><span className="text-amber-500">▸</span>{c}</li>)}
            </ul>
          )}
          <button onClick={refreshFeed} disabled={busy} className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-mono text-[11px] font-bold rounded-lg flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> REFRESH MUSIC-VS-CONTROL FEED
          </button>
        </div>
      </div>

      {/* Trial cards */}
      {trials.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {trials.map((t) => (
            <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-white font-mono">{t.id}</span>
                <span className="text-[10px] font-mono text-slate-500">{t.stimulus?.tuningHz}Hz · {t.stimulus?.bpm}bpm {t.stimulus?.major ? 'maj' : 'min'} · {t.stimulus?.intensity}</span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mb-2">{t.claim}</p>
              <p className="text-[11px] font-mono text-indigo-300 mb-2">{t.tuningNote}</p>
              <div className="space-y-1">
                {t.biomarkers?.map((b) => (
                  <div key={b.biomarker} className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>{b.biomarker}{b.calibrated ? ' (calibrated)' : ''}</span>
                    <span className={b.effect < 0 ? 'text-emerald-400' : 'text-indigo-300'}>{b.effect > 0 ? '+' : ''}{b.effect} ± {b.sd}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-400">{msg}</div>}
    </div>
  );
};

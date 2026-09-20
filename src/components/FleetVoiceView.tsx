import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Network, Play, RefreshCw, Volume2 } from 'lucide-react';
import { speakBrief } from '../lib/narration';
import { stopClonedSpeech } from '../lib/voiceClone';
import type { FleetOpenHubState, FleetVoiceBriefs, FleetAxiomState } from '../lib/fleetVoice';

interface FleetVoiceResponse {
  success: boolean;
  axiom: FleetAxiomState;
  openhub: FleetOpenHubState;
  briefs: FleetVoiceBriefs;
}

function reach(reachable: boolean, label: string) {
  return (
    <span
      className={`px-2 py-1 rounded border text-[11px] font-mono ${
        reachable ? 'border-emerald-800 text-emerald-300' : 'border-red-800 text-red-300'
      }`}
    >
      {label}
    </span>
  );
}

export function FleetVoiceView() {
  const [data, setData] = useState<FleetVoiceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/recourse/fleet/voice').then((r) => r.json());
      if (res?.success) setData(res as FleetVoiceResponse);
      else setMessage(res?.error ?? 'fleet voice unavailable');
    } catch (e: any) {
      setMessage(`failed to load fleet voice: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const play = (text: string) => {
    if (!text) return;
    stopClonedSpeech();
    speakBrief(text);
  };

  const axiom = data?.axiom;
  const audit = data?.openhub.audit ?? null;

  return (
    <div className="p-4 space-y-4 text-sm max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-cyan-400" />
            <span className="text-cyan-300 font-semibold text-base">Fleet Voice — Axiom &amp; OpenHub</span>
          </div>
          <div className="text-slate-400 text-xs mt-0.5">
            Spoken briefs for Recourse's two fleet peers, built from real probes. Transitions (bridge reachability,
            loop lifecycle, audit grade and findings) are also narrated automatically by the fleet voice monitor.
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded border border-slate-700 hover:border-cyan-600 text-slate-300 flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Axiom */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-200 font-semibold text-sm">Axiom bridge</span>
          {data && reach(Boolean(axiom?.online), axiom?.online ? 'ONLINE' : 'OFFLINE')}
          {data && (
            <span className="px-2 py-1 rounded border border-slate-700 text-slate-400 text-[11px] font-mono">
              AUTH {axiom?.auth ?? '—'}
            </span>
          )}
          {axiom?.url && <span className="text-slate-500 text-xs font-mono break-all">{axiom.url}</span>}
        </div>

        {axiom?.loop ? (
          <div className="text-xs text-slate-400 font-mono space-y-0.5">
            <div>
              LOOP <span className="text-slate-200">{axiom.loop.id}</span> · STATUS{' '}
              <span className="text-slate-200">{axiom.loop.status ?? 'unknown'}</span>
              {axiom.loop.iteration !== null ? ` · ITERATION ${axiom.loop.iteration}` : ''}
            </div>
            {axiom.loop.goal && <div className="text-slate-500 break-all">GOAL {axiom.loop.goal}</div>}
          </div>
        ) : (
          <div className="text-xs text-slate-500 font-mono">
            {axiom?.loopError ? `LOOP — ${axiom.loopError}` : 'LOOP — none recorded'}
          </div>
        )}

        <div className="flex items-start gap-2">
          <button
            onClick={() => play(data?.briefs.axiom ?? '')}
            disabled={!data?.briefs.axiom}
            className="px-3 py-1.5 rounded bg-cyan-800 hover:bg-cyan-700 disabled:opacity-40 text-white font-semibold flex items-center gap-2 shrink-0"
          >
            <Play className="w-3.5 h-3.5" /> Speak brief
          </button>
          <p className="text-xs text-slate-300 leading-relaxed">{data?.briefs.axiom ?? '—'}</p>
        </div>
      </div>

      {/* OpenHub */}
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-200 font-semibold text-sm">OpenHub audit</span>
          {data && reach(data.openhub.recorded, data.openhub.recorded ? 'RECORDED' : 'NONE')}
          {audit && (
            <span className="px-2 py-1 rounded border border-slate-700 text-slate-400 text-[11px] font-mono">
              GRADE {audit.grade}
              {audit.score === null ? '' : ` · ${audit.score}/100`}
            </span>
          )}
          {audit && audit.deterministicScore !== null && (
            <span className="px-2 py-1 rounded border border-slate-700 text-slate-500 text-[11px] font-mono">
              DETERMINISTIC {audit.deterministicScore}/100
            </span>
          )}
        </div>

        {audit ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
            <span className="rounded border border-slate-800 px-2 py-1 text-slate-400">
              COVERAGE <span className="text-slate-200">{audit.coveragePercent}%</span>
            </span>
            <span className="rounded border border-slate-800 px-2 py-1 text-slate-400">
              FINDINGS <span className="text-slate-200">{audit.findings.total}</span>
            </span>
            <span className="rounded border border-slate-800 px-2 py-1 text-slate-400">
              FIXED <span className="text-emerald-300">{audit.findings.fixed}</span>
            </span>
            <span className="rounded border border-slate-800 px-2 py-1 text-slate-400">
              NEW <span className="text-amber-300">{audit.findings.new}</span>
            </span>
          </div>
        ) : (
          <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> No audit snapshot recorded — no grade to report.
          </div>
        )}

        <div className="flex items-start gap-2">
          <button
            onClick={() => play(data?.briefs.openhub ?? '')}
            disabled={!data?.briefs.openhub}
            className="px-3 py-1.5 rounded bg-cyan-800 hover:bg-cyan-700 disabled:opacity-40 text-white font-semibold flex items-center gap-2 shrink-0"
          >
            <Play className="w-3.5 h-3.5" /> Speak brief
          </button>
          <p className="text-xs text-slate-300 leading-relaxed">{data?.briefs.openhub ?? '—'}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Volume2 className="w-3.5 h-3.5" />
        <span>
          Briefs speak even while narration is muted. Transition events respect the header's voice toggle and
          narration level.
        </span>
        <button
          onClick={stopClonedSpeech}
          className="ml-auto px-2 py-1 rounded border border-slate-700 hover:border-slate-500 text-slate-400"
        >
          Stop
        </button>
      </div>

      {message && <div className="text-amber-300 text-xs">{message}</div>}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Activity,
  CheckCircle2,
  Wrench,
  ShieldCheck,
  Layers,
  AlertTriangle,
  X,
  RefreshCw,
  Volume2,
  Server
} from 'lucide-react';
import type { SystemStatus } from '../types';
import { speakBrief } from '../lib/narration';
import { isVoiceEnabled } from '../lib/voice';

export type InsightKind = 'gen' | 'upgrades' | 'repair' | 'chain' | 'genes' | 'safety';

interface SystemInsightModalProps {
  kind: InsightKind | null;
  status: SystemStatus;
  onClose: () => void;
}

const META: Record<InsightKind, { title: string; subtitle: string; Icon: React.ElementType }> = {
  gen: { title: 'Autonomous Generation', subtitle: '24/7 tick activity & recorded work', Icon: Activity },
  upgrades: { title: 'Promoted Upgrades', subtitle: 'Tools promoted with passing verifiers', Icon: CheckCircle2 },
  repair: { title: 'Autonomous Self-Repair', subtitle: 'Healing radar, diagnoses & outcomes', Icon: Wrench },
  chain: { title: 'Hash Chain Integrity', subtitle: 'Provenance ledger & cryptographic state', Icon: ShieldCheck },
  genes: { title: 'Tool Genes', subtitle: 'Domain coverage & registry health', Icon: Layers },
  safety: { title: 'Safety & Defects', subtitle: 'Approval queue, policy & open anomalies', Icon: AlertTriangle }
};

const FETCH_PLAN: Record<InsightKind, string[]> = {
  gen: ['status', 'provenance', 'repair', 'generations'],
  upgrades: ['registry', 'status'],
  repair: ['repair', 'status'],
  chain: ['provenance', 'status'],
  genes: ['registry', 'status', 'selfhosted'],
  safety: ['repair', 'status']
};

const ENDPOINTS: Record<string, string> = {
  status: '/api/recourse/status',
  registry: '/api/recourse/registry',
  provenance: '/api/recourse/provenance',
  repair: '/api/recourse/repair/status',
  selfhosted: '/api/recourse/selfhosted',
  generations: '/api/recourse/generations'
};

async function fetchPlan(kind: InsightKind): Promise<{ data: Record<string, any>; errors: string[] }> {
  const data: Record<string, any> = {};
  const errors: string[] = [];
  const results = await Promise.all(
    FETCH_PLAN[kind].map(async (name) => {
      try {
        const res = await fetch(ENDPOINTS[name]).then((r) => r.json());
        return { name, res };
      } catch (err: any) {
        return { name, error: err?.message || 'fetch failed' };
      }
    })
  );
  for (const r of results) {
    if ('error' in r && r.error) {
      errors.push(`${r.name}: ${r.error}`);
    } else if (r.res) {
      data[r.name] = r.res;
    }
  }
  return { data, errors };
}

const DOMAIN_ORDER = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];

const DOMAIN_PILL: Record<string, string> = {
  coding: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  math: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  systemic: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  cyber_defense: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  biotech: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  neuro_symbolic: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  quantum_sim: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
};

function timeAgo(ts?: number): string {
  if (!ts) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function fmtClock(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString();
}

function pickLines(obj: any): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const keys = ['title', 'summary', 'description', 'reason', 'message', 'actionType', 'recommendedAction'];
  const out: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
    if (v && typeof v === 'object' && k !== 'recommendedAction') {
      out.push(...pickLines(v).slice(0, 1));
    }
    if (out.length >= 2) break;
  }
  return out;
}

function eventSummary(evt: any): string {
  const d = evt?.data || {};
  const candidates = [d.tool, d.toolName, d.hybridTool, d.toolName, d.action, d.actionType, d.templateId, d.chaosType, d.gene];
  const subject = candidates.find((c) => typeof c === 'string' && c.length > 0);
  if (subject) return `${evt.type} — ${subject}`;
  const action = pickLines(d)[0];
  return action ? `${evt.type} — ${action}` : evt.type;
}

function domainPill(domain: string) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${DOMAIN_PILL[domain] || 'text-slate-400 bg-slate-800 border-slate-700'}`}>
      {domain.replace('_', ' ').toUpperCase()}
    </span>
  );
}

// ===========================================================================
// Briefs — real numbers rendered as prose for voice read-aloud
// ===========================================================================

function buildBrief(kind: InsightKind, data: Record<string, any>): string[] {
  const s = data.status?.status || {};
  const lines: string[] = [];
  switch (kind) {
    case 'gen': {
      lines.push(
        `Generation ${s.generation ?? '?'}. ${s.isAutoEvolving ? 'Autonomous evolution running.' : 'Evolution paused.'} ` +
          `Policy ${s.activePolicy || 'unknown'}. Readiness ${Math.round((s.readinessScore ?? 0) * 100)} percent.`
      );
      if (s.providerStatus?.online) lines.push(`Local model ${s.providerStatus.model || ''} online.`);
      else lines.push('Local model offline.');
      lines.push(
        `${s.totalUpgrades ?? 0} upgrades live. ${s.selfRepair?.totalHealedCount ?? 0} self repairs completed. ` +
          `${s.selfRepair?.activeAnomaliesCount ?? 0} active defects. ${data.provenance?.events?.length ?? 0} recorded provenance events.`
      );
      const gens = data.generations?.entries || [];
      if (gens.length) {
        lines.push(`Generation ledger records ${gens.length} generation${gens.length === 1 ? '' : 's'}${gens[0]?.gen && gens[0].gen > 1 ? ` starting at generation ${gens[0].gen}` : ''}.`);
      } else {
        lines.push('Generation ledger empty — generations recorded before it was enabled were not persisted.');
      }
      break;
    }
    case 'upgrades': {
      const reg = data.registry?.registry || [];
      const promoted = reg
        .map((t: any) => ({ t, v: [...(t.versions || [])].reverse().find((x: any) => x.promoted) }))
        .filter((x: any) => x.v);
      lines.push(`${promoted.length} tools currently have a promoted version.`);
      for (const { t, v } of promoted.slice(0, 5)) {
        lines.push(`${t.name} ${t.domain} version ${v.version}, verifier score ${Math.round((v.score ?? 0) * 100)} percent.`);
      }
      break;
    }
    case 'repair': {
      const sr = s.selfRepair || {};
      lines.push(
        `${sr.totalHealedCount ?? 0} tools healed. Success rate ${Math.round((sr.repairSuccessRate ?? 0) * 100)} percent. ` +
          `${sr.activeAnomaliesCount ?? 0} active anomalies.`
      );
      const active = (data.repair?.anomalies || []).filter((a: any) => a.status === 'detected');
      if (active.length) {
        lines.push(`${active.length} unresolved.`);
        for (const a of active.slice(0, 3)) lines.push(`${a.toolName}: ${a.errorType}.`);
      }
      break;
    }
    case 'chain': {
      const integrity = data.provenance?.integrity || {};
      lines.push(
        `Provenance chain ${integrity.valid ? 'valid' : 'BROKEN'}. ${integrity.length ?? 0} events. ` +
          `Last hash ${String(integrity.lastHash || '').slice(0, 10)}.`
      );
      break;
    }
    case 'genes': {
      const reg = data.registry?.registry || [];
      const healthy = reg.filter((t: any) => t.healthStatus === 'healthy').length;
      lines.push(`${reg.length} registered tool genes, ${healthy} healthy.`);
      const cov = s.domainCoverage || {};
      for (const d of DOMAIN_ORDER) {
        const c = cov[d];
        if (c) lines.push(`${d}: ${c.activeGenes} active at ${Math.round((c.passRate ?? 0) * 100)} percent pass.`);
      }
      lines.push(`${data.selfhosted?.count ?? 0} self hosted runtime modules.`);
      break;
    }
    case 'safety': {
      lines.push(`${s.pendingApprovalsCount ?? 0} genes pending approval. ${s.selfRepair?.activeAnomaliesCount ?? 0} active defects.`);
      const active = (data.repair?.anomalies || []).filter((a: any) => a.status === 'detected');
      for (const a of active.slice(0, 4)) lines.push(`${a.severity} defect in ${a.toolName}: ${a.errorType}.`);
      break;
    }
  }
  return lines.filter((l) => l.trim());
}

// ===========================================================================
// Modal body
// ===========================================================================

export const SystemInsightModal: React.FC<SystemInsightModalProps> = ({ kind, status, onClose }) => {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [brief, setBrief] = useState<string[]>([]);

  const meta = kind ? META[kind] : null;

  const load = async (k: InsightKind) => {
    setLoading(true);
    setErrors([]);
    const { data: d, errors: e } = await fetchPlan(k);
    setData(d);
    setErrors(e);
    setFetchedAt(Date.now());
    setLoading(false);
  };

  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    setLoading(true);
    fetchPlan(kind).then(({ data: d, errors: e }) => {
      if (cancelled) return;
      setData(d);
      setErrors(e);
      setFetchedAt(Date.now());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    if (!kind || !data) {
      setBrief([]);
      return;
    }
    setBrief(buildBrief(kind, data));
  }, [kind, data]);

  if (!kind || !meta) return null;

  const handleSpeak = () => {
    speakBrief(brief.join(' '));
  };

  const muteNote = !isVoiceEnabled();

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-indigo-400">
              <meta.Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{meta.title}</h3>
              <p className="text-[11px] font-mono text-slate-400 mt-0.5">{meta.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => kind && load(kind)}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleSpeak}
              disabled={brief.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono font-bold transition cursor-pointer disabled:opacity-50"
              title="Read this panel aloud"
            >
              <Volume2 className="w-4 h-4" />
              <span>SPEAK BRIEF</span>
            </button>
            <button onClick={onClose} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Honest voice note */}
        {muteNote && (
          <div className="px-5 pt-3 text-[10px] font-mono text-slate-500">
            Voice is muted in the header — SPEAK BRIEF plays a one-off readout anyway.
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errors.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono">
              <div className="font-bold mb-1">Some live feeds could not be loaded</div>
              {errors.map((e) => (
                <div key={e}>• {e}</div>
              ))}
            </div>
          )}

          {/* Brief prose box */}
          {brief.length > 0 && (
            <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/50 text-indigo-100 text-xs font-mono space-y-1">
              {brief.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          )}

          {loading && !data && (
            <div className="py-16 text-center text-slate-400 font-mono text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
              Fetching live state...
            </div>
          )}

          {data && (
            <>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 border-b border-slate-800 pb-2">
                <span>Live API data</span>
                <span>Fetched {fetchedAt ? timeAgo(fetchedAt) : 'just now'}</span>
              </div>
              {kind === 'gen' && <GenPanel data={data} status={status} />}
              {kind === 'upgrades' && <UpgradesPanel data={data} />}
              {kind === 'repair' && <RepairPanel data={data} status={status} />}
              {kind === 'chain' && <ChainPanel data={data} />}
              {kind === 'genes' && <GenesPanel data={data} status={status} />}
              {kind === 'safety' && <SafetyPanel data={data} status={status} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ===========================================================================
// Panel renderers
// ===========================================================================

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
      <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`mt-1 text-sm font-mono font-bold ${accent || 'text-white'}`}>{value}</div>
    </div>
  );
}

function GenPanel({ data, status }: { data: Record<string, any>; status: SystemStatus }) {
  const s = data.status?.status || status;
  const events: any[] = data.provenance?.events || [];
  const recent = [...events].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 20);
  const anomalies = data.repair?.anomalies || [];
  const activeDefects = anomalies.filter((a: any) => a.status === 'detected').length;
  const lastDecisionLines = pickLines(s.lastDecision);

  // Coalesce consecutive duplicates (e.g. repeated auto_evolve_toggle rows) so
  // the activity feed shows signal, not a wall of identical toggles.
  const coalesced: Array<{ evt: any; n: number }> = [];
  for (const evt of recent) {
    const sig = `${evt.type}|${eventSummary(evt)}`;
    const prev = coalesced[coalesced.length - 1];
    if (prev && `${prev.evt.type}|${eventSummary(prev.evt)}` === sig) {
      prev.n += 1;
    } else {
      coalesced.push({ evt, n: 1 });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Generation" value={`#${s.generation ?? '?'}`} accent="text-indigo-400" />
        <Stat label="Mode" value={s.isAutoEvolving ? '24/7 AUTO' : 'PAUSED'} accent={s.isAutoEvolving ? 'text-emerald-400' : 'text-amber-400'} />
        <Stat label="Policy" value={(s.activePolicy || '—').replace(/_/g, ' ')} />
        <Stat label="Readiness" value={`${Math.round((s.readinessScore ?? 0) * 100)}%`} accent="text-cyan-400" />
        <Stat label="Model" value={s.providerStatus?.online ? (s.providerStatus.model || 'online') : 'OFFLINE'} accent={s.providerStatus?.online ? 'text-emerald-400' : 'text-slate-500'} />
        <Stat label="Verifier Pass" value={`${Math.round((s.verifierPassRate ?? 0) * 100)}%`} accent="text-emerald-400" />
        <Stat label="Crystallized Genes" value={s.dreamState?.totalCrystallizedGenes ?? 0} accent="text-purple-400" />
        <Stat label="Active Defects" value={activeDefects} accent={activeDefects > 0 ? 'text-rose-400' : 'text-emerald-400'} />
      </div>

      {lastDecisionLines.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Last growth decision</div>
          {lastDecisionLines.map((l, i) => (
            <p key={i} className="text-xs text-slate-300 font-mono">{l}</p>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Recent recorded activity</span>
          <span className="text-[10px] font-mono text-slate-500">{events.length} total</span>
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {coalesced.map(({ evt, n }, i) => (
            <div key={`${evt.ts}-${i}`} className="flex items-center gap-2 bg-slate-950 border border-slate-800/70 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-[10px] font-mono text-slate-500 w-14 shrink-0">{timeAgo(evt.ts)}</span>
              <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/50 border border-indigo-900 rounded px-1.5 py-0.5 shrink-0">{evt.type}</span>
              <span className="text-slate-300 font-mono truncate">{eventSummary(evt)}</span>
              {n > 1 && <span className="ml-auto text-[10px] font-mono text-slate-500 shrink-0">×{n}</span>}
            </div>
          ))}
          {coalesced.length === 0 && <div className="text-xs text-slate-500 font-mono py-6 text-center">No provenance events recorded yet.</div>}
        </div>
        <p className="text-[10px] font-mono text-slate-600 mt-2">
          Note: the generation counter advances on every 24/7 tick; ticks themselves don't each create a provenance record — this feed shows recorded work.
        </p>
      </div>

      {/* Generation ledger — real per-generation records, persisted from each tick */}
      {(() => {
        const entries: any[] = (data.generations?.entries || []).slice().reverse().slice(0, 40);
        const all = data.generations?.entries || [];
        const ledgerStartsAt = all.length > 0 ? all[0]?.gen : null;
        return (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Generation ledger</span>
              <span className="text-[10px] font-mono text-slate-500">
                {all.length} recorded {ledgerStartsAt != null && ledgerStartsAt > 1 ? `(from gen ${ledgerStartsAt})` : ''}
              </span>
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {entries.map((e) => (
                <div key={e.gen} className="flex items-center gap-2 bg-slate-950 border border-slate-800/70 rounded-lg px-3 py-1.5 text-xs">
                  <span className="text-indigo-300 font-mono font-bold shrink-0">Gen #{e.gen}</span>
                  <span className="text-slate-500 font-mono text-[10px] shrink-0">{timeAgo(e.ts)}</span>
                  <span className="font-mono text-emerald-400 shrink-0">{Math.round((e.readinessScore ?? 0) * 100)}%</span>
                  <span className="font-mono text-slate-400 hidden sm:inline">
                    E {typeof e.energyBudget === 'number' ? Math.round(e.energyBudget) : '—'}
                    {typeof e.energyConsumed === 'number' ? ` / ${Math.round(e.energyConsumed)} used` : ''}
                  </span>
                  {typeof e.learnerEpisode === 'number' && (
                    <span className="font-mono text-purple-300/80 hidden md:inline">ep {e.learnerEpisode} μ{e.learnerAvgReward != null ? Number(e.learnerAvgReward).toFixed(3) : '—'}</span>
                  )}
                  <span className="ml-auto flex items-center gap-1 shrink-0">
                    {e.dream && <span className="px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">DREAM</span>}
                    {e.axiomAdded && <span className="px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">AXIOM</span>}
                    {e.legoTick && <span className="px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">LEGO</span>}
                    {e.permitNextIteration === false && <span className="px-1 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">HALT</span>}
                  </span>
                </div>
              ))}
              {entries.length === 0 && (
                <div className="text-xs text-slate-500 font-mono py-4 text-center">
                  No generation records yet{ledgerStartsAt == null ? '' : ` — ledger begins at gen ${ledgerStartsAt}`}.
                </div>
              )}
            </div>
            {ledgerStartsAt != null && ledgerStartsAt > 1 && (
              <p className="text-[10px] font-mono text-slate-600 mt-2">
                Generations 1–{ledgerStartsAt - 1} predate the ledger and were never persisted, so their per-gen results cannot be reconstructed. The ledger records every generation from gen {ledgerStartsAt} forward.
              </p>
            )}
            {ledgerStartsAt == null && all.length === 0 && (
              <p className="text-[10px] font-mono text-slate-600 mt-2">
                The ledger turns on with the next 24/7 tick — every generation after that is recorded here in real time.
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function UpgradesPanel({ data }: { data: Record<string, any> }) {
  const reg = data.registry?.registry || [];
  const rows = reg
    .map((t: any) => ({ t, v: [...(t.versions || [])].reverse().find((x: any) => x.promoted) }))
    .filter((x: any) => x.v)
    .sort((a: any, b: any) => (b.v.created_at || 0) - (a.v.created_at || 0));

  return (
    <div className="space-y-2">
      {rows.length === 0 && <div className="text-xs text-slate-500 font-mono py-6 text-center">No promoted tools on record.</div>}
      {rows.map(({ t, v }: any) => (
        <div key={t.name} className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-mono font-bold text-white truncate">{t.name}</span>
              {domainPill(t.domain)}
            </div>
            <span className="text-[10px] font-mono text-slate-500 shrink-0">v{v.version} • {timeAgo(v.created_at)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] font-mono">
            <span className={v.passed_verifier ? 'text-emerald-400' : 'text-rose-400'}>
              {v.passed_verifier ? '✓ VERIFIED' : '✗ FAILED'} {Math.round((v.score ?? 0) * 100)}%
            </span>
            <span className={`${t.healthStatus === 'healthy' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.healthStatus}</span>
            {String(t.entrypoint || '').includes('.selfhosted/') && <span className="text-cyan-400">SELF-HOSTED</span>}
          </div>
          {v.verifier_notes && <p className="mt-1 text-[10px] font-mono text-slate-500 line-clamp-2">{v.verifier_notes}</p>}
        </div>
      ))}
    </div>
  );
}

function RepairPanel({ data, status }: { data: Record<string, any>; status: SystemStatus }) {
  const sr = data.status?.status?.selfRepair || status.selfRepair || {};
  const anomalies: any[] = data.repair?.anomalies || [];
  const sorted = [...anomalies].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 25);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Total Healed" value={sr.totalHealedCount ?? 0} accent="text-emerald-400" />
        <Stat label="Active Defects" value={sr.activeAnomaliesCount ?? 0} accent={(sr.activeAnomaliesCount ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400'} />
        <Stat label="Success Rate" value={`${Math.round((sr.repairSuccessRate ?? 0) * 100)}%`} accent="text-cyan-400" />
        <Stat label="MTTR" value={sr.meanTimeToRepairMs ? `${sr.meanTimeToRepairMs}ms` : '—'} />
      </div>

      <div>
        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">Repair & anomaly log</div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {sorted.map((a) => (
            <div key={a.id} className="bg-slate-950 border border-slate-800/70 rounded-lg p-2.5">
              <div className="flex items-center gap-2">
                <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded border', a.status === 'repaired' && 'text-emerald-400 bg-emerald-950/50 border-emerald-900', a.status === 'detected' && 'text-rose-400 bg-rose-950/50 border-rose-900', a.status !== 'repaired' && a.status !== 'detected' && 'text-amber-400 bg-amber-950/50 border-amber-900')}>
                  {String(a.status || 'unknown').toUpperCase()}
                </span>
                <span className="text-xs font-mono font-bold text-white truncate">{a.toolName}</span>
                {domainPill(a.domain)}
                <span className="ml-auto text-[10px] font-mono text-slate-500 shrink-0">{timeAgo(a.timestamp)}</span>
              </div>
              <div className="mt-1 text-[11px] font-mono text-slate-400">
                {a.errorType} — {a.rootCause || a.description}
              </div>
              {a.repairLatencyMs != null && (
                <div className="mt-0.5 text-[10px] font-mono text-slate-500">repair latency {a.repairLatencyMs}ms • gen {a.repairGen}</div>
              )}
            </div>
          ))}
          {sorted.length === 0 && <div className="text-xs text-slate-500 font-mono py-6 text-center">No repair activity recorded.</div>}
        </div>
      </div>
    </div>
  );
}

function ChainPanel({ data }: { data: Record<string, any> }) {
  const prov = data.provenance || {};
  const integrity = prov.integrity || {};
  const events: any[] = prov.events || [];
  const typeCount = new Map<string, number>();
  for (const e of events) typeCount.set(e.type, (typeCount.get(e.type) || 0) + 1);
  const topTypes = [...typeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const tail = [...events].slice(-8).reverse();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Chain Status" value={integrity.valid ? 'VALID' : 'BROKEN'} accent={integrity.valid ? 'text-emerald-400' : 'text-rose-400'} />
        <Stat label="Events" value={integrity.length ?? events.length} />
        <Stat label="Merkle Root" value={<span className="text-[10px] text-cyan-300">{(prov.merkleRoot || '—').slice(0, 16)}…</span>} />
        <Stat label="Last Hash" value={<span className="text-[10px] text-indigo-300">{(integrity.lastHash || '—').slice(0, 16)}…</span>} />
      </div>

      {!integrity.valid && integrity.brokenIndex != null && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono">
          Chain broke at event index {integrity.brokenIndex}. Tamper detected — see PROVENANCE tab.
        </div>
      )}

      <div>
        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">Event-type distribution</div>
        <div className="flex flex-wrap gap-1.5">
          {topTypes.map(([t, n]) => (
            <span key={t} className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300">
              {t}: <strong className="text-indigo-300">{n}</strong>
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">Ledger tail</div>
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          {tail.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="flex items-center gap-2 bg-slate-950 border border-slate-800/70 rounded-lg px-3 py-1.5 text-xs font-mono">
              <span className="text-slate-500 w-14 shrink-0 text-[10px]">{timeAgo(e.ts)}</span>
              <span className="text-indigo-300 text-[10px] truncate">{e.type}</span>
              <span className="ml-auto text-slate-600 text-[10px] truncate">{String(e.hash || '').slice(0, 12)}…</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenesPanel({ data, status }: { data: Record<string, any>; status: SystemStatus }) {
  const reg = data.registry?.registry || [];
  const cov = data.status?.status?.domainCoverage || status.domainCoverage || {};
  const sh = data.selfhosted || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DOMAIN_ORDER.map((d) => {
          const c = cov[d];
          return (
            <div key={d} className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-300">{d.replace('_', ' ')}</span>
              {c ? (
                <span className="text-[11px] font-mono">
                  <strong className="text-indigo-300">{c.activeGenes}</strong>{' '}
                  <span className="text-slate-500">@ {Math.round((c.passRate ?? 0) * 100)}%</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-600">no tools</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
        <Server className="w-3.5 h-3.5 text-emerald-400" />
        <span>{sh.count ?? 0} self-hosted runtime modules</span>
        {(sh.tools || []).slice(0, 5).map((t: any) => (
          <span key={t.name} className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-900 text-emerald-300 text-[10px]">{t.name}</span>
        ))}
      </div>

      <div>
        <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">Registry</div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {reg.map((t: any) => {
            const cur = [...(t.versions || [])].reverse().find((x: any) => x.promoted) || [...(t.versions || [])].reverse()[0];
            const selfHosted = String(t.entrypoint || '').includes('.selfhosted/');
            return (
              <div key={t.name} className="flex items-center gap-2 bg-slate-950 border border-slate-800/70 rounded-lg px-3 py-2">
                <span className="text-xs font-mono font-bold text-white truncate">{t.name}</span>
                {domainPill(t.domain)}
                <span className={`text-[10px] font-mono ${t.healthStatus === 'healthy' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.healthStatus}</span>
                {selfHosted && <span className="text-[9px] font-mono text-cyan-400 border border-cyan-900 bg-cyan-950/40 px-1 py-0.5 rounded">SELF-HOSTED</span>}
                <span className="ml-auto text-[10px] font-mono text-slate-500 shrink-0">
                  {cur ? `${Math.round((cur.score ?? 0) * 100)}%` : '—'}
                </span>
              </div>
            );
          })}
          {reg.length === 0 && <div className="text-xs text-slate-500 font-mono py-6 text-center">Registry is empty.</div>}
        </div>
      </div>
    </div>
  );
}

function SafetyPanel({ data, status }: { data: Record<string, any>; status: SystemStatus }) {
  const s = data.status?.status || status;
  const anomalies: any[] = data.repair?.anomalies || [];
  const active = anomalies.filter((a: any) => a.status === 'detected');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Pending Approval" value={s.pendingApprovalsCount ?? 0} accent="text-amber-400" />
        <Stat label="Active Defects" value={s.selfRepair?.activeAnomaliesCount ?? 0} accent={(s.selfRepair?.activeAnomaliesCount ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400'} />
        <Stat label="Gate Policy" value={(s.activePolicy || '—').replace(/_/g, ' ')} />
        <Stat label="Auto-Evolve" value={s.isAutoEvolving ? 'RUNNING' : 'PAUSED'} accent={s.isAutoEvolving ? 'text-emerald-400' : 'text-amber-400'} />
      </div>

      {active.length === 0 ? (
        <div className="text-xs text-slate-500 font-mono py-8 text-center">
          No open anomalies. {s.pendingApprovalsCount ? `${s.pendingApprovalsCount} gene(s) sit in the approval queue — approve them in the GENES tab.` : 'Nothing pending.'}
        </div>
      ) : (
        <div>
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-2">Open anomalies</div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {active.map((a) => (
              <div key={a.id} className="bg-rose-950/30 border border-rose-900/60 rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-3.5 h-3.5 ${a.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}`} />
                  <span className="text-xs font-mono font-bold text-white truncate">{a.toolName}</span>
                  {domainPill(a.domain)}
                  <span className="ml-auto text-[10px] font-mono text-slate-500">{timeAgo(a.timestamp)}</span>
                </div>
                <div className="mt-1 text-[11px] font-mono text-slate-400">{a.errorType} — {a.rootCause || a.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

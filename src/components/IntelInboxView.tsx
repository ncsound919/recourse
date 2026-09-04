'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Lightbulb,
  RefreshCw,
  ArrowUpDown,
  CheckCircle,
  XCircle,
  ExternalLink,
  Tag,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
  Search,
} from 'lucide-react';
import type { ToolDomain } from '../types';

type IntelSourceId = 'bbtech' | 'omniresearch' | 'strategy';
type ProposalStatus = 'new' | 'ranked' | 'adopted' | 'declined';

interface IntelSourceStatus {
  id: IntelSourceId;
  configured: boolean;
  online: boolean;
  baseUrl: string;
  note: string;
}

interface IntelProposal {
  id: string;
  source: IntelSourceId;
  title: string;
  description: string;
  domain: ToolDomain;
  url?: string;
  tags: string[];
  rationale: string;
  score: number;
  createdAt: number;
  status: ProposalStatus;
  adoptedSpecId?: string;
  adoptedAt?: number;
}

interface IntelSnapshot {
  proposals: IntelProposal[];
  top: IntelProposal | null;
  agendaSize: number;
}

interface IntelView {
  proposals: IntelProposal[];
  top: IntelProposal | null;
  agendaSize: number;
  sources: IntelSourceStatus[];
}

const DOMAIN_COLORS: Record<string, string> = {
  coding: 'text-cyan-300 border-cyan-800 bg-cyan-950/40',
  math: 'text-indigo-300 border-indigo-800 bg-indigo-950/40',
  biotech: 'text-emerald-300 border-emerald-800 bg-emerald-950/40',
  systemic: 'text-amber-300 border-amber-800 bg-amber-950/40',
  neuro_symbolic: 'text-purple-300 border-purple-800 bg-purple-950/40',
  cyber_defense: 'text-rose-300 border-rose-800 bg-rose-950/40',
  quantum_sim: 'text-sky-300 border-sky-800 bg-sky-950/40',
};

const SOURCE_ICONS: Record<IntelSourceId, string> = {
  bbtech: 'BT',
  strategy: 'SB',
  omniresearch: 'OR',
};

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

interface AdoptFormProps {
  proposal: IntelProposal;
  onAdopt: (data: { functionName: string; prompt: string; referenceSuite: string; domain: ToolDomain; title: string }) => Promise<void>;
  onCancel: () => void;
}

function AdoptForm({ proposal, onAdopt, onCancel }: AdoptFormProps) {
  const [fn, setFn] = useState(proposal.title.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase().slice(0, 32) || 'new_tool');
  const [title, setTitle] = useState(proposal.title);
  const [prompt, setPrompt] = useState(proposal.description.slice(0, 200));
  const [suite, setSuite] = useState('');
  const [domain, setDomain] = useState<ToolDomain>(proposal.domain);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const domains: ToolDomain[] = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (fn.length < 2) { setError('functionName must be a valid identifier'); return; }
    if (prompt.trim().length < 20) { setError('prompt must describe the behavior (>= 20 chars)'); return; }
    if (suite.trim().length < 10) { setError('referenceSuite is required — invented ideas need a real testable contract'); return; }
    setSubmitting(true);
    try {
      await onAdopt({ functionName: fn, prompt, referenceSuite: suite, domain, title });
    } catch (err: any) {
      setError(err.message || 'adopt failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-amber-700/50 rounded-xl bg-slate-950 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-amber-300 text-sm font-semibold">Adopt into Forge agenda</span>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 text-xs">cancel</button>
      </div>
      <div className="text-[11px] font-mono text-slate-400 bg-slate-900 rounded p-2 border border-slate-800">
        {proposal.rationale}
      </div>
      <form onSubmit={submit} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase">functionName *</label>
            <input value={fn} onChange={e => setFn(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:border-amber-600 focus:outline-none"
              placeholder="my_new_tool" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase">domain</label>
            <select value={domain} onChange={e => setDomain(e.target.value as ToolDomain)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:border-amber-600 focus:outline-none">
              {domains.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-mono text-slate-500 uppercase">title</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:border-amber-600 focus:outline-none"
            placeholder="Human-readable tool name" />
        </div>
        <div>
          <label className="text-[10px] font-mono text-slate-500 uppercase">prompt (behavior description, &gt;= 20 chars) *</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:border-amber-600 focus:outline-none resize-y"
            placeholder="What the tool does, concretely..." />
        </div>
        <div>
          <label className="text-[10px] font-mono text-slate-500 uppercase">referenceSuite (test suite, &gt;= 10 chars) *</label>
          <input value={suite} onChange={e => setSuite(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:border-amber-600 focus:outline-none"
            placeholder="describe how to test this tool concretely" />
          <p className="text-[9px] text-slate-600 mt-0.5">
            The adopt gate: invented ideas need a real, testable contract before they become buildable.
          </p>
        </div>
        {error && <div className="text-rose-400 text-xs font-mono bg-rose-950/30 border border-rose-800 rounded px-2 py-1">{error}</div>}
        <button type="submit" disabled={submitting}
          className="w-full px-3 py-1.5 rounded bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1">
          {submitting ? 'Adopting…' : <><Check className="w-3 h-3" /> Adopt into Forge Agenda</>}
        </button>
      </form>
    </div>
  );
}

export function IntelInboxView() {
  const [intel, setIntel] = useState<IntelView | null>(null);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [ranking, setRanking] = useState(false);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [adoptError, setAdoptError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'new' | 'ranked' | 'adopted'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/recourse/intel');
      const j = await r.json();
      if (j.intel) setIntel(j.intel);
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function pull() {
    setPulling(true);
    try {
      const r = await fetch('/api/recourse/intel/pull', { method: 'POST' });
      const j = await r.json();
      if (j.intel) setIntel(j.intel);
    } catch { /* best-effort */ }
    finally { setPulling(false); }
  }

  async function rank() {
    setRanking(true);
    try {
      const r = await fetch('/api/recourse/intel/rank', { method: 'POST' });
      const j = await r.json();
      if (j.intel) setIntel(j.intel);
    } catch { /* best-effort */ }
    finally { setRanking(false); }
  }

  async function adopt(proposal: IntelProposal, data: { functionName: string; prompt: string; referenceSuite: string; domain: ToolDomain; title: string }) {
    setAdopting(proposal.id);
    setAdoptError('');
    try {
      const r = await fetch('/api/recourse/intel/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id, ...data }),
      });
      const j = await r.json();
      if (!j.success) { setAdoptError(j.error || 'adopt failed'); return; }
      setAdopting(null);
      if (j.intel) setIntel(j.intel);
    } catch (err: any) {
      setAdoptError(err.message || 'network error');
    }
  }

  const proposals = intel?.proposals ?? [];
  const filtered = filter === 'all' ? proposals : proposals.filter(p => p.status === filter);
  const top = intel?.top;
  const sources = intel?.sources ?? [];

  const sourceOnline = sources.filter(s => s.online).map(s => s.id);
  const sourceNote = sources.length > 0
    ? sources.map(s => `${s.id}:${s.online ? 'ON' : 'OFF'}`).join(' | ')
    : 'no sources configured';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-amber-200">Intel Inbox</span>
          <span className="text-[11px] font-mono text-slate-500">{proposals.length} proposals · agenda {intel?.agendaSize ?? 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-mono text-slate-500">{sourceNote}</div>
          <button onClick={pull} disabled={pulling || loading}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-900/40 hover:bg-amber-800/40 disabled:opacity-40 text-amber-300 text-[11px] font-semibold border border-amber-800">
            <RefreshCw className={`w-3 h-3 ${pulling ? 'animate-spin' : ''}`} />
            {pulling ? 'Pulling…' : 'Pull intel'}
          </button>
          <button onClick={rank} disabled={ranking || proposals.length === 0 || loading}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-900/40 hover:bg-indigo-800/40 disabled:opacity-40 text-indigo-300 text-[11px] font-semibold border border-indigo-800">
            <ArrowUpDown className={`w-3 h-3 ${ranking ? 'animate-spin' : ''}`} />
            {ranking ? 'Ranking…' : 'Rank'}
          </button>
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded border border-slate-700 hover:border-slate-500 text-slate-400 disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top proposal banner */}
      {top && (
        <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 px-4 py-2.5 flex items-center gap-3">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-amber-200 truncate">{top.title}</div>
            <div className="text-[10px] font-mono text-slate-500">{top.source} · {top.domain} · score {top.score}</div>
          </div>
          <button onClick={() => setAdopting(top.id)}
            className="px-2 py-1 rounded bg-emerald-800 hover:bg-emerald-700 text-white text-[10px] font-bold shrink-0">
            Adopt
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1">
        {(['all', 'new', 'ranked', 'adopted'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold border ${
              filter === f
                ? 'bg-indigo-900/50 text-indigo-200 border-indigo-700'
                : 'bg-slate-900/50 text-slate-500 border-slate-800 hover:border-slate-600'
            }`}>
            {f.toUpperCase()} {f !== 'all' && `(${proposals.filter(p => p.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Proposal list */}
      {loading && proposals.length === 0 ? (
        <div className="flex items-center gap-2 text-slate-500 text-xs py-4 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading intel…
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-slate-800 rounded-lg p-6 text-center">
          <Search className="w-6 h-6 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm font-semibold">
            {proposals.length === 0 ? 'Intel inbox is empty' : `No ${filter} proposals`}
          </p>
          <p className="text-slate-500 text-xs mt-1">
            {proposals.length === 0
              ? sourceOnline.length === 0
                ? 'All sources are offline. Pull will have no effect until bbtech or strategy comes online.'
                : 'Pull intel to fetch new proposals.'
              : `All proposals are ${filter}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const isExpanded = expanded.has(p.id);
            const isAdoptingRow = adopting === p.id;
            return (
              <div key={p.id} className="border border-slate-800 rounded-lg bg-slate-950/60 overflow-hidden">
                <div className="flex items-start gap-2 px-3 py-2.5">
                  {/* Source badge */}
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold border font-mono mt-0.5 ${
                    p.source === 'bbtech' ? 'text-cyan-300 border-cyan-800 bg-cyan-950/60' :
                    p.source === 'strategy' ? 'text-indigo-300 border-indigo-800 bg-indigo-950/60' :
                    'text-slate-400 border-slate-700 bg-slate-900/60'
                  }`}>
                    {SOURCE_ICONS[p.source] ?? p.source}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-200 leading-snug">{p.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${DOMAIN_COLORS[p.domain] ?? 'text-slate-400 border-slate-700'}`}>
                            {p.domain}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">{timeAgo(p.createdAt)}</span>
                          <span className="text-[9px] font-mono text-slate-500">score {p.score}</span>
                          {p.status === 'adopted' && (
                            <span className="text-[9px] font-mono text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded bg-emerald-950/40">
                              <CheckCircle className="w-2.5 h-2.5 inline mr-0.5" />
                              Adopted
                            </span>
                          )}
                          {p.tags.slice(0, 3).map(t => (
                            <span key={t} className="text-[9px] font-mono text-slate-600 border border-slate-800 px-1 py-0.5 rounded">
                              <Tag className="w-2 h-2 inline mr-0.5" />{t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {p.url && (
                          <a href={p.url} target="_blank" rel="noopener noreferrer"
                            className="p-1 text-slate-500 hover:text-slate-300">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {p.status !== 'adopted' && (
                          <button onClick={() => setAdopting(p.id)}
                            className="px-2 py-1 rounded bg-emerald-900/40 hover:bg-emerald-800/40 text-emerald-300 text-[10px] font-bold border border-emerald-800 disabled:opacity-40">
                            Adopt
                          </button>
                        )}
                        <button onClick={() => {
                          const next = new Set(expanded);
                          if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                          setExpanded(next);
                        }} className="p-1 text-slate-500 hover:text-slate-300">
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-800 px-3 py-2.5 space-y-2 bg-slate-950/40">
                    <p className="text-[11px] font-mono text-slate-400 leading-relaxed">{p.description}</p>
                    <div className="text-[10px] font-mono text-slate-600 italic">{p.rationale}</div>
                  </div>
                )}

                {/* Adopt form inline */}
                {isAdoptingRow && (
                  <div className="border-t border-slate-800 px-3 py-3 bg-slate-950/80">
                    {adoptError && (
                      <div className="mb-2 text-rose-400 text-xs font-mono bg-rose-950/30 border border-rose-800 rounded px-2 py-1">
                        <AlertCircle className="w-3 h-3 inline mr-1" />{adoptError}
                      </div>
                    )}
                    <AdoptForm
                      proposal={p}
                      onAdopt={async (data) => { await adopt(p, data); }}
                      onCancel={() => { setAdopting(null); setAdoptError(''); }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

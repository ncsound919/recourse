import React, { useState, useEffect, useCallback } from 'react';
import {
  Library,
  Search,
  RefreshCw,
  FileText,
  TerminalSquare,
  ScrollText,
  Layers,
  BookOpen,
  ArrowRight,
} from 'lucide-react';

interface SkillDefUI {
  id: string;
  name: string;
  description: string;
  rootId: string;
  dir: string;
  words: number;
  topics: string[];
  hasScripts: boolean;
  files: string[];
}

interface SkillUI {
  roots: Array<{ id: string; root: string }>;
  lastScanAt: number | null;
  skills: SkillDefUI[];
  summary: { total: number; byRoot: Record<string, number>; withScripts: number } | null;
  found: number;
  prunedTranslations: number;
  errors: Array<{ root: string; error: string }>;
}

interface SkillsViewProps {
  onNotify?: (msg: string) => void;
}

const TOPIC_COLORS: Record<string, string> = {
  marketing: 'text-orange-300 bg-orange-950/60 border-orange-800',
  engineering: 'text-cyan-300 bg-cyan-950/60 border-cyan-800',
  ml_ai: 'text-purple-300 bg-purple-950/60 border-purple-800',
  research: 'text-teal-300 bg-teal-950/60 border-teal-800',
  security: 'text-red-300 bg-red-950/60 border-red-800',
  domain_business: 'text-emerald-300 bg-emerald-950/60 border-emerald-800',
};

const LIB_COLORS: Record<string, string> = {
  'fleet-skills': 'text-cyan-300 bg-cyan-950/60 border-cyan-800',
  ecc: 'text-purple-300 bg-purple-950/60 border-purple-800',
};

export const SkillsView: React.FC<SkillsViewProps> = ({ onNotify }) => {
  const [lib, setLib] = useState<SkillUI | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filterRoot, setFilterRoot] = useState('all');
  const [scanning, setScanning] = useState(false);
  const [openSkill, setOpenSkill] = useState<{ skill: SkillDefUI; text: string; truncated: boolean } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/recourse/skills/status').then(r => r.json()).catch(() => null);
      if (res?.skills) {
        setLib(res.skills);
        setDigest(res.digest ?? null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
    const int = setInterval(fetchStatus, 8000);
    return () => clearInterval(int);
  }, [fetchStatus]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/recourse/skills/rescan', { method: 'POST' }).then(r => r.json());
      if (res?.success) {
        setLib(res.skills);
        setDigest(res.digest ?? null);
        if (onNotify) onNotify(`Skill scan: ${res.skills.summary?.total ?? 0} skills indexed`);
      } else if (onNotify) onNotify(`Skill scan failed: ${res.error}`);
    } catch (e: any) {
      if (onNotify) onNotify(`Skill scan error: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  const openSkillText = async (s: SkillDefUI) => {
    setOpenSkill(null);
    try {
      const params = new URLSearchParams({ rootId: s.rootId, dir: s.dir });
      const res = await fetch(`/api/recourse/skills/skill?${params.toString()}`).then(r => r.json());
      if (res?.success) setOpenSkill({ skill: s, text: res.text, truncated: res.truncated });
      else if (onNotify) onNotify(`Could not read skill: ${res.error}`);
    } catch {}
  };

  const summary = lib?.summary;
  const roots = lib?.roots ?? [];
  const filtered = (lib?.skills ?? []).filter(s =>
    (filterRoot === 'all' || s.rootId === filterRoot) &&
    (!q || s.name.toLowerCase().includes(q.toLowerCase()) || s.description.toLowerCase().includes(q.toLowerCase()) || s.topics.some(t => t.includes(q.toLowerCase())))
  ).slice(0, 120);

  return (
    <div className="p-5 space-y-4 text-slate-200">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Library className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-bold tracking-wide">SKILL LIBRARY</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-[10px] rounded border ${lib?.lastScanAt ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300' : 'border-amber-800 bg-amber-950/40 text-amber-300'}`}>
            {lib?.lastScanAt ? 'CATALOGUED' : 'NOT SCANNED'}
          </span>
          <button
            onClick={runScan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning…' : 'Rescan Libraries'}
          </button>
        </div>
      </div>

      {lib && lib.errors.length > 0 && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-xs text-red-200">
          {lib.errors.map((e, i) => <div key={i} className="flex items-center gap-2"><span className="font-semibold">{e.root}:</span> {e.error}</div>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-purple-400" /> LIBRARIES
            </h3>
            <div className="space-y-2">
              {roots.map(r => (
                <div key={r.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{r.id}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[200px]">{r.root}</div>
                  </div>
                  <span className="text-xs text-purple-300">{summary?.byRoot[r.id] ?? 0}</span>
                </div>
              ))}
              {roots.length === 0 && <div className="text-xs text-slate-500">no roots configured</div>}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div>Indexed: <span className="text-slate-100 font-semibold">{summary?.total ?? 0}</span> skills</div>
              <div>Script-bearing: <span className="text-slate-100 font-semibold">{summary?.withScripts ?? 0}</span></div>
              {lib && lib.found > 0 && <div>Found on disk: {lib.found} · translation mirrors pruned: {lib.prunedTranslations}</div>}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 lg:col-span-2">
          <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
            <ScrollText className="w-4 h-4 text-purple-400" /> LIBRARY DIGEST
          </h3>
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300 max-h-[240px] overflow-y-auto font-mono">
            {digest ?? 'Trigger a scan to build the skill library digest.'}
          </pre>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-purple-400" /> SKILL CATALOG ({filtered.length} shown of {lib?.skills.length ?? 0})
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="search skills…" className="pl-7 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 w-44" />
            </div>
            <select value={filterRoot} onChange={e => setFilterRoot(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200">
              <option value="all">All libraries</option>
              {roots.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
          {filtered.map(s => (
            <div key={s.id} className="rounded border border-slate-800 bg-slate-950/40 p-2 hover:border-purple-800 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] shrink-0 ${LIB_COLORS[s.rootId] ?? 'text-slate-400 bg-slate-900 border-slate-700'}`}>{s.rootId}</span>
                  <span className="text-xs font-semibold text-slate-100 truncate">{s.name}</span>
                  {s.hasScripts && <TerminalSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] text-slate-500">{s.words} words</span>
                  <button onClick={() => openSkillText(s)} className="inline-flex items-center gap-0.5 text-[10px] text-purple-400 hover:text-purple-300">
                    Read <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 line-clamp-2 mt-1">{s.description || s.dir}</div>
              {s.topics.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.topics.map(t => (
                    <span key={t} className={`px-1.5 py-0.5 rounded border text-[9px] ${TOPIC_COLORS[t] ?? 'text-slate-400 bg-slate-900 border-slate-700'}`}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div className="text-xs text-slate-500 py-4 text-center">No skills match. Run a scan first.</div>}
        </div>
      </div>

      {openSkill && (
        <div className="rounded-lg border border-purple-800 bg-slate-950/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> {openSkill.skill.rootId}/{openSkill.skill.dir}/SKILL.md
            </h3>
            <div className="flex items-center gap-3">
              {openSkill.skill.files.length > 0 && (
                <span className="text-[10px] text-slate-500">{openSkill.skill.files.length} supporting files</span>
              )}
              <button onClick={() => setOpenSkill(null)} className="text-xs text-slate-400 hover:text-white">✕</button>
            </div>
          </div>
          {openSkill.skill.files.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {openSkill.skill.files.slice(0, 20).map(f => (
                <span key={f} className="px-1.5 py-0.5 rounded border border-slate-800 bg-slate-900 text-[9px] text-slate-400 font-mono">{f}</span>
              ))}
            </div>
          )}
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300 max-h-[420px] overflow-y-auto font-mono">
            {openSkill.text}
          </pre>
          {openSkill.truncated && <div className="mt-2 text-[10px] text-amber-400">Truncated to first 100KB.</div>}
        </div>
      )}
    </div>
  );
};

export default SkillsView;

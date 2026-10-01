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
  marketing: 'text-warn-300 bg-warn-950/60 border-warn-800',
  engineering: 'text-accent-300 bg-accent-950/60 border-accent-800',
  ml_ai: 'text-accent-300 bg-accent-950/60 border-accent-800',
  research: 'text-accent-300 bg-accent-950/60 border-accent-800',
  security: 'text-bad-300 bg-bad-950/60 border-bad-800',
  domain_business: 'text-ok-300 bg-ok-950/60 border-ok-800',
};

const LIB_COLORS: Record<string, string> = {
  'fleet-skills': 'text-accent-300 bg-accent-950/60 border-accent-800',
  ecc: 'text-accent-300 bg-accent-950/60 border-accent-800',
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
    <div className="p-5 space-y-4 text-ink-200">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Library className="w-5 h-5 text-accent-400" />
          <h2 className="text-lg font-semibold ">Skill library</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-[10px] rounded border ${lib?.lastScanAt ? 'border-ok-800 bg-ok-950/40 text-ok-300' : 'border-warn-800 bg-warn-950/40 text-warn-300'}`}>
            {lib?.lastScanAt ? 'Catalogued' : 'Not scanned'}
          </span>
          <button
            onClick={runScan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning…' : 'Rescan Libraries'}
          </button>
        </div>
      </div>

      {lib && lib.errors.length > 0 && (
        <div className="rounded-lg border border-bad-900 bg-bad-950/30 p-3 text-xs text-bad-200">
          {lib.errors.map((e, i) => <div key={i} className="flex items-center gap-2"><span className="font-semibold">{e.root}:</span> {e.error}</div>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-4">
            <h3 className="text-xs font-semibold text-ink-400 mb-3 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-accent-400" /> LIBRARIES
            </h3>
            <div className="space-y-2">
              {roots.map(r => (
                <div key={r.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-ink-100">{r.id}</div>
                    <div className="text-[10px] text-ink-500 truncate max-w-[200px]">{r.root}</div>
                  </div>
                  <span className="text-xs text-accent-300">{summary?.byRoot[r.id] ?? 0}</span>
                </div>
              ))}
              {roots.length === 0 && <div className="text-xs text-ink-500">no roots configured</div>}
            </div>
            <div className="mt-3 pt-3 border-t border-ink-800 text-[11px] text-ink-400 space-y-1">
              <div>Indexed: <span className="text-ink-100 font-semibold">{summary?.total ?? 0}</span> skills</div>
              <div>Script-bearing: <span className="text-ink-100 font-semibold">{summary?.withScripts ?? 0}</span></div>
              {lib && lib.found > 0 && <div>Found on disk: {lib.found} · translation mirrors pruned: {lib.prunedTranslations}</div>}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-4 lg:col-span-2">
          <h3 className="text-xs font-semibold text-ink-400 mb-3 flex items-center gap-1.5">
            <ScrollText className="w-4 h-4 text-accent-400" /> LIBRARY DIGEST
          </h3>
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-ink-300 max-h-[240px] overflow-y-auto font-mono">
            {digest ?? 'Trigger a scan to build the skill library digest.'}
          </pre>
        </div>
      </div>

      <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-xs font-semibold text-ink-400 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-accent-400" /> SKILL CATALOG ({filtered.length} shown of {lib?.skills.length ?? 0})
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-500" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="search skills…" className="pl-7 bg-ink-800 border border-ink-700 rounded px-2 py-1 text-ink-200 w-44" />
            </div>
            <select value={filterRoot} onChange={e => setFilterRoot(e.target.value)} className="bg-ink-800 border border-ink-700 rounded px-2 py-1 text-ink-200">
              <option value="all">All libraries</option>
              {roots.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
          {filtered.map(s => (
            <div key={s.id} className="rounded border border-ink-800 bg-ink-950/40 p-2 hover:border-accent-800 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] shrink-0 ${LIB_COLORS[s.rootId] ?? 'text-ink-400 bg-ink-900 border-ink-700'}`}>{s.rootId}</span>
                  <span className="text-xs font-semibold text-ink-100 truncate">{s.name}</span>
                  {s.hasScripts && <TerminalSquare className="w-3.5 h-3.5 text-ok-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] text-ink-500">{s.words} words</span>
                  <button onClick={() => openSkillText(s)} className="inline-flex items-center gap-0.5 text-[10px] text-accent-400 hover:text-accent-300">
                    Read <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-ink-400 line-clamp-2 mt-1">{s.description || s.dir}</div>
              {s.topics.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.topics.map(t => (
                    <span key={t} className={`px-1.5 py-0.5 rounded border text-[9px] ${TOPIC_COLORS[t] ?? 'text-ink-400 bg-ink-900 border-ink-700'}`}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div className="text-xs text-ink-500 py-4 text-center">No skills match. Run a scan first.</div>}
        </div>
      </div>

      {openSkill && (
        <div className="rounded-lg border border-accent-800 bg-ink-950/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-accent-300 flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> {openSkill.skill.rootId}/{openSkill.skill.dir}/SKILL.md
            </h3>
            <div className="flex items-center gap-3">
              {openSkill.skill.files.length > 0 && (
                <span className="text-[10px] text-ink-500">{openSkill.skill.files.length} supporting files</span>
              )}
              <button onClick={() => setOpenSkill(null)} className="text-xs text-ink-400 hover:text-white">✕</button>
            </div>
          </div>
          {openSkill.skill.files.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {openSkill.skill.files.slice(0, 20).map(f => (
                <span key={f} className="px-1.5 py-0.5 rounded border border-ink-800 bg-ink-900 text-[9px] text-ink-400">{f}</span>
              ))}
            </div>
          )}
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-ink-300 max-h-[420px] overflow-y-auto font-mono">
            {openSkill.text}
          </pre>
          {openSkill.truncated && <div className="mt-2 text-[10px] text-warn-400">Truncated to first 100KB.</div>}
        </div>
      )}
    </div>
  );
};

export default SkillsView;

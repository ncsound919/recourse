import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderSearch,
  RefreshCw,
  BookOpen,
  ScrollText,
  Database,
  FileText,
  Map as MapIcon,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

interface CorpusArtifactUI {
  project: string;
  rel: string;
  name: string;
  kind: string;
  words: number;
  topics: string[];
  excerpt: string;
}

interface CorpusUI {
  roots: Array<{ project: string; root: string }>;
  lastScanAt: number | null;
  artifacts: CorpusArtifactUI[];
  summary: {
    total: number;
    byProject: Record<string, number>;
    byKind: Record<string, number>;
    topics: Record<string, number>;
  } | null;
  errors: Array<{ root: string; error: string }>;
  dispatchedSignals: number;
}

interface CorpusViewProps {
  onNotify?: (msg: string) => void;
}

const KIND_COLORS: Record<string, string> = {
  whitepaper: 'text-purple-300 bg-purple-950/60 border-purple-800',
  paper: 'text-fuchsia-300 bg-fuchsia-950/60 border-fuchsia-800',
  research: 'text-cyan-300 bg-cyan-950/60 border-cyan-800',
  knowledge: 'text-teal-300 bg-teal-950/60 border-teal-800',
  spec: 'text-blue-300 bg-blue-950/60 border-blue-800',
  data: 'text-emerald-300 bg-emerald-950/60 border-emerald-800',
  readme: 'text-slate-400 bg-slate-900 border-slate-700',
  config: 'text-zinc-400 bg-zinc-900 border-zinc-700',
  other: 'text-slate-500 bg-slate-900 border-slate-800',
};

export const CorpusView: React.FC<CorpusViewProps> = ({ onNotify }) => {
  const [corpus, setCorpus] = useState<CorpusUI | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [filterProject, setFilterProject] = useState('all');
  const [filterKind, setFilterKind] = useState('all');
  const [q, setQ] = useState('');
  const [openArtifact, setOpenArtifact] = useState<{ project: string; rel: string; text: string; truncated: boolean } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/recourse/corpus/status').then(r => r.json()).catch(() => null);
      if (res?.corpus) {
        setCorpus(res.corpus);
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
      const res = await fetch('/api/recourse/corpus/scan', { method: 'POST' }).then(r => r.json());
      if (res?.success) {
        setCorpus(res);
        if (onNotify) onNotify(`Corpus scan: ${res.artifacts?.length ?? 0} artifacts indexed, ${res.added ?? 0} new signals dispatched`);
      } else if (onNotify) onNotify(`Corpus scan failed: ${res.error}`);
      fetchStatus();
    } catch (e: any) {
      if (onNotify) onNotify(`Corpus scan error: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  const openArtifactText = async (project: string, rel: string) => {
    setOpenArtifact(null);
    try {
      const params = new URLSearchParams({ project, rel });
      const res = await fetch(`/api/recourse/corpus/artifact?${params.toString()}`).then(r => r.json());
      if (res?.success) setOpenArtifact({ project, rel, text: res.text, truncated: res.truncated });
      else if (onNotify) onNotify(`Could not read artifact: ${res.error}`);
    } catch {}
  };

  const summary = corpus?.summary;
  const kindNames = summary ? Object.entries(summary.byKind).sort((a, b) => (b[1] as number) - (a[1] as number)) : [];
  const projectNames = corpus?.roots.map(r => r.project) ?? [];
  const filtered = (corpus?.artifacts ?? []).filter(a =>
    (filterProject === 'all' || a.project === filterProject) &&
    (filterKind === 'all' || a.kind === filterKind) &&
    (!q || a.name.toLowerCase().includes(q.toLowerCase()) || a.topics.some(t => t.includes(q.toLowerCase())))
  ).slice(0, 60);

  return (
    <div className="p-5 space-y-4 text-slate-200">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FolderSearch className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold tracking-wide">ECOSYSTEM RESEARCH CORPUS</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 text-[10px] rounded border ${corpus?.lastScanAt ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300' : 'border-amber-800 bg-amber-950/40 text-amber-300'}`}>
            {corpus?.lastScanAt ? 'SCANNED' : 'NOT SCANNED'}
          </span>
          <span className="px-2 py-1 text-[10px] rounded border border-cyan-800 bg-cyan-950/40 text-cyan-300">
            {corpus?.dispatchedSignals ?? 0} signals dispatched
          </span>
          <button
            onClick={runScan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning…' : 'Scan Corpus'}
          </button>
        </div>
      </div>

      {corpus && corpus.errors && corpus.errors.length > 0 && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-xs text-red-200">
          {corpus.errors.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="font-semibold">{e.root}:</span> {e.error}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Roots + summary */}
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-cyan-400" /> CONFIGURED ROOTS
            </h3>
            <div className="space-y-2">
              {projectNames.map(p => {
                const root = corpus?.roots.find(r => r.project === p);
                return (
                  <div key={p} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-100 capitalize">{p}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[220px]">{root?.root}</div>
                    </div>
                    <span className="text-xs text-cyan-300">{summary?.byProject[p] ?? 0}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-cyan-400" /> DOCUMENT KINDS
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {kindNames.map(([k, n]) => (
                <span key={k} className={`px-2 py-1 rounded border text-[10px] capitalize ${KIND_COLORS[k] ?? KIND_COLORS.other}`}>
                  {k} · {n}
                </span>
              ))}
              {kindNames.length === 0 && <span className="text-xs text-slate-500">no artifacts yet</span>}
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
              <MapIcon className="w-4 h-4 text-cyan-400" /> TOP TOPICS
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {summary && Object.entries(summary.topics).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 8).map(([t, n]) => (
                <span key={t} className="px-2 py-1 rounded border border-slate-700 bg-slate-800 text-[10px] text-slate-300">{t} ({n})</span>
              ))}
              {(!summary || Object.keys(summary.topics).length === 0) && <span className="text-xs text-slate-500">scan to detect topics</span>}
            </div>
          </div>
        </div>

        {/* Digest */}
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 lg:col-span-2">
          <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1.5">
            <ScrollText className="w-4 h-4 text-cyan-400" /> FLEET DIGEST
          </h3>
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300 max-h-[320px] overflow-y-auto font-mono">
            {digest ?? 'Trigger a scan to build the corpus digest.'}
          </pre>
        </div>
      </div>

      {/* Artifacts */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-cyan-400" /> INDEXED ARTIFACTS ({filtered.length} shown)
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200">
              <option value="all">All projects</option>
              {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterKind} onChange={e => setFilterKind(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200">
              <option value="all">All kinds</option>
              {kindNames.map(([k]) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="filter…"
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 w-32"
            />
          </div>
        </div>
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
          {filtered.map(a => (
            <div key={`${a.project}::${a.rel}`} className="rounded border border-slate-800 bg-slate-950/40 p-2 hover:border-cyan-800 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] capitalize shrink-0 ${KIND_COLORS[a.kind] ?? KIND_COLORS.other}`}>{a.kind}</span>
                  <span className="text-xs font-semibold text-slate-200 truncate">{a.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] text-slate-500 capitalize">{a.project}</span>
                  <span className="text-[9px] text-slate-500">{a.words} words</span>
                  {a.topics.length > 0 && (
                    <span className="text-[9px] text-teal-300">{a.topics.join(',')}</span>
                  )}
                  <button
                    onClick={() => openArtifactText(a.project, a.rel)}
                    className="inline-flex items-center gap-0.5 text-[10px] text-cyan-400 hover:text-cyan-300"
                  >
                    Read <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 truncate mt-1">{a.excerpt}</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-xs text-slate-500 py-4 text-center">
              No artifacts match. Run a scan first.
            </div>
          )}
        </div>
      </div>

      {/* Artifact reader */}
      {openArtifact && (
        <div className="rounded-lg border border-cyan-800 bg-slate-950/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> {openArtifact.project}/{openArtifact.rel}
            </h3>
            <button onClick={() => setOpenArtifact(null)} className="text-xs text-slate-400 hover:text-white">✕</button>
          </div>
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300 max-h-[400px] overflow-y-auto font-mono">
            {openArtifact.text}
          </pre>
          {openArtifact.truncated && (
            <div className="mt-2 text-[10px] text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Truncated to first 60KB.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CorpusView;

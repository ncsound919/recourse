import React, { useState } from 'react';
import { Search, Star, FileCode2, ExternalLink, ShieldAlert, ShieldCheck, AlertTriangle, GitBranch } from 'lucide-react';
import clsx from 'clsx';

interface Repo {
  id: string;
  fullName: string;
  author: string;
  stars: number;
  description: string;
  license?: string;
  htmlUrl: string;
  defaultBranch?: string;
  language?: string;
}

interface ImportView {
  repo: string;
  path: string;
  sha: string;
  defaultBranch: string;
  license?: string;
  htmlUrl: string;
  content: string;
  language: string;
  analysis: {
    parseOk: boolean;
    parseErr: string;
    security: { isSecure: boolean; vulnerabilities: { type: string; severity: string; message: string }[] };
    lint: { available: boolean; clean: boolean; errors: number; warnings: number; details: string[] };
  };
  toolName: string;
}

export const GitHubResearchView: React.FC<{ onIngestBlueprint?: (id: string) => Promise<any> }> = () => {
  const [query, setQuery] = useState('');
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [result, setResult] = useState<ImportView | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/recourse/github/catalog?q=${encodeURIComponent(query.trim())}`).then((r) => r.json());
      if (!res.success) throw new Error(res.error || 'GitHub search failed');
      setRepos(res.repos || []);
      setNote(res.note || null);
    } catch (err: any) {
      setError(err.message || 'GitHub search failed');
    } finally {
      setLoading(false);
    }
  };

  const doImport = async (repo: string) => {
    setImporting(repo);
    setError(null);
    try {
      const res = await fetch('/api/recourse/github/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error || 'Import failed');
      setResult(res.result);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(null);
    }
  };

  const codeLines = result ? result.content.split('\n') : [];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white font-mono">REAL GITHUB RESEARCH</h2>
        <p className="text-xs text-slate-400 mt-1">
          Live results from the GitHub REST API. Importing a repository fetches a real source file and registers it as an
          <span className="text-amber-400"> UNVERIFIED pending candidate</span> — it is never auto-promoted because imported code has
          no regression suite and its correctness is unknown until you review it.
        </p>
        <div className="flex gap-2 mt-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search GitHub repositories (e.g. merkle tree, lru cache, cosine distance)..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={search}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-mono font-bold rounded-xl"
          >
            <Search className="w-4 h-4" /> {loading ? 'SEARCHING...' : 'SEARCH LIVE'}
          </button>
        </div>
        {note && <p className="text-[11px] text-slate-500 mt-2 font-mono">{note}</p>}
        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-mono flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}
      </div>

      {repos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {repos.map((r) => (
            <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <a href={r.htmlUrl} target="_blank" rel="noreferrer" className="text-cyan-300 font-mono text-sm font-bold hover:underline truncate block flex items-center gap-1">
                    {r.fullName} <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono mt-1">
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400" />{r.stars.toLocaleString()}</span>
                    {r.language && <span>{r.language}</span>}
                    {r.license && <span>{r.license}</span>}
                    {r.defaultBranch && <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{r.defaultBranch}</span>}
                  </div>
                </div>
                <button
                  onClick={() => doImport(r.fullName)}
                  disabled={importing !== null}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700 text-emerald-300 disabled:opacity-50"
                >
                  {importing === r.fullName ? 'FETCHING...' : 'IMPORT (REAL)'}
                </button>
              </div>
              <p className="text-xs text-slate-400 line-clamp-3">{r.description || 'No description.'}</p>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-indigo-400" />
              Imported: {result.repo}/{result.path}
            </h3>
            <a href={result.htmlUrl} target="_blank" rel="noreferrer" className="text-cyan-300 text-xs font-mono hover:underline flex items-center gap-1">
              view on github <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex flex-wrap gap-2 font-mono text-[11px]">
            <span className={`px-2 py-1 rounded border ${result.analysis.parseOk ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-rose-950 text-rose-300 border-rose-800'}`}>
              PARSE: {result.analysis.parseOk ? 'OK' : 'FAILED'}
            </span>
            <span className={`px-2 py-1 rounded border ${result.analysis.security.isSecure ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-rose-950 text-rose-300 border-rose-800'}`}>
              {result.analysis.security.isSecure ? <ShieldCheck className="inline w-3 h-3 mr-1" /> : <ShieldAlert className="inline w-3 h-3 mr-1" />}
              SECURITY: {result.analysis.security.isSecure ? 'CLEAN' : result.analysis.security.vulnerabilities.map((v) => v.type).join(', ')}
            </span>
            <span className={clsx('px-2 py-1 rounded border', !result.analysis.lint.available && 'bg-slate-900 text-slate-400 border-slate-700', result.analysis.lint.available && result.analysis.lint.clean && 'bg-emerald-950 text-emerald-300 border-emerald-800', result.analysis.lint.available && !result.analysis.lint.clean && 'bg-rose-950 text-rose-300 border-rose-800')}>
              LINT: {result.analysis.lint.available ? (result.analysis.lint.clean ? 'CLEAN' : `${result.analysis.lint.errors} ERROR(S)`) : 'NOT RUN'}
            </span>
            <span className="px-2 py-1 rounded border bg-slate-950 text-slate-400 border-slate-700">
              sha {result.sha.slice(0, 12)} | {result.license || 'no license'} | {result.language.toUpperCase()}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900 text-amber-200 text-xs font-mono">
            Registered as <span className="text-white">{result.toolName}</span> in PENDING (unverified). It will NOT run or pass until you
            add a regression suite and approve it in the Registry.
          </div>

          <pre className="max-h-72 overflow-auto bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-300 font-mono">
            {codeLines.slice(0, 120).join('\n')}
            {codeLines.length > 120 ? '\n... (truncated)' : ''}
          </pre>
        </div>
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { Archive, BookOpen, Clock, Fingerprint, Gauge, Newspaper, PenLine, ShieldCheck, Sparkles } from 'lucide-react';
import { recourseJson } from '../lib/recourseClient';

interface ReporterCounts {
  registryTotal: number;
  provenanceTotal: number;
  jobsEnabled: number;
  jobsTotal: number;
  connectionsUp: number;
  connectionsTotal: number;
  promotions: number;
  repairs: number;
  mathSolved: number;
  mathTotal: number;
  biotechPassed: number;
  biotechTotal: number;
  learnerEpisodes: number;
  crystallizedGenes: number;
}

interface ReporterVoiceInfo {
  id: string;
  name: string;
  tone: string;
  verbosity: string;
}

interface ReporterFormatInfo {
  id: string;
  name: string;
  description: string;
}

interface ReporterDimension {
  id: string;
  title: string;
  logic: string;
  metric: string;
}

interface ReporterArticle {
  fingerprint: string;
  id: string;
  title: string;
  headline: string;
  dek: string;
  voice: { id: string; name: string; tone: string; verbosity: string; identity: { name: string; role: string } };
  format: string;
  metaphor: {
    condition: string;
    archetype: string;
    source: string;
    businessLogic: string;
    application: string;
    lesson: string;
    alternatives: string[];
    dimensions: ReporterDimension[];
  };
  codex: {
    scores: Record<string, number>;
    gates: Record<string, boolean>;
    verdict: string;
    summary: string;
    sensitivity: Array<{ metric: string; driver: string; delta: number }>;
    meanings: Record<string, string>;
  };
  monteCarlo: {
    codex: {
      trials: number;
      goProbability: number;
      agreement: number;
      baseVerdict: string;
      binding: string;
      metrics: Record<string, { mean: number; p10: number; p50: number; p90: number; passProbability: number }>;
      leverImpact: Array<{ driver: string; goDelta: number }>;
    };
    protocol: { trials: number; baseCondition: string; stability: number };
  };
  prose: {
    score: number;
    band: string;
    findings: Array<{ id: string; label: string; count: number; severity: string }>;
    metrics: { words: number; sentences: number; sentenceCv: number };
  };
  proseChanges: string[];
  markdown: string;
  counts: ReporterCounts;
  generatedAt: number;
  wordCount: number;
  narration?: { prose: string; model?: string; nonCanonical: true } | null;
}

interface ReporterIndexEntry {
  fingerprint: string;
  id: string;
  title: string;
  headline: string;
  generatedAt: number;
  wordCount: number;
  hasNarration: boolean;
}

interface ReporterStatus {
  articleCount: number;
  latestFingerprint: string | null;
  latestGeneratedAt: number | null;
  cadenceMs: number;
  voices: ReporterVoiceInfo[];
  formats: ReporterFormatInfo[];
  soulLoaded: boolean;
}

function fmtTime(ms: number | null): string {
  if (!ms) return 'never';
  return new Date(ms).toLocaleString();
}

export const SelfReporterView: React.FC = () => {
  const [article, setArticle] = useState<ReporterArticle | null>(null);
  const [index, setIndex] = useState<ReporterIndexEntry[]>([]);
  const [status, setStatus] = useState<ReporterStatus | null>(null);
  const [voice, setVoice] = useState('field');
  const [format, setFormat] = useState('dispatch');
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async (fingerprint?: string) => {
    setLoading(true);
    try {
      const [statusRes, listRes, articleRes] = await Promise.all([
        fetch('/api/recourse/reporter/status').then((r) => r.json()),
        fetch('/api/recourse/reporter/articles?limit=20').then((r) => r.json()),
        fetch(fingerprint ? `/api/recourse/reporter/article/${fingerprint}` : '/api/recourse/reporter/latest').then((r) => r.json()),
      ]);
      if (statusRes?.success) setStatus(statusRes as ReporterStatus);
      if (listRes?.success) setIndex((listRes.articles as ReporterIndexEntry[]) ?? []);
      setArticle((articleRes?.article as ReporterArticle) ?? null);
      setPreviewing(false);
    } catch {
      setMessage('Could not reach the reporter API.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const preview = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`/api/recourse/reporter/preview?voice=${encodeURIComponent(voice)}&format=${encodeURIComponent(format)}`).then((r) => r.json());
      if (res?.success && res.article) {
        setArticle(res.article as ReporterArticle);
        setPreviewing(true);
      } else {
        setMessage(res?.error ?? 'Preview failed.');
      }
    } catch (err) {
      setMessage(`Preview failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setLoading(false);
  }, [voice, format]);

  const writeNow = useCallback(async () => {
    setWriting(true);
    setMessage('');
    try {
      const res = await recourseJson('/api/recourse/reporter/generate', {
        method: 'POST',
        body: JSON.stringify({ force: true, voice, format }),
      });
      if (res?.success) {
        setMessage(res.written ? `Wrote dispatch ${res.article.id}.` : `No new dispatch: ${res.reason}.`);
        await load();
      } else {
        setMessage(res?.error ?? 'Generation failed.');
      }
    } catch (err) {
      setMessage(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setWriting(false);
  }, [voice, format, load]);

  const narrate = useCallback(async () => {
    if (!article || previewing) return;
    setNarrating(true);
    setMessage('');
    try {
      const res = await recourseJson('/api/recourse/reporter/narrate', {
        method: 'POST',
        body: JSON.stringify({ fingerprint: article.fingerprint }),
      });
      if (res?.success && res.article) {
        setArticle(res.article as ReporterArticle);
        setMessage('Attached a non-canonical narration.');
      } else {
        setMessage(`Narration unavailable: ${res?.error ?? 'model offline'}.`);
      }
    } catch (err) {
      setMessage(`Narration failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setNarrating(false);
  }, [article, previewing]);

  const counts = article?.counts;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Newspaper className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-mono font-bold text-white">Self Reporter — First-Person Dispatches</h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5 max-w-3xl">
            Recourse writes its own plain-language field report from live state, reads it as a comic protocol, and scores it
            against a five-dimension quality codex. Same state always yields the same article; each dispatch is content-addressed
            by the SHA-256 of its facts.{status ? ` ${status.voices.length} voices · ${status.formats.length} formats · ${status.articleCount} archived.` : ''}
            {status?.soulLoaded ? ' Soul override loaded.' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs font-mono text-slate-200"
          >
            {(status?.voices ?? [{ id: 'field', name: 'Field Dispatch', tone: '', verbosity: '' }]).map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs font-mono text-slate-200"
          >
            {(status?.formats ?? [{ id: 'dispatch', name: 'Field Dispatch', description: '' }]).map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button
            onClick={preview}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            <Gauge className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>PREVIEW</span>
          </button>
          <button
            onClick={narrate}
            disabled={narrating || !article || previewing}
            className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className={`w-3.5 h-3.5 ${narrating ? 'animate-spin' : ''}`} />
            <span>NARRATE</span>
          </button>
          <button
            onClick={writeNow}
            disabled={writing}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 cursor-pointer"
          >
            <PenLine className={`w-3.5 h-3.5 ${writing ? 'animate-pulse' : ''}`} />
            <span>{writing ? 'WRITING…' : 'WRITE DISPATCH NOW'}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-4 text-xs font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
          {message}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-4">
          {!article ? (
            <div className="text-center py-12 text-slate-500 font-mono text-xs">
              {loading ? 'Loading the latest dispatch…' : 'No dispatch written yet. Click “Write dispatch now”.'}
            </div>
          ) : (
            <article className="bg-slate-950 border border-slate-800 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                  <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{article.id}</span>
                  <span className="text-slate-600">·</span>
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{fmtTime(article.generatedAt)}</span>
                  <span className="text-slate-600">·</span>
                  <span>{article.wordCount} words</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-cyan-300">{article.voice.name} / {article.format}</span>
                </div>
                <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" /> {previewing ? 'preview' : 'deterministic'}
                </span>
              </div>
              <div className="mt-4 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {article.markdown}
              </div>
              {article.narration?.prose && (
                <div className="mt-5 border-t border-slate-800 pt-4">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-amber-300">
                    <Sparkles className="w-3.5 h-3.5" />
                    NON-CANONICAL NARRATION{article.narration.model ? ` (${article.narration.model})` : ''} — does not change the article or its fingerprint
                  </div>
                  <div className="mt-3 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {article.narration.prose}
                  </div>
                </div>
              )}
            </article>
          )}
        </div>

        <div className="space-y-4">
          {article && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Chapter · {article.metaphor.condition}</span>
              </div>
              <div className="font-mono text-sm text-purple-200 font-bold">{article.metaphor.archetype}</div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">{article.metaphor.source}</div>
              <div className="mt-2 text-[11px] text-slate-300 leading-relaxed">{article.metaphor.businessLogic}</div>
              <ul className="mt-2 space-y-1">
                {article.metaphor.dimensions.map((d) => (
                  <li key={d.id} className="text-[10px] font-mono text-slate-400">
                    <span className="text-slate-300">{d.id} {d.title}</span> — {d.logic}
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[11px] text-amber-300">Lesson: {article.metaphor.lesson}</div>
            </div>
          )}

          {article && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Gauge className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Quality codex</span>
                </div>
                <span className={`text-[11px] font-mono font-bold ${article.codex.verdict === 'GO' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {article.codex.verdict}
                </span>
              </div>
              <div className="space-y-1.5">
                {Object.entries(article.codex.scores).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 font-mono text-[10px] text-slate-400 capitalize">{k}</span>
                    <div className="h-2 flex-1 rounded-full bg-slate-800">
                      <div className="h-2 rounded-full" style={{ width: `${Math.round(Number(v) * 100)}%`, background: article.codex.gates[k] ? 'var(--color-success, #34d399)' : '#f59e0b' }} />
                    </div>
                    <span className="w-9 shrink-0 text-right font-mono text-[10px] text-slate-400">{v}</span>
                  </div>
                ))}
              </div>
              {article.codex.sensitivity[0] && (
                <div className="mt-2 text-[10px] font-mono text-slate-500">
                  Top lever: {article.codex.sensitivity[0].driver} ({article.codex.sensitivity[0].metric} {article.codex.sensitivity[0].delta >= 0 ? '+' : ''}{article.codex.sensitivity[0].delta})
                </div>
              )}
            </div>
          )}

          {article && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Monte Carlo</span>
                <span className="text-[10px] font-mono text-slate-500">{article.monteCarlo.codex.trials} trials</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-mono text-slate-500">Odds of GO</span>
                <span className={`font-mono text-lg font-bold ${article.monteCarlo.codex.goProbability >= 0.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {Math.round(article.monteCarlo.codex.goProbability * 100)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800">
                <div className="h-2 rounded-full" style={{ width: `${Math.round(article.monteCarlo.codex.goProbability * 100)}%`, background: '#22d3ee' }} />
              </div>
              <div className="mt-2 space-y-1">
                {(Object.entries(article.monteCarlo.codex.metrics) as Array<[string, { p10: number; p90: number; passProbability: number }]>).map(([k, m]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 font-mono text-[10px] capitalize text-slate-400">{k}</span>
                    <div className="relative h-1.5 flex-1 rounded-full bg-slate-800">
                      <div className="absolute h-1.5 rounded-full bg-cyan-500/40" style={{ left: `${Math.round(m.p10 * 100)}%`, width: `${Math.max(2, Math.round((m.p90 - m.p10) * 100))}%` }} />
                    </div>
                    <span className="w-9 shrink-0 text-right font-mono text-[10px] text-slate-500">{Math.round(m.passProbability * 100)}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 font-mono text-[10px] text-slate-500">arc holds {Math.round(article.monteCarlo.protocol.stability * 100)}% · binding {article.monteCarlo.codex.binding}</div>
            </div>
          )}

          {article && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Prose audit</span>
                <span className={`font-mono text-[11px] font-bold ${article.prose.score < 15 ? 'text-emerald-400' : article.prose.score < 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {article.prose.score}/100 · {article.prose.band}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800">
                <div className="h-2 rounded-full" style={{ width: `${article.prose.score}%`, background: article.prose.score < 15 ? '#34d399' : article.prose.score < 40 ? '#f59e0b' : '#fb7185' }} />
              </div>
              {article.prose.findings.length === 0 ? (
                <div className="mt-2 font-mono text-[10px] text-slate-500">No anti-slop tells detected.</div>
              ) : (
                <div className="mt-2 space-y-1">
                  {article.prose.findings.slice(0, 4).map((f) => (
                    <div key={f.id} className="font-mono text-[10px] text-slate-400"><span className="text-slate-300">{f.label}</span> ×{f.count}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {counts && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500 mb-3">Dispatch facts</div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <Fact label="Jobs on" value={`${counts.jobsEnabled}/${counts.jobsTotal}`} />
                <Fact label="Capabilities" value={String(counts.registryTotal)} />
                <Fact label="Connections" value={`${counts.connectionsUp}/${counts.connectionsTotal}`} />
                <Fact label="Promotions" value={String(counts.promotions)} />
                <Fact label="Self-repairs" value={String(counts.repairs)} />
                <Fact label="Sealed entries" value={String(counts.provenanceTotal)} />
                <Fact label="Learn episodes" value={String(counts.learnerEpisodes)} />
                <Fact label="Crystallized" value={String(counts.crystallizedGenes)} />
              </div>
            </div>
          )}

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Archive className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] font-mono uppercase tracking-widest text-slate-500">Archive</span>
            </div>
            {index.length === 0 ? (
              <div className="font-mono text-xs text-slate-500">No dispatches archived.</div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {index.map((entry) => (
                  <button
                    key={entry.fingerprint}
                    onClick={() => void load(entry.fingerprint)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-all cursor-pointer ${
                      article?.fingerprint === entry.fingerprint
                        ? 'border-cyan-600/50 bg-cyan-500/10'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-mono text-[11px] text-slate-200 line-clamp-2">{entry.headline}</div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-slate-500">
                      <span>{entry.id}</span>
                      <span>·</span>
                      <span>{fmtTime(entry.generatedAt)}</span>
                      {entry.hasNarration && <span className="text-amber-400">· narrated</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Fact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-2">
    <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
    <div className="text-sm font-bold text-slate-100">{value}</div>
  </div>
);

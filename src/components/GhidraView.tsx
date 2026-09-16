import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Binary,
  ShieldAlert,
  RefreshCw,
  Upload,
  FileCode,
  Brain,
  AlertTriangle,
  CheckCircle2,
  Activity,
} from 'lucide-react';

interface GhidraHealth {
  online: boolean;
  available: boolean;
  service?: string;
  ghidraHome?: string | null;
  analyzeHeadless?: string | null;
  java?: string | null;
  javaVersion?: string | null;
  supportedFormats?: string[];
  sidecarUrl?: string;
  reason?: string | null;
  error?: string | null;
}

interface Indicator {
  kind: string;
  severity: 'high' | 'medium' | 'low';
  detail: string;
}

interface Findings {
  heuristic: boolean;
  note: string;
  riskScore: number;
  indicatorCount: number;
  indicators: Indicator[];
  suspiciousImports: string[];
  counts: { functions: number; symbols: number; strings: number; sections: number; decompiled: number };
}

interface Analysis {
  program: string;
  language: string;
  compiler: string;
  imageBase: string;
  md5: string;
  sha256: string;
  format: string;
  functions: Array<{ name: string; entry: string; size: number; isExternal: boolean; isThunk: boolean }>;
  symbols: Array<{ name: string; external: boolean }>;
  strings: Array<{ address: string; value: string; length: number }>;
  sections: Array<{ name: string; size: number; read: boolean; write: boolean; execute: boolean }>;
  decompiled: Array<{ name: string; entry: string; c: string }>;
}

interface AnalyzeResult {
  ok: boolean;
  available?: boolean;
  error?: string;
  elapsedMs?: number;
  analysis?: Analysis;
  findings?: Findings;
  log_tail?: string[];
}

const SEV_COLOR: Record<string, string> = {
  high: 'text-rose-300 bg-rose-950/40 border-rose-800',
  medium: 'text-amber-300 bg-amber-950/40 border-amber-800',
  low: 'text-sky-300 bg-sky-950/40 border-sky-800',
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('failed to read file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export const GhidraView: React.FC = () => {
  const [health, setHealth] = useState<GhidraHealth>({ online: false, available: false });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [selectedFn, setSelectedFn] = useState<string | null>(null);
  const [learned, setLearned] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const h = await fetch('/api/recourse/ghidra/sidecar').then((r) => r.json());
      setHealth({
        online: !!h?.online,
        available: !!h?.available,
        service: h?.service,
        ghidraHome: h?.ghidraHome ?? null,
        analyzeHeadless: h?.analyzeHeadless ?? null,
        java: h?.java ?? null,
        javaVersion: h?.javaVersion ?? null,
        supportedFormats: h?.supportedFormats ?? [],
        sidecarUrl: h?.sidecarUrl,
        reason: h?.reason ?? null,
        error: h?.error ?? null,
      });
    } catch {
      setHealth({ online: false, available: false, error: 'unreachable' });
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  const analyze = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    setLearned(null);
    setSelectedFn(null);
    try {
      const data = await fileToBase64(file);
      const res = await fetch('/api/recourse/ghidra/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_base64: data, filename: file.name, analysis_timeout_sec: 300 }),
      });
      const data2 = await res.json();
      setResult(data2);
    } catch (err: any) {
      setResult({ ok: false, error: err?.message ?? 'analysis request failed' });
    } finally {
      setBusy(false);
    }
  }, [file]);

  const feedLearner = useCallback(async () => {
    if (!result?.findings || !result?.analysis) return;
    setLearned(null);
    try {
      const res = await fetch('/api/recourse/ghidra/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          binaryName: file?.name ?? result.analysis.program,
          domain: 'cyber_defense',
          findings: result.findings,
          analysis: {
            program: result.analysis.program,
            format: result.analysis.format,
            md5: result.analysis.md5,
            sha256: result.analysis.sha256,
            functionCount: result.findings.counts.functions,
            symbolCount: result.findings.counts.symbols,
            stringCount: result.findings.counts.strings,
          },
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        setLearned(`learner reward ${data.reward} · ${data.repairRows?.length ?? 0} repair row(s) · ${data.signals?.length ?? 0} signal(s)`);
      } else {
        setLearned(`not learned: ${data?.error ?? data?.reason ?? 'sink unavailable'}`);
      }
    } catch (err: any) {
      setLearned(`not learned: ${err?.message ?? 'request failed'}`);
    }
  }, [result, file]);

  const findings = result?.findings;
  const analysis = result?.analysis;
  const selected = analysis?.decompiled.find((d) => d.name === selectedFn) ?? analysis?.decompiled[0];

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="rounded-2xl border border-emerald-900/60 bg-gradient-to-br from-slate-950 via-slate-900/90 to-emerald-950/40 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Binary className="w-5 h-5 text-emerald-300" />
            <h2 className="font-bold tracking-wide">GHIDRA REVERSE ENGINEERING</h2>
          </div>
          <button onClick={refresh} className="text-slate-400 hover:text-white transition" title="Refresh now">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[12px] text-slate-400 mt-1">
          Real NSA <span className="font-mono">Ghidra</span> headless analysis via the stateless sidecar
          <span className="font-mono"> python/ghidra_service</span>: functions, imports, strings, memory sections and
          decompiled C. Findings are deterministic heuristics over that real output — never a fabricated disassembly.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-mono border ${health.online ? 'text-emerald-300 bg-emerald-950/40 border-emerald-800' : 'text-rose-300 bg-rose-950/40 border-rose-800'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${health.online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            SIDECAR {health.online ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-mono border ${health.available ? 'text-emerald-300 bg-emerald-950/40 border-emerald-800' : 'text-amber-300 bg-amber-950/40 border-amber-800'}`}>
            GHIDRA {health.available ? 'AVAILABLE' : 'NOT INSTALLED'}
          </span>
          {health.ghidraHome && <span className="text-[11px] font-mono text-slate-400 truncate max-w-[240px]">{health.ghidraHome}</span>}
          {health.javaVersion && <span className="text-[11px] font-mono text-slate-500">java: {health.javaVersion}</span>}
        </div>
        {!health.available && (
          <div className="mt-3 text-[11px] text-amber-300 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{health.reason ?? health.error ?? 'Ghidra not detected'} — analysis will honestly return ok:false.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-sm tracking-wide">ARTIFACT</h3>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setLearned(null);
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-slate-700 hover:border-emerald-700 bg-slate-900/60 px-3 py-6 text-sm text-slate-300 transition"
          >
            {file ? <span className="font-mono text-emerald-300">{file.name}</span> : 'Choose a binary…'}
          </button>
          <button
            onClick={analyze}
            disabled={!file || busy || !health.online}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-900/50 hover:bg-emerald-800/60 disabled:opacity-40 border border-emerald-800 px-3 py-2 text-sm font-mono transition"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            {busy ? 'analyzing (real Ghidra run)…' : 'ANALYZE'}
          </button>
          {result && !result.ok && (
            <div className="mt-3 text-[11px] text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded p-2">
              {result.error ?? 'analysis failed'}
              {result.log_tail && result.log_tail.length > 0 && (
                <pre className="mt-1 text-[10px] text-rose-200/70 overflow-x-auto">{result.log_tail.join('\n')}</pre>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-sm tracking-wide">FINDINGS</h3>
            {result?.elapsedMs != null && <span className="text-[10px] font-mono text-slate-500">{result.elapsedMs} ms</span>}
          </div>
          {!findings && <div className="text-slate-500 text-sm py-8 text-center">Analyze an artifact to see real findings.</div>}
          {findings && (
            <>
              <div className="flex items-center gap-3">
                <div className={`text-3xl font-mono font-bold ${findings.riskScore >= 50 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {findings.riskScore}
                  <span className="text-sm text-slate-500">/100</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {findings.indicatorCount} indicator(s) · {findings.counts.functions} fn · {findings.counts.decompiled} decompiled
                  <div className="text-slate-600">{findings.note}</div>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 max-h-[240px] overflow-y-auto">
                {findings.indicators.map((ind, i) => (
                  <div key={i} className={`rounded border px-2.5 py-1.5 text-[11px] font-mono ${SEV_COLOR[ind.severity] ?? SEV_COLOR.low}`}>
                    <span className="uppercase font-bold mr-2">{ind.severity}</span>
                    <span className="text-slate-300">{ind.kind}: {ind.detail}</span>
                  </div>
                ))}
                {findings.indicators.length === 0 && (
                  <div className="text-[11px] text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> no heuristic indicators fired
                  </div>
                )}
              </div>
              <button
                onClick={feedLearner}
                disabled={!analysis}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-900/50 hover:bg-indigo-800/60 disabled:opacity-40 border border-indigo-800 px-3 py-1.5 text-[12px] font-mono transition"
              >
                <Brain className="w-4 h-4" /> FEED TO LEARNER + REPAIR LOOP
              </button>
              {learned && <div className="mt-2 text-[11px] font-mono text-indigo-300">{learned}</div>}
            </>
          )}
        </div>
      </div>

      {analysis && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileCode className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-sm tracking-wide">DECOMPILED FUNCTIONS ({analysis.decompiled.length})</h3>
          </div>
          {analysis.decompiled.length === 0 ? (
            <div className="text-slate-500 text-sm">No functions decompiled.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-1 max-h-[420px] overflow-y-auto space-y-1">
                {analysis.decompiled.map((d) => (
                  <button
                    key={d.entry}
                    onClick={() => setSelectedFn(d.name)}
                    className={`w-full text-left rounded px-2 py-1.5 text-[11px] font-mono truncate ${selected?.name === d.name ? 'bg-emerald-950/60 text-emerald-200' : 'text-slate-400 hover:bg-slate-900'}`}
                    title={d.name}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
              <pre className="lg:col-span-3 max-h-[420px] overflow-auto rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-[11px] text-slate-300">
                {selected?.c ?? 'select a function'}
              </pre>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono text-slate-500">
            <span>format: {analysis.format}</span>
            <span>lang: {analysis.language}</span>
            <span>base: {analysis.imageBase}</span>
            <span className="truncate">sha256: {analysis.sha256?.slice(0, 20)}…</span>
            <span>symbols: {analysis.symbols.length}</span>
            <span>strings: {analysis.strings.length}</span>
            <span>sections: {analysis.sections.length}</span>
            <span>md5: {analysis.md5?.slice(0, 12)}</span>
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-600">
        Honest scope: findings are deterministic heuristics over real Ghidra output (packer hints, RWX sections, risky
        imports, oversized functions) — indicators, not a malware verdict. The sidecar holds no Recourse state; when
        Ghidra or its JRE is missing it reports <span className="font-mono">available:false</span> and never invents an
        analysis.
      </p>
    </div>
  );
};

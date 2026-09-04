import { useEffect, useState } from 'react';

/**
 * Web Download — Recourse downloads from the web through AgentBrowser.
 * A thin UI over GET /api/recourse/web/agentbrowser (status) and
 * POST /api/recourse/web/download (fetch a URL by mode).
 */

interface ABStatus {
  configured: boolean;
  online: boolean;
  baseUrl: string;
}
interface DownloadResult {
  ok: boolean;
  mode?: string;
  httpStatus?: number;
  contentType?: string;
  text?: string;
  error?: string;
}

const MODES = [
  { value: 'download', label: 'Download (proxy HTML/text/JSON)' },
  { value: 'reader', label: 'Reader (rendered page → readable text)' },
  { value: 'extract', label: 'Extract (selectors)' },
  { value: 'search', label: 'Search' },
] as const;

export function WebDownloadView() {
  const [status, setStatus] = useState<ABStatus | null>(null);
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<string>('download');
  const [selectors, setSelectors] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [notice, setNotice] = useState('');

  async function refresh() {
    try {
      const r = await fetch('/api/recourse/web/agentbrowser');
      const j = await r.json();
      setStatus(j);
    } catch {
      setStatus({ configured: false, online: false, baseUrl: '' });
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function download() {
    if (!url.trim()) return;
    setBusy(true);
    setResult(null);
    setNotice('');
    try {
      const r = await fetch('/api/recourse/web/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          mode,
          selectors: selectors.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const j = await r.json();
      setResult(j);
    } catch (e: any) {
      setNotice(`request failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  const isDown = status ? !status.configured : true;
  return (
    <div className="p-4 space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-emerald-300 font-semibold text-base">Download from the Web (AgentBrowser)</div>
          <div className="text-slate-400 text-xs">
            Fetch public web pages / files through the ecosystem browser service (proxy: download, reader, extract, search).
          </div>
        </div>
        <button onClick={refresh} className="px-3 py-1.5 rounded border border-slate-700 hover:border-emerald-600 text-slate-300">
          Refresh status
        </button>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <span className={`px-2 py-1 rounded border ${status?.configured ? 'border-emerald-800 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>
          API key: {status?.configured ? 'configured' : 'NOT SET (AGENTBROWSER_API_KEY)'}
        </span>
        <span className={`px-2 py-1 rounded border ${status?.online ? 'border-emerald-800 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>
          AgentBrowser: {status?.online ? 'online' : isDown ? 'not configured' : 'unreachable'}
        </span>
        {status?.baseUrl && <span className="px-2 py-1 rounded border border-slate-700 text-slate-400">{status.baseUrl}</span>}
      </div>

      <div className="grid gap-2 max-w-3xl">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/page  (public http/https URL)"
          className="px-3 py-2 rounded border border-slate-700 bg-slate-900 text-slate-200 focus:border-emerald-600 outline-none"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="px-2 py-2 rounded border border-slate-700 bg-slate-900 text-slate-200"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <input
            value={selectors}
            onChange={(e) => setSelectors(e.target.value)}
            placeholder="selectors (extract), comma-separated: h1, .content"
            className="px-2 py-2 rounded border border-slate-700 bg-slate-900 text-slate-200 focus:border-emerald-600 outline-none sm:col-span-2"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={download}
            disabled={busy || !url.trim()}
            className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-semibold"
          >
            {busy ? 'Downloading…' : 'Download'}
          </button>
          {notice && <span className="text-amber-400 text-xs">{notice}</span>}
        </div>
      </div>

      {result && (
        <div className="border border-slate-800 rounded p-3 bg-slate-900/40 space-y-2 max-w-5xl">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded border ${result.ok ? 'border-emerald-800 text-emerald-300' : 'border-red-800 text-red-300'}`}>
              {result.ok ? 'OK' : 'FAILED'}
            </span>
            {result.httpStatus && <span className="px-2 py-0.5 rounded border border-slate-700 text-slate-300">HTTP {result.httpStatus}</span>}
            {result.contentType && <span className="px-2 py-0.5 rounded border border-slate-700 text-slate-300">{result.contentType}</span>}
            {result.error && <span className="text-red-300">{result.error}</span>}
          </div>
          {result.ok && result.text && (
            <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words max-h-96 overflow-auto">
              {result.text.slice(0, 20000)}
            </pre>
          )}
        </div>
      )}

      <div className="text-xs text-slate-500 max-w-3xl">
        Intake autopilot: set <code className="text-slate-300">AGENTBROWSER_POLL_URLS</code> (comma-separated) in env and it downloads each
        page every poll cycle as a grounding signal. Requires <code className="text-slate-300">AGENTBROWSER_API_KEY</code>.
      </div>
    </div>
  );
}

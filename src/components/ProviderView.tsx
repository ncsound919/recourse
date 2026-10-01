import React, { useState, useEffect } from 'react';
import { Server, CheckCircle, XCircle, MessageSquare, Send, RefreshCw } from 'lucide-react';

interface ProviderState {
  mode: string;
  current: { baseUrl: string; model: string; online: boolean; lastError?: string };
  profiles: Array<{ id: string; label: string; baseUrl: string; model: string }>;
}

interface ChatMsg { role: 'user' | 'assistant'; content: string; error?: string }

export const ProviderView: React.FC = () => {
  const [provider, setProvider] = useState<ProviderState | null>(null);
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [chatBusy, setChatBusy] = useState(false);

  const load = async () => {
    try {
      const j = await fetch('/api/recourse/settings/provider').then((r) => r.json());
      setProvider({ mode: j.mode, current: j.current, profiles: j.profiles ?? [] });
    } catch { setProvider(null); }
  };

  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!prompt.trim() || chatBusy) return;
    setChatBusy(true);
    setHistory((h) => [...h, { role: 'user', content: prompt }]);
    const text = prompt;
    setPrompt('');
    try {
      const j = await fetch('/api/recourse/provider/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      }).then((r) => r.json());
      if (j?.response) setHistory((h) => [...h, { role: 'assistant', content: j.response, error: j.error }]);
      else setHistory((h) => [...h, { role: 'assistant', content: '', error: j?.error || 'no response' }]);
    } catch (e: any) {
      setHistory((h) => [...h, { role: 'assistant', content: '', error: e.message }]);
    } finally { setChatBusy(false); }
  };

  const cur = provider?.current;
  const online = cur?.online === true;

  return (
    <div className="space-y-6">
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-accent-400" />
          <h2 className="text-sm font-semibold text-white">AI provider - configured model endpoint</h2>
        </div>
        <p className="text-[11px] text-ink-500 mt-1">
          All self-improvement generation (dream, forge, swarm, mutator) routes through the configured provider. The
          local (MiniCPM5 / llama-server) profile is used local-first with an automatic API fallback. Offline is
          reported as offline - never fabricated.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-3 lg:col-span-1">
          <h3 className="text-sm font-semibold text-white">Provider status</h3>
          {!cur ? (
            <p className="text-xs text-ink-500">Provider settings unavailable (server route down).</p>
          ) : (
            <>
              <div className="flex justify-between items-center p-2.5 rounded-lg bg-ink-950 border border-ink-800 text-xs">
                <span className="text-ink-400">Status:</span>
                <span className={`font-semibold px-2 py-0.5 rounded text-[10px] ${online ? 'bg-ok-950 text-ok-400 border border-ok-800' : 'bg-bad-950 text-bad-400 border border-bad-800'}`}>
                  {online ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-ink-950 border border-ink-800 space-y-1 text-xs">
                <div className="text-ink-500">Model: <span className="text-white">{cur.model}</span></div>
                <div className="text-ink-500 break-all">Endpoint: <span className="text-accent-300">{cur.baseUrl || '(unset)'}</span></div>
                {cur.lastError && <div className="text-bad-400 text-[10px] break-all">{cur.lastError}</div>}
              </div>
              <button onClick={load} className="w-full py-2 bg-ink-800 hover:bg-ink-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> REFRESH
              </button>
            </>
          )}
        </div>

        <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 lg:col-span-2 flex flex-col h-[480px]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 pb-3 border-b border-ink-800">
            <MessageSquare className="w-4 h-4 text-accent-400" /> PROVIDER TERMINAL
          </h3>
          <div className="flex-1 bg-ink-950 border border-ink-800 rounded-xl p-3 overflow-y-auto space-y-2 text-xs">
            {history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-ink-600 text-center">Prompt the configured provider. Runs through /api/recourse/provider/chat, which uses the local-first generation policy.</div>
            ) : history.map((m, i) => (
              <div key={i} className={`p-2.5 rounded-lg border ${m.role === 'user' ? 'bg-accent-950/20 border-accent-900/50 text-accent-200' : 'bg-ink-900 border-ink-800 text-ink-300'}`}>
                <div className="text-[10px] text-ink-500 mb-1 font-semibold ">{m.role === 'user' ? 'You' : (cur?.model ?? 'provider')}</div>
                {m.error && <div className="text-bad-400 text-[10px] mb-1">{m.error}</div>}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask the configured provider..." disabled={chatBusy}
              className="flex-1 bg-ink-950 border border-ink-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500 disabled:opacity-50" />
            <button onClick={send} disabled={chatBusy || !prompt.trim()} className="px-4 py-2.5 bg-accent-600 hover:bg-accent-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> {chatBusy ? 'WAITING...' : 'SEND'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Profiles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(provider?.profiles ?? []).map((p) => (
            <div key={p.id} className="p-3 rounded-xl border border-ink-800 bg-ink-950 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-200 font-semibold">{p.label}</span>
                {p.id === 'api' ? <CheckCircle className="w-4 h-4 text-ok-400" /> : <XCircle className="w-4 h-4 text-ink-600" />}
              </div>
              <div className="text-ink-500">Model: <span className="text-white">{p.model}</span></div>
              <div className="text-ink-500 break-all">{p.baseUrl || 'not configured'}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-ink-600 mt-3">
          Local profile points at the MiniCPM5 model served by llama-server (LOCAL_MODEL_BASE_URL / LOCAL_MODEL_NAME /
          LOCAL_MODEL_API_KEY). It is used local-first, with the API profile as fallback.
        </p>
      </div>
    </div>
  );
};

// src/components/LlamaView.tsx — Local llama.cpp (llama-server) hub.
// Replaces the orphaned OllamaView, whose /api/ollama/* calls had no backend.
// Every button here maps to a real route in src/routes/llama.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Server, Cpu, RefreshCw, MessageSquare, Play, Volume2, AlertTriangle, CheckCircle } from 'lucide-react';
import { speak, playChirp } from '../lib/voice';

interface LlamaStatus {
  success: boolean;
  online: boolean;
  baseUrl: string;
  configuredModel: string;
  servedModel?: string;
  numCtx?: number;
  build?: string | null;
  totalSlots?: number | null;
  error?: string;
}

interface LlamaModels {
  success: boolean;
  models: string[];
  note?: string;
  configuredModel?: string;
  error?: string;
}

interface LlamaTimings {
  promptTokens?: number;
  sampledTokens?: number;
  promptMs?: number;
  sampledMs?: number;
  tokensPerSec?: number;
  promptTokensPerSec?: number;
  totalMs?: number;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  timings?: LlamaTimings | null;
  model?: string;
  failed?: boolean;
}

const card = 'bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-col gap-3';
const btn = 'px-3 py-1.5 rounded-lg text-[11px] font-semibold border disabled:opacity-50';
const btnOk = `${btn} bg-ok-900/50 hover:bg-ok-800 border-ok-700 text-ok-300`;
const btnAccent = `${btn} bg-accent-600 hover:bg-accent-500 border-accent-600 text-white`;

export function LlamaView() {
  const [status, setStatus] = useState<LlamaStatus | null>(null);
  const [models, setModels] = useState<LlamaModels | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [prompt, setPrompt] = useState('');
  const [checking, setChecking] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/llama/status');
      const body = (await res.json()) as LlamaStatus;
      setStatus(body);
      speak(
        body.online
          ? `llama.cpp online. Serving ${body.servedModel ?? body.configuredModel}.`
          : `llama.cpp offline. ${body.error ?? 'no response'}`
      );
    } catch (err: any) {
      setStatus({ success: false, online: false, baseUrl: '', configuredModel: '', error: String(err?.message || err) });
    } finally {
      setChecking(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const res = await fetch('/api/llama/models');
      setModels((await res.json()) as LlamaModels);
    } catch (err: any) {
      setModels({ success: false, models: [], error: String(err?.message || err) });
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const ask = useCallback(async () => {
    const text = prompt.trim();
    if (!text || asking) return;
    setChatError('');
    setPrompt('');
    setTurns((t) => [...t, { role: 'user', content: text }]);
    setAsking(true);
    try {
      const res = await fetch('/api/llama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, system: 'You are a helpful local coder.' }),
      });
      const body = await res.json();
      if (body?.success) {
        setTurns((t) => [...t, { role: 'assistant', content: body.reply, timings: body.timings, model: body.model }]);
        playChirp('success');
      } else {
        setChatError(body?.error ?? `chat failed (HTTP ${res.status})`);
        setTurns((t) => [...t, { role: 'assistant', content: body?.error ?? 'chat failed', failed: true }]);
        playChirp('failure');
      }
    } catch (err: any) {
      setChatError(String(err?.message || err));
      setTurns((t) => [...t, { role: 'assistant', content: String(err?.message || err), failed: true }]);
      playChirp('failure');
    } finally {
      setAsking(false);
    }
  }, [prompt, asking]);

  useEffect(() => {
    void checkStatus();
    void loadModels();
  }, [checkStatus, loadModels]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [turns]);

  const lastTimings = [...turns].reverse().find((t) => t.timings)?.timings ?? null;
  const online = status?.online === true;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Server className="w-5 h-5 text-accent-400" />
        <h2 className="text-xl font-bold text-white font-mono tracking-tight">llama.cpp Local Model Hub</h2>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded ${online ? 'bg-ok-900/50 text-ok-300' : 'bg-bad-950/50 text-bad-300'}`}
        >
          {online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-200">
              {online ? <CheckCircle className="w-4 h-4 text-ok-400" /> : <AlertTriangle className="w-4 h-4 text-bad-400" />}
              Server
            </div>
            <button onClick={checkStatus} disabled={checking} className={btnOk}>
              <RefreshCw className={`w-3 h-3 inline ${checking ? 'animate-spin' : ''}`} />{' '}
              {checking ? 'Checking...' : 'Refresh status'}
            </button>
          </div>
          {status ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
              <dt className="text-ink-500">base URL</dt>
              <dd className="text-ink-200 break-all">{status.baseUrl || 'not configured'}</dd>
              <dt className="text-ink-500">serving</dt>
              <dd className="text-ink-200 break-all">{status.online ? status.servedModel ?? status.configuredModel : '-'}</dd>
              <dt className="text-ink-500">configured</dt>
              <dd className="text-ink-200">{status.configuredModel || '-'}</dd>
              {status.numCtx ? (
                <>
                  <dt className="text-ink-500">context</dt>
                  <dd className="text-ink-200">{status.numCtx} tokens</dd>
                </>
              ) : null}
              {status.build ? (
                <>
                  <dt className="text-ink-500">build</dt>
                  <dd className="text-ink-200 break-all">{status.build}</dd>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="text-[11px] text-ink-500">probing...</p>
          )}
          {status?.error && <p className="text-[11px] text-bad-300">{status.error}</p>}
        </div>

        <div className={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-200">
              <Cpu className="w-4 h-4 text-accent-400" /> Models
            </div>
            <button onClick={loadModels} disabled={loadingModels} className={btnOk}>
              <RefreshCw className={`w-3 h-3 inline ${loadingModels ? 'animate-spin' : ''}`} />{' '}
              {loadingModels ? 'Listing...' : 'Refresh models'}
            </button>
          </div>
          {models?.models?.length ? (
            <ul className="flex flex-col gap-1 text-[11px] font-mono text-ink-200">
              {models.models.map((m) => (
                <li key={m} className="truncate">
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-ink-500">{models?.error ?? 'no models reported'}</p>
          )}
          {models?.note && <p className="text-[11px] text-ink-500">{models.note}</p>}
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-200">
          <MessageSquare className="w-4 h-4 text-accent-400" /> Chat with the local model
        </div>
        <div ref={logRef} className="max-h-72 overflow-y-auto flex flex-col gap-2">
          {turns.length === 0 && <p className="text-[11px] text-ink-500">no turns yet</p>}
          {turns.map((t, i) => (
            <div key={i} className="text-[11px] font-mono">
              <span className={t.role === 'user' ? 'text-accent-300' : t.failed ? 'text-bad-300' : 'text-ink-200'}>
                {t.role === 'user' ? '> ' : '< '}
                {t.content}
              </span>
              {t.timings?.tokensPerSec ? (
                <span className="text-ink-500 ml-2">
                  {t.timings.tokensPerSec} tok/s · {t.timings.sampledTokens ?? '?'} tokens in{' '}
                  {t.timings.sampledMs ?? '?'}ms
                </span>
              ) : null}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) void ask();
            }}
            placeholder={online ? 'Ask the local model...' : 'llama-server is offline'}
            disabled={!online || asking}
            className="flex-1 bg-ink-950 border border-ink-700 rounded-xl px-3 py-2 text-sm text-ink-200 placeholder-ink-500 focus:outline-none focus:border-accent-500 disabled:opacity-50"
          />
          <button onClick={() => void ask()} disabled={!online || asking || !prompt.trim()} className={btnAccent}>
            <Play className="w-3 h-3 inline" /> {asking ? 'Generating...' : 'Send'}
          </button>
          <button
            onClick={() => speak(lastTimings?.tokensPerSec ? `Local model running at ${lastTimings.tokensPerSec} tokens per second.` : 'No local timings yet.')}
            className={btnOk}
          >
            <Volume2 className="w-3 h-3 inline" /> Speak
          </button>
        </div>
        {chatError && <p className="text-[11px] text-bad-300">{chatError}</p>}
        <p className="text-[11px] text-ink-500">
          Timings are llama.cpp's own token counts and milliseconds. Generation runs on the local CPU/GPU via
          llama-server; nothing here calls a hosted model.
        </p>
      </div>
    </div>
  );
}

export default LlamaView;

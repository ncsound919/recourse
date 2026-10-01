import { useEffect, useState } from 'react';

/** Model provider settings - toggle the generative model between the local
 *  MiniCPM5 model (llama-server) and the remote LLM API at runtime. Backed by
 *  GET/POST /api/recourse/settings/provider. */

interface Profile {
  id: 'local' | 'api';
  label: string;
  baseUrl: string;
  model: string;
}
interface ProviderSettings {
  mode: 'local' | 'api';
  profiles: Profile[];
  current: { baseUrl: string; model: string; online: boolean; lastError?: string };
}

interface AutonomyInfo {
  safeBoot: boolean;
  autoEvolving: boolean;
  dreamActive: boolean;
  swarmAutopilot: boolean;
  intakeAutopilot: boolean;
  forgeAutopilot: boolean;
  devAutopilot: boolean;
}

export function SettingsView() {
  const [data, setData] = useState<ProviderSettings | null>(null);
  const [chosen, setChosen] = useState<'local' | 'api'>('api');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [autonomy, setAutonomy] = useState<AutonomyInfo | null>(null);
  const [autoNotice, setAutoNotice] = useState('');
  const [halting, setHalting] = useState(false);

  async function loadAutonomy() {
    try {
      const r = await fetch('/api/recourse/autonomy');
      const j = await r.json();
      if (j.autonomy) setAutonomy(j.autonomy);
    } catch {
      setAutoNotice('failed to load autonomy settings');
    }
  }

  async function setSafeBoot(safeBoot: boolean) {
    setAutoNotice('');
    try {
      const r = await fetch('/api/recourse/autonomy/safe-boot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeBoot }),
      });
      const j = await r.json();
      if (!j.success) setAutoNotice(`error: ${j.error || 'update failed'}`);
      else {
        setAutonomy((a) => (a ? { ...a, safeBoot: j.safeBoot } : a));
        setAutoNotice(safeBoot ? 'Safe boot enabled: autonomous loops will NOT auto-resume after a restart.' : 'Safe boot disabled: loops resume as configured.');
      }
    } catch (e: any) {
      setAutoNotice(`request failed: ${e?.message || e}`);
    }
  }

  async function haltAll() {
    setHalting(true);
    setAutoNotice('');
    try {
      const r = await fetch('/api/recourse/autonomy/halt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'settings_panel' }),
      });
      const j = await r.json();
      if (!j.success) setAutoNotice(`error: ${j.error || 'halt failed'}`);
      else {
        setAutonomy({
          safeBoot: j.safeBoot,
          autoEvolving: j.autoEvolving,
          dreamActive: j.dreamActive,
          swarmAutopilot: j.swarmAutopilot,
          intakeAutopilot: j.intakeAutopilot,
          forgeAutopilot: j.forgeAutopilot,
          devAutopilot: j.devAutopilot,
        });
        setAutoNotice('All autonomous loops halted. Nothing will tick or write state until you re-enable it.');
      }
    } catch (e: any) {
      setAutoNotice(`request failed: ${e?.message || e}`);
    } finally {
      setHalting(false);
    }
  }

  async function load() {
    try {
      const r = await fetch('/api/recourse/settings/provider');
      const j = await r.json();
      if (j.profiles) setData(j);
    } catch {
      setNotice('failed to load provider settings');
    }
  }

  useEffect(() => {
    load();
    loadAutonomy();
  }, []);

  useEffect(() => {
    if (data) setChosen(data.mode);
  }, [data?.mode]);

  async function apply(mode: 'local' | 'api') {
    setBusy(true);
    setNotice('');
    try {
      const r = await fetch('/api/recourse/settings/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const j = await r.json();
      if (!j.success) setNotice(`error: ${j.error || 'apply failed'}`);
      else {
        setChosen(j.applied);
        setData((d) => (d ? { ...d, mode: j.applied, current: j.current } : d));
      }
    } catch (e: any) {
      setNotice(`request failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-4 text-sm max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-ok-300 font-semibold text-base">Settings - Model Provider</div>
          <div className="text-ink-400 text-xs">
            Choose which model endpoint drives the generative features (dream, swarm, mutation, chat): the local MiniCPM5
            model (llama-server) or the remote LLM API. Applies immediately; persisted across restarts.
          </div>
        </div>
        <button onClick={load} className="px-3 py-1.5 rounded border border-ink-700 hover:border-ok-600 text-ink-300">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(data?.profiles ?? []).map((p) => {
          const active = chosen === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setChosen(p.id)}
              className={`text-left rounded border p-3 transition-colors ${
                active ? 'border-ok-500 bg-ok-950/30' : 'border-ink-700 bg-ink-900/40 hover:border-ink-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-semibold ${active ? 'text-ok-300' : 'text-ink-200'}`}>{p.label}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] border ${active ? 'border-ok-700 text-ok-200' : 'border-ink-700 text-ink-400'}`}>
                  {active ? 'ACTIVE' : 'select'}
                </span>
              </div>
              <div className="mt-1 text-xs text-ink-400 break-all">model: {p.model}</div>
              <div className="text-xs text-ink-500 break-all">endpoint: {p.baseUrl}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => apply(chosen)}
          disabled={busy || !data || chosen === data.mode}
          className="px-4 py-2 rounded bg-ok-700 hover:bg-ok-600 disabled:opacity-40 text-white font-semibold"
        >
          {busy ? 'Applying…' : 'Apply provider'}
        </button>
        {notice && <span className="text-warn-400 text-xs">{notice}</span>}
      </div>

      {data?.current && (
        <div className="border border-ink-800 rounded p-3 bg-ink-900/40 text-xs space-y-1">
          <div className="text-ink-300 font-semibold">Current live endpoint</div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`px-2 py-0.5 rounded border ${data.current.online ? 'border-ok-800 text-ok-300' : 'border-bad-800 text-bad-300'}`}>
              {data.current.online ? 'online' : 'offline'}
            </span>
            <span className="text-ink-300">{data.current.model}</span>
            <span className="text-ink-500 break-all">{data.current.baseUrl}</span>
          </div>
          {data.current.lastError && <div className="text-bad-300 break-all">{data.current.lastError}</div>}
        </div>
      )}

      <div className="border-t border-ink-800 my-4" />

      {/* Autonomy & Stability */}
      <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-ok-300 font-semibold text-sm">Autonomy &amp; Stability</div>
            <div className="text-ink-400 text-xs mt-0.5">
              The engine's autonomous loops tick, write state, and can re-enter a reload loop if they resume
              automatically after a restart. Safe boot keeps the dashboard stable until you explicitly re-enable loops.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 bg-ink-900/50 rounded border border-ink-800 p-3">
          <div className="text-ink-300 text-sm">
            Safe boot
            <div className="text-ink-500 text-xs mt-0.5">
              {autonomy?.safeBoot
                ? 'On: autonomous loops stay paused across restarts (recommended).'
                : 'Off: loops auto-resume after a restart - can crash-loop the UI.'}
            </div>
          </div>
          <button
            onClick={() => setSafeBoot(!autonomy?.safeBoot)}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
              autonomy?.safeBoot ? 'bg-ok-600' : 'bg-ink-700'
            }`}
            aria-pressed={autonomy?.safeBoot ?? true}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                autonomy?.safeBoot ? 'left-6' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className={`px-2 py-1 rounded border ${autonomy?.autoEvolving ? 'border-warn-700 text-warn-300' : 'border-ink-800 text-ink-500'}`}>
            AUTO-EVOLVE {autonomy?.autoEvolving ? 'ON' : 'OFF'}
          </span>
          <span className={`px-2 py-1 rounded border ${autonomy?.dreamActive ? 'border-accent-700 text-accent-300' : 'border-ink-800 text-ink-500'}`}>
            DREAM {autonomy?.dreamActive ? 'ON' : 'OFF'}
          </span>
          <span className={`px-2 py-1 rounded border ${autonomy?.swarmAutopilot ? 'border-accent-700 text-accent-300' : 'border-ink-800 text-ink-500'}`}>
            SWARM-AUTO {autonomy?.swarmAutopilot ? 'ON' : 'OFF'}
          </span>
          <span className={`px-2 py-1 rounded border ${autonomy?.forgeAutopilot ? 'border-accent-700 text-accent-300' : 'border-ink-800 text-ink-500'}`}>
            FORGE-AUTO {autonomy?.forgeAutopilot ? 'ON' : 'OFF'}
          </span>
        </div>

        <button
          onClick={haltAll}
          disabled={halting}
          className="px-4 py-2 rounded bg-bad-800 hover:bg-bad-700 disabled:opacity-50 text-white text-sm font-semibold"
        >
          {halting ? 'Halting…' : '⏹ Halt all autonomous loops now'}
        </button>
        {autoNotice && <div className="text-warn-300 text-xs">{autoNotice}</div>}
      </div>

      <div className="text-xs text-ink-500">
        Configure each profile's endpoint/model via env (Local: <code className="text-ink-300">LOCAL_MODEL_BASE_URL/NAME</code>;
        API: <code className="text-ink-300">API_MODEL_BASE_URL/NAME</code>, falling back to <code className="text-ink-300">MODEL_*</code>).
        The Capability Forge has its own independent <code className="text-ink-300">FORGE_MODEL_*</code> config and is not changed by this toggle.
      </div>
    </div>
  );
}

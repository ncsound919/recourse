import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Mic, Play, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import {
  cloneCooldownMs,
  deleteVoiceProfile,
  fetchVoiceStatus,
  getCloneProfileId,
  isVoiceCloneEnabled,
  recordReference,
  resetCloneCooldown,
  saveVoiceProfile,
  setCloneProfileId,
  setVoiceCloneEnabled,
  speakCloned,
  stopClonedSpeech,
  type VoiceProfileSummary,
  type VoiceSidecarStatus,
} from '../lib/voiceClone';

const RECORD_MS = 15000;

export function VoiceCloneView() {
  const [sidecar, setSidecar] = useState<VoiceSidecarStatus | null>(null);
  const [profiles, setProfiles] = useState<VoiceProfileSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(getCloneProfileId());
  const [enabled, setEnabled] = useState(isVoiceCloneEnabled());
  const [name, setName] = useState('My Voice');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [testText, setTestText] = useState('Recourse telemetry, spoken in my own voice.');
  const [speaking, setSpeaking] = useState(false);

  const refresh = useCallback(async () => {
    setNotice('');
    resetCloneCooldown();
    try {
      const { sidecar: s, profiles: p } = await fetchVoiceStatus();
      setSidecar(s);
      setProfiles(p);
      setSelected((cur) => (cur && p.some((x) => x.id === cur) ? cur : p[0]?.id ?? null));
    } catch (e: any) {
      setNotice(`failed to load voice status: ${e?.message || e}`);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setCloneProfileId(selected);
  }, [selected]);

  const toggleEnabled = (next: boolean) => {
    setEnabled(next);
    setVoiceCloneEnabled(next);
    if (!next) stopClonedSpeech();
  };

  async function record() {
    setNotice('');
    setBusy(true);
    setRecording(true);
    setElapsed(0);
    try {
      const reference = await recordReference({ durationMs: RECORD_MS, onProgress: setElapsed });
      const saved = await saveVoiceProfile({ name: name.trim() || 'My Voice', reference });
      setSelected(saved.profile.id);
      resetCloneCooldown();
      setNotice(
        saved.suitable === false
          ? `Saved, but the clip may be too short/quiet: ${saved.reason ?? 'quality check failed'}`
          : `Saved "${saved.profile.name}" (${reference.durationSec.toFixed(1)}s). Inference requires a TTS backend on the sidecar.`,
      );
      await refresh();
    } catch (e: any) {
      setNotice(`recording failed: ${e?.message || e}`);
    } finally {
      setRecording(false);
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setNotice('');
    try {
      await deleteVoiceProfile(id);
      await refresh();
    } catch (e: any) {
      setNotice(`delete failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!selected) {
      setNotice('select or record a profile first');
      return;
    }
    setBusy(true);
    setNotice('');
    setSpeaking(true);
    try {
      await speakCloned(testText, { profileId: selected });
    } catch (e: any) {
      const cooldown = Math.round(cloneCooldownMs() / 1000);
      setNotice(
        cooldown > 0
          ? `synthesis unavailable: ${e?.message || e} — narration falls back to Web Speech for ~${cooldown}s`
          : `synthesis unavailable: ${e?.message || e}`,
      );
    } finally {
      setSpeaking(false);
      setBusy(false);
    }
  }

  const engines = sidecar?.engines ?? [];
  const cloneUsable = Boolean(sidecar?.ttsAvailable && profiles.length > 0);

  return (
    <div className="p-4 space-y-4 text-sm max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-emerald-300 font-semibold text-base">Voice Clone — speak in your own voice</div>
          <div className="text-slate-400 text-xs mt-0.5">
            Record a clean ~15s reference clip, then narration is synthesized in that voice. The Web Speech API
            cannot host a custom voice and its output cannot be captured, so cloning <strong>replaces</strong> it —
            Web Speech stays the fallback when this is off or the sidecar is down.
          </div>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 rounded border border-slate-700 hover:border-emerald-600 text-slate-300 flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className={`px-2 py-1 rounded border ${sidecar?.online ? 'border-emerald-800 text-emerald-300' : 'border-red-800 text-red-300'}`}>
            SIDECAR {sidecar?.online ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span className={`px-2 py-1 rounded border ${sidecar?.ttsAvailable ? 'border-emerald-800 text-emerald-300' : 'border-amber-700 text-amber-300'}`}>
            TTS {sidecar?.ttsAvailable ? 'AVAILABLE' : 'NOT INSTALLED'}
          </span>
          <span className="px-2 py-1 rounded border border-slate-700 text-slate-400">
            ENGINES {engines.length ? engines.join(', ') : '—'}
          </span>
          <span className="px-2 py-1 rounded border border-slate-700 text-slate-400">
            DEVICE {sidecar?.device ?? '—'}
          </span>
        </div>
        {sidecar?.error && <div className="text-amber-300 text-xs">{sidecar.error}</div>}
        {sidecar?.online && !sidecar.ttsAvailable && (
          <div className="text-amber-300 text-xs flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              No zero-shot TTS backend on the sidecar. Install one from <code>python/tts_service</code>:
              <code className="ml-1 text-slate-300">pip install -r requirements.txt</code> (coqui-tts / XTTS-v2).
              Recordings are stored either way; synthesis stays honestly unavailable until then.
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 bg-slate-900/50 rounded border border-slate-800 p-3">
        <div className="text-slate-300 text-sm">
          Use cloned voice for narration
          <div className="text-slate-500 text-xs mt-0.5">
            {enabled
              ? 'On: speak() routes through the clone, falling back to Web Speech on failure.'
              : 'Off: narration uses the system Web Speech voice.'}
          </div>
        </div>
        <button
          onClick={() => toggleEnabled(!enabled)}
          disabled={!cloneUsable}
          className={`relative w-12 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
            enabled && cloneUsable ? 'bg-emerald-600' : 'bg-slate-700'
          }`}
          aria-pressed={enabled && cloneUsable}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${enabled && cloneUsable ? 'left-6' : 'left-0.5'}`} />
        </button>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-3">
        <div className="text-slate-300 font-semibold text-sm">Reference clip</div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-400">
            Profile name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-48 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
            />
          </label>
          <button
            onClick={record}
            disabled={busy || recording}
            className="px-4 py-2 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold flex items-center gap-2"
          >
            {recording ? (
              <>
                <Mic className="w-4 h-4 animate-pulse" /> Recording… {Math.round(Math.min(RECORD_MS, elapsed) / 1000)}s
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" /> Record ~{RECORD_MS / 1000}s
              </>
            )}
          </button>
        </div>
        <div className="text-xs text-slate-500">
          Speak a full sentence or two, no music or noise. The clip is downsampled to 16 kHz mono WAV before upload
          and stored under <code>data/voice-profiles/</code>.
        </div>
      </div>

      {profiles.length > 0 && (
        <div className="space-y-2">
          <div className="text-slate-300 font-semibold text-sm">Saved profiles</div>
          {profiles.map((p) => {
            const active = p.id === selected;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-3 rounded border p-3 ${
                  active ? 'border-emerald-500 bg-emerald-950/30' : 'border-slate-700 bg-slate-900/40'
                }`}
              >
                <button onClick={() => setSelected(p.id)} className="text-left flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${active ? 'text-emerald-300' : 'text-slate-200'}`}>{p.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] border ${active ? 'border-emerald-700 text-emerald-200' : 'border-slate-700 text-slate-400'}`}>
                      {active ? 'ACTIVE' : 'select'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.durationSec ? `${p.durationSec.toFixed(1)}s · ` : ''}
                    {(p.bytes / 1024).toFixed(0)} KB · {p.language} · {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </button>
                <button
                  onClick={() => remove(p.id)}
                  disabled={busy}
                  className="p-2 rounded border border-slate-700 hover:border-rose-600 text-slate-400 hover:text-rose-300 disabled:opacity-40"
                  title="Delete profile"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-3">
        <div className="text-slate-300 font-semibold text-sm">Test synthesis</div>
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          rows={2}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-200"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={test}
            disabled={busy || !selected || !sidecar?.ttsAvailable || speaking}
            className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-semibold flex items-center gap-2"
          >
            <Play className="w-4 h-4" /> {speaking ? 'Generating…' : 'Synthesize'}
          </button>
          <button
            onClick={stopClonedSpeech}
            className="px-3 py-2 rounded border border-slate-700 hover:border-slate-500 text-slate-300 flex items-center gap-2"
          >
            <Volume2 className="w-4 h-4" /> Stop
          </button>
          {selected && <span className="text-xs text-slate-500 font-mono">profile {selected.slice(0, 8)}</span>}
        </div>
      </div>

      {notice && <div className="text-amber-300 text-xs">{notice}</div>}
    </div>
  );
}

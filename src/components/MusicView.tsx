/**
 * Music sector view — compose chord progressions / songs and hand them to
 * SoundLab.
 *
 * Real data only: the progression comes from the Recourse composer via
 * `/api/recourse/compose/song.json`; the SoundLab hand-off opens SoundLab's
 * Recourse Composer pre-filled with the same style + seed.
 */

import React, { useEffect, useState } from 'react';
import { Music2, RefreshCw, ExternalLink, Copy, Loader2, AlertTriangle, Wand2 } from 'lucide-react';
import {
  MUSIC_SECTOR,
  SOUNDLAB_DEFAULT_URL,
  chordParts,
  progressionSummary,
  soundlabHandoffUrl,
  songPayloadUrl,
  type ProgressionBrief,
} from '../lib/musicSector';

interface SongSection { name?: string; bars?: number }
interface Song {
  mode: 'loop' | 'arr';
  style: string;
  seed: number;
  bars: number;
  bpm: number;
  key: string;
  keyPc: number;
  major: boolean;
  chords: string[];
  events: number;
  sections?: SongSection[];
  /** Set when the composer reported a problem. */
  error?: string;
}

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const STORAGE_KEY = 'recourse_soundlab_url';

export const MusicView: React.FC = () => {
  const [soundlabBase, setSoundlabBase] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || SOUNDLAB_DEFAULT_URL; } catch { return SOUNDLAB_DEFAULT_URL; }
  });
  const [styles, setStyles] = useState<string[]>(['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane']);
  const [style, setStyle] = useState('steely-dan');
  const [seed, setSeed] = useState(1);
  const [mode, setMode] = useState<'loop' | 'arr'>('loop');
  const [bars, setBars] = useState(8);
  const [keyPc, setKeyPc] = useState(-1);
  const [song, setSong] = useState<Song | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, soundlabBase); } catch { /* ignore */ }
  }, [soundlabBase]);

  useEffect(() => {
    let alive = true;
    fetch('/api/recourse/compose/styles')
      .then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j?.styles) && j.styles.length) setStyles(j.styles); })
      .catch(() => { /* keep defaults */ });
    return () => { alive = false; };
  }, []);

  const brief = (): ProgressionBrief => ({
    style,
    seed,
    bars,
    mode,
    ...(keyPc >= 0 ? { key: keyPc } : {}),
  });

  const generate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch(songPayloadUrl(brief())).then((r) => r.json());
      if (!j?.success) throw new Error(j?.error || 'composer returned no song');
      setSong(j as Song);
    } catch (e: any) {
      setMsg(`generate failed: ${e?.message ?? String(e)}`);
      setSong(null);
    } finally {
      setBusy(false);
    }
  };

  const handoff = () => soundlabHandoffUrl(soundlabBase, brief());
  const pullUrl = () => `${window.location.origin}${songPayloadUrl(brief())}`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setMsg(`copied ${label}`);
    } catch {
      setMsg(`${label}: ${text}`);
    }
  };

  const summary = song ? progressionSummary(song.chords) : null;

  return (
    <div className="space-y-4" data-music-sector>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Music2 className="w-5 h-5 text-fuchsia-400" />
          <div>
            <div className="text-sm font-black uppercase tracking-wider text-white">Music sector</div>
            <div className="text-[11px] text-zinc-500">
              Compose chord progressions &amp; songs with the Recourse composer, then perform them in SoundLab.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSeed(1 + Math.floor(Math.random() * 200))}
            className="px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold uppercase tracking-wider"
          >
            New seed
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-fuchsia-600/20 border border-fuchsia-500/50 text-fuchsia-200 hover:bg-fuchsia-600/30 disabled:opacity-50 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {busy ? 'Composing…' : 'Compose progression'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Controls */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2.5 text-[11px]">
          <label className="flex items-center justify-between gap-2 text-zinc-400">
            Style
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white max-w-[170px]">
              {styles.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-zinc-400">
            Key
            <select value={keyPc} onChange={(e) => setKeyPc(parseInt(e.target.value))} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white">
              <option value={-1}>Auto</option>
              {KEY_NAMES.map((k, i) => <option key={k} value={i}>{k}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-zinc-400">
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as 'loop' | 'arr')} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white">
              <option value="loop">Loop (SoundLab-playable)</option>
              <option value="arr">Arrangement</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-zinc-400">
            Bars
            <select value={bars} onChange={(e) => setBars(parseInt(e.target.value))} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white">
              {[4, 8, 16].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-zinc-400">
            Seed
            <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value) || 0)} className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white" />
          </label>

          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <label className="block text-zinc-400">
              SoundLab URL
              <input
                value={soundlabBase}
                onChange={(e) => setSoundlabBase(e.target.value)}
                className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white"
              />
            </label>
            <button
              type="button"
              onClick={() => window.open(handoff(), '_blank', 'noopener')}
              className="w-full px-2.5 py-1.5 rounded bg-emerald-600/20 border border-emerald-500/50 text-emerald-200 hover:bg-emerald-600/30 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Compose this in SoundLab
            </button>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => copy(pullUrl(), 'SoundLab piece URL')}
                className="flex-1 px-2 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"
              >
                <Copy className="w-3 h-3" /> Piece URL
              </button>
              <button
                type="button"
                onClick={() => copy(handoff(), 'handoff link')}
                className="flex-1 px-2 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-white text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"
              >
                <Copy className="w-3 h-3" /> Handoff link
              </button>
            </div>
          </div>

          <p className="text-[10px] text-zinc-600 leading-snug flex gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-400/70" />
            SoundLab must be running ({soundlabBase}). Arrangement mode returns chords/sections only — SoundLab plays the loop pocket.
          </p>
        </div>

        {/* Result */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-3 min-h-[220px]">
          {msg && <div className="text-[11px] text-amber-300 font-mono">{msg}</div>}
          {!song && !busy && !msg && (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2 py-12">
              <RefreshCw className="w-6 h-6" />
              <p className="text-[11px] uppercase font-bold tracking-wider">Pick a style and compose a progression</p>
            </div>
          )}
          {song && (
            <>
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                <span>{song.style} · {song.key} · {song.bpm} BPM · {song.bars} bars · seed {song.seed} · {song.mode}</span>
                <span>{song.events} events</span>
              </div>

              <div className="flex flex-wrap gap-1.5" data-music-chords>
                {song.chords.map((c, i) => {
                  const { root, quality } = chordParts(c);
                  return (
                    <span key={`${c}-${i}`} className="px-3 py-2 rounded-lg border border-white/10 bg-black/40 flex flex-col items-center leading-none">
                      <span className="text-lg font-black text-white">{root}</span>
                      <span className="text-[10px] font-mono text-fuchsia-300 mt-0.5">{quality || 'maj'}</span>
                    </span>
                  );
                })}
              </div>

              {summary && (
                <div className="text-[10px] font-mono text-zinc-500">
                  {summary.count} chords · {summary.unique.length} unique · {summary.unique.join('  ')}
                </div>
              )}

              {song.mode === 'arr' && (
                <div className="text-[11px] text-amber-300/90">
                  Sections: {(song.sections ?? []).map((s, i) => `${s.name ?? `S${i + 1}`}${s.bars ? ` (${s.bars}b)` : ''}`).join(' · ') || '—'}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sector evidence (honest) */}
      <div className="text-[10px] text-zinc-600 font-mono">
        sector <span className="text-zinc-400">{MUSIC_SECTOR.id}</span> · verified {String(MUSIC_SECTOR.verified)} · sources: {MUSIC_SECTOR.sources.join(', ')}
      </div>
    </div>
  );
};

export default MusicView;

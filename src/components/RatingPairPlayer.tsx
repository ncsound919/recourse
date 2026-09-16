import React, { useCallback, useMemo, useState } from 'react';
import { Music, Shuffle, Star, Radio, Download, ThumbsUp } from 'lucide-react';
import { sendTrackToWebMidi, isWebMidiAvailable } from '../lib/composer/encode/webmidi';

const STYLES = ['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane'] as const;
type StyleIdLite = (typeof STYLES)[number];

const STYLE_LABEL: Record<StyleIdLite, string> = {
  'steely-dan': 'Steely Dan (jazz-harmony)',
  'jasper-ballad': 'Jasper ballad (quiet-storm)',
  'dangelo-glasper': 'D’Angelo × Glasper (neo-soul)',
  airplane: 'Jefferson Airplane (psych-rock)',
};

interface Props {
  defaultStyle?: StyleIdLite;
  bars?: 4 | 8 | 16;
  onNotify?: (message: string) => void;
}

/**
 * Audible A/B rating loop (Phase 7 actuator): play two deterministic
 * compositions as real rendered WAV audio, rate each, and feed the composer
 * learner. "Send to MIDI" pushes the chosen take to a connected MIDI device.
 */
export const RatingPairPlayer: React.FC<Props> = ({ defaultStyle = 'jasper-ballad', bars = 8, onNotify }) => {
  const [style, setStyle] = useState<StyleIdLite>(defaultStyle);
  const [seedA, setSeedA] = useState(101);
  const [seedB, setSeedB] = useState(202);
  const [ratings, setRatings] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [busy, setBusy] = useState(false);

  const notify = useCallback((m: string) => { onNotify?.(m); }, [onNotify]);

  const wavUrl = useMemo(
    () => (seed: number) => `/api/recourse/compose/wav?style=${encodeURIComponent(style)}&seed=${seed}&bars=${bars}`,
    [style, bars],
  );

  const rate = useCallback(
    async (side: 'a' | 'b', rating: number) => {
      const seed = side === 'a' ? seedA : seedB;
      setRatings((r) => ({ ...r, [side]: rating }));
      try {
        const res = await fetch('/api/recourse/compose/rate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ style, seed, rating, bars }),
        });
        const data = await res.json();
        if (!res.ok || data.success === false) {
          notify(`Rating not recorded: ${data?.error ?? res.status}`);
          return;
        }
        notify(`Recorded: ${style} seed ${seed} → ${rating}/5`);
      } catch (err: any) {
        notify(`Rating failed: ${err?.message ?? String(err)}`);
      }
    },
    [style, bars, seedA, seedB, notify],
  );

  const sendToMidi = useCallback(
    async (seed: number) => {
      if (!isWebMidiAvailable()) {
        notify('Web MIDI is not available in this browser.');
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(`/api/recourse/compose/track.json?style=${encodeURIComponent(style)}&seed=${seed}&bars=${bars}`);
        const track = await res.json();
        const out = await sendTrackToWebMidi(track);
        notify(out.ok ? `Sent ${out.sent} MIDI messages to ${out.outputName}.` : `MIDI send failed: ${out.error}`);
      } catch (err: any) {
        notify(`MIDI send failed: ${err?.message ?? String(err)}`);
      } finally {
        setBusy(false);
      }
    },
    [style, bars, notify],
  );

  const reroll = () => {
    // Deterministic-but-varied: derive the next seeds from the current ones.
    setSeedA((s) => (s * 1664525 + 1013904223) % 100000);
    setSeedB((s) => (s * 22695477 + 1) % 100000);
  };

  const ratingRow = (side: 'a' | 'b') => (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => rate(side, n)}
          className={`w-8 h-8 rounded-lg border text-xs font-mono transition ${
            ratings[side] === n
              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-amber-500/50'
          }`}
          title={`Rate take ${side.toUpperCase()} ${n}/5`}
        >
          {n}
        </button>
      ))}
    </div>
  );

  const take = (side: 'a' | 'b', seed: number) => (
    <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-slate-400">TAKE {side.toUpperCase()} · seed {seed}</span>
        <div className="flex gap-2">
          <a
            href={wavUrl(seed)}
            download={`recourse-${style}-${seed}.wav`}
            className="p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-emerald-400"
            title="Download WAV"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            onClick={() => sendToMidi(seed)}
            disabled={busy}
            className="p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-indigo-400 disabled:opacity-40"
            title="Send to MIDI device"
          >
            <Radio className="w-4 h-4" />
          </button>
        </div>
      </div>
      <audio controls preload="none" className="w-full mb-3" src={wavUrl(seed)} />
      <div className="flex items-center gap-3">
        <ThumbsUp className="w-4 h-4 text-slate-500" />
        {ratingRow(side)}
      </div>
    </div>
  );

  return (
    <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-950/70 border border-amber-700/40 rounded-xl">
            <Music className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm tracking-widest">A/B RATING LOOP</h3>
            <p className="text-[11px] text-slate-400">Listen, rate, and teach the composer. Rendered locally to WAV — no DAW.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as StyleIdLite)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300"
          >
            {STYLES.map((s) => (
              <option key={s} value={s}>{STYLE_LABEL[s]}</option>
            ))}
          </select>
          <button
            onClick={reroll}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 hover:text-amber-400"
          >
            <Shuffle className="w-3.5 h-3.5" /> New pair
          </button>
        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        {take('a', seedA)}
        {take('b', seedB)}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 font-mono">
        <Star className="w-3 h-3" />
        Deterministic: the same style + seed always renders the same audio. Ratings feed the composer learner.
      </div>
    </div>
  );
};

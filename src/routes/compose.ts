/**
 * compose.ts — the composer API (extracted from the `server.ts` monolith).
 *
 * Style-driven original track generation -> .mid / .seq / .wav / stems, plus the
 * learner rating loop and the objective benchmark. The composer learner is
 * resolved lazily via `getLearner()` because the host creates it later in module
 * init. Write routes are guarded by the host's mutation auth.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  composeToOutcome,
  composeArrangement,
  summarizeTrack,
  toMidiBytes,
  seqToJson,
  listStyles,
  runBenchmark as runComposerBenchmark,
  renderBenchmark as renderComposerBenchmark,
  autoRateBenchmark,
  encodeSoundlabPiece,
  validatePiece,
  pieceToJson,
  compose,
  type ComposerLearner,
} from '../lib/composer/index.js';
import { renderTrackToWav, renderStemToWav } from '../lib/composer/encode/wav.js';

export interface ComposeRouterDeps {
  requireMutationAuth: (req: Request, res: Response) => boolean;
  /** Resolved lazily: the host constructs the learner after this module loads. */
  getLearner: () => ComposerLearner;
}

export function createComposeRouter(deps: ComposeRouterDeps): Router {
  const router = Router();
// =========================================================================
// COMPOSER — creative domain. Original tracks "in the vein of" a studied style
// (Steely Dan complexity / Jasper soul ballads / D'Angelo x Glasper neo-soul /
// Jefferson Airplane psych), deterministic per seed. Emits a .mid for the DAW
// and a SoundLab .seq pocket. Writes files => guarded write route.
// =========================================================================

const COMPOSE_DIR = process.env.RECOURSE_COMPOSE_DIR || path.join(process.cwd(), 'composer-out');

function safeSlug(s: string): string {
  return String(s || 'track').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
}

/** Compose an original track. Body mirrors a ComposeBrief. */
router.post('/compose', (req, res) => {
  if (!deps.requireMutationAuth(req, res)) return;
  try {
    const b = req.body ?? {};
    const style = b.style;
    const known = listStyles();
    if (!known.includes(style)) {
      return res.status(400).json({ success: false, error: `style must be one of: ${known.join(', ')}` });
    }
    const brief = {
      style,
      key: typeof b.key === 'number' ? b.key : undefined,
      major: typeof b.major === 'boolean' ? b.major : undefined,
      bpm: typeof b.bpm === 'number' && b.bpm > 0 ? b.bpm : undefined,
      bars: [4, 8, 16].includes(b.bars) ? b.bars : 8,
      seed: typeof b.seed === 'number' ? b.seed : undefined,
      title: typeof b.title === 'string' ? b.title : undefined,
    };

    // Arrangement mode: a non-looping written-out arc (SD charts / Jasper final
    // key-lift). .mid only — SoundLab's .seq can't hold a multi-bar progression.
    if (b.mode === 'arr') {
      const track = composeArrangement({ ...brief, style });
      const dir = path.join(COMPOSE_DIR, safeSlug(style));
      fs.mkdirSync(dir, { recursive: true });
      const base = `${safeSlug(brief.title || `${style}-arr`)}-${brief.seed ?? ''}`;
      const midiFile = path.join(dir, `${base}.mid`);
      fs.writeFileSync(midiFile, toMidiBytes(track));
      return res.json({
        success: true,
        mode: 'arr',
        style: track.style,
        key: track.key,
        bpm: track.bpm,
        bars: track.bars,
        seed: track.seed,
        events: track.events.length,
        sections: track.sections,
        files: { midi: midiFile },
      });
    }

    const out = composeToOutcome(brief, {
      midi: true,
      seq: true,
      // Compose with the learner's current biases unless explicitly bypassed, so
      // the more you rate, the more it steers toward what you like.
      lexicon: req.body?.learn === false ? undefined : deps.getLearner().adjustedLexicon(style),
    });
    const dir = path.join(COMPOSE_DIR, safeSlug(style));
    fs.mkdirSync(dir, { recursive: true });
    const base = `${safeSlug(brief.title || `${style}-${brief.seed ?? 'x'}`)}-${brief.seed ?? ''}`;
    const midiFile = path.join(dir, `${base}.mid`);
    const seqFile = path.join(dir, `${base}.seq`);
    fs.writeFileSync(midiFile, toMidiBytes(out.track));
    fs.writeFileSync(seqFile, seqToJson(out.seq!));
    const summary = summarizeTrack(out);
    fs.writeFileSync(path.join(dir, `${base}.txt`), summary);
    res.json({
      success: true,
      files: { midi: midiFile, seq: seqFile, notes: path.join(dir, `${base}.txt`) },
      style: out.track.style,
      key: out.keyName,
      bpm: out.bpm,
      bars: out.bars,
      seed: out.track.seed,
      chords: out.chordLabels,
      events: out.track.events.length,
      styles: known,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** List supported composer styles (read-only). */
router.get('/compose/styles', (_req, res) => {
  res.json({ success: true, styles: listStyles(), composeDir: COMPOSE_DIR });
});

/** Emit a piece for SoundLab playback (the window.__recourse.load contract).
 *  Guarded write (composes + may save). Returns the JSON the bridge consumes. */
router.post('/compose/soundlab', (req, res) => {
  if (!deps.requireMutationAuth(req, res)) return;
  try {
    const b = req.body ?? {};
    const style = b.style;
    if (!listStyles().includes(style)) return res.status(400).json({ success: false, error: 'unknown style' });
    const brief = {
      style,
      key: typeof b.key === 'number' ? b.key : undefined,
      major: typeof b.major === 'boolean' ? b.major : undefined,
      bpm: typeof b.bpm === 'number' && b.bpm > 0 ? b.bpm : undefined,
      bars: [4, 8, 16].includes(b.bars) ? b.bars : 8,
      seed: typeof b.seed === 'number' ? b.seed : undefined,
      title: typeof b.title === 'string' ? b.title : undefined,
    };
    const track = composeArrangement(brief);
    const piece = encodeSoundlabPiece(track);
    const problems = validatePiece(piece);
    let file: string | undefined;
    const dir = path.join(COMPOSE_DIR, safeSlug(style));
    try {
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, `${safeSlug(brief.title || style)}-${brief.seed ?? 'x'}.soundlab.json`);
      fs.writeFileSync(file, pieceToJson(piece));
    } catch { /* optional write */ }
    res.json({ success: problems.length === 0, valid: problems.length === 0, problems, style, seed: track.seed, file, piece });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** Deterministic piece URL for a running SoundLab page to pull (CORS-open).
 *  Read-only + reproducible per (style, seed). Example:
 *  GET /api/recourse/compose/soundlab.json?style=jasper-ballad&seed=1 */
router.get('/compose/soundlab.json', (req, res) => {
  try {
    const style = typeof req.query.style === 'string' && listStyles().includes(req.query.style as any) ? req.query.style : 'steely-dan';
    const seed = Number(req.query.seed) || 1;
    const bars = [4, 8, 16].includes(Number(req.query.bars)) ? Number(req.query.bars) : 8;
    const track = compose({ style: style as never, seed, bars, title: `${style} pull` });
    const piece = encodeSoundlabPiece(track);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'no-store');
    res.json(piece);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/**
 * Read-only song payload for the SoundLab composer panel: the chord
 * progression + key + BPM, plus the SoundLab-playable piece (loop mode) or the
 * arrangement sections (arr mode). CORS-open like soundlab.json — GET requests
 * are never mutation-gated. Example:
 *   GET /api/recourse/compose/song.json?style=jasper-ballad&seed=1&bars=8&mode=loop
 */
router.get('/compose/song.json', (req, res) => {
  try {
    const style = typeof req.query.style === 'string' && listStyles().includes(req.query.style as any) ? req.query.style : 'steely-dan';
    const seed = Number(req.query.seed) || 1;
    const bars = [4, 8, 16].includes(Number(req.query.bars)) ? Number(req.query.bars) : 8;
    const mode = req.query.mode === 'arr' ? 'arr' : 'loop';
    const keyParam = req.query.key !== undefined && req.query.key !== '' ? Number(req.query.key) : undefined;
    const major = req.query.major === 'true' ? true : req.query.major === 'false' ? false : undefined;
    const bpmParam = req.query.bpm !== undefined && req.query.bpm !== '' ? Number(req.query.bpm) : undefined;
    const brief = {
      style: style as never,
      seed,
      bars,
      title: `${style} ${mode}`,
      ...(keyParam !== undefined && Number.isFinite(keyParam) ? { key: keyParam } : {}),
      ...(major !== undefined ? { major } : {}),
      ...(bpmParam !== undefined && Number.isFinite(bpmParam) && bpmParam > 0 ? { bpm: bpmParam } : {}),
    };
    const track = mode === 'arr' ? composeArrangement(brief) : compose(brief);
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const keyPc = ((track.key % 12) + 12) % 12;
    const chords = track.chords.map((c) => `${names[((c.rootPc % 12) + 12) % 12]}${c.quality}`);
    const payload: Record<string, unknown> = {
      success: true,
      mode,
      style: track.style,
      seed: track.seed,
      bars: track.bars,
      bpm: track.bpm,
      key: `${names[keyPc]}${track.major ? '' : 'm'}`,
      keyPc,
      major: track.major,
      chords,
      events: track.events.length,
    };
    if (mode === 'arr') payload.sections = track.sections ?? [];
    else payload.piece = encodeSoundlabPiece(track);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'no-store');
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/**
 * Offline WAV render (audio actuator). Renders a composed track to real PCM
 * audio — no DAW, no network. Query params mirror `compose/song.json`; add
 * `stem=<part>` to render a single stem.
 *   GET /api/recourse/compose/wav?style=jasper-ballad&seed=1&bars=8
 */
function composeBriefFromQuery(q: Record<string, unknown>) {
  const style = typeof q.style === 'string' && listStyles().includes(q.style as any) ? q.style : 'steely-dan';
  const seed = Number(q.seed) || 1;
  const bars = [4, 8, 16].includes(Number(q.bars)) ? Number(q.bars) : 8;
  const mode = q.mode === 'arr' ? 'arr' : 'loop';
  const keyParam = q.key !== undefined && q.key !== '' ? Number(q.key) : undefined;
  const major = q.major === 'true' ? true : q.major === 'false' ? false : undefined;
  const bpmParam = q.bpm !== undefined && q.bpm !== '' ? Number(q.bpm) : undefined;
  return {
    mode: mode as 'loop' | 'arr',
    brief: {
      style: style as never,
      seed,
      bars,
      title: `${style} ${mode}`,
      ...(keyParam !== undefined && Number.isFinite(keyParam) ? { key: keyParam } : {}),
      ...(major !== undefined ? { major } : {}),
      ...(bpmParam !== undefined && Number.isFinite(bpmParam) && bpmParam > 0 ? { bpm: bpmParam } : {}),
    },
  };
}

router.get('/compose/wav', (req, res) => {
  try {
    const { mode, brief } = composeBriefFromQuery(req.query as Record<string, unknown>);
    const track = mode === 'arr' ? composeArrangement(brief) : compose(brief);
    const stem = typeof req.query.stem === 'string' ? req.query.stem : '';
    const bytes = stem
      ? renderStemToWav(track, stem as never)
      : renderTrackToWav(track);
    const suffix = stem ? `-${stem}` : '';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="recourse-${track.style}${suffix}.wav"`);
    res.setHeader('X-Recourse-Seed', String(track.seed));
    res.send(Buffer.from(bytes));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

router.get('/compose/stems', (req, res) => {
  try {
    const { mode, brief } = composeBriefFromQuery(req.query as Record<string, unknown>);
    const track = mode === 'arr' ? composeArrangement(brief) : compose(brief);
    const parts = Array.from(new Set(track.events.map((e) => e.part)));
    const inline = req.query.inline === '1';
    const stems = parts.map((part) => {
      const wav = renderStemToWav(track, part);
      return {
        part,
        bytes: wav.byteLength,
        ...(inline ? { base64: Buffer.from(wav).toString('base64') } : {}),
      };
    });
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'no-store');
    res.json({ success: true, style: track.style, seed: track.seed, bpm: track.bpm, bars: track.bars, stems, hint: 'GET /api/recourse/compose/wav?stem=<part> for one stem' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** Full realized Track as JSON — consumed by the browser Web MIDI sender. */
router.get('/compose/track.json', (req, res) => {
  try {
    const { mode, brief } = composeBriefFromQuery(req.query as Record<string, unknown>);
    const track = mode === 'arr' ? composeArrangement(brief) : compose(brief);
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'no-store');
    res.json(track);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** Standard MIDI File download (real .mid bytes, importable by any DAW). */
router.get('/compose/midi', (req, res) => {
  try {
    const { mode, brief } = composeBriefFromQuery(req.query as Record<string, unknown>);
    const track = mode === 'arr' ? composeArrangement(brief) : compose(brief);
    const bytes = toMidiBytes(track);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'audio/midi');
    res.setHeader('Content-Disposition', `attachment; filename="recourse-${track.style}-${track.seed}.mid"`);
    res.send(Buffer.from(bytes));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});
router.post('/compose/rate', (req, res) => {
  if (!deps.requireMutationAuth(req, res)) return;
  try {
    const b = req.body ?? {};
    const style = b.style;
    if (!listStyles().includes(style)) return res.status(400).json({ success: false, error: 'unknown style' });
    const rating = Number(b.rating);
    if (!Number.isFinite(rating)) return res.status(400).json({ success: false, error: 'rating must be a number' });
    const seed = Number(b.seed);
    if (!Number.isFinite(seed)) return res.status(400).json({ success: false, error: 'seed must be a number' });
    const bars = [4, 8, 16].includes(b.bars) ? b.bars : 8;
    const episode = deps.getLearner().rate(
      { style, seed, bars, key: b.key, major: b.major, bpm: b.bpm },
      rating,
      Array.isArray(b.tags) ? b.tags.map(String) : undefined,
      typeof b.notes === 'string' ? b.notes : undefined,
    );
    res.json({ success: true, episode });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** Learned quality biases per style (read-only). */
router.get('/compose/learned', (req, res) => {
  const style = typeof req.query.style === 'string' ? req.query.style : undefined;
  if (style && listStyles().includes(style as any)) {
    return res.json({ success: true, style, adjustments: deps.getLearner().adjustmentsFor(style as any), episodes: deps.getLearner().episodesFor(style as any).slice(-20) });
  }
  const leaderboard = deps.getLearner().leaderboard();
  const byStyle = (Object.fromEntries(leaderboard.map((l) => [l.style, deps.getLearner().adjustmentsFor(l.style)])) as Record<string, unknown>);
  res.json({ success: true, styles: listStyles(), leaderboard, adjustments: byStyle });
});

/** Candidate briefs to explore near what you liked (read-only). */
router.get('/compose/suggest', (req, res) => {
  const style = typeof req.query.style === 'string' && listStyles().includes(req.query.style as any) ? req.query.style : 'steely-dan';
  const count = Math.min(10, Number(req.query.count) || 4);
  res.json({ success: true, style, suggestions: deps.getLearner().suggestNext(style as any, count) });
});

/** Objective composer benchmark (read). Grading methodology is documented in
 *  src/lib/composer/benchmark.ts and does NOT claim to grade taste/timbre. */
router.get('/compose/benchmark', (_req, res) => {
  try {
    const report = runComposerBenchmark();
    res.json({ success: true, ...report, markdown: renderComposerBenchmark(report) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/** Run the objective benchmark; optionally auto-rate winners into the learner
 *  so recursion starts without human ears. Guarded write when autoRate is set. */
router.post('/compose/benchmark', (req, res) => {
  const autoRate = req.body?.autoRate === true;
  if (autoRate && !deps.requireMutationAuth(req, res)) return;
  try {
    const styles = Array.isArray(req.body?.styles) ? req.body.styles.filter((s: string) => listStyles().includes(s as any)) : undefined;
    const seeds = Array.isArray(req.body?.seeds) ? req.body.seeds.map(Number).filter((n: number) => Number.isFinite(n)) : undefined;
    const bars = [4, 8, 16].includes(req.body?.bars) ? req.body.bars : 8;
    const report = runComposerBenchmark({ styles, seeds, bars });
    let auto: { pushed: number; details: unknown[] } | undefined;
    if (autoRate) {
      const r = autoRateBenchmark(deps.getLearner(), report, Number(req.body?.minTotal ?? 0.7));
      auto = { pushed: r.pushed, details: r.details };
    }
    res.json({ success: true, ...report, auto, markdown: renderComposerBenchmark(report) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});
  return router;
}

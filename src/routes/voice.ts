/**
 * Voice-clone router — reference-voice profiles + zero-shot speech synthesis.
 *
 * Backs the "speak in my voice" tool: record a clean reference clip in the
 * browser, store it as a named profile, then synthesize narration text through
 * the stateless TTS sidecar (`src/lib/ttsSidecarClient.ts`) in that voice.
 *
 * WHY NOT WEB SPEECH: `window.speechSynthesis` exposes no API to register a
 * custom voice and its output cannot be captured, so it can never actually
 * speak in a cloned voice. Recourse synthesizes real audio instead and plays it
 * back — `src/lib/voiceClone.ts` falls back to Web Speech only when cloning is
 * off or unavailable, and labels that case honestly in the UI.
 *
 * Honesty contract: a synthesis request returns 503 with the sidecar's real
 * reason when no TTS backend is installed. This router never substitutes a
 * different system voice and calls it a clone.
 *
 * All dependencies are injected so the surface is testable without booting the
 * monolith (see `tests/voiceRouter.test.ts`).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  cloneSpeech,
  ttsSidecarHealth,
  validateReferenceVoice,
} from '../lib/ttsSidecarClient.js';
import {
  deleteVoiceProfile,
  getVoiceProfile,
  listVoiceProfiles,
  readReferenceBase64,
  saveVoiceProfile,
} from '../lib/voiceProfileStore.js';

export interface VoiceRouterDeps {
  requireMutationAuth: (req: Request, res: Response) => boolean;
  /** Sidecar health probe (injected so tests are hermetic). */
  health?: typeof ttsSidecarHealth;
  /** Reference-clip probe (injected so tests are hermetic). */
  validateReference?: typeof validateReferenceVoice;
  /** Zero-shot synthesis call (injected so tests are hermetic). */
  synthesize?: typeof cloneSpeech;
}

/** Mirrors the sidecar's own cap so oversized text is a clean 413, not a proxy 503. */
const MAX_SPEAK_CHARS = 5000;
const MAX_REFERENCE_TEXT_CHARS = 2000;
const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

export function createVoiceRouter(deps: VoiceRouterDeps): Router {
  const router = Router();
  const health = deps.health ?? ttsSidecarHealth;
  const probe = deps.validateReference ?? validateReferenceVoice;
  const synthesize = deps.synthesize ?? cloneSpeech;

  router.get('/voice/status', async (_req, res) => {
    const [sidecar, profiles] = await Promise.all([health(), Promise.resolve(listVoiceProfiles())]);
    res.json({
      success: true,
      sidecar: {
        online: sidecar.ok,
        ttsAvailable: sidecar.ttsAvailable ?? false,
        engines: sidecar.engines ?? [],
        defaultEngine: sidecar.defaultEngine ?? null,
        device: sidecar.device ?? null,
        latencyMs: sidecar.latencyMs ?? null,
        error: sidecar.error ?? null,
      },
      profileCount: profiles.length,
      profiles,
    });
  });

  router.get('/voice/profiles', (_req, res) => {
    const profiles = listVoiceProfiles();
    res.json({ success: true, count: profiles.length, profiles });
  });

  router.post('/voice/profiles', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const { name, referenceBase64, filename, language, referenceText, durationSec, sampleRate } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: 'name (string) required' });
      }
      if (typeof referenceBase64 !== 'string' || !referenceBase64) {
        return res.status(400).json({ success: false, error: 'referenceBase64 (string) required' });
      }
      if (typeof referenceText === 'string' && referenceText.length > MAX_REFERENCE_TEXT_CHARS) {
        return res.status(413).json({
          success: false,
          error: `referenceText exceeds ${MAX_REFERENCE_TEXT_CHARS} characters`,
        });
      }

      const profile = saveVoiceProfile({
        name,
        referenceBase64,
        ...(typeof filename === 'string' ? { filename } : {}),
        ...(typeof language === 'string' ? { language } : {}),
        ...(typeof referenceText === 'string' ? { referenceText } : {}),
        ...(typeof durationSec === 'number' ? { durationSec } : {}),
        ...(typeof sampleRate === 'number' ? { sampleRate } : {}),
      });

      // Validation is advisory: the clip is already durable, so report the
      // probe result (or its absence) rather than refusing the save.
      const validation = await probe(referenceBase64, { timeoutMs: 15000 });
      res.json({
        success: true,
        profile,
        validated: validation.ok,
        suitable: validation.suitable ?? null,
        validationReason: validation.reason ?? null,
        validationError: validation.ok ? null : validation.error ?? 'validation unavailable',
      });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? 'failed to save voice profile' });
    }
  });

  router.delete('/voice/profiles/:id', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const removed = deleteVoiceProfile(String(req.params.id));
    if (!removed) return res.status(404).json({ success: false, error: 'voice profile not found' });
    res.json({ success: true, id: req.params.id });
  });

  router.post('/voice/speak', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const { text, profileId, engine, language, speed } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'text (string) required' });
    }
    if (text.length > MAX_SPEAK_CHARS) {
      return res.status(413).json({ success: false, error: `text exceeds ${MAX_SPEAK_CHARS} characters` });
    }
    if (typeof profileId !== 'string' || !profileId) {
      return res.status(400).json({ success: false, error: 'profileId (string) required' });
    }

    const profile = getVoiceProfile(profileId);
    if (!profile) return res.status(404).json({ success: false, error: 'voice profile not found' });

    const referenceBase64 = readReferenceBase64(profileId);
    if (!referenceBase64) {
      return res.status(404).json({ success: false, error: 'reference clip for this profile is missing on disk' });
    }

    // Clamp rather than reject: a slightly out-of-range speed is a UI rounding
    // issue, not a client error, and the models reject 0/negative values.
    const clampSpeed =
      typeof speed === 'number' && Number.isFinite(speed)
        ? Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED)
        : undefined;

    const result = await synthesize(text, referenceBase64, {
      language: typeof language === 'string' ? language : profile.language,
      ...(typeof engine === 'string' ? { engine } : {}),
      ...(clampSpeed !== undefined ? { speed: clampSpeed } : {}),
      ...(profile.referenceText ? { referenceText: profile.referenceText } : {}),
      referenceFilename: profile.filename,
    });

    if (!result.ok) {
      const reason = result.reason ?? result.error ?? 'voice synthesis unavailable';
      return res.status(503).json({ success: false, error: reason, profileId, latencyMs: result.latencyMs ?? null });
    }

    res.json({
      success: true,
      profileId,
      engine: result.engine,
      mime: result.mime,
      sampleRate: result.sampleRate,
      durationSec: result.durationSec,
      chars: result.chars,
      latencyMs: result.latencyMs,
      audioBase64: result.audioBase64,
    });
  });

  return router;
}

/**
 * Voice-profile store — durable, file-backed registry of reference voice clips.
 *
 * The zero-shot TTS sidecar is stateless, so Recourse owns the reference audio:
 *   data/voice-profiles/index.json   metadata (newest-first)
 *   data/voice-profiles/<id>.wav     the reference clip (mono PCM WAV)
 *
 * `id` is a generated UUID and is validated before ever being joined into a
 * path (blocks traversal). Missing/corrupt files degrade to explicit empty/null
 * — a profile never silently resolves to someone else's voice.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJsonFile, writeJsonFile } from './durableJson.js';

const INDEX_CAP = 100;
const MAX_REFERENCE_BYTES = 25 * 1024 * 1024;
const MAX_NAME_CHARS = 80;
const MAX_REFERENCE_TEXT_CHARS = 2000;
const MIN_WAV_BYTES = 44;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Decode and validate a reference clip.
 *
 * `Buffer.from(x, 'base64')` never throws — it silently drops invalid
 * characters — so validation is explicit. The RIFF/WAVE check matters because
 * a stored clip that is not really a WAV can never be synthesized from: better
 * to reject it at save time than to keep a profile that always fails.
 */
function decodeReference(referenceBase64: string): Buffer {
  const trimmed = referenceBase64.trim();
  if (!trimmed) throw new Error('reference clip is empty');
  if (trimmed.length % 4 !== 0 || !BASE64_RE.test(trimmed)) {
    throw new Error('referenceBase64 is not valid base64');
  }
  const bytes = Buffer.from(trimmed, 'base64');
  if (bytes.length === 0) throw new Error('reference clip is empty');
  if (bytes.length > MAX_REFERENCE_BYTES) throw new Error('reference clip too large');
  if (
    bytes.length < MIN_WAV_BYTES ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('reference clip must be a WAV file (RIFF/WAVE header not found)');
  }
  return bytes;
}

export interface VoiceProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  language: string;
  filename: string;
  referenceText?: string;
  bytes: number;
  durationSec?: number;
  sampleRate?: number;
}

export interface SaveVoiceProfileInput {
  name: string;
  referenceBase64: string;
  filename?: string;
  language?: string;
  referenceText?: string;
  durationSec?: number;
  sampleRate?: number;
}

export function voiceProfileDir(): string {
  return process.env.VOICE_PROFILE_DIR || path.join(process.cwd(), 'data', 'voice-profiles');
}

function indexPath(): string {
  return path.join(voiceProfileDir(), 'index.json');
}

function referencePath(id: string): string {
  return path.join(voiceProfileDir(), `${id}.wav`);
}

function readIndex(): VoiceProfileMeta[] {
  const raw = readJsonFile<VoiceProfileMeta[]>(indexPath(), []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((p) => p && typeof p.id === 'string' && ID_RE.test(p.id));
}

function writeIndex(entries: VoiceProfileMeta[]): void {
  writeJsonFile(indexPath(), entries.slice(0, INDEX_CAP));
}

export function listVoiceProfiles(): VoiceProfileMeta[] {
  return readIndex();
}

export function getVoiceProfile(id: string): VoiceProfileMeta | undefined {
  if (!ID_RE.test(id)) return undefined;
  return readIndex().find((p) => p.id === id);
}

export function saveVoiceProfile(input: SaveVoiceProfileInput): VoiceProfileMeta {
  const name = (input.name || '').trim();
  if (!name) throw new Error('name is required');
  if (name.length > MAX_NAME_CHARS) throw new Error(`name exceeds ${MAX_NAME_CHARS} characters`);
  if (!input.referenceBase64) throw new Error('referenceBase64 is required');
  if (input.referenceText && input.referenceText.length > MAX_REFERENCE_TEXT_CHARS) {
    throw new Error(`referenceText exceeds ${MAX_REFERENCE_TEXT_CHARS} characters`);
  }

  const bytes = decodeReference(input.referenceBase64);

  const now = Date.now();
  const existing = readIndex().find((p) => p.name.toLowerCase() === name.toLowerCase());
  const id = existing?.id ?? randomUUID();

  fs.mkdirSync(voiceProfileDir(), { recursive: true });
  const tmp = `${referencePath(id)}.tmp`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, referencePath(id));

  const meta: VoiceProfileMeta = {
    id,
    name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    language: input.language || 'en',
    filename: input.filename || `${id}.wav`,
    bytes: bytes.length,
    ...(input.referenceText ? { referenceText: input.referenceText } : {}),
    ...(typeof input.durationSec === 'number' ? { durationSec: input.durationSec } : {}),
    ...(typeof input.sampleRate === 'number' ? { sampleRate: input.sampleRate } : {}),
  };

  const rest = readIndex().filter((p) => p.id !== id);
  writeIndex([meta, ...rest]);
  return meta;
}

export function deleteVoiceProfile(id: string): boolean {
  if (!ID_RE.test(id)) return false;
  const entries = readIndex();
  const next = entries.filter((p) => p.id !== id);
  if (next.length === entries.length) return false;
  writeIndex(next);
  try {
    fs.unlinkSync(referencePath(id));
  } catch {
    /* clip already gone — metadata removal still counts */
  }
  return true;
}

/** Read a stored reference clip as base64; null when absent (never guessed). */
export function readReferenceBase64(id: string): string | null {
  if (!ID_RE.test(id)) return null;
  try {
    if (!fs.existsSync(referencePath(id))) return null;
    return fs.readFileSync(referencePath(id)).toString('base64');
  } catch {
    return null;
  }
}

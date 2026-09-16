/**
 * skillRegistry.ts — a signed, versioned index of distributable skills
 * (Wave 3). Exports were local folders with no signature, license, or index;
 * this is the registry they can be published to and discovered from.
 *
 * Entries are HMAC-signed (same contract as plugin manifests). Verification is
 * honest: with no `RECOURSE_SKILL_SECRET` configured, an entry is stored but
 * reported `signed:false` rather than trusted.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './durableJson';
import { sha256Hex, pluginSecret } from './pluginSdk';

export interface SkillRegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  domain?: string;
  /** Verified registry tool this skill was exported from, when applicable. */
  toolName?: string;
  sourceHash?: string;
  license?: string;
  author?: string;
  publishedAt: number;
  /** HMAC-SHA256 over the canonical fields below. */
  signature?: string;
}

export function skillSecret(): string | null {
  const s = process.env.RECOURSE_SKILL_SECRET;
  return s && s.trim() ? s.trim() : pluginSecret();
}

export function canonicalSkillEntry(e: SkillRegistryEntry): string {
  const ordered = {
    id: e.id,
    name: e.name,
    version: e.version,
    description: e.description,
    domain: e.domain ?? null,
    toolName: e.toolName ?? null,
    sourceHash: e.sourceHash ?? null,
    license: e.license ?? null,
    author: e.author ?? null,
    publishedAt: e.publishedAt,
  };
  return JSON.stringify(ordered, Object.keys(ordered).sort());
}

export function signSkillEntry(
  e: SkillRegistryEntry,
  secret: string | null = skillSecret(),
): { ok: true; entry: SkillRegistryEntry } | { ok: false; error: string } {
  if (!secret) return { ok: false, error: 'no skill signing secret configured; entry will be unsigned' };
  const signature = crypto.createHmac('sha256', secret).update(canonicalSkillEntry(e)).digest('hex');
  return { ok: true, entry: { ...e, signature } };
}

export function verifySkillEntry(
  e: SkillRegistryEntry,
  secret: string | null = skillSecret(),
): { signed: boolean; valid: boolean; reason?: string } {
  if (!e.signature) return { signed: false, valid: false, reason: 'unsigned skill entry' };
  if (!secret) return { signed: true, valid: false, reason: 'no signing secret configured; cannot verify' };
  const expected = crypto.createHmac('sha256', secret).update(canonicalSkillEntry(e)).digest('hex');
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(e.signature, 'utf-8');
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { signed: true, valid, reason: valid ? undefined : 'signature mismatch' };
}

interface SkillRegistryDoc {
  version: number;
  entries: SkillRegistryEntry[];
}

export function skillRegistryFile(): string {
  return process.env.RECOURSE_SKILL_REGISTRY_FILE || path.join(process.cwd(), 'data', 'skill-registry.json');
}

export interface PublishInput {
  id: string;
  name: string;
  version: string;
  description: string;
  domain?: string;
  toolName?: string;
  source?: string;
  license?: string;
  author?: string;
}

export interface SkillRegistry {
  file(): string;
  publish(input: PublishInput): { ok: boolean; entry?: SkillRegistryEntry; signed: boolean; error?: string };
  list(): SkillRegistryEntry[];
  get(id: string): SkillRegistryEntry | undefined;
  revoke(id: string): { ok: boolean; error?: string };
  verify(id: string): { found: boolean; signed: boolean; valid: boolean; reason?: string };
}

export function openSkillRegistry(file = skillRegistryFile()): SkillRegistry {
  let doc = readJsonFile<SkillRegistryDoc>(file, { version: 1, entries: [] });
  if (!doc || !Array.isArray(doc.entries)) doc = { version: 1, entries: [] };
  const persist = () => writeJsonFile(file, doc);

  return {
    file: () => file,
    publish(input) {
      if (!input.id || !input.name || !input.version) return { ok: false, signed: false, error: 'id, name and version are required' };
      const base: SkillRegistryEntry = {
        id: input.id,
        name: input.name,
        version: input.version,
        description: input.description ?? '',
        domain: input.domain,
        toolName: input.toolName,
        sourceHash: input.source ? sha256Hex(input.source) : undefined,
        license: input.license,
        author: input.author,
        publishedAt: Date.now(),
      };
      const signedResult = signSkillEntry(base);
      const entry = 'entry' in signedResult ? signedResult.entry : base;
      const existing = doc.entries.findIndex((e) => e.id === entry.id);
      if (existing >= 0) doc.entries[existing] = entry;
      else doc.entries.push(entry);
      persist();
      return { ok: true, entry, signed: 'entry' in signedResult };
    },
    list() {
      return [...doc.entries].sort((a, b) => a.id.localeCompare(b.id)).map((e) => ({ ...e }));
    },
    get(id) {
      const e = doc.entries.find((x) => x.id === id);
      return e ? { ...e } : undefined;
    },
    revoke(id) {
      const before = doc.entries.length;
      doc.entries = doc.entries.filter((e) => e.id !== id);
      if (doc.entries.length === before) return { ok: false, error: `no skill "${id}"` };
      persist();
      return { ok: true };
    },
    verify(id) {
      const e = doc.entries.find((x) => x.id === id);
      if (!e) return { found: false, signed: false, valid: false, reason: 'not found' };
      const v = verifySkillEntry(e);
      return { found: true, ...v };
    },
  };
}

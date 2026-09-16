/**
 * targets.ts — where a published article is delivered.
 *
 * Three target kinds cover the real channels without inventing integrations:
 *   - file:        write markdown to a directory (blog repo, static site, docs)
 *   - webhook:     POST the article JSON to a configured URL (newsletter/blog
 *                  platform endpoint, CMS, Zapier/n8n, etc.)
 *   - global_lens: reuse Recourse's existing Global Lens bridge
 *
 * A per-article/target delivery log makes publish passes idempotent: the same
 * content hash is never re-delivered to the same target. Every delivery result
 * is honest — an unreachable webhook is `ok:false` with the transport error,
 * never a claimed success.
 */
import fs from 'node:fs';
import path from 'node:path';
import { canonicalize, sha256Hex } from '../federation/canonical.js';
import { readJsonFile, writeJsonFile } from '../durableJson.js';
import { renderArticleMarkdown, type PublicArticle } from './articles.js';

export type PublishTargetKind = 'file' | 'webhook' | 'global_lens';
const KINDS: readonly PublishTargetKind[] = ['file', 'webhook', 'global_lens'];

export interface PublishTarget {
  id: string;
  kind: PublishTargetKind;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: number;
}

export interface PublishTargetInput {
  id?: string;
  kind: PublishTargetKind;
  name?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export function targetsFile(): string {
  return process.env.RECOURSE_PUBLISH_TARGETS_FILE || path.join(process.cwd(), 'data', 'publishing', 'targets.json');
}

export function deliveriesFile(): string {
  return process.env.RECOURSE_PUBLISH_DELIVERIES_FILE || path.join(process.cwd(), 'data', 'publishing', 'deliveries.jsonl');
}

export function outDir(): string {
  return process.env.RECOURSE_PUBLISH_OUT_DIR || path.join(process.cwd(), 'data', 'publishing', 'out');
}

interface TargetDoc {
  version: 1;
  targets: PublishTarget[];
}

function loadDoc(file: string): TargetDoc {
  const doc = readJsonFile<TargetDoc>(file, { version: 1, targets: [] });
  if (!doc || !Array.isArray(doc.targets)) return { version: 1, targets: [] };
  return { version: 1, targets: doc.targets.filter((t) => t && typeof t.id === 'string') };
}

export interface PublishTargetStore {
  file(): string;
  list(): PublishTarget[];
  enabled(): PublishTarget[];
  get(id: string): PublishTarget | undefined;
  upsert(input: PublishTargetInput, now?: number): PublishTarget;
  remove(id: string): boolean;
  setEnabled(id: string, enabled: boolean): PublishTarget | undefined;
}

export function openPublishTargetStore(file = targetsFile()): PublishTargetStore {
  const save = (doc: TargetDoc): void => writeJsonFile(file, doc);
  return {
    file: () => file,
    list: () => loadDoc(file).targets.slice().sort((a, b) => a.createdAt - b.createdAt),
    enabled: () => loadDoc(file).targets.filter((t) => t.enabled).sort((a, b) => a.createdAt - b.createdAt),
    get: (id) => loadDoc(file).targets.find((t) => t.id === id),
    upsert(input, now = Date.now()) {
      if (!KINDS.includes(input.kind)) throw new Error(`unknown target kind: ${input.kind}`);
      const config = input.config ?? {};
      if (input.kind === 'webhook' && !config.url) throw new Error('webhook target requires config.url');
      const doc = loadDoc(file);
      const id = input.id ? String(input.id) : `pt_${sha256Hex(`${input.kind}:${input.name ?? ''}:${now}`).slice(0, 12)}`;
      const existing = doc.targets.find((t) => t.id === id);
      const target: PublishTarget = {
        id,
        kind: input.kind,
        name: String(input.name ?? '').trim() || `${input.kind}:${id.slice(-4)}`,
        enabled: input.enabled !== false,
        config,
        createdAt: existing?.createdAt ?? now,
      };
      if (existing) Object.assign(existing, target);
      else doc.targets.push(target);
      save(doc);
      return target;
    },
    remove(id) {
      const doc = loadDoc(file);
      const before = doc.targets.length;
      doc.targets = doc.targets.filter((t) => t.id !== id);
      if (doc.targets.length === before) return false;
      save(doc);
      return true;
    },
    setEnabled(id, enabled) {
      const doc = loadDoc(file);
      const t = doc.targets.find((x) => x.id === id);
      if (!t) return undefined;
      t.enabled = enabled;
      save(doc);
      return { ...t };
    },
  };
}

// ---------------------------------------------------------------------------
// Delivery log
// ---------------------------------------------------------------------------

export interface PublishDelivery {
  targetId: string;
  targetName: string;
  kind: PublishTargetKind;
  articleSlug: string;
  contentHash: string;
  ok: boolean;
  status: number;
  externalId?: string;
  error?: string;
  at: number;
}

export interface DeliveryLog {
  file(): string;
  record(delivery: PublishDelivery): void;
  recent(limit?: number): PublishDelivery[];
  forArticle(slug: string): PublishDelivery[];
  hasDelivered(contentHash: string, targetId: string): boolean;
}

export function openDeliveryLog(file = deliveriesFile()): DeliveryLog {
  const read = (): PublishDelivery[] => {
    try {
      if (!fs.existsSync(file)) return [];
      const raw = fs.readFileSync(file, 'utf-8').trim();
      if (!raw) return [];
      const out: PublishDelivery[] = [];
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as PublishDelivery;
          if (d && typeof d.contentHash === 'string') out.push(d);
        } catch { /* skip malformed */ }
      }
      return out;
    } catch {
      return [];
    }
  };
  return {
    file: () => file,
    record(delivery) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify(delivery) + '\n', 'utf-8');
    },
    recent: (limit = 50) => read().slice(-Math.max(1, limit)).reverse(),
    forArticle: (slug) => read().filter((d) => d.articleSlug === slug),
    hasDelivered: (contentHash, targetId) => read().some((d) => d.ok && d.contentHash === contentHash && d.targetId === targetId),
  };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export type FetchLike = typeof fetch;

export interface PublishContext {
  fetchImpl?: FetchLike;
  now?: number;
  timeoutMs?: number;
  /** Global Lens bridge publisher (injected by the server). */
  globalLensPublish?: (article: PublicArticle, target: PublishTarget) => Promise<{ ok: boolean; inserted?: boolean; error?: string }>;
}

async function fetchWithTimeout(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function deliverToTarget(
  target: PublishTarget,
  article: PublicArticle,
  ctx: PublishContext = {},
): Promise<PublishDelivery> {
  const now = ctx.now ?? Date.now();
  const base: Omit<PublishDelivery, 'ok' | 'status'> = {
    targetId: target.id,
    targetName: target.name,
    kind: target.kind,
    articleSlug: article.slug,
    contentHash: article.contentHash,
    at: now,
  };

  if (target.kind === 'file') {
    const dir = String(target.config.dir ?? path.join(outDir(), target.id));
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${article.slug}.md`);
      fs.writeFileSync(file, renderArticleMarkdown(article), 'utf-8');
      return { ...base, ok: true, status: 200, externalId: file };
    } catch (e: any) {
      return { ...base, ok: false, status: 0, error: e?.message || 'file write failed' };
    }
  }

  if (target.kind === 'webhook') {
    const url = String(target.config.url ?? '');
    const fetchImpl = ctx.fetchImpl ?? fetch;
    try {
      const res = await fetchWithTimeout(fetchImpl, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(target.config.headers as Record<string, string> | undefined) },
        body: JSON.stringify({ article: { ...article, markdown: renderArticleMarkdown(article) } }),
      }, ctx.timeoutMs ?? 10_000);
      const text = await res.text().catch(() => '');
      let externalId: string | undefined;
      try { externalId = JSON.parse(text)?.id; } catch { externalId = undefined; }
      return res.ok
        ? { ...base, ok: true, status: res.status, externalId }
        : { ...base, ok: false, status: res.status, error: `webhook HTTP ${res.status}: ${text.slice(0, 200)}` };
    } catch (e: any) {
      return { ...base, ok: false, status: 0, error: e?.message || 'webhook failed' };
    }
  }

  // global_lens
  if (!ctx.globalLensPublish) {
    return { ...base, ok: false, status: 0, error: 'global lens publisher not configured' };
  }
  try {
    const r = await ctx.globalLensPublish(article, target);
    return r.ok
      ? { ...base, ok: true, status: 200, externalId: r.inserted === false ? 'deduped' : 'published' }
      : { ...base, ok: false, status: 0, error: r.error || 'global lens publish failed' };
  } catch (e: any) {
    return { ...base, ok: false, status: 0, error: e?.message || 'global lens publish threw' };
  }
}

/** Stable idempotency key for a (target, content) pair. */
export function deliveryKey(article: PublicArticle, target: PublishTarget): string {
  return sha256Hex(canonicalize({ target: target.id, hash: article.contentHash })).slice(0, 32);
}

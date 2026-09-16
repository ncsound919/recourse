/**
 * articles.ts — durable public-article store for the publishing surface.
 *
 * Articles are the unit of "going public": a title/body with a summary, tags
 * and a visibility that the paywall enforces. Each article is content-addressed
 * by a hash of its mutable content so publish passes can be idempotent and
 * readers can be told when an article changed.
 *
 * Honesty: nothing is published implicitly. `save` writes a draft; an article
 * gets a `publishedAt` only when `publish` is called explicitly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { canonicalize, sha256Hex } from '../federation/canonical.js';
import { readJsonFile, writeJsonFile } from '../durableJson.js';

export type ArticleVisibility = 'public' | 'subscriber' | 'private';

export interface PublicArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  visibility: ArticleVisibility;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  contentHash: string;
  author?: string;
  coverImage?: string;
}

export interface ArticleInput {
  title: string;
  body: string;
  slug?: string;
  summary?: string;
  tags?: string[];
  visibility?: ArticleVisibility;
  author?: string;
  coverImage?: string;
}

const VISIBILITIES: readonly ArticleVisibility[] = ['public', 'subscriber', 'private'];
export const MAX_ARTICLE_BODY = 200_000;

export function articlesDir(): string {
  return process.env.RECOURSE_PUBLISH_DIR || path.join(process.cwd(), 'data', 'publishing', 'articles');
}

export function slugifyTitle(title: string): string {
  const slug = String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'article';
}

/** Content hash over the mutable fields — changes iff the published content does. */
export function articleContentHash(input: Pick<ArticleInput, 'title' | 'summary' | 'body' | 'tags' | 'visibility'>): string {
  return sha256Hex(canonicalize({
    title: input.title,
    summary: input.summary ?? '',
    body: input.body,
    tags: [...(input.tags ?? [])].sort(),
    visibility: input.visibility ?? 'public',
  }));
}

export interface ArticleValidation {
  ok: boolean
  errors: string[];
  article?: Omit<PublicArticle, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'contentHash'>;
}

export function validateArticleInput(input: Partial<ArticleInput>): ArticleValidation {
  const errors: string[] = [];
  const title = String(input.title ?? '').trim();
  const body = String(input.body ?? '').trim();
  if (!title) errors.push('title is required');
  if (!body) errors.push('body is required');
  if (body.length > MAX_ARTICLE_BODY) errors.push(`body exceeds ${MAX_ARTICLE_BODY} chars`);
  const visibility = (input.visibility ?? 'public') as ArticleVisibility;
  if (!VISIBILITIES.includes(visibility)) errors.push('visibility must be public|subscriber|private');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    article: {
      slug: input.slug ? slugifyTitle(input.slug) : slugifyTitle(title),
      title,
      summary: String(input.summary ?? '').trim(),
      body,
      tags: Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean) : [],
      visibility,
      author: input.author ? String(input.author) : undefined,
      coverImage: input.coverImage ? String(input.coverImage) : undefined,
    },
  };
}

function articlePath(dir: string, slug: string): string {
  return path.join(dir, `${slug}.json`);
}

export interface ArticleStore {
  dir(): string;
  list(): PublicArticle[];
  get(slug: string): PublicArticle | undefined;
  save(input: ArticleInput, now?: number): PublicArticle;
  publish(slug: string, now?: number): PublicArticle | undefined;
  remove(slug: string): boolean;
  /** Published articles with `public` visibility, newest first. */
  publicList(): PublicArticle[];
}

export function openArticleStore(dir = articlesDir()): ArticleStore {
  const readAll = (): PublicArticle[] => {
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const out: PublicArticle[] = [];
    for (const f of files) {
      const a = readJsonFile<PublicArticle | null>(path.join(dir, f), null);
      if (a && typeof a.slug === 'string' && typeof a.title === 'string') out.push(a);
    }
    return out;
  };

  const write = (article: PublicArticle): void => {
    fs.mkdirSync(dir, { recursive: true });
    writeJsonFile(articlePath(dir, article.slug), article);
  };

  return {
    dir: () => dir,
    list: () => readAll().sort((a, b) => b.updatedAt - a.updatedAt),
    get: (slug) => readAll().find((a) => a.slug === slug),
    save(input, now = Date.now()) {
      const existing = readAll().find((a) => a.slug === (input.slug ? slugifyTitle(input.slug) : slugifyTitle(input.title)));
      const validation = validateArticleInput({ ...input, slug: existing?.slug ?? input.slug });
      if (!validation.ok || !validation.article) throw new Error(validation.errors.join('; '));
      const a = validation.article;
      const article: PublicArticle = {
        id: existing?.id ?? `art_${sha256Hex(`${a.slug}:${now}`).slice(0, 16)}`,
        ...a,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        publishedAt: existing?.publishedAt,
        contentHash: articleContentHash(a),
      };
      write(article);
      return article;
    },
    publish(slug, now = Date.now()) {
      const article = readAll().find((a) => a.slug === slug);
      if (!article) return undefined;
      const published: PublicArticle = { ...article, publishedAt: article.publishedAt ?? now, updatedAt: now };
      write(published);
      return published;
    },
    remove(slug) {
      const file = articlePath(dir, slug);
      if (!fs.existsSync(file)) return false;
      fs.rmSync(file, { force: true });
      return true;
    },
    publicList: () => readAll()
      .filter((a) => a.visibility === 'public' && a.publishedAt !== undefined)
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)),
  };
}

/** Deterministic markdown rendering (used by the file/webhook publish targets). */
export function renderArticleMarkdown(article: PublicArticle): string {
  const L: string[] = [];
  L.push(`# ${article.title}`);
  L.push('');
  if (article.summary) {
    L.push(`> ${article.summary}`);
    L.push('');
  }
  L.push(article.body.trim());
  L.push('');
  if (article.tags.length) L.push(`Tags: ${article.tags.join(', ')}`);
  L.push(`Slug: ${article.slug} · visibility: ${article.visibility} · hash: ${article.contentHash.slice(0, 16)}`);
  return L.join('\n');
}

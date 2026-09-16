/**
 * Reporter store — durable archive of Recourse's self-written articles.
 *
 * File-backed and dependency-free (the pattern used by researchReports.ts):
 *   data/reports/reporter/<fingerprint>.json   full article
 *   data/reports/reporter/<fingerprint>.md     canonical markdown
 *   data/reports/reporter/index.json           newest-first index (capped)
 *   data/reports/reporter/latest.json/.md      most recent article
 *
 * Because the article fingerprint is a content address, re-writing the same
 * state overwrites the same file and updates (never duplicates) the index.
 * Corrupt or absent files degrade to explicit empty/`null` — never fabricated.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ReporterArticle } from './selfReporter.js';

const INDEX_CAP = 200;

export interface ReporterIndexEntry {
  fingerprint: string;
  id: string;
  title: string;
  headline: string;
  generatedAt: number;
  wordCount: number;
  hasNarration: boolean;
}

export function reporterDir(): string {
  return process.env.REPORTER_DIR || path.join(process.cwd(), 'data', 'reports', 'reporter');
}

function indexPath(): string {
  return path.join(reporterDir(), 'index.json');
}

/** Only accept 64-char lowercase hex (a sha256). Blocks path traversal. */
function isFingerprint(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function loadIndex(): ReporterIndexEntry[] {
  const raw = readJson<unknown>(indexPath());
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is ReporterIndexEntry =>
      Boolean(e) && typeof e === 'object' &&
      isFingerprint((e as ReporterIndexEntry).fingerprint) &&
      typeof (e as ReporterIndexEntry).title === 'string',
  );
}

function saveIndex(index: ReporterIndexEntry[]): void {
  fs.writeFileSync(indexPath(), JSON.stringify(index.slice(0, INDEX_CAP), null, 2), 'utf-8');
}

function toIndexEntry(article: ReporterArticle): ReporterIndexEntry {
  return {
    fingerprint: article.fingerprint,
    id: article.id,
    title: article.title,
    headline: article.headline,
    generatedAt: article.generatedAt,
    wordCount: article.wordCount,
    hasNarration: Boolean(article.narration?.prose),
  };
}

export interface ReporterSaveResult {
  files: string[];
  deduped: boolean;
}

/**
 * Persist an article. Same fingerprint ⇒ same file (index entry refreshed),
 * not a duplicate. Returns the written paths and whether the content address
 * already existed.
 */
export function saveReporterArticle(article: ReporterArticle): ReporterSaveResult {
  const dir = reporterDir();
  fs.mkdirSync(dir, { recursive: true });

  const jsonFile = path.join(dir, `${article.fingerprint}.json`);
  const mdFile = path.join(dir, `${article.fingerprint}.md`);
  const deduped = fs.existsSync(jsonFile);

  fs.writeFileSync(jsonFile, JSON.stringify(article, null, 2), 'utf-8');
  fs.writeFileSync(mdFile, article.markdown, 'utf-8');
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(article, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'latest.md'), article.markdown, 'utf-8');

  const index = loadIndex().filter((e) => e.fingerprint !== article.fingerprint);
  index.unshift(toIndexEntry(article));
  index.sort((a, b) => b.generatedAt - a.generatedAt);
  saveIndex(index);

  return { files: [jsonFile, mdFile, path.join(dir, 'latest.json'), path.join(dir, 'latest.md')], deduped };
}

export function latestReporterArticle(): ReporterArticle | null {
  return readJson<ReporterArticle>(path.join(reporterDir(), 'latest.json'));
}

export function getReporterArticle(fingerprint: string): ReporterArticle | null {
  if (!isFingerprint(fingerprint)) return null;
  return readJson<ReporterArticle>(path.join(reporterDir(), `${fingerprint}.json`));
}

export function listReporterArticles(limit = 20): ReporterIndexEntry[] {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(limit, INDEX_CAP) : 20;
  return loadIndex().slice(0, cap);
}

export function reporterStatus(): {
  dir: string;
  articleCount: number;
  latestFingerprint: string | null;
  latestGeneratedAt: number | null;
} {
  const latest = latestReporterArticle();
  return {
    dir: reporterDir(),
    articleCount: loadIndex().length,
    latestFingerprint: latest?.fingerprint ?? null,
    latestGeneratedAt: latest?.generatedAt ?? null,
  };
}

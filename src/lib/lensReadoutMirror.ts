/**
 * lensReadoutMirror.ts — keep a local copy of Global Lens oncology readouts inside
 * the Oncology Ecosystem tree (<Ecosystem>/lens-readouts), so the orchestrator and
 * the weekly compiler can read what Lens was sent without calling Lens.
 *
 * A mirror file records the publish outcome (published / failed + reason) next to
 * the article body. It never claims "published" unless Lens confirmed it.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ONCOLOGY_DIR = 'C:\\Users\\User\\Downloads\\BUSINESS\\SCIENCE\\Oncology Ecosystem';

export function oncologyReadoutsDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ONCOLOGY_LENS_READOUTS_DIR || path.join(env.ONCOLOGY_ECOSYSTEM_PATH || DEFAULT_ONCOLOGY_DIR, 'lens-readouts');
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'readout';
}

export interface ReadoutMeta {
  source: string; // e.g. 'global-lens-publish' | 'daily-science'
  published?: boolean;
  inserted?: boolean;
  error?: string;
  url?: string;
  category?: string;
}

/** Write <dir>/<date>-<slug>.md (+ latest.md). Returns the path, or null on failure (never throws). */
export function mirrorReadout(title: string, body: string, meta: ReadoutMeta, dir = oncologyReadoutsDir()): string | null {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const status = meta.published === true ? (meta.inserted ? 'published (new)' : 'published (already present)') : meta.published === false ? `NOT published: ${meta.error ?? 'unknown'}` : 'not sent to Lens';
    const md = [
      '---',
      `title: ${JSON.stringify(title)}`,
      `date: ${date}`,
      `source: ${meta.source}`,
      `lens_status: ${JSON.stringify(status)}`,
      meta.category ? `category: ${meta.category}` : null,
      meta.url ? `url: ${meta.url}` : null,
      '---',
      '',
      body,
      '',
    ].filter((x) => x !== null).join('\n');
    const file = path.join(dir, `${date}-${slug(title)}.md`);
    fs.writeFileSync(file, md, 'utf8');
    fs.writeFileSync(path.join(dir, 'latest.md'), md, 'utf8');
    return file;
  } catch (err) {
    console.warn('[lens-readout-mirror] failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

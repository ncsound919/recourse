/**
 * Corpus scanner — walks one or more project roots on disk and extracts the
 * insight-bearing text artifacts (whitepapers, research docs, knowledge JSON,
 * datasets, config outlines). Deterministic and honest: files are classified
 * from their real path/filename, content is read from disk (size-capped), and
 * unreadable roots are reported as errors, never silently skipped.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { CorpusArtifact, CorpusRoot, CorpusScanError, CorpusScanResult, InsightKind } from './types.js';

/** Directories that never contain research insights — always pruned. */
const NOISE_DIR =
  /(^|[\\/])(node_modules|\.git|dist|build|\.next|\.nuxt|out|coverage|__pycache__|\.pytest_cache|site-packages|\.venv|venv|\.turbo|\.cache|\.svelte-kit|test-results|\.qwick|\.ruff_cache|\.mypy_cache|\.idea|\.vscode)([\\/]|$)/i;

/** Text/document extensions whose content Recourse reads for insights. */
const DOC_EXTS = new Set([
  '.md', '.mdx', '.markdown', '.txt', '.json', '.jsonl', '.csv',
  '.yml', '.yaml', '.toml', '.bib', '.tex', '.rst', '.org',
]);

/** Binary/data extensions never read as insight text. */
const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp',
  '.pdf', '.exe', '.dll', '.so', '.dylib', '.zip', '.tar', '.gz', '.tgz',
  '.7z', '.rar', '.jar', '.pkl', '.db', '.db-wal', '.db-shm', '.sqlite',
  '.pyc', '.woff', '.woff2', '.ttf', '.otf', '.map', '.lock', '.pid',
  '.fasta', '.fa', '.fna', '.cif', '.gtf', '.pdb',
]);

/** Max bytes of a file actually read for excerpt/topic/word extraction. */
export const MAX_READ_BYTES = 1_000_000;
/** Max excerpt length kept on an artifact. */
export const MAX_EXCERPT = 1200;

/** Real content topics (label -> case-insensitive keyword set). */
export const CORPUS_TOPICS: Record<string, string[]> = {
  oncology: ['oncology', 'cancer', 'tumor', 'tumour', 'carcinoma', 'leukemia', 'melanoma', 'minimal residual', 'mrd'],
  hemp: ['hemp', 'cannabis', 'cbd', 'cannabinoid', 'terpene'],
  pharma: ['pharma', 'drug', 'therapeutic', 'compound', 'pharmacokinetic', 'dosing', 'bioavailability'],
  biotech: ['biotech', 'bioassay', 'cell', 'protein', 'molecular', 'genomic', 'crispr', 'assay', 'antibody'],
  clinical: ['clinical', 'trial', 'patient', 'cohort', 'recist', 'adjuvant', 'endpoint', 'protocol'],
  ml_ai: ['machine learning', 'neural', 'llm', 'deep learning', 'reinforcement', 'transformer', 'agent'],
  systems: ['architecture', 'orchestration', 'pipeline', 'swarm', 'workflow', 'service', 'api'],
  math: ['math', 'probability', 'statistical', 'bayesian', 'algorithm', 'optimization', 'regression'],
  research_ops: ['research', 'synthesis', 'knowledge graph', 'hypothesis', 'validation', 'methodology', 'framework'],
};

function classifyKind(rel: string, name: string, ext: string): InsightKind {
  const n = name.toLowerCase();
  const p = rel.toLowerCase();
  if (/whitepaper|white.?paper/.test(n)) return 'whitepaper';
  if (/\b(papers?|thesis|manuscript|preprint)\b/.test(n) || /[\\/]papers?[\\/]/.test(p)) return 'paper';
  if (/\b(synthesis|research|review|study|findings?|insight|report|breakthrough|trial|validation|executive[-_ ]?summary|deep[-_ ]?research)\b/.test(n)) return 'research';
  if (/\b(knowledge|kb|insight|intel|bank|ontology|vocab)\b/.test(n) || /knowledge[-_ ]?base/i.test(p)) return 'knowledge';
  if (/\b(spec|design|architecture|outline|plan|roadmap|proposal|protocol|schema|contract)\b/.test(n)) return 'spec';
  if (ext === '.csv' || /\b(dataset|schema|patients|sample|results)\b/.test(n)) return 'data';
  if (/\b(readme|manual|guide|user[-_ ]?(guide|manual)|changelog|troubleshoot)\b/.test(n)) return 'readme';
  if (ext === '.json' || ext === '.jsonl' || ext === '.yml' || ext === '.yaml' || ext === '.toml' || /\b(config|package|docker)\b/.test(n)) return 'config';
  return 'other';
}

function detectTopics(text: string): string[] {
  const hits: string[] = [];
  const lower = text.toLowerCase();
  for (const [label, kws] of Object.entries(CORPUS_TOPICS)) {
    for (const kw of kws) {
      if (lower.includes(kw)) { hits.push(label); break; }
    }
  }
  return hits;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function countWords(text: string): number {
  let n = 0;
  let inTok = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const ws = c <= 32 || (c >= 9 && c <= 13) || c === 160;
    if (ws) inTok = false;
    else if (!inTok) { inTok = true; n++; }
  }
  return n;
}

function toExcerpt(text: string, cap: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > cap ? collapsed.slice(0, cap) + '…' : collapsed;
}

/** Scan a single project root. Honest: per-root IO errors surface, never as artifacts. */
export async function scanRoot(root: CorpusRoot): Promise<{ artifacts: CorpusArtifact[]; errors: CorpusScanError[] }> {
  const artifacts: CorpusArtifact[] = [];
  const errors: CorpusScanError[] = [];
  const seen = new Set<string>();

  async function walk(dir: string, relDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      errors.push({ root: root.project, error: `readdir ${relDir || dir}: ${err?.message ?? err}` });
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (NOISE_DIR.test(abs + path.sep)) continue;
        await walk(abs, relDir ? `${relDir}/${ent.name}` : ent.name);
        continue;
      }
      if (!ent.isFile()) continue;
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      const ext = path.extname(ent.name).toLowerCase();
      if (!DOC_EXTS.has(ext) || SKIP_EXTS.has(ext)) continue;
      const dedupeKey = `${root.project}::${rel}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const artifact = await buildArtifact(root.project, rel, abs, ext);
      if (artifact) artifacts.push(artifact);
    }
  }

  try {
    const st = await fs.stat(root.root);
    if (!st.isDirectory()) {
      errors.push({ root: root.project, error: `root is not a directory: ${root.root}` });
      return { artifacts, errors };
    }
  } catch (err: any) {
    errors.push({ root: root.project, error: `root missing: ${root.root} (${err?.message ?? err})` });
    return { artifacts, errors };
  }

  await walk(root.root, '');
  return { artifacts, errors };
}

async function buildArtifact(
  project: string,
  rel: string,
  abs: string,
  ext: string,
): Promise<CorpusArtifact | null> {
  let bytes: Buffer;
  let mtime = 0;
  let sizeBytes = 0;
  try {
    const fh = await fs.open(abs, 'r');
    try {
      const st = await fh.stat();
      mtime = st.mtimeMs;
      sizeBytes = st.size;
      const buf = Buffer.alloc(MAX_READ_BYTES);
      const { bytesRead } = await fh.read(buf, 0, MAX_READ_BYTES, 0);
      bytes = buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  } catch (err: any) {
    // Unreadable file — record its existence honestly with a content-less record.
    const name = path.basename(rel);
    return {
      hash: sha256(Buffer.from(`${project}::${rel}`)),
      project,
      rel,
      name,
      ext,
      kind: classifyKind(rel, name, ext),
      sizeBytes: 0,
      words: 0,
      excerpt: `[unreadable: ${err?.message ?? 'io error'}]`,
      topics: [],
      mtime: 0,
    };
  }
  const text = bytes.toString('utf-8');
  const name = path.basename(rel);
  return {
    hash: sha256(bytes),
    project,
    rel,
    name,
    ext,
    kind: classifyKind(rel, name, ext),
    sizeBytes,
    words: countWords(text),
    excerpt: toExcerpt(text, MAX_EXCERPT),
    topics: detectTopics(text),
    mtime,
  };
}

/** Scan multiple roots concurrently and merge results. */
export async function scanCorpus(roots: CorpusRoot[]): Promise<CorpusScanResult> {
  const results = await Promise.all(roots.map((r) => scanRoot(r)));
  const artifacts: CorpusArtifact[] = [];
  const errors: CorpusScanError[] = [];
  for (const r of results) {
    artifacts.push(...r.artifacts);
    errors.push(...r.errors);
  }
  return { scannedAt: Date.now(), artifacts, errors };
}

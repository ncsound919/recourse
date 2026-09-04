/**
 * Skill scanner — walks skill repository roots and discovers every SKILL.md.
 *
 * Honest rules:
 *  - Translation mirrors under a docs/<lang> folder are pruned (they duplicate
 *    canonical English skills); the pruned count is reported, not hidden.
 *  - Standard noise dirs (node_modules, .git, dist, …) are skipped.
 *  - A SKILL.md that cannot be read is recorded, never fabricated.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { SkillDef, SkillRoot, SkillScanError, SkillScanResult } from './types.js';

const NOISE_DIR =
  /(^|[\\/])(node_modules|\.git|dist|build|\.next|\.nuxt|out|coverage|__pycache__|\.pytest_cache|site-packages|\.venv|venv|\.turbo|\.cache|\.svelte-kit|test-results|\.idea|\.vscode)([\\/]|$)/i;

/** docs/<lang>/ translation mirrors — duplicated skill content, pruned. */
const TRANSLATION_DIR = /[\\/]docs[\\/][a-z]{2}(-[A-Z]{2})?[\\/]/i;

/** Text/script file extensions considered part of a skill's supporting set. */
const SUPPORT_FILES = new Set([
  '.md', '.txt', '.json', '.jsonl', '.yml', '.yaml', '.toml', '.csv',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.sh', '.rb', '.ps1',
  '.go', '.rs', '.java', '.sql', '.cfg', '.rst',
]);
const SCRIPT_EXTS = new Set(['.py', '.sh', '.ts', '.js', '.mjs', '.cjs', '.rb', '.ps1', '.go', '.rs']);
const MAX_SUPPORT_FILES = 200;

const TOPIC_KEYWORDS: Record<string, string[]> = {
  marketing: ['seo', 'marketing', 'ads', 'social media', 'copywriting', 'brand', 'content'],
  engineering: ['coding', 'typescript', 'react', 'python', 'architecture', 'test', 'refactor', 'api', 'pattern'],
  ml_ai: ['machine learning', 'llm', 'ai', 'agent', 'neural', 'claude', 'model'],
  research: ['research', 'paper', 'analysis', 'deep research', 'benchmark'],
  security: ['security', 'audit', 'vulnerab', 'review', 'threat'],
  domain_business: ['procurement', 'logistics', 'freight', 'carrier', 'energy', 'quality', 'inventory', 'demand', 'supply'],
};

export function sha16(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

function detectTopics(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const [label, kws] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of kws) {
      if (lower.includes(kw)) { hits.push(label); break; }
    }
  }
  return hits;
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

/**
 * Parse the YAML frontmatter of a SKILL.md. Returns the raw keys we care about
 * (name/description/license) plus the body. Tolerant parser: never throws on
 * malformed frontmatter — falls back to best-effort values.
 */
export function parseSkillDoc(raw: string): {
  name: string;
  description: string;
  license?: string;
  keys: string[];
  body: string;
} {
  const text = raw.replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) {
    const h = /^#\s+(.+)$/m.exec(text);
    return { name: h?.[1]?.trim() ?? '', description: '', keys: [], body: text.slice(0, 4000) };
  }
  const fm = m[1];
  const body = text.slice(m[0].length).slice(0, 4000);
  const keys: string[] = [];
  const get = (k: string): string => {
    const re = new RegExp(`^${k}:\\s*(.+)$`, 'm');
    const km = re.exec(fm);
    if (!km) return '';
    keys.push(k);
    let v = km[1].trim();
    // Unwrap a single quoted string (double or single).
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  };
  const name = get('name');
  const description = get('description');
  const license = get('license') || undefined;
  return { name, description, license, keys, body };
}

async function listSupportFiles(dirAbs: string): Promise<{ files: string[]; hasScripts: boolean }> {
  const out: string[] = [];
  let hasScripts = false;
  async function walk(cur: string, relDir: string) {
    let entries;
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_SUPPORT_FILES) return;
      const abs = path.join(cur, e.name);
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (NOISE_DIR.test(abs + path.sep)) continue;
        await walk(abs, rel);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (SUPPORT_FILES.has(ext) && e.name.toUpperCase() !== 'SKILL.MD') {
          out.push(rel);
          if (SCRIPT_EXTS.has(ext)) hasScripts = true;
        }
      }
    }
  }
  await walk(dirAbs, '');
  return { files: out.slice(0, MAX_SUPPORT_FILES), hasScripts };
}

/** Scan one skill library root. */
export async function scanSkillRoot(root: SkillRoot): Promise<{ skills: SkillDef[]; found: number; prunedTranslations: number; errors: SkillScanError[] }> {
  const skills: SkillDef[] = [];
  const errors: SkillScanError[] = [];
  let found = 0;
  let prunedTranslations = 0;

  let stack: string[] = [root.root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      errors.push({ root: root.id, error: `readdir ${dir}: ${err?.message ?? err}` });
      continue;
    }
    const subdirs: string[] = [];
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (NOISE_DIR.test(abs + path.sep)) continue;
        if (TRANSLATION_DIR.test(abs + path.sep)) {
          // Count translation trees lazily by recursing their SKILL.md.
          prunedTranslations += await countTranslationSkills(abs);
          continue;
        }
        subdirs.push(abs);
        continue;
      }
      if (e.isFile() && e.name.toUpperCase() === 'SKILL.MD') {
        found++;
        const skill = await buildSkill(root, dir, abs);
        if (skill) skills.push(skill);
      }
    }
    // push subdirs so the first-level files are handled breadth; order not important.
    stack.push(...subdirs);
  }
  return { skills, found, prunedTranslations, errors };
}

/** Recursively count SKILL.md under a translation dir (cheap, depth-first). */
async function countTranslationSkills(dir: string): Promise<number> {
  let n = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) n += await countTranslationSkills(abs);
    else if (e.name.toUpperCase() === 'SKILL.MD') n++;
  }
  return n;
}

async function buildSkill(root: SkillRoot, dirAbs: string, skillMdAbs: string): Promise<SkillDef | null> {
  const dirRel = path.relative(root.root, dirAbs).replace(/\\/g, '/');
  const mdRel = path.relative(root.root, skillMdAbs).replace(/\\/g, '/');
  let mtime = 0;
  let text = '';
  try {
    const raw = await fs.readFile(skillMdAbs, 'utf-8');
    const st = await fs.stat(skillMdAbs);
    mtime = st.mtimeMs;
    text = raw;
  } catch (err: any) {
    return {
      id: sha16(`${root.id}|${mdRel}`),
      name: path.basename(dirAbs),
      description: `[unreadable: ${err?.message ?? 'io error'}]`,
      rootId: root.id,
      rel: mdRel,
      dir: dirRel,
      words: 0,
      excerpt: '[unreadable skill file]',
      topics: [],
      hasScripts: false,
      files: [],
      frontmatterKeys: [],
      mtime: 0,
    };
  }
  const parsed = parseSkillDoc(text);
  const name = parsed.name || path.basename(dirAbs);
  const excerptText = parsed.description || parsed.body;
  const support = await listSupportFiles(dirAbs);
  return {
    id: sha16(`${root.id}|${mdRel}`),
    name,
    description: parsed.description,
    license: parsed.license,
    rootId: root.id,
    rel: mdRel,
    dir: dirRel,
    words: countWords(parsed.body),
    excerpt: (excerptText || name).replace(/\s+/g, ' ').trim().slice(0, 300),
    topics: detectTopics(`${parsed.description} ${parsed.body}`),
    hasScripts: support.hasScripts,
    files: support.files,
    frontmatterKeys: parsed.keys,
    mtime,
  };
}

/** Scan multiple roots concurrently and merge. */
export async function scanSkillLibraries(roots: SkillRoot[]): Promise<SkillScanResult> {
  const results = await Promise.all(roots.map((r) => scanSkillRoot(r)));
  const skills: SkillDef[] = [];
  const errors: SkillScanError[] = [];
  let found = 0;
  let prunedTranslations = 0;
  for (const r of results) {
    skills.push(...r.skills);
    errors.push(...r.errors);
    found += r.found;
    prunedTranslations += r.prunedTranslations;
  }
  return { scannedAt: Date.now(), found, prunedTranslations, skills, errors };
}

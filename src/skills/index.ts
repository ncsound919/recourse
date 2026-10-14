/**
 * Skill library index — rollups, digest, and search over a scanned skill set.
 * Pure + unit-testable; never reads the network or a model.
 */
import type { SkillDef, SkillRoot, SkillSnapshot, SkillSummary } from './types.js';

export function summarize(skills: SkillDef[]): SkillSummary {
  const byRoot: Record<string, number> = {};
  let withScripts = 0;
  for (const s of skills) {
    byRoot[s.rootId] = (byRoot[s.rootId] ?? 0) + 1;
    if (s.hasScripts) withScripts++;
  }
  return { total: skills.length, byRoot, withScripts };
}

/** Honest markdown digest of the skill library state. */
export function skillDigest(snapshot: SkillSnapshot): string {
  const L: string[] = [];
  L.push('## Skill Library');
  L.push('');
  if (!snapshot.roots.length) { L.push('- No skill roots configured.'); return L.join('\n'); }
  if (snapshot.lastScanAt == null) {
    L.push('- Not scanned yet.');
    L.push('- Roots: ' + snapshot.roots.map((r) => `${r.id} (${r.root})`).join(' | '));
    return L.join('\n');
  }
  const at = new Date(snapshot.lastScanAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  L.push(`- Last scan: ${at} | indexed: ${snapshot.summary?.total ?? 0} skills (${snapshot.found} found, ${snapshot.prunedTranslations} translation mirrors pruned)`);
  if (snapshot.summary && Object.keys(snapshot.summary.byRoot).length) {
    L.push(`- By library: ${Object.entries(snapshot.summary.byRoot).map(([id, n]) => `${id}: ${n}`).join(', ')}`);
  }
  if (snapshot.summary && snapshot.summary.withScripts) {
    L.push(`- ${snapshot.summary.withScripts} skills ship runnable scripts`);
  }
  if (snapshot.errors.length) L.push(`- Scan errors: ${snapshot.errors.length} (${snapshot.errors[0].root}: ${snapshot.errors[0].error})`);
  return L.join('\n');
}

/** Case-insensitive ranked search over name/description/excerpt/topics. */
export function searchSkills(skills: SkillDef[], q: string, limit = 100): SkillDef[] {
  const query = (q || '').trim().toLowerCase();
  if (!query) return skills.slice(0, limit);
  const tokens = query.split(/\s+/).filter(Boolean);
  const scored = skills
    .map((s) => {
      const hayName = s.name.toLowerCase();
      const hayDesc = (s.description + ' ' + s.excerpt + ' ' + s.topics.join(' ')).toLowerCase();
      const hayDir = s.dir.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hayName.includes(t)) score += 4;
        if (hayDesc.includes(t)) score += 2;
        if (hayDir.includes(t)) score += 1;
        if (s.topics.some((top) => top.includes(t))) score += 2;
      }
      if (s.name === query) score += 10;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.s);
}

/** Full-text body fetch helper result type. */
export interface SkillContent {
  ok: boolean;
  rootId?: string;
  rel?: string;
  text?: string;
  bytes?: number;
  error?: string;
}

export const DEFAULT_SKILL_ROOTS: SkillRoot[] = [
  { id: 'fleet-skills', root: 'C:\\Users\\User\\Downloads\\BUSINESS\\SKILLS\\skills' },
  { id: 'ecc', root: 'C:\\Users\\User\\Downloads\\BUSINESS\\SKILLS\\ecc-skills' },
  { id: 'deterministic-brain', root: 'C:\\Users\\User\\Downloads\\BUSINESS\\agents\\deterministic-brain\\skills' },
  // Axiom is archived (Uplift teardown).
  { id: 'axiom-opencode', root: 'C:\\Users\\User\\Downloads\\BUSINESS\\_archive\\from-uplift\\06_Resources\\Axiom Agent\\.opencode\\skills' },
  // External bare harnesses (outside BUSINESS) — unchanged.
  { id: 'deepseek-harness', root: 'C:\\Users\\User\\Downloads\\bare-harnesses\\deepseek-harness\\.agents\\skills' },
  { id: 'opencode', root: 'C:\\Users\\User\\Downloads\\bare-harnesses\\opencode\\.opencode\\skills' },
];

/** Parse a `RECOURSE_SKILL_ROOTS` override: a JSON array of `{ id, root }`.
 *  Returns null when unset/invalid so callers fall back to the defaults. */
export function skillRootsFromEnv(raw: string | undefined = process.env.RECOURSE_SKILL_ROOTS): SkillRoot[] | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out = parsed
      .filter((r) => r && typeof r.id === 'string' && typeof r.root === 'string' && r.id.trim() && r.root.trim())
      .map((r) => ({ id: String(r.id).trim(), root: String(r.root).trim() }));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** The configured skill roots: `RECOURSE_SKILL_ROOTS` when set, else the
 *  built-in library list. Always a fresh array of fresh objects. */
export function defaultSkillRoots(): SkillRoot[] {
  return (skillRootsFromEnv() ?? DEFAULT_SKILL_ROOTS).map((r) => ({ ...r }));
}

/**
 * Skill Library accessor — lets Recourse catalog, search, and read skills from
 * sibling skill repositories on disk (Draymond agents/skills, ECC, …).
 *
 * A "skill" is any directory containing a SKILL.md with YAML frontmatter
 * (name/description) plus supporting files/scripts. Everything here is read
 * from real files; no skill content is ever synthesized.
 */

/** A configured skill repository root on disk. */
export interface SkillRoot {
  /** Stable id for this library, e.g. 'fleet-skills' | 'ecc'. */
  id: string;
  /** Absolute path to scan recursively for SKILL.md. */
  root: string;
}

/** One discovered skill. */
export interface SkillDef {
  /** Stable identity across scans: rootId + path. */
  id: string;
  /** Canonical name from SKILL.md frontmatter (fallback: dir basename). */
  name: string;
  /** Frontmatter description (or ''). */
  description: string;
  license?: string;
  /** Owning library id. */
  rootId: string;
  /** Path to SKILL.md relative to its root. */
  rel: string;
  /** Path of the skill directory relative to its root. */
  dir: string;
  /** Word count of the SKILL.md body. */
  words: number;
  /** Short excerpt of description-or-body for the catalog. */
  excerpt: string;
  /** Real topics detected in description/body. */
  topics: string[];
  /** True if the skill ships runnable scripts. */
  hasScripts: boolean;
  /** Supporting files relative to the skill dir (capped, text/script). */
  files: string[];
  /** SKILL.md frontmatter keys discovered (name/description/license). */
  frontmatterKeys: string[];
  mtime: number;
}

export interface SkillScanError {
  root: string;
  error: string;
}

export interface SkillScanResult {
  scannedAt: number;
  /** All SKILL.md found before prunes (translations/noise). */
  found: number;
  /** SKILL.md pruned as translation mirrors under a docs/<lang> folder. */
  prunedTranslations: number;
  skills: SkillDef[];
  errors: SkillScanError[];
}

export interface SkillSummary {
  total: number;
  byRoot: Record<string, number>;
  withScripts: number;
}

/** Full state surfaced to the API/UI and persisted with the engine. */
export interface SkillSnapshot {
  roots: SkillRoot[];
  lastScanAt: number | null;
  skills: SkillDef[];
  summary: SkillSummary | null;
  found: number;
  prunedTranslations: number;
  errors: SkillScanError[];
}

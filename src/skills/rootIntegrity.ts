/**
 * Skill-root integrity.
 *
 * The persisted skill catalog records which root each skill came from, but
 * nothing checked whether those roots still EXIST. A stale catalog therefore
 * satisfied the boot gate forever: when 9 of 13 configured roots were deleted,
 * the scan never re-ran, 137 catalog entries kept pointing at missing
 * directories, and `/skills/status` still reported `errors: []`.
 *
 * These predicates are extracted from `server.ts` so they are unit-testable —
 * `server.ts` exports nothing, so an inline `statSync` there can only be checked
 * by restarting the process.
 */
import fs from 'node:fs';

/** Minimal shape needed; avoids importing the whole skills module. */
export interface SkillRootLike {
  id: string;
  root: string;
}

/** True when `root` is a readable directory. Any throw means "not usable". */
export function skillRootExists(root: string): boolean {
  try {
    return fs.statSync(root).isDirectory();
  } catch {
    return false;
  }
}

/** Configured roots whose directory is gone (unreadable counts as gone). */
export function missingSkillRoots(roots: readonly SkillRootLike[]): SkillRootLike[] {
  return roots.filter((r) => !skillRootExists(r.root));
}

/**
 * True when the persisted catalog still legitimately covers every configured
 * root. A missing root always forces a rescan, because a catalog can never
 * re-acquire entries from a directory that is not there.
 */
export function catalogCoversRoots(
  catalog: readonly { rootId: string }[],
  roots: readonly SkillRootLike[],
): boolean {
  return catalog.length > 0
    && roots.every((r) => catalog.some((s) => s.rootId === r.id))
    && missingSkillRoots(roots).length === 0;
}

/**
 * Worktree snapshotting — how the unified runner measures what a pipeline
 * actually changed. Hash + line count per file, then a set diff.
 *
 * Heavy/irrelevant trees (node_modules, VCS, build output) are skipped so a
 * benchmark on a real repo stays cheap.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FileFingerprint {
  hash: string;
  lines: number;
  size: number;
}

export type Snapshot = Map<string, FileFingerprint>;

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.turbo',
  '.cache',
  'composer-out',
  'recourse-fix-bundle',
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function snapshotDir(root: string): Snapshot {
  const out: Snapshot = new Map();
  walk(root, root, out);
  return out;
}

function walk(root: string, dir: string, out: Snapshot): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(root, abs, out);
    } else if (entry.isFile()) {
      const rel = path.relative(root, abs).split(path.sep).join('/');
      try {
        const stat = fs.statSync(abs);
        if (stat.size > MAX_FILE_BYTES) continue;
        const content = fs.readFileSync(abs);
        out.set(rel, {
          hash: crypto.createHash('sha256').update(content).digest('hex'),
          lines: countLines(content),
          size: stat.size,
        });
      } catch {
        // Unreadable file (locked/removed mid-walk) — skip.
      }
    }
  }
}

function countLines(buf: Buffer): number {
  if (buf.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
  return lines;
}

export interface SnapshotDiff {
  added: string[];
  removed: string[];
  modified: string[];
  changedFiles: string[];
  linesAdded: number;
  linesRemoved: number;
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const [file, a] of after) {
    const b = before.get(file);
    if (!b) {
      added.push(file);
      linesAdded += a.lines;
    } else if (b.hash !== a.hash) {
      modified.push(file);
      const delta = a.lines - b.lines;
      if (delta > 0) linesAdded += delta;
      else linesRemoved += -delta;
    }
  }
  for (const [file, b] of before) {
    if (!after.has(file)) {
      removed.push(file);
      linesRemoved += b.lines;
    }
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    modified: modified.sort(),
    changedFiles: [...added, ...modified, ...removed].sort(),
    linesAdded,
    linesRemoved,
  };
}

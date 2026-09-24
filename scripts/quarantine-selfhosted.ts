/**
 * Quarantine low-quality self-hosted tools (NOTHING is deleted).
 *
 * Moves out of the live `.selfhosted/` registry:
 *  1. corpus-clone tools — the legacy corpus refill turned every scanned file
 *     into the same FNV-1a fingerprint function under a file-derived name;
 *  2. entries whose source fails the substance gate or the forge quality gate
 *     (special-cased suite literals, nondeterminism, argument mutation);
 *  3. near-duplicates (same algorithm skeleton — literals erased — under another
 *     name, e.g. dream weight-mutation variants; the oldest entry is kept);
 *  4. orphan module files in tools/ that no manifest entry references.
 *
 * Each quarantined module goes to `.selfhosted/quarantine/<stamp>/tools/`, the
 * removed manifest entries to `.../manifest.removed.json`, and the original
 * manifest is backed up to `.../manifest.before.json`. Restoring is a copy back.
 *
 * STOP the Recourse server first: it holds the manifest in memory and would
 * rewrite it.
 *
 *   npx tsx scripts/quarantine-selfhosted.ts            # dry run (report only)
 *   npx tsx scripts/quarantine-selfhosted.ts --apply    # move files + rewrite manifest
 *   npx tsx scripts/quarantine-selfhosted.ts --plan out.json   # write the plan as JSON
 *   SELFHOST_DIR=/path/.selfhosted npx tsx scripts/quarantine-selfhosted.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { assessSourceSubstance } from '../src/lib/honestyMetrics';
import { assessForgeCandidate, sourceSkeleton } from '../src/lib/forgeQuality';

type Entry = {
  name: string;
  file: string;
  sourceCode: string;
  testSuiteCode: string;
  summary?: string;
  createdAt?: number;
  entrypointKind?: 'class' | 'function';
  templateId?: string;
};

export type QuarantineReason = 'corpus-clone' | 'substance' | 'quality' | 'near-duplicate' | 'orphan';

export interface QuarantinePlan {
  root: string;
  total: number;
  keep: string[];
  quarantine: Array<{ name: string; file: string; reason: QuarantineReason; detail: string }>;
  orphans: string[];
}

export function isCorpusClone(e: Entry): boolean {
  const src = String(e.sourceCode || '');
  const fnv = /0x811c9dc5|2166136261/i.test(src) && /0x01000193|16777619/i.test(src);
  return /\(corpus_[0-9a-f]+\)/.test(String(e.summary || '')) || (fnv && /811c9dc5/.test(String(e.testSuiteCode || '')));
}

export function planQuarantine(root: string, opts: { quality?: boolean } = {}): QuarantinePlan {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf-8')) as { entries: Entry[] };
  const entries = [...manifest.entries].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const quarantine: QuarantinePlan['quarantine'] = [];
  const keep: string[] = [];
  const seenSource = new Map<string, string>();

  for (const e of entries) {
    if (isCorpusClone(e)) {
      quarantine.push({ name: e.name, file: e.file, reason: 'corpus-clone', detail: 'FNV fingerprint clone from legacy corpus refill' });
      continue;
    }
    // Stored self-hosted sources are often un-exported declarations (the module
    // adapter exports them); judge the code, not the missing keyword.
    const src = String(e.sourceCode || '');
    const substance = assessSourceSubstance(/\bexport\b/.test(src) ? src : `export ${src.trimStart()}`);
    if (!substance.ok) {
      quarantine.push({ name: e.name, file: e.file, reason: 'substance', detail: substance.reason ?? 'substance gate' });
      continue;
    }
    if (opts.quality !== false && e.entrypointKind !== 'class' && /^[A-Za-z_$][\w$]*$/.test(e.name)) {
      const q = assessForgeCandidate({ name: e.name, refSuite: e.testSuiteCode }, e.sourceCode, { requireBehavioral: false });
      // Only hard, objective failures quarantine an existing tool; a missing
      // JSDoc (low score) alone does not.
      const hard = q.gate.reasons.filter((r) => !r.startsWith('quality score'));
      if (hard.length) {
        quarantine.push({ name: e.name, file: e.file, reason: 'quality', detail: hard.join('; ') });
        continue;
      }
    }
    const norm = sourceSkeleton(e.sourceCode, e.name);
    const dupOf = seenSource.get(norm);
    if (dupOf) {
      quarantine.push({ name: e.name, file: e.file, reason: 'near-duplicate', detail: `same algorithm as ${dupOf} (constants differ)` });
      continue;
    }
    seenSource.set(norm, e.name);
    keep.push(e.name);
  }

  const referenced = new Set(manifest.entries.map((e) => path.basename(e.file)));
  const toolsDir = path.join(root, 'tools');
  const orphans = fs.existsSync(toolsDir)
    ? fs.readdirSync(toolsDir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !referenced.has(f))
    : [];

  return { root, total: manifest.entries.length, keep, quarantine, orphans };
}

export function applyQuarantine(plan: QuarantinePlan, stamp = new Date().toISOString().replace(/[:.]/g, '-')): string {
  const root = plan.root;
  const qdir = path.join(root, 'quarantine', stamp);
  const qtools = path.join(qdir, 'tools');
  fs.mkdirSync(qtools, { recursive: true });
  const manifestFile = path.join(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as { version: number; entries: Entry[] };
  fs.writeFileSync(path.join(qdir, 'manifest.before.json'), JSON.stringify(manifest, null, 2));

  const out = new Set(plan.quarantine.map((q) => q.name));
  const removed = manifest.entries.filter((e) => out.has(e.name));
  const move = (rel: string) => {
    const src = path.join(root, 'tools', path.basename(rel));
    if (fs.existsSync(src)) fs.renameSync(src, path.join(qtools, path.basename(rel)));
  };
  for (const e of removed) move(e.file);
  for (const f of plan.orphans) move(f);

  fs.writeFileSync(path.join(qdir, 'manifest.removed.json'), JSON.stringify(removed, null, 2));
  fs.writeFileSync(path.join(qdir, 'plan.json'), JSON.stringify(plan, null, 2));
  const next = { ...manifest, entries: manifest.entries.filter((e) => !out.has(e.name)) };
  const tmp = `${manifestFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, manifestFile);
  return qdir;
}

function summarize(plan: QuarantinePlan): string {
  const by = new Map<string, number>();
  for (const q of plan.quarantine) by.set(q.reason, (by.get(q.reason) ?? 0) + 1);
  return [
    `manifest entries: ${plan.total}`,
    `keep:             ${plan.keep.length}`,
    ...[...by.entries()].map(([r, n]) => `quarantine/${r}: ${n}`),
    `orphan files:     ${plan.orphans.length}`,
  ].join('\n');
}

const isMain = process.argv[1] && process.argv[1].endsWith('quarantine-selfhosted.ts');
if (isMain) {
  const root = path.resolve(process.env.SELFHOST_DIR || path.join(process.cwd(), '.selfhosted'));
  const apply = process.argv.includes('--apply');
  const planIdx = process.argv.indexOf('--plan');
  const plan = planQuarantine(root);
  console.log(summarize(plan));
  if (planIdx > 0 && process.argv[planIdx + 1]) {
    fs.writeFileSync(process.argv[planIdx + 1], JSON.stringify(plan, null, 2));
    console.log(`plan written to ${process.argv[planIdx + 1]}`);
  }
  if (!apply) {
    console.log('\nDRY RUN — nothing moved. Stop the server, then re-run with --apply.');
  } else {
    const qdir = applyQuarantine(plan);
    console.log(`\nApplied. Quarantined modules + backups in ${qdir}`);
  }
}

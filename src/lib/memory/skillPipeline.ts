/**
 * Skill auto-promotion pipeline — turns a detected promotion candidate (a gene
 * that wins across unrelated problems) into a durable, exportable skill.
 *
 * `skillPromotion.ts` only *detects* candidates. This module runs the promotion
 * steps for real, with every side-effecting step injected so it is unit-testable
 * and honest:
 *
 *   resolve artifact -> re-verify its stored suite -> lint -> write skill folder
 *
 * A candidate is only `promoted` if all three gates pass. Failures are reported
 * with a status + reason — nothing is silently skipped.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { PromotionCandidate } from './skillPromotion';

export interface SkillArtifact {
  /** Self-hosted tool name backing the candidate gene. */
  toolName: string;
  entrypointName: string;
  domain: string;
  sourceCode: string;
  testSuiteCode: string;
  methods: Array<{ method: string; label?: string }>;
  summary?: string;
  /** Human-readable provenance line recorded in the SKILL.md. */
  provenance?: string;
}

export interface SkillVerifyResult {
  passed: boolean;
  detail: string;
}

export interface SkillLintResult {
  ok: boolean;
  detail?: string;
}

export interface SkillWriteResult {
  ok: boolean;
  dir?: string;
  error?: string;
}

export interface SkillPromotionDeps {
  /** Find the verified artifact backing a candidate, or undefined if none. */
  resolveArtifact(candidate: PromotionCandidate): SkillArtifact | undefined;
  /** Re-run the artifact's stored suite (inside the sandbox when available). */
  verify(artifact: SkillArtifact): Promise<SkillVerifyResult> | SkillVerifyResult;
  /** Real lint gate on the artifact source. */
  lint(artifact: SkillArtifact): SkillLintResult;
  /** Persist the skill (folder/SKILL.md). */
  write(artifact: SkillArtifact): Promise<SkillWriteResult> | SkillWriteResult;
}

export type SkillPromotionStatus = 'promoted' | 'rejected' | 'skipped';

export interface SkillPromotionOutcome {
  geneId: string;
  toolName?: string;
  status: SkillPromotionStatus;
  reason: string;
  dir?: string;
}

export interface SkillPromotionOptions {
  /** Cap candidates processed per pass (deterministic order). Default 3. */
  maxPerRun?: number;
  /** Skip a gene once promoted (callers pass already-promoted gene ids). */
  alreadyPromoted?: ReadonlySet<string>;
}

/**
 * Run the promotion pipeline over detected candidates (already sorted by
 * distinct wins desc). Deterministic: candidates are processed in order and
 * the first `maxPerRun` not-yet-promoted candidates are attempted.
 */
export async function promoteSkillCandidates(
  candidates: PromotionCandidate[],
  deps: SkillPromotionDeps,
  opts: SkillPromotionOptions = {},
): Promise<SkillPromotionOutcome[]> {
  const maxPerRun = opts.maxPerRun ?? 3;
  const already = opts.alreadyPromoted ?? new Set<string>();
  const outcomes: SkillPromotionOutcome[] = [];
  let attempted = 0;

  for (const candidate of candidates) {
    if (attempted >= maxPerRun) break;
    if (already.has(candidate.geneId)) continue;
    attempted++;

    const artifact = deps.resolveArtifact(candidate);
    if (!artifact) {
      outcomes.push({
        geneId: candidate.geneId,
        status: 'skipped',
        reason: 'no verified self-hosted artifact backs this gene yet',
      });
      continue;
    }

    const verdict = await deps.verify(artifact);
    if (!verdict.passed) {
      outcomes.push({
        geneId: candidate.geneId,
        toolName: artifact.toolName,
        status: 'rejected',
        reason: `suite failed: ${verdict.detail}`,
      });
      continue;
    }

    const lint = deps.lint(artifact);
    if (!lint.ok) {
      outcomes.push({
        geneId: candidate.geneId,
        toolName: artifact.toolName,
        status: 'rejected',
        reason: `lint gate blocked: ${lint.detail ?? 'lint failed'}`,
      });
      continue;
    }

    const written = await deps.write(artifact);
    if (!written.ok) {
      outcomes.push({
        geneId: candidate.geneId,
        toolName: artifact.toolName,
        status: 'rejected',
        reason: `write failed: ${written.error ?? 'unknown'}`,
      });
      continue;
    }

    outcomes.push({
      geneId: candidate.geneId,
      toolName: artifact.toolName,
      status: 'promoted',
      reason: `verified + linted; exported to ${written.dir ?? 'skill folder'}`,
      dir: written.dir,
    });
  }

  return outcomes;
}

// ---------------------------------------------------------------------------
// Disk writer (real, path-traversal guarded)
// ---------------------------------------------------------------------------

function skillSafeName(name: string): string {
  const cleaned = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'untitled';
}

function oneLine(s: string, max = 220): string {
  const flat = String(s || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/** Render a SKILL.md document (frontmatter + verified source + suite). */
export function renderSkillMarkdownFromArtifact(artifact: SkillArtifact, provenance: string): string {
  const L: string[] = [];
  L.push('---');
  L.push(`name: ${oneLine(artifact.toolName)}`);
  L.push(`description: ${oneLine(artifact.summary || `Recourse-verified ${artifact.domain} skill`)}`);
  L.push('---');
  L.push('');
  L.push(`# ${artifact.toolName}`);
  L.push('');
  L.push(`Recourse promoted skill — **${artifact.domain}** domain.`);
  L.push('');
  L.push('## Provenance');
  L.push('');
  L.push(provenance);
  L.push('');
  L.push('## Methods');
  for (const m of artifact.methods) L.push(`- \`${m.method}\`${m.label ? ` — ${m.label}` : ''}`);
  L.push('');
  L.push('## Source');
  L.push('');
  L.push('```ts');
  L.push(artifact.sourceCode);
  L.push('```');
  if (artifact.testSuiteCode) {
    L.push('');
    L.push('## Test suite');
    L.push('');
    L.push('```ts');
    L.push(artifact.testSuiteCode);
    L.push('```');
  }
  return L.join('\n') + '\n';
}

/** Write a skill artifact as a SKILL.md folder under `outRoot` (traversal-safe). */
export async function writeSkillArtifact(
  artifact: SkillArtifact,
  outRoot: string,
): Promise<SkillWriteResult> {
  try {
    const safe = skillSafeName(artifact.toolName);
    if (!safe || safe === 'untitled' || !/^[a-z0-9-]+$/.test(safe)) {
      return { ok: false, error: `unsafe skill name: ${artifact.toolName}` };
    }
    const base = path.join(outRoot, 'promoted-skills', safe);
    const rel = path.relative(outRoot, base);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, error: 'traversal refused' };
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(
      path.join(base, 'SKILL.md'),
      renderSkillMarkdownFromArtifact(artifact, artifact.provenance ?? 'Promoted by Recourse skill pipeline.'),
      'utf-8',
    );
    return { ok: true, dir: path.join('promoted-skills', safe) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

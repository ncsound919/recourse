/**
 * Skill exporter / importer — the Distribution layer for Recourse registry
 * tools (Phase 4, roadmap item 13).
 *
 * Two directions, both honest:
 *
 * EXPORT  a verified registry tool into the open Agent-Skills shape
 *         (a directory holding a SKILL.md with name/description frontmatter,
 *         plus the verified source and test suite as supporting files). The
 *         output is rescanable by `scanSkillRoot` and consumable by any
 *         SKILL.md host (Claude Code, Codex, …). Exports are only meaningful
 *         for tools that actually carry verified source + suite in a version.
 *
 * IMPORT  an external SKILL.md back into Recourse as an UNVERIFIED candidate.
 *         Nothing is trusted from a foreign file: we extract whatever code and
 *         test suite a skill explicitly embeds (our own export format) and hand
 *         it to the caller as a candidate; verification and the promotion gate
 *         still belong to the server. A prose-only skill has no runnable code,
 *         and we say so — we never fabricate a verifiable source.
 *
 * This module is pure + unit-testable (fs writes are isolated to an outRoot and
 * path-traversal guarded). It never talks to a model or the network.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ToolDomain, ToolEntry, ToolVersion } from '../types.js';
import { parseSkillDoc } from './scanner.js';

/** Filesystem-safe, url-safe directory/entry name derived from a tool name. */
export function skillSafeName(name: string): string {
  const cleaned = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'untitled';
}

/** The active version of a registry tool (currentVersion, else most recent). */
export function currentToolVersion(tool: ToolEntry): ToolVersion | undefined {
  if (tool.currentVersion) {
    const hit = tool.versions.find((v) => v.version === tool.currentVersion);
    if (hit) return hit;
  }
  return tool.versions[tool.versions.length - 1];
}

/**
 * True when a tool version actually carries runnable verified source + suite.
 * Exporting a tool with no real code would be misleading, so this is the gate.
 */
export function isVerifiableVersion(v?: ToolVersion): v is ToolVersion & { source_code: string } {
  return !!v && typeof v.source_code === 'string' && v.source_code.trim().length > 0;
}

/** Collapse a free-text description to one line so it fits SKILL.md frontmatter. */
function oneLine(s: string, max = 220): string {
  const flat = String(s || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/**
 * Build the SKILL.md document for a registry tool.
 * Frontmatter matches the scanner's tolerant parser (single-line keys).
 * The body documents the tool and embeds its verified source + test suite so a
 * human or model can understand and run it. Honesty: it states the provenance
 * (version, verifier pass, score, notes) exactly as recorded.
 */
export function renderSkillMarkdown(
  tool: ToolEntry,
  version: ToolVersion,
  opts: { license?: string } = {},
): string {
  const L: string[] = [];
  L.push('---');
  L.push(`name: ${oneLine(tool.name)}`);
  L.push(`description: ${oneLine(tool.description || `Recourse-verified ${tool.domain} tool`)}`);
  if (opts.license) L.push(`license: ${oneLine(opts.license)}`);
  L.push('---');
  L.push('');
  L.push(`# ${tool.name}`);
  L.push('');
  L.push(`Recourse self-developing-OS tool — **${tool.domain}** domain.`);
  L.push('');
  if (tool.description) {
    L.push(tool.description);
    L.push('');
  }
  L.push('## Provenance');
  L.push('');
  L.push('- Version: ' + version.version);
  L.push('- Verifier: ' + (version.passed_verifier ? 'PASSED' : 'not passed'));
  L.push('- Score: ' + version.score.toFixed(2));
  L.push('- Hash: ' + version.hash);
  if (version.verifier_notes) {
    L.push('');
    L.push('- Notes: ' + version.verifier_notes);
  }
  if (version.source_code) {
    L.push('');
    L.push('## Source');
    L.push('');
    L.push('```ts');
    L.push(version.source_code);
    L.push('```');
  }
  if (version.test_suite_code) {
    L.push('');
    L.push('## Test suite');
    L.push('');
    L.push('```ts');
    L.push(version.test_suite_code);
    L.push('```');
  }
  return L.join('\n') + '\n';
}

export interface ExportResult {
  ok: boolean;
  toolName: string;
  version?: string;
  outRoot: string;
  dir: string; // directory rel to outRoot, e.g. recourse-tools/<safe>
  files: { rel: string; bytes: number }[];
  error?: string;
}

/**
 * Write a verified registry tool to disk as a SKILL.md folder under outRoot.
 * Layout (rescanable by scanSkillRoot):
 *   <outRoot>/recourse-tools/<safe>/SKILL.md
 *   <outRoot>/recourse-tools/<safe>/src/<safe>.ts        (verified source)
 *   <outRoot>/recourse-tools/<safe>/tests/<safe>.test.ts (verified suite)
 * Path traversal is impossible: <safe> is derived from the name and re-validated.
 */
export async function exportSkillFiles(
  tool: ToolEntry,
  version: ToolVersion,
  outRoot: string,
  opts: { license?: string } = {},
): Promise<ExportResult> {
  try {
    const safe = skillSafeName(tool.name);
    if (!safe || safe === 'untitled' || !/^[a-z0-9-]+$/.test(safe)) {
      return { ok: false, toolName: tool.name, outRoot, dir: '', files: [], error: `unsafe name: ${tool.name}` };
    }
    const base = path.join(outRoot, 'recourse-tools', safe);
    // Belt-and-braces: never allow the derived path to escape outRoot.
    const rel = path.relative(outRoot, base);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { ok: false, toolName: tool.name, outRoot, dir: '', files: [], error: 'traversal refused' };
    }
    const md = renderSkillMarkdown(tool, version, opts);
    const files: { rel: string; bytes: number }[] = [];
    const write = async (relPath: string, content: string) => {
      const abs = path.join(outRoot, relPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf-8');
      files.push({ rel: relPath, bytes: Buffer.byteLength(content, 'utf-8') });
    };
    await write(path.join('recourse-tools', safe, 'SKILL.md'), md);
    if (version.source_code) {
      await write(path.join('recourse-tools', safe, 'src', `${safe}.ts`), version.source_code);
    }
    if (version.test_suite_code) {
      await write(path.join('recourse-tools', safe, 'tests', `${safe}.test.ts`), version.test_suite_code);
    }
    return { ok: true, toolName: tool.name, version: version.version, outRoot, dir: path.join('recourse-tools', safe), files };
  } catch (err: any) {
    return { ok: false, toolName: tool.name, outRoot, dir: '', files: [], error: err?.message ?? String(err) };
  }
}

/** A fenced code block extracted from a SKILL.md body. */
export interface FencedBlock {
  lang: string;
  code: string;
}

/**
 * Extract ```-fenced code blocks from a markdown body (in order). Used to pull
 * source / test suite out of an exported or community SKILL.md. Pure + honest:
 * returns exactly what is embedded; a body with no fences yields an empty list.
 */
export function extractFencedBlocks(body: string): FencedBlock[] {
  const out: FencedBlock[] = [];
  const re = /```([^\r\n]*)\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push({ lang: m[1].trim(), code: m[2].replace(/\r\n/g, '\n') });
  }
  return out;
}

export interface ImportCandidate {
  ok: boolean;
  name: string;
  description: string;
  domain: ToolDomain;
  license?: string;
  origin: { rootId: string; rel: string };
  /** Runnables the skill actually embeds — may be empty for prose-only skills. */
  source?: string;
  suite?: string;
  /** Honest: a prose-only skill has nothing the code gate can verify. */
  runnable: boolean;
  reason?: string;
}

/**
 * Turn a scanned foreign SKILL.md (raw text + origin) into an UNVERIFIED import
 * candidate. We only trust what the skill explicitly embeds as fenced `ts`/`js`
 * code. Convention (matches our own export format):
 *   - the LAST fenced block is the test suite if preceded by a block
 *   - a block annotated `ts suite`/`test` is the suite; `ts source`/`src` is source
 * Prose-only skills are returned as non-runnable candidates — never guessed.
 */
export function candidateFromSkillText(
  raw: string,
  origin: { rootId: string; rel: string },
  defaultDomain: ToolDomain = 'coding',
): ImportCandidate {
  // Reuse the scanner's tolerant frontmatter parser so the two never drift.
  const parsed = parseSkillDoc(String(raw || ''));
  const fm = { name: parsed.name, description: parsed.description, license: parsed.license, body: parsed.body };

  const name = fm.name || origin.rel.replace(/\/SKILL\.md$/i, '').split('/').pop() || 'untitled';
  const blocks = extractFencedBlocks(fm.body);
  let source: string | undefined;
  let suite: string | undefined;
  for (const b of blocks) {
    const tag = (b.lang + ' ').toLowerCase();
    if (tag.startsWith('ts suite') || tag.startsWith('js suite') || tag.startsWith('suite')) {
      if (!suite) suite = b.code;
      continue;
    }
    if (tag.startsWith('ts source') || tag.startsWith('js source') || tag.startsWith('source') || tag.startsWith('ts src') || tag.startsWith('src')) {
      if (!source) source = b.code;
      continue;
    }
    // Untagged ts/js blocks: if we have no source yet it's the source; if we
    // already have source and no suite yet, treat the next as the suite.
    if (/^(ts|js|typescript|javascript|mjs|tsx)?$/.test(b.lang)) {
      if (!source) source = b.code;
      else if (!suite) suite = b.code;
    }
  }
  const runnable = typeof source === 'string' && source.trim().length > 0;
  return {
    ok: true,
    name,
    description: fm.description || '',
    domain: defaultDomain,
    license: fm.license,
    origin,
    source,
    suite,
    runnable,
    reason: runnable
      ? 'code found; still UNVERIFIED until it passes the server domain gate'
      : 'prose-only skill; no runnable code to verify — cannot pass the promotion gate',
  };
}

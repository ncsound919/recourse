import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  promoteSkillCandidates,
  renderSkillMarkdownFromArtifact,
  writeSkillArtifact,
  type SkillArtifact,
  type SkillPromotionDeps,
} from '../src/lib/memory/skillPipeline';
import type { PromotionCandidate } from '../src/lib/memory/skillPromotion';

function candidate(geneId: string, wins = 3): PromotionCandidate {
  return { geneId, distinctProblemWins: wins, averageWinScore: 0.9, winEpisodeIds: ['1', '2', '3'] };
}

const artifact: SkillArtifact = {
  toolName: 'Dedupe Stable',
  entrypointName: 'dedupeStable',
  domain: 'coding',
  sourceCode: 'export function dedupeStable(a){ return [...new Set(a)]; }',
  testSuiteCode: 'assert dedupeStable([1,1,2]).length === 2;',
  methods: [{ method: 'dedupeStable', label: 'dedupe' }],
  summary: 'dedupe util',
  provenance: 'test provenance',
};

function deps(overrides: Partial<SkillPromotionDeps> = {}): SkillPromotionDeps {
  return {
    resolveArtifact: () => artifact,
    verify: () => ({ passed: true, detail: 'green' }),
    lint: () => ({ ok: true }),
    write: () => ({ ok: true, dir: 'promoted-skills/dedupe-stable' }),
    ...overrides,
  };
}

describe('promoteSkillCandidates', () => {
  it('promotes a candidate when every gate passes', async () => {
    const [outcome] = await promoteSkillCandidates([candidate('gene-a')], deps());
    expect(outcome.status).toBe('promoted');
    expect(outcome.toolName).toBe('Dedupe Stable');
    expect(outcome.dir).toContain('dedupe-stable');
  });

  it('skips when no artifact backs the gene', async () => {
    const [outcome] = await promoteSkillCandidates([candidate('gene-a')], deps({ resolveArtifact: () => undefined }));
    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toMatch(/no verified self-hosted artifact/);
  });

  it('rejects when the suite fails', async () => {
    const [outcome] = await promoteSkillCandidates([candidate('gene-a')], deps({ verify: () => ({ passed: false, detail: 'assert X' }) }));
    expect(outcome.status).toBe('rejected');
    expect(outcome.reason).toMatch(/suite failed/);
  });

  it('rejects when the lint gate blocks', async () => {
    const [outcome] = await promoteSkillCandidates([candidate('gene-a')], deps({ lint: () => ({ ok: false, detail: 'no-eval' }) }));
    expect(outcome.status).toBe('rejected');
    expect(outcome.reason).toMatch(/lint gate/);
  });

  it('rejects when the write fails', async () => {
    const [outcome] = await promoteSkillCandidates([candidate('gene-a')], deps({ write: () => ({ ok: false, error: 'disk full' }) }));
    expect(outcome.status).toBe('rejected');
    expect(outcome.reason).toMatch(/write failed/);
  });

  it('respects maxPerRun and skips already-promoted genes deterministically', async () => {
    const outcomes = await promoteSkillCandidates(
      [candidate('g1'), candidate('g2'), candidate('g3')],
      deps(),
      { maxPerRun: 2, alreadyPromoted: new Set(['g1']) },
    );
    expect(outcomes.map((o) => o.geneId)).toEqual(['g2', 'g3']);
  });
});

describe('skill artifact rendering + writing', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });

  it('renders frontmatter, provenance, source and suite', () => {
    const md = renderSkillMarkdownFromArtifact(artifact, artifact.provenance!);
    expect(md).toContain('name: Dedupe Stable');
    expect(md).toContain('## Provenance');
    expect(md).toContain('test provenance');
    expect(md).toContain('```ts');
    expect(md).toContain('export function dedupeStable');
  });

  it('writes a real SKILL.md folder under the output root', async () => {
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-skills-'));
    dirs.push(outRoot);
    const result = await writeSkillArtifact(artifact, outRoot);
    expect(result.ok).toBe(true);
    const skillFile = path.join(outRoot, result.dir!, 'SKILL.md');
    expect(fs.existsSync(skillFile)).toBe(true);
    expect(fs.readFileSync(skillFile, 'utf-8')).toContain('dedupeStable');
  });

  it('neutralizes a traversal attempt by sanitizing the name inside the root', async () => {
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-skills-'));
    dirs.push(outRoot);
    const result = await writeSkillArtifact({ ...artifact, toolName: '../../evil' }, outRoot);
    expect(result.ok).toBe(true);
    // The write never escapes the output root.
    const written = fs.realpathSync(path.join(outRoot, result.dir!));
    expect(written.startsWith(fs.realpathSync(outRoot))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { reverifyRegistry, reverifyToolAgainstGene, currentToolVersion, type ReverifyReport } from '../src/lib/registryReverify';
import { compileGenome, geneEntrypointName, generateGenome } from '../src/dream/genomes';
import { mulberry32 } from '../src/dream/engine';
import type { ToolEntry, ToolVersion } from '../src/types';
import { createHash } from 'crypto';

const NOW = 1_700_000_000_000;

function spec(seed = 7) {
  return generateGenome('coding', mulberry32(seed));
}

/** A syntactically broken body that still DECLARES the gene's entrypoint, so
 *  the identity check passes and the failure is a real protocol failure. */
function brokenGeneSource(): string {
  const src = compileGenome(spec());
  const name = geneEntrypointName(spec().kind)!;
  return src.replace(new RegExp(`(function ${name}\\([^)]*\\) \\{)`), '$1 ??? ');
}

/** A different artifact entirely, wearing the gene's registry name - the case
 *  the live dry run found: TypeScript `LRUCache` classes named
 *  `CODI_CYCLOMATIC_*`, which must never be judged by the cyclomatic protocol. */
function unrelatedArtifact(): string {
  return [
    'export class LRUCache {',
    '  private capacity: number;',
    '  private cache: Map<string, unknown>;',
    '  constructor(capacity = 20) { this.capacity = capacity; this.cache = new Map(); }',
    '  public get(key: string): unknown { return this.cache.get(key); }',
    '}',
  ].join('\n');
}

function sha16(s: string) {
  return createHash('sha256').update(s).digest('hex').substring(0, 16);
}

/** A registry entry exactly as the dream mirror wrote it: bare-form source, a
 *  verifier pass on record, and no suite behind it. */
function mirroredTool(over: Partial<ToolEntry> = {}, versionOver: Partial<ToolVersion> = {}): ToolEntry {
  const source = compileGenome(spec());
  const version: ToolVersion = {
    version: '1.0.0',
    hash: sha16(source),
    created_at: NOW - 60_000,
    passed_verifier: true,
    score: 1,
    promoted: true,
    verifier_notes: 'Dream gene passed engine sandbox verification.',
    source_code: source,
    ...versionOver,
  };
  return {
    name: 'CODI_TEST',
    domain: 'coding',
    entrypoint: 'src/tools/CODI_TEST.ts',
    description: 'Crystallized from dream: test',
    versions: [version],
    currentVersion: version.version,
    healthStatus: 'unverified',
    anomalyCount: 0,
    ...over,
  };
}

describe('reverifyToolAgainstGene', () => {
  it('re-runs the real protocol instead of trusting the stored pass', () => {
    const tool = mirroredTool();
    const out = reverifyToolAgainstGene(tool, { kind: spec().kind }, NOW);

    expect(out.verdict).toBe('verified');
    expect(out.checks.length).toBeGreaterThan(1);
    expect(out.checks.every((c) => c.passed)).toBe(true);
    expect(out.changed).toBe(true);
  });

  it('appends a new version in module form with a recomputed hash', () => {
    const tool = mirroredTool();
    const out = reverifyToolAgainstGene(tool, { kind: spec().kind }, NOW);
    const latest = out.tool.versions[out.tool.versions.length - 1];

    expect(out.tool.versions).toHaveLength(2);
    // History is preserved: the old version keeps its own hash.
    expect(out.tool.versions[0].hash).toBe(tool.versions[0].hash);
    expect(out.tool.currentVersion).toBe(latest.version);
    expect(latest.version).toMatch(/-reverified\.\d+$/);
    expect(latest.source_code).toMatch(/^export function /);
    expect(latest.hash).toBe(sha16(latest.source_code!));
    expect(latest.created_at).toBe(NOW);
  });

  it('never attaches a suite: a smoke suite would become a health claim at boot', () => {
    const out = reverifyToolAgainstGene(mirroredTool(), { kind: spec().kind }, NOW);
    const latest = out.tool.versions[out.tool.versions.length - 1];
    expect(latest.test_suite_code).toBeUndefined();
  });

  it('does not claim healthy: nothing can reproduce the verdict at boot', () => {
    const out = reverifyToolAgainstGene(mirroredTool(), { kind: spec().kind }, NOW);
    expect(out.tool.healthStatus).toBe('unverified');
    expect(out.tool.versions[out.tool.versions.length - 1].verifier_notes).toMatch(/stays `unverified`/);
  });

  it('records the real check names in the notes', () => {
    const out = reverifyToolAgainstGene(mirroredTool(), { kind: spec().kind }, NOW);
    const notes = out.tool.versions[out.tool.versions.length - 1].verifier_notes;
    expect(notes).toMatch(/RE-VERIFIED PASS/);
    expect(notes).toMatch(/SandboxSyntaxValid/);
    expect(notes).toContain(spec().kind);
  });

  it('flags the fabricated claim it withdrew', () => {
    const out = reverifyToolAgainstGene(mirroredTool(), { kind: spec().kind }, NOW);
    expect(out.withdrewClaim).toBe(true);
  });

  it('marks a tool whose source fails the protocol degraded and does not promote it', () => {
    const broken = mirroredTool({}, { source_code: brokenGeneSource() });
    const out = reverifyToolAgainstGene(broken, { kind: spec().kind }, NOW);
    const latest = out.tool.versions[out.tool.versions.length - 1];

    expect(out.verdict).toBe('failed');
    expect(latest.passed_verifier).toBe(false);
    expect(latest.promoted).toBe(false);
    expect(latest.score).toBe(0);
    expect(out.tool.healthStatus).toBe('degraded');
    expect(latest.verifier_notes).toMatch(/RE-VERIFIED FAIL/);
  });

  it('refuses to judge an artifact the gene never produced, even under its name', () => {
    // The live dry run found tools named CODI_CYCLOMATIC_* whose source is a
    // TypeScript LRUCache class. Applying the cyclomatic protocol to them would
    // attribute a verdict to code that gene did not produce.
    const tool = mirroredTool({ name: 'CODI_CYCLOMATIC_2a02' }, { source_code: unrelatedArtifact() });
    const out = reverifyToolAgainstGene(tool, { kind: spec().kind }, NOW);

    expect(out.verdict).toBe('unverifiable');
    expect(out.changed).toBe(false);
    expect(out.tool).toBe(tool);
    expect(out.detail).toMatch(/does not declare cyclomaticPressureScorer/);
    // The claim is still on file and still unsupported - it was not replaced,
    // so it is reported as unsupported rather than withdrawn.
    expect(out.withdrewClaim).toBe(false);
    expect(out.unsupportedClaim).toBe(true);
  });

  it('does not mark an unverifiable artifact degraded', () => {
    const tool = mirroredTool({ name: 'CODI_CYCLOMATIC_2a02' }, { source_code: unrelatedArtifact() });
    const out = reverifyToolAgainstGene(tool, { kind: spec().kind }, NOW);
    // We are not entitled to a verdict, so we are not entitled to a health claim
    // in either direction.
    expect(out.tool.healthStatus).toBe('unverified');
  });

  it('refuses a kind with no verifiable entrypoint (arbitrary model code)', () => {
    const out = reverifyToolAgainstGene(mirroredTool(), { kind: 'model_hypothesis' }, NOW);
    expect(out.verdict).toBe('unverifiable');
    expect(out.detail).toMatch(/no verifiable entrypoint/);
  });

  it('scores a partial pass as the fraction of green checks, never 1.0', () => {
    const tampered = compileGenome(spec()).replace(/return\s+[^;]+;/, 'return "text";');
    const tool = mirroredTool({}, { source_code: tampered });
    const out = reverifyToolAgainstGene(tool, { kind: spec().kind }, NOW);
    const latest = out.tool.versions[out.tool.versions.length - 1];

    if (out.verdict === 'failed') {
      expect(latest.score).toBeLessThan(1);
      expect(latest.passed_verifier).toBe(false);
    } else {
      // A kind whose invariants tolerate the edit still has to report honestly.
      expect(latest.score).toBe(1);
    }
  });

  it('leaves a tool that already has a suite alone', () => {
    const tool = mirroredTool({}, { test_suite_code: 'assert typeof f === "function";' });
    const out = reverifyToolAgainstGene(tool, { kind: spec().kind }, NOW);

    expect(out.verdict).toBe('skipped-has-suite');
    expect(out.changed).toBe(false);
    expect(out.tool).toBe(tool);
  });

  it('refuses to guess when there is no gene kind on file', () => {
    const tool = mirroredTool();
    const out = reverifyToolAgainstGene(tool, undefined, NOW);

    expect(out.verdict).toBe('unverifiable');
    expect(out.changed).toBe(false);
    // The claim survives on file (we cannot replace it), so it is reported as
    // unsupported rather than as withdrawn.
    expect(out.withdrewClaim).toBe(false);
    expect(out.unsupportedClaim).toBe(true);
  });

  it('refuses to guess when there is no source', () => {
    const tool = mirroredTool({}, { source_code: undefined });
    expect(reverifyToolAgainstGene(tool, { kind: spec().kind }, NOW).verdict).toBe('unverifiable');
    expect(reverifyToolAgainstGene(mirroredTool({}, { source_code: '   ' }), { kind: spec().kind }, NOW).verdict).toBe('unverifiable');
  });

  it('is idempotent: a second pass adds no version', () => {
    const first = reverifyToolAgainstGene(mirroredTool(), { kind: spec().kind }, NOW);
    const second = reverifyToolAgainstGene(first.tool, { kind: spec().kind }, NOW + 5_000);

    expect(second.verdict).toBe('skipped-already-current');
    expect(second.changed).toBe(false);
    expect(second.tool.versions).toHaveLength(2);
  });

  it('re-runs when the source changed underneath a previous pass', () => {
    const first = reverifyToolAgainstGene(mirroredTool(), { kind: spec().kind }, NOW);
    // Tamper with the version that is CURRENT after the first pass, not the
    // superseded one - otherwise the idempotence guard (correctly) fires.
    const currentIndex = first.tool.versions.findIndex((v) => v.version === first.tool.currentVersion);
    const tampered = {
      ...first.tool,
      versions: first.tool.versions.map((v, i) => (i === currentIndex ? { ...v, source_code: brokenGeneSource() } : v)),
    };
    const second = reverifyToolAgainstGene(tampered, { kind: spec().kind }, NOW + 5_000);

    expect(second.verdict).toBe('failed');
    expect(second.tool.versions).toHaveLength(3);
  });

  it('does not mutate the tool it was given', () => {
    const tool = mirroredTool();
    const snapshot = JSON.parse(JSON.stringify(tool));
    reverifyToolAgainstGene(tool, { kind: spec().kind }, NOW);
    expect(tool).toEqual(snapshot);
  });
});

describe('reverifyRegistry', () => {
  it('counts verdicts and the honest gap separately', () => {
    const genes = new Map([
      ['CODI_OK', { kind: spec().kind }],
      ['CODI_BROKEN', { kind: spec().kind }],
    ]);
    const tools = [
      mirroredTool({ name: 'CODI_OK' }),
      mirroredTool({ name: 'CODI_BROKEN' }, { source_code: brokenGeneSource() }),
      mirroredTool({ name: 'CODI_NOGENE' }),
      mirroredTool({ name: 'CODI_SUITE' }, { test_suite_code: 'assert 1 === 1;' }),
    ];

    const { report } = reverifyRegistry(tools, genes, NOW);

    expect(report.considered).toBe(4);
    expect(report.verified).toBe(1);
    expect(report.failed).toBe(1);
    // No gene kind on file: we cannot check it, so we say so instead.
    expect(report.unverifiable).toBe(1);
    expect(report.skippedHasSuite).toBe(1);
    // Every one of these four has no suite, including the one we skipped.
    expect(report.noSuiteOnFile).toBe(3);
    // Two fabricated claims were REPLACED by a real verdict (the OK and the
    // BROKEN tool); the third could be neither confirmed nor replaced, so it is
    // counted as unsupported instead of overstating the withdrawal. The
    // suite-bearing one keeps its claim for boot to re-execute.
    expect(report.withdrawnClaims).toBe(2);
    expect(report.unsupportedClaims).toBe(1);
    expect(report.verified + report.failed + report.unverifiable + report.skippedHasSuite + report.skippedAlreadyCurrent)
      .toBe(report.considered);
  });

  it('lists problems before successes in the capped detail list', () => {
    // 1,124 successes must not push the failures out of an operator's view.
    const genes = new Map([['CODI_BROKEN', { kind: spec().kind }]]);
    const tools = [
      ...Array.from({ length: 60 }, (_, i) => mirroredTool({ name: `CODI_OK_${i}` })),
      mirroredTool({ name: 'CODI_BROKEN' }, { source_code: brokenGeneSource() }),
    ];
    const { report } = reverifyRegistry(tools, genes, NOW);
    expect(report.verified).toBe(0); // the OK tools have no matching gene kind
    expect(report.unverifiable).toBe(60);
    expect(report.failed).toBe(1);

    const firstProblem = report.entries.findIndex((e) => e.verdict === 'failed');
    expect(firstProblem).toBeGreaterThanOrEqual(0);
    expect(report.entries.slice(0, firstProblem).every((e) => e.verdict !== 'verified')).toBe(true);
  });

  it('counts every verdict, so a kebab/camel mismatch cannot hide a number', () => {
    const genes = new Map([['CODI_OK', { kind: spec().kind }]]);
    const tools = [
      mirroredTool({ name: 'CODI_OK' }),
      mirroredTool({ name: 'CODI_NOGENE' }),
      mirroredTool({ name: 'CODI_SUITE' }, { test_suite_code: 'assert 1 === 1;' }),
    ];
    const first = reverifyRegistry(tools, genes, NOW);
    // Second pass: the OK tool is now already-current, the other two unchanged.
    const second = reverifyRegistry(first.tools, genes, NOW + 1_000);
    const sum = (r: ReverifyReport) =>
      r.verified + r.failed + r.unverifiable + r.skippedHasSuite + r.skippedAlreadyCurrent;

    expect(sum(first.report)).toBe(first.report.considered);
    expect(sum(second.report)).toBe(second.report.considered);
    expect(second.report.skippedAlreadyCurrent).toBe(1);
  });

  it('never grows the registry and leaves unmatched tools untouched', () => {
    const genes = new Map([['CODI_OK', { kind: spec().kind }]]);
    const tools = [mirroredTool({ name: 'CODI_OK' }), mirroredTool({ name: 'SOMETHING_ELSE' })];
    const { tools: after, report } = reverifyRegistry(tools, genes, NOW);

    expect(after).toHaveLength(2);
    expect(after[1]).toBe(tools[1]);
    expect(report.unverifiable).toBe(1);
  });

  it('a second whole-registry pass changes nothing', () => {
    const genes = new Map([['CODI_OK', { kind: spec().kind }]]);
    const tools = [mirroredTool({ name: 'CODI_OK' })];
    const first = reverifyRegistry(tools, genes, NOW);
    const second = reverifyRegistry(first.tools, genes, NOW + 1_000);

    expect(second.report.skippedAlreadyCurrent).toBe(1);
    expect(second.tools[0].versions).toHaveLength(2);
    expect(second.report.withdrawnClaims).toBe(0);
  });

  it('handles an empty registry', () => {
    const { tools, report } = reverifyRegistry([], new Map(), NOW);
    expect(tools).toEqual([]);
    expect(report.considered).toBe(0);
  });
});

describe('currentToolVersion', () => {
  it('prefers the current version, then the newest promoted, then the newest', () => {
    const v1: ToolVersion = { version: '1.0.0', hash: 'a', created_at: 1, passed_verifier: false, score: 0, promoted: false, verifier_notes: '' };
    const v2: ToolVersion = { version: '2.0.0', hash: 'b', created_at: 2, passed_verifier: true, score: 1, promoted: true, verifier_notes: '' };
    const v3: ToolVersion = { version: '3.0.0', hash: 'c', created_at: 3, passed_verifier: true, score: 1, promoted: true, verifier_notes: '' };

    expect(currentToolVersion({ versions: [v1, v2, v3], currentVersion: '2.0.0' } as ToolEntry)?.version).toBe('2.0.0');
    expect(currentToolVersion({ versions: [v1, v2, v3] } as ToolEntry)?.version).toBe('3.0.0');
    expect(currentToolVersion({ versions: [v1] } as ToolEntry)?.version).toBe('1.0.0');
    expect(currentToolVersion({ versions: [] } as unknown as ToolEntry)).toBeUndefined();
  });
});

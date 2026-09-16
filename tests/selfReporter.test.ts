import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildReporterFacts,
  composeArticle,
  fingerprintReporterFacts,
  canonicalStringify,
  narrateArticle,
  type ReporterState,
} from '../src/lib/selfReporter.js';
import {
  saveReporterArticle,
  latestReporterArticle,
  getReporterArticle,
  listReporterArticles,
  reporterStatus,
} from '../src/lib/reporterStore.js';
import { deriveCodexBag, dominantCondition, selectProtocol, scoreCodex, type MetaphorInput } from '../src/lib/reporterMetaphor.js';
import { resolveVoice, phrase, seedFrom } from '../src/lib/reporterVoice.js';
import { scoreProse, deslop } from '../src/lib/reporterProse.js';
import { monteCarloCodex, monteCarloProtocol } from '../src/lib/reporterMonteCarlo.js';

function state(overrides: Partial<ReporterState> = {}): ReporterState {
  return {
    generation: 7,
    registry: {
      total: 10,
      healthy: 9,
      degraded: 1,
      selfHosted: 2,
      domains: [
        { domain: 'math', count: 5 },
        { domain: 'coding', count: 5 },
      ],
    },
    provenance: {
      total: 100,
      byType: [{ type: 'tool_promoted', count: 3 }],
      chainValid: true,
      lastHash: 'a'.repeat(64),
    },
    jobs: [
      { id: 'forge', name: 'Forge', group: 'autonomy', enabled: true, runCount: 12, failCount: 1, lastOk: true, cadenceMs: 60_000 },
    ],
    development: { promotions: 3, repairs: 1, pending: 0, rejected: 2, heldBack: 0, agendaHead: 'Solve X', activeLoops: ['Forge'] },
    growth: {
      dreamActive: true,
      dreamCycles: 9,
      cognitiveCoherence: 0.81234,
      crystallizedGenes: 4,
      learnerEpisodes: 33,
      calibration: 0.7,
      skills: 6,
      corpusArtifacts: 8,
    },
    goals: { mathSolved: 1, mathTotal: 4, biotechPassed: 2, biotechTotal: 5 },
    connections: [{ name: 'Local model', reachable: true }],
    data: { registryTools: 10, provenanceEvents: 100, modelProfile: 'local', modelOnline: true },
    ...overrides,
  };
}

describe('selfReporter determinism', () => {
  it('produces an identical fingerprint and markdown for identical state', () => {
    const a = composeArticle(buildReporterFacts(state()), 1);
    const b = composeArticle(buildReporterFacts(state()), 2);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.markdown).toBe(b.markdown);
  });

  it('is insensitive to input ordering (canonicalizes arrays)', () => {
    const forward = composeArticle(buildReporterFacts(state()), 1);
    const reordered = composeArticle(
      buildReporterFacts(state({ registry: { ...state().registry, domains: [...state().registry.domains].reverse() } })),
      1,
    );
    expect(forward.fingerprint).toBe(reordered.fingerprint);
  });

  it('changes the fingerprint when the state actually changes', () => {
    const before = fingerprintReporterFacts(buildReporterFacts(state()));
    const after = fingerprintReporterFacts(buildReporterFacts(state({ generation: 8 })));
    expect(before).not.toBe(after);
  });

  it('excludes the timestamp from the body and fingerprint', () => {
    const facts = buildReporterFacts(state());
    const early = composeArticle(facts, 0);
    const late = composeArticle(facts, Date.now());
    expect(early.fingerprint).toBe(late.fingerprint);
    expect(early.markdown).toBe(late.markdown);
  });

  it('reports a faulted chain plainly instead of hiding it', () => {
    const article = composeArticle(buildReporterFacts(state({ provenance: { ...state().provenance, chainValid: false } })));
    expect(article.headline).toMatch(/integrity fault/i);
    expect(article.markdown).toMatch(/BROKEN/);
  });

  it('canonicalStringify sorts object keys', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe('selfReporter narration', () => {
  const article = composeArticle(buildReporterFacts(state()), 1);

  it('returns non-canonical prose only when the model is online', async () => {
    const r = await narrateArticle(article, async () => ({ ok: true, content: 'A rewritten dispatch.', status: 'online', model: 'local' }));
    expect(r.ok).toBe(true);
    expect(r.prose).toBe('A rewritten dispatch.');
    expect(article.narration).toBeNull();
  });

  it('fails honestly when the model is offline', async () => {
    const r = await narrateArticle(article, async () => ({ ok: false, content: '', status: 'offline' }));
    expect(r.ok).toBe(false);
    expect(r.prose).toBeUndefined();
  });
});

describe('selfReporter voices, formats, metaphor, codex', () => {
  it('changes the article when the voice or format changes', () => {
    const field = composeArticle(buildReporterFacts(state({ voiceId: 'field', format: 'dispatch' })), 1);
    const codex = composeArticle(buildReporterFacts(state({ voiceId: 'codex', format: 'dispatch' })), 1);
    const briefing = composeArticle(buildReporterFacts(state({ voiceId: 'field', format: 'briefing' })), 1);
    expect(field.fingerprint).not.toBe(codex.fingerprint);
    expect(field.markdown).not.toBe(codex.markdown);
    expect(field.markdown).not.toBe(briefing.markdown);
  });

  it('is still deterministic across voice + format + timestamp', () => {
    const a = composeArticle(buildReporterFacts(state({ voiceId: 'storyteller', format: 'podcast' })), 10);
    const b = composeArticle(buildReporterFacts(state({ voiceId: 'storyteller', format: 'podcast' })), 99);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.markdown).toBe(b.markdown);
  });

  it('selects the integrity-fault protocol when the record is broken', () => {
    const broken = state({ provenance: { ...state().provenance, chainValid: false } });
    const facts = buildReporterFacts(broken);
    expect(facts.metaphor.condition).toBe('integrity_fault');
    expect(['The Skrull Infiltration', 'The Sentinel Logic']).toContain(facts.metaphor.archetype);
    expect(facts.codex.verdict).toBe('NO-GO');
    expect(composeArticle(facts).markdown).toMatch(/BROKEN/);
  });

  it('exposes a codex verdict with all five dimensions', () => {
    const codex = buildReporterFacts(state()).codex;
    expect(Object.keys(codex.scores).sort()).toEqual(['capacity', 'coherence', 'flow', 'risk', 'trueness']);
    expect(['GO', 'NO-GO']).toContain(codex.verdict);
    expect(codex.sensitivity.length).toBeLessThanOrEqual(3);
  });

  it('dominantCondition follows fixed priority', () => {
    const input: MetaphorInput = {
      generation: 1, chainValid: false, connectionsUp: 0, connectionsTotal: 1, jobsEnabled: 1, jobsTotal: 1,
      jobRuns: 1, jobFailures: 0, registryTotal: 1, registryHealthy: 1, registryDegraded: 0,
      promotions: 5, repairs: 5, rejected: 0, heldBack: 0, pending: 0, dreamActive: true, dreamCycles: 1,
      crystallizedGenes: 1, learnerEpisodes: 1, calibration: 0.5, domains: 1, skills: 1, corpusArtifacts: 1,
      agendaHead: null, modelOnline: true,
    };
    expect(dominantCondition(input)).toBe('integrity_fault');
    expect(dominantCondition({ ...input, chainValid: true, connectionsUp: 0 })).toBe('links_down');
    expect(dominantCondition({ ...input, chainValid: true, connectionsUp: 1 })).toBe('repairing');
    expect(dominantCondition({ ...input, chainValid: true, connectionsUp: 1, repairs: 0 })).toBe('building');
  });

  it('protocol selection and seeded phrase are reproducible', () => {
    const input = {
      generation: 1, chainValid: true, connectionsUp: 1, connectionsTotal: 1, jobsEnabled: 1, jobsTotal: 1,
      jobRuns: 1, jobFailures: 0, registryTotal: 1, registryHealthy: 1, registryDegraded: 0,
      promotions: 0, repairs: 0, rejected: 0, heldBack: 0, pending: 0, dreamActive: true, dreamCycles: 1,
      crystallizedGenes: 1, learnerEpisodes: 1, calibration: 0.5, domains: 1, skills: 1, corpusArtifacts: 1,
      agendaHead: null, modelOnline: true,
    };
    const seed = seedFrom('stable');
    const a = selectProtocol(input, seed).protocol.id;
    const b = selectProtocol(input, seed).protocol.id;
    expect(a).toBe(b);
    expect(phrase(seed, 'k', ['a', 'b', 'c'])).toBe(phrase(seed, 'k', ['a', 'b', 'c']));
  });

  it('codex is a pure function of the input', () => {
    const input = {
      generation: 1, chainValid: true, connectionsUp: 1, connectionsTotal: 1, jobsEnabled: 1, jobsTotal: 1,
      jobRuns: 10, jobFailures: 2, registryTotal: 10, registryHealthy: 9, registryDegraded: 1,
      promotions: 3, repairs: 1, rejected: 1, heldBack: 0, pending: 0, dreamActive: true, dreamCycles: 3,
      crystallizedGenes: 4, learnerEpisodes: 12, calibration: 0.7, domains: 2, skills: 4, corpusArtifacts: 6,
      agendaHead: 'x', modelOnline: true,
    };
    expect(scoreCodex(input).scores).toEqual(scoreCodex(input).scores);
  });

  it('resolves a soul override into the voice', () => {
    const voice = resolveVoice('field', {
      identity: { name: 'Custom Engine', role: 'tester' },
      agenda: { mission: 'Tell the truth', anti_goals: ['spin'] },
      preferences: { communication: { verbosity: 'deep', tone: 'blunt' } },
    });
    expect(voice.identity.name).toBe('Custom Engine');
    expect(voice.mission).toBe('Tell the truth');
    expect(voice.verbosity).toBe('deep');
    expect(voice.antiGoals).toEqual(['spin']);
  });
});

describe('reporterProse + Monte Carlo', () => {
  const slop =
    'In today\'s fast-paced world, we must leverage a holistic approach. It\'s not just about tools, it\'s about people — and at the end of the day, this comprehensive guide is a testament to that. Additionally, we utilize synergies. Furthermore, we unlock the full potential.';
  const clean =
    'The loader parses the file at startup. It took three attempts to get right. The second one failed on a locked handle, so the code now retries once before giving up.';

  it('scores slop higher than clean prose and names the tells', () => {
    const bad = scoreProse(slop);
    const good = scoreProse(clean);
    expect(bad.score).toBeGreaterThan(good.score);
    expect(bad.findings.length).toBeGreaterThan(0);
  });

  it('deslop rewrites safely and deterministically', () => {
    const once = deslop('We leverage synergy in order to utilize this.');
    const twice = deslop('We leverage synergy in order to utilize this.');
    expect(once.text).toBe(twice.text);
    expect(once.text).toMatch(/\buse\b/);
    expect(once.text).not.toMatch(/\butilize\b/);
  });

  it('produces a deterministic Monte Carlo over the codex', () => {
    const bag = deriveCodexBag({
      generation: 1, chainValid: true, connectionsUp: 1, connectionsTotal: 1, jobsEnabled: 1, jobsTotal: 1,
      jobRuns: 10, jobFailures: 1, registryTotal: 10, registryHealthy: 9, registryDegraded: 1,
      promotions: 3, repairs: 1, rejected: 1, heldBack: 0, pending: 0, dreamActive: true, dreamCycles: 3,
      crystallizedGenes: 4, learnerEpisodes: 12, calibration: 0.7, domains: 2, skills: 4, corpusArtifacts: 6,
      agendaHead: 'x', modelOnline: true,
    });
    const a = monteCarloCodex(bag, 12345);
    const b = monteCarloCodex(bag, 12345);
    expect(a).toEqual(b);
    expect(a.goProbability).toBeGreaterThanOrEqual(0);
    expect(a.goProbability).toBeLessThanOrEqual(1);
    expect(['GO', 'NO-GO']).toContain(a.baseVerdict);
  });

  it('produces a deterministic protocol distribution summing to ~1', () => {
    const input = {
      generation: 1, chainValid: true, connectionsUp: 1, connectionsTotal: 1, jobsEnabled: 1, jobsTotal: 1,
      jobRuns: 10, jobFailures: 1, registryTotal: 10, registryHealthy: 9, registryDegraded: 1,
      promotions: 0, repairs: 0, rejected: 0, heldBack: 0, pending: 0, dreamActive: true, dreamCycles: 3,
      crystallizedGenes: 4, learnerEpisodes: 12, calibration: 0.7, domains: 2, skills: 4, corpusArtifacts: 6,
      agendaHead: 'x', modelOnline: true,
    };
    const a = monteCarloProtocol(input, 999);
    const b = monteCarloProtocol(input, 999);
    expect(a).toEqual(b);
    const total = a.probabilities.reduce((s, p) => s + p.p, 0);
    expect(Math.abs(total - 1)).toBeLessThan(0.02);
    expect(a.probabilities[0].condition).toBe(a.baseCondition);
  });
});

describe('reporterStore', () => {
  const dir = path.join(os.tmpdir(), `recourse-reporter-test-${process.pid}`);

  beforeAll(() => {
    process.env.REPORTER_DIR = dir;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    process.env.REPORTER_DIR = '';
  });

  it('saves, dedupes by fingerprint, and reads back the latest', () => {
    const article = composeArticle(buildReporterFacts(state()), Date.now());
    const first = saveReporterArticle(article);
    expect(first.deduped).toBe(false);
    const second = saveReporterArticle(article);
    expect(second.deduped).toBe(true);

    expect(listReporterArticles().length).toBe(1);
    expect(latestReporterArticle()?.fingerprint).toBe(article.fingerprint);
    expect(getReporterArticle(article.fingerprint)?.markdown).toBe(article.markdown);
    expect(reporterStatus().articleCount).toBe(1);
  });

  it('refuses a non-hex fingerprint (path traversal guard)', () => {
    expect(getReporterArticle('../../etc/passwd')).toBeNull();
    expect(getReporterArticle('not-a-hash')).toBeNull();
  });
});

describe('audit narration (F4)', () => {
  const audit = {
    grade: 'C',
    score: 72,
    deterministicScore: 68,
    coveragePercent: 75,
    scope: 'diff' as const,
    dimensions: [
      { dimension: 'security', label: 'Security', status: 'covered' as const, score: 80 },
      { dimension: 'tests', label: 'Tests', status: 'covered' as const, score: 95 },
      { dimension: 'licenses', label: 'Licenses', status: 'uncovered' as const, score: null },
    ],
    findings: { total: 12, new: 3, fixed: 1, persisted: 8 },
    reasons: ['Security +20 (60→80)'],
  };

  it('says plainly when no audit is recorded', () => {
    const facts = buildReporterFacts(state());
    expect(facts.audit).toHaveLength(1);
    expect(facts.audit[0]).toContain('No audit has been recorded');
  });

  it('narrates grade, coverage gaps, findings and the regression reason', () => {
    const facts = buildReporterFacts(state({ audit }));
    const joined = facts.audit.join(' ');
    expect(joined).toContain('C');
    expect(joined).toContain('72/100');
    expect(joined).toContain('68/100');
    expect(joined).toContain('Licenses');
    expect(joined).toContain('3 new');
    expect(joined).toContain('Security +20');
    expect(facts.counts.auditCoverage).toBe(75);
    expect(facts.counts.auditNewFindings).toBe(3);
    expect(facts.tables.find((t) => t.id === 'audit')?.rows).toHaveLength(3);
  });

  it('renders an "How I audit" section in the article', () => {
    const article = composeArticle(buildReporterFacts(state({ audit })), 1);
    expect(article.markdown).toContain('How I audit');
    expect(article.markdown).toContain('Audit by dimension');
  });
});

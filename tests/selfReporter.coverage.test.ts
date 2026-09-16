import { describe, it, expect, vi } from 'vitest';
import {
  canonicalStringify,
  sha256Hex,
  buildReporterFacts,
  fingerprintReporterFacts,
  composeArticle,
  renderFormatMarkdown,
  renderArticleMarkdown,
  narrateArticle,
  type ReporterFacts,
  type ReporterState,
  type ReporterChatFn,
} from '../src/lib/selfReporter.js';

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
        { domain: 'coding', count: 9 },
      ],
    },
    provenance: {
      total: 100,
      byType: [{ type: 'tool_promoted', count: 3 }],
      chainValid: true,
      lastHash: 'b'.repeat(64),
    },
    jobs: [
      { id: 'forge', name: 'Forge', group: 'autonomy', enabled: true, runCount: 12, failCount: 1, lastOk: true, cadenceMs: 60_000 },
    ],
    development: { promotions: 0, repairs: 0, pending: 0, rejected: 0, heldBack: 0, agendaHead: 'Solve X', activeLoops: ['Forge'] },
    growth: {
      dreamActive: false,
      dreamCycles: 9,
      cognitiveCoherence: 0.81234,
      crystallizedGenes: 4,
      learnerEpisodes: 5,
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

function factsFor(overrides: Partial<ReporterState> = {}): ReporterFacts {
  return buildReporterFacts(state(overrides));
}

function jobTable(facts: ReporterFacts) {
  return facts.tables.find((t) => t.id === 'jobs')!;
}

describe('canonicalStringify', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalStringify({ b: { d: 1, c: 2 }, a: [3, { y: 1, x: 2 }] })).toBe(
      '{"a":[3,{"x":2,"y":1}],"b":{"c":2,"d":1}}',
    );
  });

  it('renders primitives and nullish values', () => {
    expect(canonicalStringify('x')).toBe('"x"');
    expect(canonicalStringify(7)).toBe('7');
    expect(canonicalStringify(true)).toBe('true');
    expect(canonicalStringify(null)).toBe('null');
    expect(canonicalStringify(undefined)).toBe('null');
  });

  it('canonicalizes nested arrays', () => {
    expect(canonicalStringify([1, 'a', null, [2]])).toBe('[1,"a",null,[2]]');
  });
});

describe('sha256Hex', () => {
  it('matches the known SHA-256 of "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('buildReporterFacts — headline priority', () => {
  it('reports an integrity fault first', () => {
    const f = factsFor({ provenance: { ...state().provenance, chainValid: false } });
    expect(f.headline).toMatch(/integrity fault/i);
  });

  it('reports a down outside link before any other condition', () => {
    const f = factsFor({
      connections: [{ name: 'A', reachable: false }],
      development: { ...state().development, repairs: 3, promotions: 3 },
    });
    expect(f.headline).toMatch(/outside link/);
  });

  it('reports repairs when links are up', () => {
    const f = factsFor({ development: { ...state().development, repairs: 2, promotions: 5 } });
    expect(f.headline).toMatch(/repaired itself 2 times/);
  });

  it('reports new capabilities when nothing was repaired', () => {
    const f = factsFor({ development: { ...state().development, repairs: 0, promotions: 3 } });
    expect(f.headline).toMatch(/built 3 new capabilities/);
  });

  it('reports dreaming when there is no build or repair', () => {
    const f = factsFor({
      growth: { ...state().growth, dreamActive: true, learnerEpisodes: 5 },
      development: { ...state().development, repairs: 0, promotions: 0 },
    });
    expect(f.headline).toMatch(/dreaming/);
  });

  it('reports learning when idle but episodes exist', () => {
    const f = factsFor({
      growth: { ...state().growth, dreamActive: false, learnerEpisodes: 5 },
      development: { ...state().development, repairs: 0, promotions: 0 },
    });
    expect(f.headline).toMatch(/learning/);
  });

  it('reports steady when nothing is happening', () => {
    const f = factsFor({
      growth: { ...state().growth, dreamActive: false, learnerEpisodes: 0 },
      development: { ...state().development, repairs: 0, promotions: 0 },
    });
    expect(f.headline).toMatch(/steady/);
  });
});

describe('buildReporterFacts — narrative branches', () => {
  it('reports no queued agenda item and no active loops', () => {
    const f = factsFor({ development: { ...state().development, agendaHead: null, activeLoops: [] } });
    const joined = f.development.join(' ');
    expect(joined).toMatch(/no agenda item queued/i);
    expect(joined).toMatch(/No self-development loops/i);
  });

  it('adds the safety note when work is held back', () => {
    const f = factsFor({ development: { ...state().development, pending: 1, rejected: 2, heldBack: 3 } });
    expect(f.development.join(' ')).toMatch(/1 await approval, 3 were kept back as non-improving, and 2 were rejected/);
  });

  it('reports a self-contained system when no connections are configured', () => {
    const f = factsFor({ connections: [] });
    expect(f.connections.join(' ')).toMatch(/entirely self-contained/);
  });

  it('names unreachable connections plainly', () => {
    const f = factsFor({ connections: [{ name: 'Arxiv', reachable: false }, { name: 'GitHub', reachable: true }] });
    expect(f.connections.join(' ')).toMatch(/cannot reach: Arxiv/);
  });

  it('notes when no model profile has answered', () => {
    const f = factsFor({ data: { ...state().data, modelProfile: null } });
    expect(f.connections.join(' ')).toMatch(/No language model profile has answered yet/);
  });

  it('reports a paused dream and unknown calibration honestly', () => {
    const f = factsFor({ growth: { ...state().growth, dreamActive: false, calibration: null } });
    expect(f.growth.join(' ')).toMatch(/Dreaming is paused/);
    expect(f.growth.join(' ')).toMatch(/not enough learning history/);
  });

  it('reports zero-data percentages as "no data yet"', () => {
    const f = factsFor({ goals: { mathSolved: 0, mathTotal: 0, biotechPassed: 0, biotechTotal: 0 } });
    expect(f.growth.join(' ')).toMatch(/no data yet/);
  });

  it('uses a collective voice ("we"/"our")', () => {
    const f = factsFor({ voiceId: 'engineer' });
    expect(f.voice.selfReference).toBe('collective');
    expect(f.systems[0]).toMatch(/\bwe\b/);
  });

  it('reports the top domain and pluralizes the domain count', () => {
    const f = factsFor();
    expect(f.systems.join(' ')).toContain('coding');
    expect(f.systems.join(' ')).toMatch(/2 domains/);
  });

  it('falls back to "nothing yet" with no domains', () => {
    const f = factsFor({ registry: { ...state().registry, domains: [] } });
    expect(f.systems.join(' ')).toMatch(/0 domains/);
    expect(f.systems.join(' ')).toContain('nothing yet');
  });
});

describe('buildReporterFacts — jobs table formatting', () => {
  it('formats state, last result, and every cadence branch', () => {
    const f = factsFor({
      jobs: [
        { id: 'a', name: 'A', group: 'g', enabled: true, runCount: 1, failCount: 0, lastOk: null, cadenceMs: null },
        { id: 'b', name: 'B', group: 'g', enabled: false, runCount: 2, failCount: 1, lastOk: false, cadenceMs: 3_600_000 },
        { id: 'c', name: 'C', group: 'g', enabled: true, runCount: 3, failCount: 0, lastOk: true, cadenceMs: 7_200_000 },
        { id: 'd', name: '', group: 'g', enabled: true, runCount: 0, failCount: 0, lastOk: true, cadenceMs: 60_000 },
        { id: 'e', name: 'E', group: 'g', enabled: true, runCount: 0, failCount: 0, lastOk: true, cadenceMs: 90_000 },
        { id: 'f', name: 'F', group: 'g', enabled: true, runCount: 0, failCount: 0, lastOk: true, cadenceMs: 0 },
      ],
    });
    const rows = jobTable(f).rows;
    const byId = (id: string) => rows.find((r) => r[0] === id || r[0] === id.toUpperCase())!;
    expect(byId('a')[2]).toBe('on');
    expect(byId('a')[5]).toBe('not run yet');
    expect(byId('a')[6]).toBe('on a schedule');
    expect(byId('b')[2]).toBe('off');
    expect(byId('b')[5]).toBe('failed');
    expect(byId('b')[6]).toBe('every 1 hour');
    expect(byId('c')[6]).toBe('every 2 hours');
    expect(byId('d')[0]).toBe('d');
    expect(byId('d')[6]).toBe('every 1 minute');
    expect(byId('e')[6]).toBe('every 90 seconds');
    expect(byId('f')[6]).toBe('on a schedule');
  });

  it('exposes counts that match the state', () => {
    const f = factsFor({ jobs: [] });
    expect(f.counts.jobsTotal).toBe(0);
    expect(f.counts.jobsEnabled).toBe(0);
    expect(f.counts.registryTotal).toBe(10);
    expect(f.counts.connectionsUp).toBe(1);
    expect(f.counts.connectionsTotal).toBe(1);
    expect(f.counts.learnerEpisodes).toBe(5);
  });
});

describe('composeArticle', () => {
  it('derives the fingerprint and id and defaults generatedAt to 0', () => {
    const facts = factsFor();
    const article = composeArticle(facts);
    expect(article.fingerprint).toBe(fingerprintReporterFacts(facts));
    expect(article.id).toBe(article.fingerprint.slice(0, 12));
    expect(article.generatedAt).toBe(0);
    expect(article.narration).toBeNull();
    expect(article.wordCount).toBeGreaterThan(0);
  });

  it('renders the dispatch body, tables, and depth metadata', () => {
    const facts = factsFor({ format: 'dispatch' });
    const article = composeArticle(facts, 123);
    expect(article.markdown).toContain('# Recourse, in its own words —');
    expect(article.markdown).toContain('## My running jobs');
    expect(article.markdown).toContain('## My outside connections');
    expect(article.markdown).toContain('## How this chapter reads:');
    expect(article.markdown).toContain('## My quality codex');
    expect(article.markdown).toContain('## How sure I am (Monte Carlo)');
    expect(article.markdown).toContain('## How the writing scores');
    expect(article.generatedAt).toBe(123);
  });

  it('renders an empty-table note when there is nothing to report', () => {
    const article = composeArticle(factsFor({ jobs: [], connections: [] }));
    expect(article.markdown).toContain('_Nothing to report yet._');
  });

  it('emits a briefing with status/risk/next-action sections', () => {
    const article = composeArticle(factsFor({ format: 'briefing' }));
    expect(article.markdown).toContain('## Status');
    expect(article.markdown).toContain('## Risk');
    expect(article.markdown).toContain('## Next action');
    // The dispatch body runs through deslop, which rewrites "leverage" -> "use".
    expect(article.markdown).toContain('lever:');
  });

  it('emits a podcast monologue', () => {
    const article = composeArticle(factsFor({ format: 'podcast' }));
    expect(article.markdown).toContain('**Hook:**');
    expect(article.markdown).toContain('Act One, The Setup');
    expect(article.markdown).toContain('Act Three, The Resolution');
    expect(article.markdown).toContain('**Numbers:**');
  });

  it('emits a dialogue script', () => {
    const article = composeArticle(factsFor({ format: 'dialogue' }));
    expect(article.markdown).toContain('**Characters:**');
    expect(article.markdown).toContain('**Listener:**');
  });
});

describe('renderFormatMarkdown', () => {
  it('falls back to the dispatch renderer for an unknown format', () => {
    const facts = { ...factsFor(), format: 'dispatch' as const };
    const md = renderFormatMarkdown(facts, 'Title', [
      { id: 'systems', heading: 'Systems', paragraphs: ['paragraph'] },
    ]);
    expect(md).toContain('# Title');
    expect(md).toContain('## Systems');
    expect(md).toContain('paragraph');
    expect(md).toContain('My running jobs');
  });

  it('omits the highest-leverage lever when no sensitivity is reported', () => {
    const facts = factsFor({ format: 'briefing' });
    const noSensitivity: ReporterFacts = { ...facts, codex: { ...facts.codex, sensitivity: [] } };
    const md = renderFormatMarkdown(noSensitivity, 'Title', []);
    expect(md).toContain('# Briefing —');
    expect(md).not.toContain('Highest-leverage lever');
  });

  it('selects the dialogue verdict wording from the codex verdict', () => {
    const base = factsFor();
    const go: ReporterFacts = { ...base, format: 'dialogue', codex: { ...base.codex, verdict: 'GO' } };
    const noGo: ReporterFacts = { ...base, format: 'dialogue', codex: { ...base.codex, verdict: 'NO-GO' } };
    expect(renderFormatMarkdown(go, 'T', [])).toContain('By my own gates, well.');
    expect(renderFormatMarkdown(noGo, 'T', [])).toContain('By my own gates, not cleanly.');
  });
});

describe('renderArticleMarkdown', () => {
  it('interleaves paragraphs and only the tables belonging to a section', () => {
    const facts = factsFor();
    const md = renderArticleMarkdown({
      title: 'T',
      dek: 'D',
      sections: [
        { id: 'systems', heading: 'Systems', paragraphs: ['p1'] },
        { id: 'growth', heading: 'Growth', paragraphs: ['p2'] },
      ],
      tables: facts.tables,
    });
    expect(md).toContain('# T');
    expect(md).toContain('_D_');
    expect(md).toContain('## Systems');
    expect(md).toContain('p1');
    expect(md).toContain('My running jobs');
    expect(md).toContain('My work by domain');
    expect(md).toContain('## Growth');
    expect(md).toContain('p2');
    expect(md).toContain('Written by Recourse about Recourse');
  });

  it('handles no sections', () => {
    const md = renderArticleMarkdown({ title: 'T', dek: 'D', sections: [], tables: [] });
    expect(md).toContain('# T');
    expect(md).toContain('Written by Recourse about Recourse');
  });
});

describe('narrateArticle', () => {
  const article = composeArticle(factsFor(), 1);

  it('returns trimmed non-canonical prose and forwards the request options', async () => {
    const chat: ReporterChatFn = vi.fn(async () => ({
      ok: true,
      content: '  A warm rewrite.  ',
      status: 'online',
      model: 'local',
    }));
    const r = await narrateArticle(article, chat);
    expect(r).toEqual({ ok: true, prose: 'A warm rewrite.', status: 'online', model: 'local' });
    expect(article.narration).toBeNull();
    const [messages, opts] = (chat as any).mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain(article.voice.tone);
    expect(messages[1]).toEqual({ role: 'user', content: article.markdown });
    expect(opts).toEqual({ temperature: 0.4 });
  });

  it('omits the model field when the result has none', async () => {
    const chat: ReporterChatFn = async () => ({ ok: true, content: 'prose', status: 'online' });
    const r = await narrateArticle(article, chat);
    expect(r.ok).toBe(true);
    expect(r.model).toBeUndefined();
  });

  it('fails honestly when ok is false, carrying the model and error', async () => {
    const chat: ReporterChatFn = async () => ({ ok: false, content: '', status: 'offline', model: 'm1' });
    const r = await narrateArticle(article, chat);
    expect(r.ok).toBe(false);
    expect(r.status).toBe('offline');
    expect(r.model).toBe('m1');
    expect(r.error).toBe('model offline');
  });

  it('rejects an ok:true result whose status is not online', async () => {
    const chat: ReporterChatFn = async () => ({ ok: true, content: 'x', status: 'offline' });
    const r = await narrateArticle(article, chat);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('model offline');
  });

  it('rejects empty prose', async () => {
    const chat: ReporterChatFn = async () => ({ ok: true, content: '', status: 'online' });
    const r = await narrateArticle(article, chat);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('model online');
  });

  it('catches a thrown chat error', async () => {
    const chat: ReporterChatFn = async () => {
      throw new Error('network exploded');
    };
    const r = await narrateArticle(article, chat);
    expect(r).toEqual({ ok: false, status: 'error', error: 'network exploded' });
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildCouncilProblem,
  councilDecide,
  councilState,
  councilLessons,
  councilPostMortem,
} from '../src/lib/genomeCouncil.js';

const BRAIN = 'http://brain.test';

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildCouncilProblem — pure builder', () => {
  it('renders a name with up to four reasons', () => {
    const problem = buildCouncilProblem({
      name: 'Registry flakiness',
      reasons: ['r1', 'r2', 'r3', 'r4', 'r5'],
    });
    expect(problem).toContain('"Registry flakiness"');
    expect(problem).toContain('- r1');
    expect(problem).toContain('- r4');
    expect(problem).not.toContain('- r5');
  });

  it('renders (none recorded) when a name exists without reasons', () => {
    const problem = buildCouncilProblem({ name: 'Lonely finding' });
    expect(problem).toContain('Lonely finding');
    expect(problem).toContain('(none recorded)');
  });

  it('falls back to the generic question with an empty reasons list', () => {
    const generic = buildCouncilProblem();
    const empty = buildCouncilProblem({ reasons: [] });
    expect(generic).toBe(empty);
    expect(generic).toContain('highest-value next repair');
  });
});

describe('genomeCouncil — not-configured guard (no network)', () => {
  it('decide reports BRAIN_URL not configured when no url resolves', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = await councilDecide({ url: '', problem: 'p' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BRAIN_URL not configured/);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('state reports BRAIN_URL not configured when no url resolves', async () => {
    const r = await councilState({ url: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BRAIN_URL not configured/);
  });

  it('lessons reports BRAIN_URL not configured when no url resolves', async () => {
    const r = await councilLessons({ url: '' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BRAIN_URL not configured/);
  });

  it('post-mortem validates required inputs before any network', async () => {
    const r = await councilPostMortem({
      url: BRAIN,
      input: {
        decisionTitle: '',
        predictedProbability: 0.5,
        actualOutcome: 'failure',
        leaderIds: [],
      },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/decisionTitle and at least one leaderIds/);
  });

  it('post-mortem reports BRAIN_URL not configured even with valid input', async () => {
    const r = await councilPostMortem({
      url: '',
      input: {
        decisionTitle: 'T',
        predictedProbability: 0.5,
        actualOutcome: 'success',
        leaderIds: ['mentor'],
      },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BRAIN_URL not configured/);
  });
});

describe('councilDecide — real HTTP', () => {
  it('returns the council result on a 2xx', async () => {
    const mock = vi.fn(async () => okJson({ leaders: ['mentor'], rationale: 'x' }));
    vi.stubGlobal('fetch', mock);
    const r = await councilDecide({ url: BRAIN, problem: 'choose a lens' });
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ leaders: ['mentor'], rationale: 'x' });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BRAIN}/genome-council/decide`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.problem).toBe('choose a lens');
    expect(body.selected_genomes).toBeUndefined();
    expect(body.active_sectors).toBeUndefined();
  });

  it('sends selected genomes and active sectors when provided', async () => {
    const mock = vi.fn(async () => okJson({}));
    vi.stubGlobal('fetch', mock);
    await councilDecide({
      url: BRAIN,
      problem: 'p',
      selectedGenomes: ['mentor', 'scientist'],
      activeSectors: ['oncology'],
      timeoutMs: 1000,
    });
    const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.selected_genomes).toEqual(['mentor', 'scientist']);
    expect(body.active_sectors).toEqual(['oncology']);
  });

  it('reports the HTTP status when the brain answers non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const r = await councilDecide({ url: BRAIN, problem: 'p' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.error).toBe('genome-council/decide HTTP 500');
  });

  it('surfaces a non-JSON body honestly as an empty result envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    const r = await councilDecide({ url: BRAIN, problem: 'p' });
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({});
  });

  it('returns an honest error when the brain is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await councilDecide({ url: BRAIN, problem: 'p' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECONNREFUSED/);
  });

  it('stringifies a non-Error rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('down'));
    const r = await councilDecide({ url: BRAIN, problem: 'p' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('down');
  });

  it('fires the abort timer when the brain never answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
      })),
    );
    const r = await councilDecide({ url: BRAIN, problem: 'p', timeoutMs: 50 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('aborted');
  });
});

describe('councilState — real HTTP', () => {
  it('returns overview and learned weights on a 2xx', async () => {
    const mock = vi.fn(async () => okJson({ learned_weights: { mentor: 0.8 }, total_decisions: 4 }));
    vi.stubGlobal('fetch', mock);
    const r = await councilState({ url: BRAIN });
    expect(r.ok).toBe(true);
    expect(r.overview).toEqual({ learned_weights: { mentor: 0.8 }, total_decisions: 4 });
    expect(r.learnedWeights).toEqual({ mentor: 0.8 });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BRAIN}/genome-council/state`);
    expect(init.method).toBe('GET');
  });

  it('defaults learned weights when the brain omits them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ other: true })));
    const r = await councilState({ url: BRAIN });
    expect(r.ok).toBe(true);
    expect(r.learnedWeights).toEqual({});
  });

  it('reports the HTTP status on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 503 })));
    const r = await councilState({ url: BRAIN });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.error).toBe('genome-council/state HTTP 503');
  });

  it('returns an honest error when the brain is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net::ERR')));
    const r = await councilState({ url: BRAIN });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/net::ERR/);
  });
});

describe('councilLessons — real HTTP', () => {
  it('appends a limit query when a limit is given', async () => {
    const mock = vi.fn(async () => okJson({ total: 2, lessons: [{ id: 'l1' }] }));
    vi.stubGlobal('fetch', mock);
    const r = await councilLessons({ url: BRAIN, limit: 7 });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(2);
    expect(r.lessons).toEqual([{ id: 'l1' }]);
    const [url] = mock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${BRAIN}/genome-council/lessons?limit=7`);
  });

  it('clamps a non-integer limit to a positive integer', async () => {
    const mock = vi.fn(async () => okJson({ total: 0, lessons: [] }));
    vi.stubGlobal('fetch', mock);
    await councilLessons({ url: BRAIN, limit: 2.7 });
    const [url] = mock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${BRAIN}/genome-council/lessons?limit=2`);
  });

  it('skips the query when no limit is provided', async () => {
    const mock = vi.fn(async () => okJson({ total: 0, lessons: [] }));
    vi.stubGlobal('fetch', mock);
    await councilLessons({ url: BRAIN });
    const [url] = mock.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${BRAIN}/genome-council/lessons`);
  });

  it('defaults total and lessons when the body is missing them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({})));
    const r = await councilLessons({ url: BRAIN });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(0);
    expect(r.lessons).toEqual([]);
  });

  it('reports the HTTP status on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));
    const r = await councilLessons({ url: BRAIN });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(r.error).toBe('genome-council/lessons HTTP 404');
  });

  it('returns an honest error when the brain is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('refused')));
    const r = await councilLessons({ url: BRAIN });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/refused/);
  });
});

describe('councilPostMortem — real HTTP', () => {
  const validInput = {
    decisionTitle: 'Repair registry',
    sector: 'dev',
    chosenOption: 'mentor',
    predictedProbability: 0.7,
    actualOutcome: 'success' as const,
    leaderIds: ['mentor'],
    rootCauses: ['flake'],
    keyLessons: ['pin deps'],
    metricVariances: [{ metric: 'm', delta: 1 }],
    retrospectiveSummary: 'summary',
  };

  it('records a post-mortem and maps the ledger fields', async () => {
    const mock = vi.fn(async () =>
      okJson({
        record: { decision_title: 'Repair registry' },
        adjustments_applied: 3,
        lessons_stored: 1,
        durable: true,
        overview: { leader_weights: {} },
      }),
    );
    vi.stubGlobal('fetch', mock);
    const r = await councilPostMortem({ url: BRAIN, input: validInput });
    expect(r.ok).toBe(true);
    expect(r.record).toEqual({ decision_title: 'Repair registry' });
    expect(r.adjustmentsApplied).toBe(3);
    expect(r.lessonsStored).toBe(1);
    expect(r.durable).toBe(true);
    expect(r.overview).toEqual({ leader_weights: {} });
    const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.decision_title).toBe('Repair registry');
    expect(body.sector).toBe('dev');
    expect(body.chosen_option).toBe('mentor');
    expect(body.predicted_probability).toBe(0.7);
    expect(body.actual_outcome).toBe('success');
    expect(body.leader_ids).toEqual(['mentor']);
    expect(body.root_causes).toEqual(['flake']);
    expect(body.key_lessons).toEqual(['pin deps']);
    expect(body.metric_variances).toEqual([{ metric: 'm', delta: 1 }]);
    expect(body.retrospective_summary).toBe('summary');
  });

  it('defaults optional fields in the request body', async () => {
    const mock = vi.fn(async () => okJson({ record: {} }));
    vi.stubGlobal('fetch', mock);
    await councilPostMortem({
      url: BRAIN,
      input: {
        decisionTitle: 'T',
        predictedProbability: 0.5,
        actualOutcome: 'partial',
        leaderIds: ['scientist'],
      },
    });
    const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sector).toBe('dev');
    expect(body.chosen_option).toBe('');
    expect(body.metric_variances).toEqual([]);
    expect(body.root_causes).toEqual([]);
    expect(body.key_lessons).toEqual([]);
    expect(body.retrospective_summary).toBe('');
  });

  it('reports the HTTP status on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 422 })));
    const r = await councilPostMortem({ url: BRAIN, input: validInput });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
    expect(r.error).toBe('genome-council/post-mortem HTTP 422');
  });

  it('returns an honest error when the brain is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const r = await councilPostMortem({ url: BRAIN, input: validInput });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/offline/);
  });

  it('defaults empty result fields on a 2xx with a bare body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({})));
    const r = await councilPostMortem({ url: BRAIN, input: validInput });
    expect(r.ok).toBe(true);
    expect(r.record).toEqual({});
    expect(r.adjustmentsApplied).toBeUndefined();
    expect(r.lessonsStored).toBeUndefined();
    expect(r.durable).toBeUndefined();
    expect(r.overview).toEqual({});
  });
});
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  publishToGlobalLens,
  globalLensHealth,
  globalLensConfigured,
  globalLensBaseUrl,
  GLOBAL_LENS_DEFAULT_URL,
} from '../src/lib/globalLensBridge';
import {
  composeDomainArticle,
  runPublishPass,
  artifactsForDomain,
  insightsForDomain,
  artifactFindings,
  PUBLISH_DOMAINS,
} from '../src/lib/globalLensPublisher';
import type { CorpusArtifact } from '../src/intake/corpus/types';

const ORIG_ENV = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ['GLOBAL_LENS_URL', 'GL_PUBLISH_KEY']) {
    if (k in ORIG_ENV) process.env[k] = ORIG_ENV[k];
    else delete process.env[k];
  }
});

beforeEach(() => {
  process.env.GLOBAL_LENS_URL = 'http://127.0.0.1:3090';
  delete process.env.GL_PUBLISH_KEY;
});

describe('global lens bridge — fail-closed, honest', () => {
  it('is not configured and refuses to publish when GL_PUBLISH_KEY is unset', async () => {
    expect(globalLensConfigured()).toBe(false);
    const r = await publishToGlobalLens({ title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('GL_PUBLISH_KEY');
    expect(r.error).toContain('fail-closed');
  });

  it('rejects missing title/body even when configured', async () => {
    process.env.GL_PUBLISH_KEY = 'test-key';
    expect(globalLensConfigured()).toBe(true);
    const noTitle = await publishToGlobalLens({ title: '', body: 'B' });
    expect(noTitle.ok).toBe(false);
    expect(noTitle.error).toContain('title');
    const noBody = await publishToGlobalLens({ title: 'T', body: '' });
    expect(noBody.ok).toBe(false);
    expect(noBody.error).toContain('body');
  });

  it('reports ok:false (not invented) when the outlet is unreachable', async () => {
    process.env.GL_PUBLISH_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await publishToGlobalLens({ title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unreachable');
  });

  it('forwards the bearer key and returns the idempotent result on 201', async () => {
    process.env.GL_PUBLISH_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, inserted: true, url_hash: 'abc123' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const r = await publishToGlobalLens({ title: 'T', body: 'B', category: 'hemp-research', source_name: 'Recourse' });
    expect(r.ok).toBe(true);
    expect(r.inserted).toBe(true);
    expect(r.url_hash).toBe('abc123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/publish');
    expect(String(init.headers.Authorization)).toBe('Bearer test-key');
    expect(JSON.parse(init.body).category).toBe('hemp-research');
  });

  it('surfaces the outlet detail on non-2xx instead of pretending success', async () => {
    process.env.GL_PUBLISH_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
    ));
    const r = await publishToGlobalLens({ title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(401);
    expect(r.error).toContain('unauthorized');
  });

  it('reports ok:false for a non-JSON response body', async () => {
    process.env.GL_PUBLISH_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    const r = await publishToGlobalLens({ title: 'T', body: 'B' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('500');
  });

  it('probes health with a real GET and fails soft when down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
    const ok = await globalLensHealth();
    expect(ok.ok).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const down = await globalLensHealth(500);
    expect(down.ok).toBe(false);
    expect(down.error).toBeTruthy();
  });

  it('exports a default URL', () => {
    expect(globalLensBaseUrl()).toBe(GLOBAL_LENS_DEFAULT_URL);
  });
});

describe('global lens publisher — composes real briefs, never fabricates', () => {
  const artifact = (over: Partial<CorpusArtifact> = {}): CorpusArtifact => ({
    hash: 'h1',
    project: 'hempforge',
    rel: 'docs/report.md',
    name: 'report.md',
    ext: '.md',
    kind: 'research',
    sizeBytes: 100,
    words: 50,
    excerpt: 'Hemp research summary with real content about cannabinoid dosing.',
    topics: ['hemp'],
    mtime: Date.now(),
    ...over,
  });

  it('returns null for a domain with zero real material', () => {
    const spec = PUBLISH_DOMAINS.find((d) => d.label.includes('HempForge'))!;
    const article = composeDomainArticle({ spec, artifacts: [], findings: [], insights: [] });
    expect(article).toBeNull();
  });

  it('builds a brief from real corpus artifacts with counts + evidence', () => {
    const spec = PUBLISH_DOMAINS.find((d) => d.label.includes('HempForge'))!;
    const article = composeDomainArticle({
      spec,
      artifacts: [artifact(), artifact({ project: 'hemp-os', name: 'b.md', topics: ['hemp', 'pharma'] })],
      findings: [],
      insights: [],
    });
    expect(article).not.toBeNull();
    expect(article!.title).toContain('HempForge');
    expect(article!.body).toContain('Artifacts indexed: 2');
    expect(article!.body).toContain('report.md');
    expect(article!.category).toBe('hemp-research');
    expect(article!.source_name).toBe('Recourse');
  });

  it('attaches a paper row (evidence tier + artifact hash) from a real finding', () => {
    const spec = PUBLISH_DOMAINS.find((d) => d.category === 'cancer-research')!;
    const finding = {
      kind: 'dose_response',
      hypothesisId: 'h1',
      problemId: 'P01',
      claim: 'CAR-T dose 1.0e5: cure rate 42.1% over 120 trials.',
      numbers: { dose: 1e5, cure_rate: 0.421 },
      provenance: 'python/biosim_service',
      mode: 'sidecar',
      cycle: 3,
      artifact: {
        id: 'art_abc',
        kind: 'dose_response',
        claim: 'CAR-T dose 1.0e5: cure rate 42.1%.',
        engine: 'biosim',
        dataVersion: null,
        params: {},
        seed: 1,
        codeVersion: 'test',
        evidenceTier: 'E2',
        stats: null,
        citation: null,
        verification: null,
        provenance: 'real',
        artifactHash: 'deadbeef'.repeat(4),
        createdAt: Date.now(),
      },
    };
    const article = composeDomainArticle({
      spec,
      artifacts: [artifact({ project: 'overlay-oncology', topics: ['oncology'] })],
      findings: [finding as any],
      insights: [],
    });
    expect(article).not.toBeNull();
    expect(article!.paper).toBeTruthy();
    expect(article!.paper!.evidence_tier).toBe('E2');
    expect(String((article!.paper!.payload as Record<string, unknown>).artifact_hash)).toContain('deadbeef');
  });

  it('runPublishPass reports ok per domain with an injected publisher', async () => {
    const artifacts = [artifact()];
    const findings: any[] = [];
    const insights: any[] = [];
    const published: string[] = [];
    const result = await runPublishPass({
      artifacts,
      findings,
      insights,
      publish: async (input) => {
        published.push(input.title);
        return { ok: true, inserted: true, url_hash: 'x' };
      },
    });
    expect(result.ok).toBeGreaterThan(0);
    // Domains with no material are skipped, never fabricated.
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(published.length + result.skipped.length).toBe(PUBLISH_DOMAINS.length);
  });

  it('domain filters are deterministic and honest', () => {
    const spec = PUBLISH_DOMAINS[0];
    expect(artifactsForDomain(spec, [])).toEqual([]);
    expect(artifactFindings([])).toEqual([]);
    expect(insightsForDomain(spec, [])).toEqual([]);
  });
});
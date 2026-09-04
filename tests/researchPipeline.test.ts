import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  ingestLocalDocuments,
  extractRelevantSnippets,
  fetchWebPage,
  synthesizeResearchBrief,
  saveResearchBrief,
  loadResearchBrief,
  ResearchBrief,
} from '../src/autopilot/research';

function makeTmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'recourse-research-test-'));
}

describe('local document ingestion', () => {
  it('recursively ingests markdown and yaml files up to depth 3', () => {
    const dir = makeTmpDir();
    try {
      writeFileSync(path.join(dir, 'README.md'), '# HempForge\nA compliance tool.');
      fs.mkdirSync(path.join(dir, 'docs'));
      writeFileSync(path.join(dir, 'docs', 'pricing.md'), 'Pricing: $199/mo');
      fs.mkdirSync(path.join(dir, 'docs', 'nested'));
      writeFileSync(path.join(dir, 'docs', 'nested', 'deep.yaml'), 'stage: beta');
      // depth 4 should be skipped
      fs.mkdirSync(path.join(dir, 'docs', 'nested', 'deep2'));
      writeFileSync(path.join(dir, 'docs', 'nested', 'deep2', 'skip.md'), 'skip me');

      const results = ingestLocalDocuments(dir);
      const filenames = results.map((r) => r.filename.split(path.sep).join('/'));
      expect(filenames).toContain('README.md');
      expect(filenames).toContain('docs/pricing.md');
      expect(filenames).toContain('docs/nested/deep.yaml');
      expect(filenames).not.toContain('docs/nested/deep2/skip.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips node_modules and .git directories', () => {
    const dir = makeTmpDir();
    try {
      fs.mkdirSync(path.join(dir, 'node_modules'));
      writeFileSync(path.join(dir, 'node_modules', 'evil.md'), 'skip');
      fs.mkdirSync(path.join(dir, '.git'));
      writeFileSync(path.join(dir, '.git', 'config'), 'skip');
      writeFileSync(path.join(dir, 'README.md'), '# Real doc');
      const results = ingestLocalDocuments(dir);
      expect(results.map((r) => r.filename)).toContain('README.md');
      expect(results.map((r) => r.filename)).not.toContain('node_modules/evil.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips files larger than 500KB', () => {
    const dir = makeTmpDir();
    try {
      writeFileSync(path.join(dir, 'small.md'), 'small content here');
      // Use a stream to write a sparse file
      const largeFd = fs.openSync(path.join(dir, 'large.md'), 'w');
      try {
        fs.writeSync(largeFd, 'a', 599_999);
      } finally {
        fs.closeSync(largeFd);
      }
      const results = ingestLocalDocuments(dir);
      const names = results.map((r) => r.filename);
      expect(names).toContain('small.md');
      expect(names).not.toContain('large.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns empty array when directory does not exist', () => {
    const results = ingestLocalDocuments('/definitely/does/not/exist');
    expect(results).toEqual([]);
  });
});

describe('snippet extraction', () => {
  it('extracts lines matching keywords', () => {
    const docs = [
      { filename: 'readme.md', content: 'HempForge handles COA compliance.\nIt supports Metrc sync.', size: 50 },
    ];
    const snippets = extractRelevantSnippets(docs, ['compliance', 'metrc'], 10);
    expect(snippets).toHaveLength(2);
    expect(snippets[0]).toContain('[readme.md]');
  });

  it('limits to maxSnippets', () => {
    const docs = Array.from({ length: 5 }, (_, i) => ({
      filename: `doc${i}.md`,
      content: `HempForge compliance line ${i}\n`,
      size: 50,
    }));
    const snippets = extractRelevantSnippets(docs, ['compliance'], 3);
    expect(snippets).toHaveLength(3);
  });

  it('skips short lines', () => {
    const docs = [{ filename: 'x.md', content: 'COA', size: 5 }];
    const snippets = extractRelevantSnippets(docs, ['COA'], 10);
    expect(snippets).toHaveLength(0);
  });
});

describe('web fetch', () => {
  it('returns an error result on timeout or unreachable URL', async () => {
    vi.useFakeTimers();
    const fetchPromise = fetchWebPage('https://10.255.255.1/', 100);
    vi.advanceTimersByTime(200);
    const result = await fetchPromise;
    expect(result.error).toBeTruthy();
    vi.useRealTimers();
  });

  it('returns error on invalid URL', async () => {
    const result = await fetchWebPage('not-a-url');
    expect(result.error).toBeTruthy();
  });

  it('extracts title from HTML', async () => {
    const html = `<!DOCTYPE html><html><head><title>HempForge - Compliance</title></head><body><p>Content here</p></body></html>`;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchWebPage('https://example.com/');
    expect(result.title).toBe('HempForge - Compliance');
    expect(result.content).toContain('Content here');
    vi.restoreAllMocks();
  });
});

describe('research brief synthesis', () => {
  it('produces a valid ResearchBrief with all required fields', async () => {
    const input = {
      profile: {
        name: 'HempForge',
        tagline: 'Compliance for hemp labs',
        industry: 'Hemp SaaS',
        icp: 'Hemp testing labs',
        segments: [{ name: 'Hemp labs', pain: 'Manual audits' }],
        offering: 'COA intake + audit ledger',
        pricing: '$199/mo',
        gaps: ['No public website'],
      },
      localDocSnippets: ['[README] HempForge compliance tool.'],
      webResults: [
        {
          url: 'https://example.com/competitor',
          title: 'CompetitorCo',
          content: 'Compliance software for hemp labs. Pricing from $99/mo.',
        },
      ],
      localDocCount: 1,
    };

    const brief = await synthesizeResearchBrief(input, null);
    expect(ResearchBrief.parse(brief)).toBeTruthy();
    expect(brief.disclaimer).toContain('4B parameter model');
    expect(brief.competitorLandscape[0].name).toBe('CompetitorCo');
    expect(brief.keywordOpportunities.length).toBeGreaterThan(0);
    expect(brief.contentGaps[0].topic).toBe('No public website');
    expect(brief.generatedAt).toBeTruthy();
    expect(brief.businessSlug).toBe('hempforge');
  });

  it('marks all web competitor entries with low confidence', async () => {
    const input = {
      profile: { name: 'Test', tagline: 't', industry: 'i', icp: 'i', segments: [], offering: 'o', pricing: 'p', gaps: [] },
      localDocSnippets: [],
      webResults: [{ url: 'https://x.com', title: 'X', content: 'content', error: undefined }],
      localDocCount: 0,
    };
    const brief = await synthesizeResearchBrief(input, null);
    for (const c of brief.competitorLandscape) {
      expect(c.confidence).toBe('low');
    }
  });
});

describe('brief persistence', () => {
  it('saves and loads a round-tripped brief', () => {
    const dir = makeTmpDir();
    try {
      const brief = {
        generatedAt: new Date().toISOString(),
        businessSlug: 'test-biz',
        profileStage: 'test',
        competitorLandscape: [
          {
            name: 'CompetitorCo',
            tagline: 'Test tagline',
            website: 'https://competitor.example.com',
            positioning: 'Test positioning',
            strengths: ['Test strength'],
            weaknesses: ['Test weakness'],
            confidence: 'low' as const,
            source: 'https://competitor.example.com',
          },
        ],
        keywordOpportunities: [
          { phrase: 'hemp compliance', intent: 'commercial' as const, difficulty: 'medium' as const },
        ],
        contentGaps: [
          {
            topic: 'Test gap',
            whyItMatters: 'Because',
            competingContent: 'Competitors have it',
          },
        ],
        positioningOptions: [
          {
            framing: 'Test framing',
            tagline: 'Test tagline',
            targetSegment: 'Test segment',
            risks: ['Risk 1'],
            confidence: 'low' as const,
          },
        ],
        marketSizing: {
          estimate: 'Hundreds',
          basis: 'Estimate',
          caveats: ['Caveat'],
        },
        localDocumentsIngested: [],
        webSources: ['https://competitor.example.com'],
        disclaimer: 'DISCLAIMER',
        operatorNotes: 'NOTES',
      };

      const filePath = saveResearchBrief(brief, dir);
      expect(filePath.split(path.sep).join('/')).toContain('test-biz/research-brief.json');

      const loaded = loadResearchBrief('test-biz', dir);
      expect(loaded).not.toBeNull();
      expect(loaded!.competitorLandscape[0].name).toBe('CompetitorCo');
      expect(loaded!.disclaimer).toBe('DISCLAIMER');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadResearchBrief returns null when file does not exist', () => {
    const result = loadResearchBrief('nonexistent-slug', '/tmp/no-such-dir');
    expect(result).toBeNull();
  });
});

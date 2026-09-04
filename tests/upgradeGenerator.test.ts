import { describe, it, expect } from 'vitest';
import { Gap, type GapT } from '../src/autopilot/loopTypes';
import type { BusinessProfileT } from '../src/autopilot/businessProfile';
import {
  generateUpgrade,
  markerContent,
  REVIEW_REQUIRED_MARKER,
  NO_AUTO_DEPLOY_MARKER,
} from '../src/autopilot/upgradeGenerator';

function makeGap(overrides: Partial<GapT>): GapT {
  return Gap.parse({
    id: 'gap-test-1',
    description: 'Fix the thing that is broken.',
    source: 'audit',
    fixability: 0.5,
    risk: 0.3,
    tier: 'A',
    affectedDimensions: [],
    ...overrides,
  });
}

function makeProfile(overrides: Partial<BusinessProfileT> = {}): BusinessProfileT {
  const base: BusinessProfileT = {
    business: {
      name: 'TestBiz',
      tagline: 'Test tagline',
      industry: 'Test',
      website: '',
      stage: 'idea',
    },
    customer: {
      icp: 'Test ICP',
      segments: [{ name: 'Seg', pain: 'Pain' }],
      buyingTrigger: 'Trigger',
      topObjections: ['Obj'],
    },
    offering: {
      summary: 'Summary',
      pricing: '$0',
      model: 'free',
      differentiators: ['Diff'],
    },
    gaps: [],
  };
  return { ...base, ...overrides } as BusinessProfileT;
}

describe('upgradeGenerator', () => {
  it('tier B gap returns a valid proposal with a REVIEW_REQUIRED.md marker file', async () => {
    const gap = makeGap({
      tier: 'B',
      description: 'Write clear setup documentation for the onboarding flow',
      fixability: 0.6,
      affectedDimensions: ['documentationCompleteness'],
    });
    const proposal = await generateUpgrade(gap, makeProfile());

    expect(proposal.gapId).toBe(gap.id);
    expect(proposal.tier).toBe('B');
    expect(proposal.markerFile).toBe(REVIEW_REQUIRED_MARKER);
    const marker = proposal.files.find((f) => f.path === REVIEW_REQUIRED_MARKER);
    expect(marker).toBeDefined();
    expect(marker?.action).toBe('create');
    expect(marker?.content).toMatch(/Never auto-deploy/);
  });

  it('tier C gap includes a NO_AUTO_DEPLOY.md marker and a strategy memo file', async () => {
    const gap = makeGap({
      tier: 'C',
      description: 'Decide whether to build or buy our analytics stack',
      fixability: 0.3,
      affectedDimensions: ['marketSignals'],
    });
    const proposal = await generateUpgrade(gap, makeProfile());

    expect(proposal.markerFile).toBe(NO_AUTO_DEPLOY_MARKER);
    const marker = proposal.files.find((f) => f.path === NO_AUTO_DEPLOY_MARKER);
    expect(marker).toBeDefined();
    expect(marker?.content).toMatch(/NO_AUTO_DEPLOY/);
    const memo = proposal.files.find((f) => /docs\/strategy\/.*-memo\.md$/.test(f.path));
    expect(memo).toBeDefined();
    expect(memo?.content).toMatch(/NO_AUTO_DEPLOY/);
    expect(memo?.content).toMatch(/## Options/);
    expect(memo?.content).toMatch(/## Recommendation/);
  });

  it('tier A env-style gap is honest: requiresSandboxVerify and no fabricated code', async () => {
    const gap = makeGap({
      tier: 'A',
      description: 'Secrets are committed in .env and must be rotated out of the working tree',
      fixability: 0.5,
      affectedDimensions: ['securityPosture'],
    });
    const proposal = await generateUpgrade(gap, makeProfile());

    expect(proposal.requiresSandboxVerify).toBe(true);
    expect(proposal.description).toMatch(/model-based code synthesis is pending/i);
    expect(proposal.files.length).toBeGreaterThan(0);
    for (const file of proposal.files) {
      expect(file.path.endsWith('.md')).toBe(true);
      expect(file.path).not.toMatch(/\.(ts|tsx|js|jsx|py|mjs|cjs)$/);
    }
    expect(proposal.files[0].content).toMatch(/model-based code synthesis is pending/i);
  });

  it('tier A gitignore-style gap produces a real .gitignore template without sandbox verify', async () => {
    const gap = makeGap({
      tier: 'A',
      description: 'Add a .gitignore so .env and token files are protected from being committed',
      fixability: 0.9,
    });
    const proposal = await generateUpgrade(gap, makeProfile());

    expect(proposal.requiresSandboxVerify).toBe(false);
    const ignore = proposal.files.find((f) => f.path === '.gitignore');
    expect(ignore).toBeDefined();
    expect(ignore?.action).toBe('create');
    expect(ignore?.content).toContain('.env');
  });

  it('expectedScoreDelta includes every affected dimension with a positive delta', async () => {
    const gap = makeGap({
      tier: 'A',
      description: 'Fix the thing that is broken.',
      fixability: 0.4,
      affectedDimensions: ['codeQuality', 'securityPosture', 'testCoverage'],
    });
    const proposal = await generateUpgrade(gap, makeProfile());

    expect(Object.keys(proposal.expectedScoreDelta).sort()).toEqual([
      'codeQuality',
      'securityPosture',
      'testCoverage',
    ]);
    for (const value of Object.values(proposal.expectedScoreDelta)) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it('id has the upgrade- prefix and a numeric timestamp suffix', async () => {
    const proposal = await generateUpgrade(
      makeGap({ tier: 'A', description: 'Fix the thing that is broken.' }),
      makeProfile(),
    );
    expect(proposal.id).toMatch(/^upgrade-gap-test-1-\d+$/);
  });

  it('is deterministic for title and marker content while ids carry a timestamp', async () => {
    const gap = makeGap({
      tier: 'B',
      description: 'Write clear setup documentation for the onboarding flow',
      fixability: 0.6,
    });
    const [a, b] = await Promise.all([
      generateUpgrade(gap, makeProfile()),
      generateUpgrade(gap, makeProfile()),
    ]);

    expect(a.title).toBe(b.title);
    expect(a.markerFile).toBe(b.markerFile);
    expect(a.files.find((f) => f.path === REVIEW_REQUIRED_MARKER)?.content).toBe(
      b.files.find((f) => f.path === REVIEW_REQUIRED_MARKER)?.content,
    );
    expect(a.id).toMatch(/^upgrade-gap-test-1-\d+$/);
    expect(b.id).toMatch(/^upgrade-gap-test-1-\d+$/);
  });

  it('returns an empty expectedScoreDelta when the gap has no affected dimensions', async () => {
    const gap = makeGap({ tier: 'C', description: 'Decide the pricing model for next year' });
    const proposal = await generateUpgrade(gap, makeProfile());
    expect(proposal.expectedScoreDelta).toEqual({});
  });

  it('tier B landing gap produces a valid HTML shell with a REVIEW_REQUIRED comment', async () => {
    const gap = makeGap({
      tier: 'B',
      description: 'Build a landing page for the new rental pricing',
      fixability: 0.7,
    });
    const proposal = await generateUpgrade(gap, makeProfile());
    const landing = proposal.files.find((f) => f.path === 'landing/index.html');
    expect(landing).toBeDefined();
    expect(landing?.content).toMatch(/<!DOCTYPE html>/i);
    expect(landing?.content).toContain('<!-- REVIEW_REQUIRED -->');
    expect(landing?.content).toContain('TestBiz');
    expect(landing?.content).toContain('$0');
  });

  it('tier B faq gap produces three Q/A rows grounded in objections and buying trigger', async () => {
    const gap = makeGap({
      tier: 'B',
      description: 'Create FAQ content answering the most common objections',
      fixability: 0.8,
    });
    const proposal = await generateUpgrade(gap, makeProfile());
    const faq = proposal.files.find((f) => f.path === 'content/faq-testbiz.md');
    expect(faq).toBeDefined();
    const questionCount = faq?.content.match(/\*\*Q:/g)?.length ?? 0;
    expect(questionCount).toBe(3);
    expect(faq?.content).toContain('Obj?');
    expect(faq?.content).toContain('Trigger');
    expect(faq?.content).toContain('Test ICP');
  });

  it('markerContent returns the standard marker text for both markers', () => {
    const review = markerContent('REVIEW_REQUIRED');
    const nodeploy = markerContent('NO_AUTO_DEPLOY');
    expect(review).toMatch(/human review before any deploy/i);
    expect(review).toMatch(/Never auto-deploy/i);
    expect(nodeploy).toContain('NO_AUTO_DEPLOY');
    expect(nodeploy).toMatch(/Never auto-deploy/i);
  });
});

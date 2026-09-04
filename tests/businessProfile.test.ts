import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BusinessProfileError,
  listBusinessSlugs,
  loadBusinessProfile,
  profileIsStale,
  BUSINESS_PROFILES_DIR,
} from '../src/autopilot/businessProfile';

function makeTmpProfilesDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'recourse-profiles-'));
  return dir;
}

describe('business profile store', () => {
  it('lists slugs from a directory of yaml files', () => {
    const dir = makeTmpProfilesDir();
    try {
      writeFileSync(path.join(dir, 'hempforge.yaml'), 'business:\n  name: HempForge\n');
      writeFileSync(path.join(dir, 'aetherdesk.yml'), 'business:\n  name: Aetherdesk\n');
      writeFileSync(path.join(dir, 'README.md'), 'not a profile');
      const slugs = listBusinessSlugs(dir);
      expect(slugs).toEqual(['aetherdesk', 'hempforge']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty list when the profiles directory does not exist', () => {
    const dir = path.join(tmpdir(), 'definitely-does-not-exist-recourse-profiles-xyz');
    expect(listBusinessSlugs(dir)).toEqual([]);
  });

  it('loads and validates a complete profile', () => {
    const dir = makeTmpProfilesDir();
    try {
      const yaml = `
business:
  name: HempForge
  tagline: "Compliance for hemp data"
  industry: Hemp SaaS
  website: ""
  stage: live_product
customer:
  icp: "Hemp labs"
  segments:
    - name: Labs
      pain: "Manual audits"
  buyingTrigger: "Failed inspection"
  topObjections:
    - "Too expensive"
offering:
  summary: "COA + audit ledger"
  pricing: "$199/mo"
  model: subscription
  differentiators:
    - "ALCOA++ chain"
gaps: []
`;
      writeFileSync(path.join(dir, 'hempforge.yaml'), yaml);
      const profile = loadBusinessProfile('hempforge', dir);
      expect(profile.business.name).toBe('HempForge');
      expect(profile.customer.segments).toHaveLength(1);
      expect(profile.offering.model).toBe('subscription');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a structured error when the file is missing', () => {
    const dir = makeTmpProfilesDir();
    try {
      expect(() => loadBusinessProfile('nope', dir)).toThrow(BusinessProfileError);
      expect(() => loadBusinessProfile('nope', dir)).toThrow(/not found/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on invalid YAML', () => {
    const dir = makeTmpProfilesDir();
    try {
      writeFileSync(path.join(dir, 'bad.yaml'), 'business: : : not yaml');
      expect(() => loadBusinessProfile('bad', dir)).toThrow(BusinessProfileError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws on schema violations (e.g. unknown stage)', () => {
    const dir = makeTmpProfilesDir();
    try {
      const yaml = `
business:
  name: BadBiz
  tagline: "x"
  industry: x
  website: ""
  stage: vaporware
customer:
  icp: x
  segments:
    - { name: a, pain: b }
  buyingTrigger: x
  topObjections: [x]
offering:
  summary: x
  pricing: x
  model: subscription
  differentiators: [x]
`;
      writeFileSync(path.join(dir, 'bad.yaml'), yaml);
      expect(() => loadBusinessProfile('bad', dir)).toThrow(/stage/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when a required top-level field is missing', () => {
    const dir = makeTmpProfilesDir();
    try {
      writeFileSync(path.join(dir, 'incomplete.yaml'), 'business: { name: x, tagline: x, industry: x, website: "", stage: idea }');
      expect(() => loadBusinessProfile('incomplete', dir)).toThrow(/customer/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a profile with no lastReviewedAt as stale', () => {
    const profile = {
      business: {
        name: 'x',
        tagline: 'x',
        industry: 'x',
        website: '',
        stage: 'idea' as const,
      },
      customer: {
        icp: 'x',
        segments: [{ name: 'a', pain: 'b' }],
        buyingTrigger: 'x',
        topObjections: ['x'],
      },
      offering: {
        summary: 'x',
        pricing: 'x',
        model: 'free' as const,
        differentiators: ['x'],
      },
      gaps: [],
    };
    expect(profileIsStale(profile)).toBe(true);
  });

  it('treats a recently-reviewed profile as fresh', () => {
    const profile = {
      business: {
        name: 'x',
        tagline: 'x',
        industry: 'x',
        website: '',
        stage: 'idea' as const,
      },
      customer: {
        icp: 'x',
        segments: [{ name: 'a', pain: 'b' }],
        buyingTrigger: 'x',
        topObjections: ['x'],
      },
      offering: {
        summary: 'x',
        pricing: 'x',
        model: 'free' as const,
        differentiators: ['x'],
      },
      gaps: [],
      lastReviewedAt: new Date().toISOString(),
    };
    expect(profileIsStale(profile)).toBe(false);
  });

  it('treats an old profile as stale even with a lastReviewedAt', () => {
    const profile = {
      business: {
        name: 'x',
        tagline: 'x',
        industry: 'x',
        website: '',
        stage: 'idea' as const,
      },
      customer: {
        icp: 'x',
        segments: [{ name: 'a', pain: 'b' }],
        buyingTrigger: 'x',
        topObjections: ['x'],
      },
      offering: {
        summary: 'x',
        pricing: 'x',
        model: 'free' as const,
        differentiators: ['x'],
      },
      gaps: [],
      lastReviewedAt: '2020-01-01T00:00:00.000Z',
    };
    expect(profileIsStale(profile)).toBe(true);
  });

  it('uses the canonical profiles directory by default', () => {
    expect(BUSINESS_PROFILES_DIR).toBe('data/business-profiles');
  });
});

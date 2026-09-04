import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import yaml from 'yaml';
import {
  BusinessProfile,
  BusinessProfileError,
  isAutoMergeEnabled,
  isKillSwitchActive,
  listBusinessSlugs,
  loadBusinessProfile,
  profileIsStale,
  RepoBinding,
  BUSINESS_PROFILES_DIR,
  type BusinessProfileT,
  type RepoBindingT,
} from '../src/autopilot/businessProfile';

function loadBusinessProfileFromYaml(yamlText: string): BusinessProfileT {
  return BusinessProfile.parse(yaml.parse(yamlText));
}

type ProfileOverrides = Partial<Omit<BusinessProfileT, 'repo'>> & { repo?: Partial<RepoBindingT> };

function makeMinimalProfile(overrides: ProfileOverrides = {}): BusinessProfileT {
  const base: BusinessProfileT = {
    business: {
      name: 'TestBiz',
      tagline: 'Tagline',
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
  const { repo, ...rest } = overrides;
  const profile = { ...base, ...rest } as BusinessProfileT;
  if (repo !== undefined) profile.repo = RepoBinding.parse(repo);
  return profile;
}

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

describe('repo binding', () => {
  it('accepts a complete repo binding', () => {
    const profile = loadBusinessProfileFromYaml(`
business:
  name: TestBiz
  tagline: t
  industry: t
  website: ""
  stage: live_product
customer:
  icp: t
  segments:
    - name: a
      pain: b
  buyingTrigger: t
  topObjections: [t]
offering:
  summary: t
  pricing: t
  model: subscription
  differentiators: [t]
gaps: []
repo:
  localPath: "C:/Users/Test/repo"
  githubUrl: "https://github.com/test/repo"
  defaultBranch: main
  autoMergeEnabled: true
  autoMergeVetoHours: 24
  minSandboxScore: 0.7
`);
    expect(profile.repo?.localPath).toBe('C:/Users/Test/repo');
    expect(profile.repo?.autoMergeEnabled).toBe(true);
    expect(profile.repo?.autoMergeVetoHours).toBe(24);
    expect(profile.repo?.githubUrl).toBe('https://github.com/test/repo');
  });

  it('repo is optional — a profile without it is valid', () => {
    const profile = loadBusinessProfileFromYaml(`
business:
  name: TestBiz
  tagline: t
  industry: t
  website: ""
  stage: live_product
customer:
  icp: t
  segments:
    - name: a
      pain: b
  buyingTrigger: t
  topObjections: [t]
offering:
  summary: t
  pricing: t
  model: subscription
  differentiators: [t]
gaps: []
`);
    expect(profile.repo).toBeUndefined();
  });

  it('applies defaults when repo fields are omitted', () => {
    const profile = loadBusinessProfileFromYaml(`
business:
  name: TestBiz
  tagline: t
  industry: t
  website: ""
  stage: live_product
customer:
  icp: t
  segments:
    - name: a
      pain: b
  buyingTrigger: t
  topObjections: [t]
offering:
  summary: t
  pricing: t
  model: subscription
  differentiators: [t]
gaps: []
repo:
  localPath: "/tmp/repo"
`);
    expect(profile.repo?.autoMergeEnabled).toBe(false);
    expect(profile.repo?.autoMergeVetoHours).toBe(24);
    expect(profile.repo?.defaultBranch).toBe('main');
    expect(profile.repo?.protectedPaths.length).toBeGreaterThan(0);
  });

  it('isAutoMergeEnabled returns false when repo is absent', () => {
    const profile = makeMinimalProfile();
    expect(isAutoMergeEnabled(profile)).toBe(false);
  });

  it('isAutoMergeEnabled returns true when repo.autoMergeEnabled is true', () => {
    const profile = makeMinimalProfile({
      repo: {
        localPath: '/tmp/repo',
        autoMergeEnabled: true,
        autoMergeVetoHours: 24,
        minSandboxScore: 0.7,
      },
    });
    expect(isAutoMergeEnabled(profile)).toBe(true);
  });

  it('isKillSwitchActive returns true when env var is set', () => {
    const prev = process.env.RECOURSE_AUTOPILOT_DISABLED;
    process.env.RECOURSE_AUTOPILOT_DISABLED = '1';
    try {
      expect(isKillSwitchActive()).toBe(true);
    } finally {
      if (prev) process.env.RECOURSE_AUTOPILOT_DISABLED = prev;
      else delete process.env.RECOURSE_AUTOPILOT_DISABLED;
    }
  });

  it('isKillSwitchActive returns false when env var is absent', () => {
    const prev = process.env.RECOURSE_AUTOPILOT_DISABLED;
    delete process.env.RECOURSE_AUTOPILOT_DISABLED;
    try {
      expect(isKillSwitchActive()).toBe(false);
    } finally {
      if (prev) process.env.RECOURSE_AUTOPILOT_DISABLED = prev;
    }
  });
});

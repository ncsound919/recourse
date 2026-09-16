/**
 * seo.ts — deterministic SEO/content planning from a real business profile.
 *
 * This module produces a plan an operator or writer can act on: page titles,
 * meta descriptions, target keywords and article briefs derived from the
 * profile's own offering, differentiators and gaps.
 *
 * Honesty contract: it makes NO claims about search volume, difficulty, ranking
 * or traffic. Those require a real keyword dataset and are explicitly listed as
 * unmeasured in `honestyNotes`, never invented.
 */
import type { BusinessProfileT } from '../../autopilot/businessProfile.js';

export type PageIntent = 'home' | 'product' | 'solution' | 'comparison' | 'content';

export interface SeoPage {
  path: string;
  title: string;
  description: string;
  targetKeyword: string;
  intent: PageIntent;
}

export interface ContentBrief {
  workingTitle: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  outline: string[];
  callToAction: string;
}

export interface SeoPlan {
  siteName: string;
  pages: SeoPage[];
  briefs: ContentBrief[];
  honestyNotes: string[];
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'or', 'the', 'to', 'of', 'for', 'with', 'that', 'this', 'from', 'on', 'in', 'is', 'are',
  'we', 'our', 'you', 'your', 'it', 'as', 'by', 'at', 'be', 'can', 'will', 'help', 'helps', 'using', 'use',
]);

function words(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Frequency-ranked keyword phrases from real profile text. */
export function deriveKeywords(profile: BusinessProfileT, limit = 12): string[] {
  const text = [
    profile.business.name,
    profile.business.tagline,
    profile.business.industry,
    profile.offering?.summary,
    ...(profile.offering?.differentiators ?? []),
    profile.customer?.icp,
    ...(profile.customer?.segments ?? []).map((s) => `${s.name} ${s.pain}`),
  ].join(' ');
  const counts = new Map<string, number>();
  for (const w of words(text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([w]) => w);
}

function clampText(text: string, max: number): string {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Build a page + content plan from the profile. Deterministic, no clock. */
export function buildSeoPlan(profile: BusinessProfileT): SeoPlan {
  const name = profile.business.name || 'The business';
  const keywords = deriveKeywords(profile);
  const primary = keywords[0] ?? name.toLowerCase();
  const industry = profile.business.industry || 'your category';
  const differentiators = (profile.offering?.differentiators ?? []).slice(0, 3);
  const gaps = (profile.gaps ?? []).slice(0, 5);
  const cta = `Start with ${name}`;

  const pages: SeoPage[] = [
    {
      path: '/',
      title: clampText(`${name} — ${profile.business.tagline || industry}`, 60),
      description: clampText(profile.offering?.summary || `${name} helps ${profile.customer?.icp || 'teams'} in ${industry}.`, 155),
      targetKeyword: primary,
      intent: 'home',
    },
    {
      path: `/solutions/${primary.replace(/\s+/g, '-')}`,
      title: clampText(`${primary} for ${profile.customer?.segments?.[0]?.name || industry}`, 60),
      description: clampText(`How ${name} solves ${profile.customer?.segments?.[0]?.pain || `the core ${industry} problem`}.`, 155),
      targetKeyword: `${primary} ${industry}`.trim(),
      intent: 'solution',
    },
  ];
  if (differentiators.length) {
    pages.push({
      path: `/why-${(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'us')}`,
      title: clampText(`Why ${name}: ${differentiators[0]}`, 60),
      description: clampText(differentiators.join(' · '), 155),
      targetKeyword: primary,
      intent: 'product',
    });
  }

  const briefs: ContentBrief[] = gaps.map((gap, i) => ({
    workingTitle: clampText(gap, 90),
    targetKeyword: keywords[i % Math.max(1, keywords.length)] ?? primary,
    secondaryKeywords: keywords.slice(0, 5).filter((k) => k !== primary),
    outline: [
      `Problem: ${profile.customer?.segments?.[0]?.pain || `why ${primary} matters`}`,
      `Context: ${industry} today`,
      `Approach: ${differentiators[0] ?? profile.offering?.summary ?? `our method`}`,
      'Evidence / examples',
      `Next step: ${cta}`,
    ],
    callToAction: cta,
  }));

  return {
    siteName: name,
    pages,
    briefs,
    honestyNotes: [
      'No search-volume, difficulty, ranking or traffic estimates are provided — these require a real keyword dataset and are intentionally unmeasured.',
      'Keyword targets are derived from the profile text by frequency, not from search demand.',
      gaps.length ? `${gaps.length} content brief(s) mapped to recorded business gaps.` : 'No business gaps recorded — no content briefs generated.',
    ],
  };
}

/** Minimal sitemap.xml for the planned pages. */
export function renderSitemap(pages: SeoPage[], baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const urls = pages.map((p) => `  <url><loc>${base}${p.path}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** HTML meta tags for a planned page. */
export function renderPageMeta(page: SeoPage): string {
  return [
    `<title>${page.title}</title>`,
    `<meta name="description" content="${page.description.replace(/"/g, '&quot;')}" />`,
    `<link rel="canonical" href="${page.path}" />`,
  ].join('\n');
}

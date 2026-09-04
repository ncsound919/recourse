/**
 * upgradeGenerator.ts — gap -> UpgradeProposal (tier A/B/C).
 *
 * This generator is RULE-BASED and self-contained. It does NOT call an LLM and
 * never pretends a 4B model wrote working code. Honesty contract:
 *
 *   - Tier A gaps that genuinely require synthesized source are emitted with
 *     requiresSandboxVerify: true and a description that states model-based
 *     code synthesis is pending a configured planner model. No source file is
 *     fabricated.
 *   - Tier A gaps that are non-code mechanical fixes (gitignore-style ignore
 *     template, .env.example placeholder) MAY get real, correct file content
 *     with requiresSandboxVerify: false.
 *   - Tier B artifacts always carry a REVIEW_REQUIRED.md marker.
 *   - Tier C artifacts always carry a NO_AUTO_DEPLOY.md marker.
 */

import { UpgradeProposal, type GapT, type UpgradeFileT, type UpgradeProposalT } from './loopTypes';
import type { BusinessProfileT } from './businessProfile';
import { repoBinding } from './businessProfile';

export const REVIEW_REQUIRED_MARKER = 'REVIEW_REQUIRED.md';
export const NO_AUTO_DEPLOY_MARKER = 'NO_AUTO_DEPLOY.md';

const HONEST_CODE_NOTE =
  'Note: model-based code synthesis is pending a configured planner model. ' +
  'This rule-based generator does not fabricate working source. The required ' +
  'implementation must be written and sandbox-verified before it can be trusted.';

// ============================================================================
// Public API
// ============================================================================

export async function generateUpgrade(
  gap: GapT,
  profile: BusinessProfileT,
): Promise<UpgradeProposalT> {
  const nowMs = Date.now();
  const base = {
    id: `upgrade-${gap.id}-${nowMs}`,
    gapId: gap.id,
    tier: gap.tier,
    title: titleFor(gap.description, gap.id),
    generatedAt: new Date(nowMs).toISOString(),
    expectedScoreDelta: expectedScoreDeltaFor(gap),
  };

  if (gap.tier === 'A') {
    return UpgradeProposal.parse({ ...base, ...buildTierA(gap, profile) });
  }
  if (gap.tier === 'B') {
    return UpgradeProposal.parse({ ...base, ...buildTierB(gap, profile) });
  }
  return UpgradeProposal.parse({ ...base, ...buildTierC(gap, profile, nowMs) });
}

export function markerContent(marker: 'REVIEW_REQUIRED' | 'NO_AUTO_DEPLOY'): string {
  if (marker === 'REVIEW_REQUIRED') {
    return [
      'REVIEW_REQUIRED',
      '',
      'This Tier B artifact requires human review before any deploy.',
      'Never auto-deploy.',
      '',
    ].join('\n');
  }
  return [
    'NO_AUTO_DEPLOY',
    '',
    'This Tier C artifact is strategy guidance for the operator, not executable output.',
    'A human decides whether and how to act on it. Never auto-deploy.',
    '',
  ].join('\n');
}

// ============================================================================
// Tier A — code / tooling
// ============================================================================

function buildTierA(
  gap: GapT,
  profile: BusinessProfileT,
): Pick<UpgradeProposalT, 'description' | 'files' | 'requiresSandboxVerify'> {
  const description = gap.description;
  const wantsCode = /bug|fix|refactor|implement|write|build|rotate|migrat|add (a )?(unit )?test|test coverage|function|class|module/i.test(description);

  if (/gitignore|protected path/i.test(description) && !wantsCode) {
    const content = ignoreTemplate(profile, gap);
    const file: UpgradeFileT = { path: '.gitignore', action: 'create', content };
    return { description, files: [file], requiresSandboxVerify: false };
  }

  if (/env\.example|sample env|env template|\.env template/i.test(description) && !wantsCode) {
    const content = envExampleTemplate(profile);
    const file: UpgradeFileT = { path: '.env.example', action: 'create', content };
    return { description, files: [file], requiresSandboxVerify: false };
  }

  const docPath = `docs/upgrades/${slugify(gap.id) || 'upgrade'}.md`;
  const envLike = /env|environment|config|secret/i.test(description);
  const file: UpgradeFileT = {
    path: docPath,
    action: 'create',
    content: tierADocBody(gap, profile, description, envLike),
  };
  return {
    description: `${description}\n\n${HONEST_CODE_NOTE}`,
    files: [file],
    requiresSandboxVerify: true,
  };
}

function tierADocBody(gap: GapT, profile: BusinessProfileT, description: string, envLike: boolean): string {
  const requiredChange = envLike
    ? `Harden environment/secret handling: remove secret values from the working tree, move them to a secret store or environment variables, commit only a placeholder .env.example, and keep secrets out of version control.`
    : `Implement the change described by the gap. The concrete implementation is not synthesized here.`;

  const acceptance = envLike
    ? [
        'No secret values remain in the working tree or in version control.',
        'A placeholder .env.example is committed with empty values only.',
        'Secret-carrying paths are ignored by the repository.',
      ]
    : [
        'The implementation satisfies the gap description and the profile context.',
        'A sandbox run verifies the change behaves as documented.',
        'Existing tests still pass after the change.',
      ];

  return [
    `# Upgrade: ${titleFor(description, gap.id)}`,
    '',
    `Status: PENDING SANDBOX VERIFICATION — implementation is not yet written.`,
    '',
    HONEST_CODE_NOTE,
    '',
    '## Gap',
    `- id: ${gap.id}`,
    `- tier: ${gap.tier}`,
    `- business: ${profile.business.name}`,
    '',
    `## Required change`,
    requiredChange,
    '',
    '## Acceptance criteria',
    ...acceptance.map((a) => `- ${a}`),
    '',
    '## Test plan',
    '- Open a sandbox that runs the new code against a real fixture.',
    '- Verify each acceptance criterion above with a concrete check.',
    '',
  ].join('\n');
}

// ============================================================================
// Tier A concrete templates (mechanical, non-code fixes)
// ============================================================================

function ignoreTemplate(profile: BusinessProfileT, gap: GapT): string {
  const binding = repoBinding(profile);
  const patterns =
    binding && binding.protectedPaths.length > 0
      ? binding.protectedPaths
      : ['.env', '*.env*', '*secret*', '*token*', '*key*'];
  const unique = Array.from(new Set(patterns));
  return [
    '# Generated by the Recourse autopilot upgrade generator (gap ' + gap.id + ').',
    '# Patterns come from the business profile protected-path policy.',
    '# Add stack-specific ignores (node_modules/, dist/, build/, coverage/) after human review.',
    '',
    ...unique.map((p) => p.replace(/\r/g, '')),
    '',
  ].join('\n');
}

function envExampleTemplate(profile: BusinessProfileT): string {
  const binding = repoBinding(profile);
  const patterns =
    binding && binding.protectedPaths.length > 0
      ? binding.protectedPaths
      : ['.env', '*.env*', '*secret*', '*token*', '*key*'];
  const keys = Array.from(
    new Set(
      patterns
        .map((p) => p.replace(/[*?]/g, '').toUpperCase().replace(/[^A-Z0-9_]/g, '_'))
        .filter((p) => p && p !== '.ENV' && p !== 'GH_TOKEN_TXT')
        .map((p) => (p.endsWith('_') ? p.slice(0, -1) : p)),
    ),
  );
  const safeKeys = keys.length > 0 ? keys : ['API_TOKEN', 'SECRET_KEY'];
  return [
    `# .env.example for ${profile.business.name} — generated by the Recourse autopilot.`,
    '# Copy to .env and fill real values locally. Never commit .env.',
    '# Placeholder keys only. The generator does not invent or store real secrets.',
    '',
    ...safeKeys.map((k) => `${k}=`),
    '',
  ].join('\n');
}

// ============================================================================
// Tier B — docs / content / web
// ============================================================================

function buildTierB(
  gap: GapT,
  profile: BusinessProfileT,
): Pick<UpgradeProposalT, 'description' | 'files' | 'markerFile'> {
  const description = gap.description;
  const markerFile = REVIEW_REQUIRED_MARKER;
  const files: UpgradeFileT[] = [
    { path: markerFile, action: 'create', content: markerContent('REVIEW_REQUIRED') },
  ];
  const name = profile.business.name;
  const slug = slugify(name) || 'business';

  if (/landing|website|web/i.test(description)) {
    files.unshift({
      path: `landing/index.html`,
      action: 'create',
      content: landingHtml(profile, description),
    });
  } else if (/faq|content|seo/i.test(description)) {
    files.unshift({
      path: `content/faq-${slug}.md`,
      action: 'create',
      content: faqMarkdown(profile),
    });
  } else {
    files.unshift({
      path: `docs/upgrades/${slugify(gap.id) || 'upgrade'}.md`,
      action: 'create',
      content: tierBChangeDoc(name, description, gap.id),
    });
  }

  return { description, files, markerFile };
}

function tierBChangeDoc(businessName: string, description: string, gapId: string): string {
  return [
    `# Upgrade: ${titleFor(description, gapId)}`,
    '',
    `Business: ${businessName}`,
    '',
    'Status: DRAFT — requires human review before any deploy (see REVIEW_REQUIRED.md).',
    '',
    '## Recommended change',
    description,
    '',
    '## Acceptance criteria',
    '- The produced artifact is factually accurate against the business profile.',
    '- No claim is published that the profile does not support.',
    '- A human has reviewed the artifact and removed the REVIEW_REQUIRED marker.',
    '',
  ].join('\n');
}

function landingHtml(profile: BusinessProfileT, description: string): string {
  const esc = (s: string): string =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const { business, offering, customer } = profile;
  const name = esc(business.name);
  const tagline = esc(business.tagline);
  const pricing = esc(offering.pricing);
  const summary = esc(offering.summary);
  const diffs = offering.differentiators.map((d) => `        <li>${esc(d)}</li>`).join('\n');
  const objections = customer.topObjections.map((o) => `        <li>${esc(o)}</li>`).join('\n');
  const focus = profile.gaps.map((g) => `        <li>${esc(g)}</li>`).join('\n');
  const website = business.website
    ? `      <p>Website: <a href="${esc(business.website)}">${esc(business.website)}</a></p>`
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${name} — landing (draft)</title>`,
    '  <!-- REVIEW_REQUIRED -->',
    '</head>',
    '<body>',
    '  <header>',
    `    <h1>${name}</h1>`,
    `    <p>${tagline}</p>`,
    '  </header>',
    '  <main>',
    '    <section id="about">',
    `      <h2>What we do</h2>`,
    `      <p>${summary}</p>`,
    website,
    '    </section>',
    '    <section id="pricing">',
    '      <h2>Pricing</h2>',
    `      <p>${pricing}</p>`,
    '    </section>',
    '    <section id="differentiators">',
    '      <h2>Why us</h2>',
    '      <ul>',
    diffs,
    '      </ul>',
    '    </section>',
    '    <section id="objections">',
    '      <h2>Questions we hear</h2>',
    '      <ul>',
    objections,
    '      </ul>',
    '    </section>',
    '    <section id="known-focus-areas">',
    '      <h2>Known focus areas (do not publish verbatim)</h2>',
    '      <ul>',
    focus,
    '      </ul>',
    '    </section>',
    `    <p class="provenance">Drafted from the ${esc(business.name)} business profile for gap: ${esc(description)}. Human review required before deploy.</p>`,
    '  </main>',
    '  <footer>',
    `    <p>© ${esc(new Date().getFullYear().toString())} ${name}</p>`,
    '  </footer>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function faqMarkdown(profile: BusinessProfileT): string {
  const name = profile.business.name;
  const slug = slugify(name) || 'business';
  const rows = faqRows(profile);
  const body: string[] = [];
  for (const row of rows) {
    body.push(`**Q: ${row.q}**`, '', `**A:** ${row.a}`, '');
  }

  return [
    `# ${name} — FAQ (draft)`,
    '',
    `> Machine-drafted from the ${slug} business profile. Requires human review.`,
    '> Every factual claim must be verified against the live product before publishing.',
    '',
    ...body,
  ].join('\n');
}

interface FaqRow {
  q: string;
  a: string;
}

function faqRows(profile: BusinessProfileT): FaqRow[] {
  const object = profile.customer;
  const rows: FaqRow[] = [];
  const objectionLimit = Math.min(object.topObjections.length, 2);
  for (let i = 0; i < objectionLimit; i += 1) {
    const objection = object.topObjections[i];
    rows.push({ q: asQuestion(objection), a: groundedAnswer(objection, profile) });
  }
  rows.push({
    q: `When should I start using ${profile.business.name}?`,
    a: object.buyingTrigger,
  });
  if (rows.length < 3) {
    rows.push({
      q: `Who is ${profile.business.name} for?`,
      a: object.icp,
    });
  }
  return rows;
}

function asQuestion(text: string): string {
  return /[?!.。]$/.test(text.trim()) ? text.trim().replace(/[.。]$/, '?') : `${text.trim()}?`;
}

function groundedAnswer(objection: string, profile: BusinessProfileT): string {
  const differentiator = bestMatchingDifferentiator(objection, profile);
  if (differentiator) {
    return `Draft response (verify before publish): ${differentiator}`;
  }
  return `Draft response (verify before publish): the business profile does not yet record a grounded answer to this objection. Confirm capability against the live product.`;
}

function bestMatchingDifferentiator(objection: string, profile: BusinessProfileT): string | null {
  const objectionTokens = tokens(objection);
  if (objectionTokens.length === 0) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const d of profile.offering.differentiators) {
    const diffTokens = new Set(tokens(d));
    const score = objectionTokens.filter((t) => diffTokens.has(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return bestScore > 0 ? best : null;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'when', 'will', 'would',
  'does', 'do', 'are', 'we', 'you', 'your', 'our', 'can', 'what', 'how', 'why',
  'is', 'it', 'that', 'this', 'too', 'just', 'still', 'calls', 'them',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

// ============================================================================
// Tier C — strategy
// ============================================================================

function buildTierC(
  gap: GapT,
  profile: BusinessProfileT,
  nowMs: number,
): Pick<UpgradeProposalT, 'description' | 'files' | 'markerFile'> {
  const markerFile = NO_AUTO_DEPLOY_MARKER;
  const memoPath = `docs/strategy/${businessSlug(profile)}-${nowMs}-memo.md`;
  const files: UpgradeFileT[] = [
    { path: memoPath, action: 'create', content: strategyMemo(gap, profile) },
    { path: markerFile, action: 'create', content: markerContent('NO_AUTO_DEPLOY') },
  ];
  return { description: gap.description, files, markerFile };
}

function strategyMemo(gap: GapT, profile: BusinessProfileT): string {
  const pct = Math.round(gap.fixability * 100);
  const recommendation =
    gap.fixability >= 0.6
      ? 'Option 1 (address in-house). Fixability is high enough that a focused in-house effort is the cheapest reliable path.'
      : 'Option 2 (buy / integrate existing tooling) unless the operator has a strategic reason to build. Low fixability means an in-house build is expensive and risky.';
  return [
    `# Strategy memo — ${titleFor(gap.description, gap.id)}`,
    '',
    '> NO_AUTO_DEPLOY — this is a Tier C strategy memo. It is guidance for a',
    '> human operator. Recourse never auto-applies or auto-deploys it.',
    '',
    '## Gap',
    `- id: ${gap.id}`,
    `- source: ${gap.source}`,
    `- tier: ${gap.tier}`,
    `- fixability: ${gap.fixability} (${pct}%)`,
    `- risk: ${gap.risk}`,
    `- affected dimensions: ${gap.affectedDimensions.length > 0 ? gap.affectedDimensions.join(', ') : '(none)'}`,
    `- profile: ${profile.business.name} (${profile.business.industry})`,
    '',
    '## Description',
    gap.description,
    '',
    '## Options',
    '',
    `### Option 1 — Address in-house`,
    `Build the fix with the current team and stack for ${profile.business.name}.`,
    '',
    'Risks:',
    '- Consumes operator time that may be better spent on revenue.',
    '- Requires sandbox verification before it can be trusted.',
    '',
    `### Option 2 — Buy or integrate existing tooling`,
    'Prefer a maintained external solution over a custom build.',
    '',
    'Risks:',
    '- Adds a dependency and recurring cost.',
    '- Integration still requires operator effort.',
    '',
    `### Option 3 — Defer and re-scope`,
    'Do nothing now; fold this gap into the next planning cycle.',
    '',
    'Risks:',
    '- The gap keeps costing scorecard points until it is addressed.',
    '',
    '## Recommendation',
    recommendation,
    '',
    '## Decision needed from operator',
    '- [ ] Choose an option or reject this memo.',
    '- [ ] If Option 1: assign an owner and a deadline.',
    '',
  ].join('\n');
}

// ============================================================================
// Shared helpers
// ============================================================================

function expectedScoreDeltaFor(gap: GapT): Record<string, number> {
  const deltas: Record<string, number> = {};
  if (gap.affectedDimensions.length === 0) return deltas;
  for (const dim of gap.affectedDimensions) {
    deltas[dim] = Math.max(1, Math.round(10 * gap.fixability));
  }
  return deltas;
}

function titleFor(description: string, fallbackId: string): string {
  const single = collapse(description);
  if (single.length === 0) return `Upgrade for ${fallbackId}`;
  return single.length > 60 ? single.slice(0, 60) : single;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function businessSlug(profile: BusinessProfileT): string {
  return slugify(profile.business.name) || 'business';
}

/**
 * ReporterProse — a deterministic prose quality gate for the SelfReporter.
 *
 * Ported in spirit from the anti-slop writing agents:
 *   - **sloptrim** (github.com/seyedehsanhadi/sloptrim): local, dependency-free,
 *     no-model scoring of AI-writing patterns against a 0-100 scale. The subset
 *     implemented here covers the high-precision, era-stable tells that matter
 *     for a system dispatch: AI vocabulary, promotional language, significance
 *     inflation, -ing tail clauses, negative parallelisms, filler and pivot
 *     phrases, chatbot scaffolding, transition clusters, generic conclusions,
 *     sentence/paragraph rhythm, hedging, em-dash and heading style, canonical
 *     marketing clichés, decorative rules, and degenerate repetition.
 *   - **better-writing** (github.com/forjd/better-writing): prefer actor/object/
 *     evidence, literal over figurative, subtract not add, vary rhythm, land the
 *     real point. These inform `deslop()`'s safe rewrites and the guidance text.
 *   - **sepia** (github.com/Nanako0129/sepia): the one syntactic measure every
 *     study agrees on is the *spread* of sentence lengths; `deslop` and the
 *     metrics report it.
 *
 * Everything here is pure and deterministic: same text in, same audit out. It
 * never calls a model and never proves authorship — a score says something about
 * writing, never about a writer. It is a self-audit, not a verdict.
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type ProseSeverity = 'tier1' | 'tier2' | 'tier3' | 'advice';

export interface ProseFinding {
  id: string;
  label: string;
  count: number;
  severity: ProseSeverity;
  /** Weight applied to the score (0 for advice-only findings). */
  weight: number;
  examples: string[];
}

export interface ProseMetrics {
  words: number;
  sentences: number;
  paragraphs: number;
  meanSentenceLen: number;
  /** Coefficient of variation of sentence lengths (higher = more human). */
  sentenceCv: number;
  /** Share of successive sentence-length changes that flip sign (1.0 = metronome). */
  cadenceZigzag: number;
  paragraphCv: number;
  emDashes: number;
  semicolons: number;
  hedges: number;
  /** Share of repeated 6-word spans (degenerate repetition). */
  repeatedSpanShare: number;
}

export interface ProseAudit {
  score: number;
  band: 'clean' | 'light tells' | 'mixed' | 'heavy tells' | 'pervasive tells';
  findings: ProseFinding[];
  metrics: ProseMetrics;
  advice: string[];
}

export interface DeslopResult {
  text: string;
  changes: string[];
}

// ----------------------------------------------------------------------------
// Pattern banks (grounded in sloptrim's catalogue)
// ----------------------------------------------------------------------------

const AI_VOCAB = [
  'additionally', 'align with', 'crucial', 'delve', 'tapestry', 'pivotal', 'vibrant',
  'meticulous', 'testament', 'underscore', 'intricate', 'interplay', 'garner', 'bolster',
  'foster', 'showcase', 'emphasize', 'enduring', 'enhance', 'leverage', 'utilize',
  'facilitate', 'encompass', 'harness', 'holistic', 'paradigm', 'transformative',
  'unprecedented', 'myriad', 'plethora', 'robust', 'seamless', 'navigate', 'embark', 'craft',
] as const;

const PROMOTIONAL = [
  'vibrant', 'rich', 'nestled', 'in the heart of', 'breathtaking', 'must-visit', 'stunning',
  'picturesque', 'charming', 'idyllic', 'groundbreaking', 'renowned', 'world-class', 'premier',
  'top-tier', 'unparalleled', 'best-in-class', 'cutting-edge', 'state-of-the-art',
] as const;

const SIGNIFICANCE = [
  'serves as', 'stands as', 'is a testament', 'vital role', 'significant role', 'crucial role',
  'pivotal role', 'underscores its importance', 'reflects broader', 'setting the stage for',
  'marking a turning point', 'evolving landscape', 'indelible mark', 'has shaped',
  'plays a crucial role', 'plays a vital role',
] as const;

const ING_TAILS = [
  'highlighting', 'reflecting', 'symbolizing', 'emphasizing', 'underscoring', 'showcasing',
  'fostering', 'cultivating', 'encompassing', 'signaling', 'demonstrating', 'illustrating',
  'representing', 'suggesting', 'indicating', 'reinforcing', 'leveraging', 'embodying',
] as const;

const FILLER = [
  'in terms of', 'when it comes to', 'with regard to', 'a large number of',
  'in close proximity to', 'prior to', 'during the course of', 'on a regular basis',
  'in spite of the fact that', 'for all intents and purposes', 'the fact of the matter is',
  'a manner of speaking', 'as many of you already know',
] as const;

const EMPTY_PIVOTS = [
  "it's worth noting that", 'it is worth noting that', 'it bears mentioning that',
  'one thing to consider is', 'it is interesting to note that', 'a key consideration is',
  'a point to highlight is',
] as const;

const AUTHORITY = [
  "here's the thing", 'make no mistake', 'the truth is', "let's be honest", 'the simple fact is',
  'at its core', 'what really matters', 'more than anything', 'at the end of the day',
  'the bottom line is', 'the real question is', 'the heart of the matter', 'the deeper issue',
] as const;

const SELF_THOROUGHNESS = [
  'this comprehensive guide', 'this in-depth analysis', 'this complete overview',
  'a thorough examination of', 'everything you need to know about', 'comprehensive guide',
] as const;

const CONCLUSIONS = [
  'in conclusion', 'in summary', 'to summarize', 'to conclude', 'all in all', 'in essence',
] as const;

const CHATBOT = [
  'i hope this helps', 'happy to help', 'of course!', 'certainly!', "you're absolutely right",
  'would you like me to', 'feel free to ask', 'hope this email finds you well',
  'let me know if you', 'here is a summary', 'below is a summary',
] as const;

const RLHF = [
  'on one hand', 'on the other hand', 'it is important to consider both', 'there are pros and cons',
  "let's explore", 'it is worth understanding that', 'both sides have valid',
] as const;

const MARKETING_SLOP = [
  'unlock the full potential', 'unlock the potential', 'navigate the complexities',
  'a testament to the power', 'stay ahead of the curve', 'turn challenges into opportunities',
  'the future is full of possibilities', 'something for everyone',
  'whether you are a beginner or a pro', 'the key takeaway', 'seamlessly integrate',
  'take it to the next level', 'working smarter, not harder', 'more important than ever',
  'drive meaningful impact', 'game-changer', 'supercharge', 'skyrocket',
] as const;

const HEDGES = [
  'may', 'might', 'could', 'possibly', 'potentially', 'arguably', 'perhaps', 'seems',
  'appears to', 'somewhat', 'relatively', 'fairly', 'kind of', 'sort of',
] as const;

const CHATBOT_MARKUP = ['citeturn0search', 'oai_citation', 'contentreference', 'navlist', '【'] as const;
const PLACEHOLDER = ['[your name]', '[insert url]', '[insert email]', '[company]', '[todo]', '[placeholder]', 'lorem ipsum'] as const;

// ----------------------------------------------------------------------------
// Counting helpers
// ----------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countPhrases(text: string, phrases: readonly string[]): { count: number; examples: string[] } {
  let count = 0;
  const examples: string[] = [];
  for (const p of phrases) {
    const re = new RegExp(`\\b${escapeRe(p)}`, 'gi');
    const hits = text.match(re);
    if (hits) {
      count += hits.length;
      if (examples.length < 3) examples.push(`${p} ×${hits.length}`);
    }
  }
  return { count, examples };
}

function countRegex(text: string, re: RegExp): number {
  const m = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
  return m ? m.length : 0;
}

// ----------------------------------------------------------------------------
// Metrics (strip markdown for prose-only measurement)
// ----------------------------------------------------------------------------

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/\|[^\n]*\|/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*---+\s*$/gm, ' ');
}

function splitSentences(plain: string): string[] {
  return plain
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function coefficientOfVariation(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (mean <= 0) return 0;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance) / mean;
}

function computeMetrics(md: string): ProseMetrics {
  const plain = stripMarkdown(md);
  const words = plain.split(/\s+/).filter(Boolean);
  const sentences = splitSentences(plain);
  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const paragraphs = md.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p && !/^[#|\-|]/.test(p));
  const paraLens = paragraphs.map((p) => splitSentences(stripMarkdown(p)).length).filter((n) => n > 0);

  let flips = 0;
  for (let i = 2; i < lengths.length; i++) {
    const a = lengths[i - 1] - lengths[i - 2];
    const b = lengths[i] - lengths[i - 1];
    if (a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b)) flips++;
  }
  const zigzagDenom = Math.max(1, lengths.length - 2);
  const cadenceZigzag = lengths.length > 2 ? flips / zigzagDenom : 0;

  const tokens = plain.toLowerCase().split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  let repeated = 0;
  let spans = 0;
  for (let i = 0; i + 6 <= tokens.length; i++) {
    const gram = tokens.slice(i, i + 6).join(' ');
    spans++;
    if (seen.has(gram)) repeated++;
    else seen.add(gram);
  }

  let hedges = 0;
  for (const s of sentences) {
    const lower = s.toLowerCase();
    const hits = HEDGES.filter((h) => new RegExp(`\\b${escapeRe(h)}\\b`).test(lower)).length;
    if (hits >= 2) hedges++;
  }

  return {
    words: words.length,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    meanSentenceLen: lengths.length ? Math.round((lengths.reduce((a, b) => a + b, 0) / lengths.length) * 10) / 10 : 0,
    sentenceCv: Math.round(coefficientOfVariation(lengths) * 1000) / 1000,
    cadenceZigzag: Math.round(cadenceZigzag * 1000) / 1000,
    paragraphCv: Math.round(coefficientOfVariation(paraLens) * 1000) / 1000,
    emDashes: (md.match(/—/g) || []).length,
    semicolons: (plain.match(/;/g) || []).length,
    hedges,
    repeatedSpanShare: spans ? Math.round((repeated / spans) * 1000) / 1000 : 0,
  };
}

// ----------------------------------------------------------------------------
// Scoring
// ----------------------------------------------------------------------------

const SEVERITY_WEIGHT: Record<ProseSeverity, number> = { tier1: 12, tier2: 7, tier3: 4, advice: 0 };

function bandFor(score: number): ProseAudit['band'] {
  if (score < 15) return 'clean';
  if (score < 30) return 'light tells';
  if (score < 55) return 'mixed';
  if (score < 75) return 'heavy tells';
  return 'pervasive tells';
}

function finding(
  id: string,
  label: string,
  severity: ProseSeverity,
  hit: { count: number; examples: string[] },
  threshold = 1,
): ProseFinding | null {
  if (hit.count < threshold) return null;
  return { id, label, count: hit.count, severity, weight: SEVERITY_WEIGHT[severity], examples: hit.examples };
}

/** Score text on a 0-100 slop scale (higher = more AI-tell density). Pure. */
export function scoreProse(markdown: string): ProseAudit {
  const metrics = computeMetrics(markdown);
  const findings: ProseFinding[] = [];

  const push = (f: ProseFinding | null) => { if (f) findings.push(f); };

  push(finding('1_vocab', 'AI vocabulary cluster', 'tier2', countPhrases(markdown, AI_VOCAB), 3));
  push(finding('3_promotional', 'Promotional language', 'tier2', countPhrases(markdown, PROMOTIONAL)));
  push(finding('10_significance', 'Significance inflation', 'tier2', countPhrases(markdown, SIGNIFICANCE)));
  push(finding('16_ing_tails', 'Superficial -ing tail clauses', 'tier2', countPhrases(markdown, ING_TAILS)));
  push(finding('17_negation', 'Negative parallelism / tailing negation', 'tier2', {
    count: countRegex(markdown, /\b(not only|not just|not merely)\b/i) + countRegex(markdown, /,\s*no (wasted|hassle|fluff|guess)/i),
    examples: [],
  }));
  push(finding('19_filler', 'Filler phrases', 'tier3', countPhrases(markdown, FILLER)));
  push(finding('20_empty_pivot', 'Empty pivot phrases', 'tier3', countPhrases(markdown, EMPTY_PIVOTS)));
  push(finding('22_authority', 'Persuasive authority tropes', 'tier2', countPhrases(markdown, AUTHORITY)));
  push(finding('24_self_thorough', 'Self-thoroughness phrases', 'tier2', countPhrases(markdown, SELF_THOROUGHNESS)));
  push(finding('25_qna', 'Question-answer rhetorical pattern', 'tier2', {
    count: countRegex(markdown, /\b[a-z][^.?]{4,60}\?\s*(Yes|No|Absolutely|Exactly|Maybe)\./g),
    examples: [],
  }));
  push(finding('37_transitions', 'Transition cluster overuse', 'tier3', countPhrases(markdown, ['additionally', 'furthermore', 'moreover', 'nevertheless', 'subsequently']), 2));
  push(finding('38_conclusions', 'Compulsive conclusion phrases', 'tier3', countPhrases(markdown, CONCLUSIONS)));
  push(finding('47_chatbot', 'Chatbot artifacts', 'tier1', countPhrases(markdown, CHATBOT)));
  push(finding('49_rlhf', 'Helpful-assistant register', 'tier2', countPhrases(markdown, RLHF)));
  push(finding('54_hedging', 'Hedge stacking', 'tier2', { count: metrics.hedges, examples: [] }));
  push(finding('56_bold', 'Boldface overuse', 'tier3', { count: countRegex(markdown, /\*\*[^*]+\*\*/g), examples: [] }, 8));
  push(finding('58_emdash', 'Em-dash overuse', 'tier3', { count: metrics.emDashes, examples: [] }, 3));
  push(finding('59_titlecase', 'Title case in headings', 'tier3', {
    count: countRegex(markdown, /^#{1,6}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){2,}/gm),
    examples: [],
  }));
  push(finding('62_invisible', 'Invisible / control characters', 'tier1', {
    count: (markdown.match(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g) || []).length,
    examples: [],
  }));
  push(finding('63_placeholder', 'Placeholder / template text', 'tier1', countPhrases(markdown, PLACEHOLDER)));
  push(finding('64_markup', 'Chatbot reference-markup leak', 'tier1', countPhrases(markdown, CHATBOT_MARKUP)));
  push(finding('69_marketing', 'Canonical marketing-slop phrases', 'tier1', countPhrases(markdown, MARKETING_SLOP)));
  push(finding('70_rules', 'Decorative horizontal rules', 'tier3', {
    count: countRegex(markdown, /^\s*---+\s*$/gm),
    examples: [],
  }, 3));
  push(finding('71_repetition', 'Degenerate repetition', 'tier2', {
    count: metrics.repeatedSpanShare > 0.2 ? Math.round(metrics.repeatedSpanShare * 100) : 0,
    examples: metrics.repeatedSpanShare > 0.2 ? [`${Math.round(metrics.repeatedSpanShare * 100)}% repeated 6-word spans`] : [],
  }));

  const advice: string[] = [];
  if (metrics.sentences >= 8 && metrics.meanSentenceLen > 0) {
    if (metrics.sentenceCv < 0.35) {
      push(finding('40_monotony', 'Sentence-length monotony', 'advice', { count: 1, examples: [`CV ${metrics.sentenceCv}`] }));
      advice.push('Vary sentence length: add at least one short sentence per paragraph.');
    }
    if (metrics.cadenceZigzag > 0.8 && metrics.sentences >= 6) {
      push(finding('41_zigzag', 'Mechanical short-long alternation', 'advice', { count: 1, examples: [`zigzag ${metrics.cadenceZigzag}`] }));
      advice.push('Break the short-long metronome; let two similar lengths sit together.');
    }
  }
  if (metrics.paragraphs >= 4 && metrics.paragraphCv < 0.4 && metrics.paragraphCv > 0) {
    push(finding('44_para_uniform', 'Uniform paragraph length', 'advice', { count: 1, examples: [`CV ${metrics.paragraphCv}`] }));
    advice.push('Vary paragraph length; let one paragraph be a single sentence.');
  }

  const raw = findings.reduce((sum, f) => sum + f.weight * Math.min(f.count, 4), 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  findings.sort((a, b) => b.weight * b.count - a.weight * a.count || a.id.localeCompare(b.id));

  return { score, band: bandFor(score), findings, metrics, advice };
}

// ----------------------------------------------------------------------------
// Deterministic, conservative rewrite (better-writing's "subtract, don't add")
// ----------------------------------------------------------------------------

const REPLACEMENTS: Array<{ re: RegExp; to: string; label: string }> = [
  { re: /\butili[sz]e\b/gi, to: 'use', label: 'utilize → use' },
  { re: /\bleverage\b/gi, to: 'use', label: 'leverage → use' },
  { re: /\bin order to\b/gi, to: 'to', label: 'in order to → to' },
  { re: /\bdelve into\b/gi, to: 'look at', label: 'delve into → look at' },
  { re: /\ba plethora of\b/gi, to: 'many', label: 'a plethora of → many' },
  { re: /\bmyriad of\b/gi, to: 'many', label: 'myriad of → many' },
  { re: /\bthe fact of the matter is that\b/gi, to: '', label: 'removed “the fact of the matter is that”' },
  { re: /\bit(?:'| i)s worth noting that\b/gi, to: '', label: 'removed “it’s worth noting that”' },
  { re: /\bhere(?:'| i)s the thing[:,]?\s*/gi, to: '', label: 'removed “here’s the thing”' },
  { re: /\bat the end of the day,?\s*/gi, to: '', label: 'removed “at the end of the day”' },
  { re: /\bin conclusion,?\s*/gi, to: '', label: 'removed “in conclusion”' },
  { re: /\bin summary,?\s*/gi, to: '', label: 'removed “in summary”' },
  { re: /\bto summarize,?\s*/gi, to: '', label: 'removed “to summarize”' },
  { re: /\b(?:i hope this helps|happy to help)[.!]?\s*/gi, to: '', label: 'removed chatbot sign-off' },
  { re: /\bseamlessly integrate\b/gi, to: 'connect', label: 'seamlessly integrate → connect' },
  { re: /\bunlock the (?:full )?potential of\b/gi, to: 'get the most from', label: 'unlock the potential of → get the most from' },
  { re: /\bstay ahead of the curve\b/gi, to: 'keep pace', label: 'stay ahead of the curve → keep pace' },
  { re: /\btake it to the next level\b/gi, to: 'improve it', label: 'take it to the next level → improve it' },
];

/** Normalize invisible characters and non-standard spaces deterministically. */
export function scrub(markdown: string): DeslopResult {
  const changes: string[] = [];
  let text = markdown;
  const invisible = text.match(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g);
  if (invisible) {
    text = text.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
    changes.push(`removed ${invisible.length} invisible character(s)`);
  }
  if (/[\u00A0\u202F\u2000-\u200A\u205F\u3000]/.test(text)) {
    text = text.replace(/[\u00A0\u202F\u2000-\u200A\u205F\u3000]/g, ' ');
    changes.push('normalized non-standard spaces');
  }
  return { text, changes };
}

/**
 * Conservative deterministic cleanup. Removes the safe tells only; the audit
 * still reports everything else as guidance. Never adds a claim. Pure.
 */
export function deslop(markdown: string): DeslopResult {
  const changes: string[] = [];
  let text = scrub(markdown).text;

  for (const { re, to, label } of REPLACEMENTS) {
    const fresh = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    if (fresh.test(text)) {
      text = text.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`), to);
      changes.push(label);
    }
  }

  // Decorative em-dash hinges → comma, but keep the first (sloptrim allows one).
  let seenDash = false;
  let replacedDashes = 0;
  text = text.replace(/\s—\s/g, (match) => {
    if (!seenDash) { seenDash = true; return match; }
    replacedDashes++;
    return ', ';
  });
  if (replacedDashes > 0) changes.push(`replaced ${replacedDashes} extra em-dash hinge(s) with a comma`);

  // Collapse doubled spaces introduced by deletions, and fix leading punctuation.
  const before = text;
  text = text.replace(/[ \t]{2,}/g, ' ').replace(/^\s*[,.;]\s*/gm, '').trim();
  if (before !== text) changes.push('tidied whitespace and stray punctuation');

  return { text, changes };
}

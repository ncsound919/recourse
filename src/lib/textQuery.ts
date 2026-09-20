/**
 * textQuery — shared query cleaning for tool/skill retrieval.
 *
 * Drops punctuation, very short tokens and stopwords so lexical ranking is
 * precise rather than noise-driven. Short acronyms (pdf, seo, api) are kept.
 */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'are', 'not', 'use', 'using', 'one', 'two', 'its',
  'from', 'into', 'must', 'will', 'can', 'each', 'they', 'them', 'then', 'than', 'when', 'what', 'which', 'have',
  'has', 'was', 'were', 'all', 'any', 'our', 'out', 'but', 'there', 'here', 'how', 'why', 'who', 'about', 'only',
  'return', 'should', 'would', 'could', 'these', 'those', 'such', 'also', 'more', 'most', 'some', 'same', 'make',
  'please', 'give', 'need', 'want', 'like', 'just', 'very', 'does', 'did', 'done', 'been', 'being', 'over', 'under',
]);

export function cleanTaskQuery(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .join(' ')
    .trim();
}

/** Split an identifier/label into lowercase words (handles snake/kebab/camel). */
export function queryWords(value: string): string[] {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when a token matches a candidate word (exact, prefix either way). */
export function wordMatches(token: string, word: string): boolean {
  return word === token || word.startsWith(token) || token.startsWith(word);
}

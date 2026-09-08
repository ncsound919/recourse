/**
 * Deterministic researcher template plugin — Recourse template-plugin port of
 * the deterministic-web-researcher core (`deteministic
 * researcher/deterministic-web-researcher.ts`).
 *
 * The synthesizer emits a dependency-free `Researcher` class that wraps the
 * same deterministic pipeline (four-stage dedup, weighted relevance scoring,
 * hash-chained audit summary, claim binding) so sandboxed builds and
 * self-hosted modules reproduce the core in `src/lib/deterministicResearch.ts`
 * without imports. No external fetch anywhere on either side.
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

const params: ComponentTemplateParam[] = [
  {
    id: 'maxSources',
    label: 'Max Sources',
    type: 'number',
    default: 10,
    min: 1,
    max: 100,
    step: 1,
    description: 'Maximum verified sources retained after scoring and sorting',
  },
  {
    id: 'minRelevance',
    label: 'Min Relevance',
    type: 'number',
    default: 0,
    min: 0,
    max: 1,
    step: 0.05,
    description: 'Minimum relevance score (0-1) for a source to survive verification',
  },
  {
    id: 'dedupThreshold',
    label: 'Dedup Similarity Threshold',
    type: 'number',
    default: 0.85,
    min: 0.5,
    max: 1,
    step: 0.01,
    description: 'Title Levenshtein similarity above which sources merge (exact hash/DOI/author-cluster always merge)',
  },
];

export const deterministicResearcherPlugin: TemplatePlugin = {
  id: 'tpl_deterministic_researcher',
  name: 'Deterministic Researcher with Evidence Bridge',
  domain: 'systemic' as ToolDomain,
  category: 'algorithmic' as ComponentTemplateCategory,
  description:
    'Deterministic research pipeline with four-stage dedup (exact hash, DOI, author-cluster, Levenshtein), weighted relevance scoring, hash-chained audit summary, and claim-evidence binding. No external fetch.',
  benchmarkFlops: 1200,
  complexity: 'O(n^2 * L)',
  defaultScore: 0.95,
  tags: ['research', 'evidence', 'audit', 'deterministic', 'dedup'],
  params,
  synthesizer: (userParams, options) => {
    const maxSources = Math.max(1, Math.min(100, Math.floor(Number(userParams.maxSources) || 10)));
    const minRelevanceRaw = Number(userParams.minRelevance);
    const minRelevance = Math.max(0, Math.min(1, Number.isFinite(minRelevanceRaw) ? minRelevanceRaw : 0));
    const dedupRaw = Number(userParams.dedupThreshold);
    const dedupThreshold = Math.max(0.5, Math.min(1, Number.isFinite(dedupRaw) ? dedupRaw : 0.85));
    const withHealing = options?.withSelfHealing ?? true;
    const compName = options?.componentName || 'Researcher';

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_deterministic_researcher (maxSources: ${maxSources}, minRelevance: ${minRelevance}, dedupThreshold: ${dedupThreshold})
 * Deterministic research pipeline: four-stage dedup, weighted scoring, audit hashes, claim binding. No external fetch.
 */
export class ${compName} {
  constructor(maxSources = ${maxSources}, minRelevance = ${minRelevance}, dedupThreshold = ${dedupThreshold}) {
    this.maxSources = Math.max(1, Math.min(100, Math.floor(maxSources)));
    this.minRelevance = Math.max(0, Math.min(1, minRelevance));
    this.dedupThreshold = Math.max(0.5, Math.min(1, dedupThreshold));
    this.trustedDomains = ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'github.com', 'nature.com', 'science.org'];
  }

  hashHex(input) {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    const s = String(input);
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 16777619);
      h2 = Math.imul(h2 ^ (ch + 31), 16777619);
    }
    h1 >>>= 0; h2 >>>= 0;
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  contentHash(source) {
    const authors = (source.metadata && source.metadata.authors ? source.metadata.authors : [])
      .map((a) => String(a).toLowerCase().trim()).filter(Boolean).sort().join('|');
    return this.hashHex([String(source.title).toLowerCase().trim(), source.url, String((source.metadata && source.metadata.doi) || '').toLowerCase().trim(), authors].join('\\n'));
  }

  levenshtein(a, b) {
    a = String(a); b = String(b);
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    let prev = []; let curr = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[b.length];
  }

  similarity(a, b) {
    const m = Math.max(String(a).length, String(b).length);
    if (m === 0) return 1;
    return 1 - this.levenshtein(a, b) / m;
  }

  dedupSources(sources) {
    ${withHealing ? `if (!Array.isArray(sources)) {
      throw new Error('dedupSources expects an array of sources');
    }` : ''}
    const unique = [];
    const seenHash = {};
    for (const source of sources) {
      const hash = this.contentHash(source);
      const doi = String((source.metadata && source.metadata.doi) || '').toLowerCase().trim();
      const authorKey = (source.metadata && source.metadata.authors ? source.metadata.authors : [])
        .map((a) => String(a).toLowerCase().trim()).filter(Boolean).sort().join('|');
      let dup = false;
      if (seenHash[hash]) dup = true;
      if (!dup && doi !== '') {
        dup = unique.some((u) => String((u.metadata && u.metadata.doi) || '').toLowerCase().trim() === doi);
      }
      if (!dup && authorKey !== '') {
        dup = unique.some((u) => (u.metadata && u.metadata.authors ? u.metadata.authors : [])
          .map((a) => String(a).toLowerCase().trim()).filter(Boolean).sort().join('|') === authorKey);
      }
      if (!dup) {
        dup = unique.some((u) => this.similarity(String(u.title).toLowerCase(), String(source.title).toLowerCase()) > this.dedupThreshold);
      }
      if (!dup) { seenHash[hash] = true; unique.push(source); }
    }
    return { unique, duplicatesRemoved: sources.length - unique.length };
  }

  scoreRelevance(source, query) {
    const tokens = String(query.topic || '').toLowerCase().split(/\\s+/).filter(Boolean);
    let score = 0;
    if (tokens.length > 0) {
      const text = (String(source.title) + ' ' + String(source.contentPreview)).toLowerCase();
      const hits = tokens.filter((t) => text.includes(t)).length;
      score += (hits / tokens.length) * 0.4;
    }
    if (this.trustedDomains.includes(source.domain)) score += 0.3;
    if (source.metadata && source.metadata.publishedAt !== undefined) {
      const ref = query.timestamp || 0;
      const ageMonths = (ref - source.metadata.publishedAt) / (1000 * 60 * 60 * 24 * 30);
      score += Math.max(0, Math.min(0.3, 0.3 * (1 - ageMonths / 12)));
    }
    if (source.metadata && source.metadata.accessibilityStatus === 'open') score += 0.1;
    return Math.max(0, Math.min(1, Math.round(score * 1e6) / 1e6));
  }

  executeResearch(query, sources) {
    ${withHealing ? `if (!query || typeof query.topic !== 'string') {
      throw new Error('executeResearch requires a query with a string topic');
    }
    if (!Array.isArray(sources)) {
      throw new Error('executeResearch requires an array of sources');
    }` : ''}
    const deduped = this.dedupSources(sources);
    const threshold = (query.constraints && query.constraints.minRelevanceScore !== undefined)
      ? query.constraints.minRelevanceScore : this.minRelevance;
    const verified = [];
    for (const raw of deduped.unique) {
      const relevanceScore = this.scoreRelevance(raw, query);
      if (relevanceScore < threshold) continue;
      const quality = {
        hasMetadata: Boolean(raw.metadata && raw.metadata.publishedAt !== undefined && raw.metadata.authors !== undefined),
        hasAuthors: Boolean(raw.metadata && raw.metadata.authors && raw.metadata.authors.length > 0),
        isOpenAccess: Boolean(raw.metadata && raw.metadata.accessibilityStatus === 'open'),
      };
      const auditHash = this.hashHex([raw.id, raw.url, raw.title, String(relevanceScore), JSON.stringify(quality)].join('|'));
      const combined = relevanceScore * 0.6 + ((quality.hasMetadata ? 0.3 : 0) + (quality.hasAuthors ? 0.3 : 0) + (quality.isOpenAccess ? 0.2 : 0)) * 0.4;
      verified.push({ ...raw, relevanceScore, confidenceLevel: combined >= 0.8 ? 'high' : combined >= 0.5 ? 'medium' : 'low', dataQuality: quality, auditHash });
    }
    verified.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const limited = verified.slice(0, this.maxSources);
    const queryHash = this.hashHex(JSON.stringify(query));
    const executionHash = this.hashHex([queryHash, ...limited.map((s) => s.id + '|' + s.relevanceScore + '|' + s.auditHash)].join('\\n'));
    return {
      sources: limited,
      dedupReport: { groupsFormed: deduped.unique.length, duplicatesRemoved: deduped.duplicatesRemoved, mergeStrategy: 'first_in_group_retained' },
      auditSummary: { queryHash, executionHash },
    };
  }

  claimSimilarity(claimText, sourceText) {
    const words = String(claimText).toLowerCase().split(/\\s+/).filter((w) => w.length > 3);
    if (words.length === 0) return 0;
    const lowered = String(sourceText).toLowerCase();
    return words.filter((w) => lowered.includes(w)).length / words.length;
  }

  bindToClaims(result, claims) {
    const bindings = [];
    for (const claim of claims) {
      for (const source of result.sources) {
        const similarity = this.claimSimilarity(claim.text, String(source.title) + ' ' + String(source.contentPreview));
        if (similarity > 0.6) {
          bindings.push({ sourceId: source.id, claimId: claim.id, confidenceLevel: source.confidenceLevel, similarity, auditHash: this.hashHex(source.id + '|' + claim.id + '|' + similarity) });
        }
      }
    }
    return bindings;
  }
}`;

    const testSuiteCode = `const r = new ${compName}(${maxSources}, ${minRelevance}, ${dedupThreshold});
const q = { id: 'q1', timestamp: 1700000000000, topic: 'graph neural networks', intent: 'literature_scan', scope: {}, constraints: {} };
const sA = { id: 's1', title: 'Graph Neural Networks for Molecules', url: 'https://arxiv.org/a', domain: 'arxiv.org', contentPreview: 'graph neural networks molecules', metadata: { publishedAt: 1699000000000, authors: ['Ada'], accessibilityStatus: 'open' }, fetchedAt: 1700000000000 };
const sB = { id: 's2', title: 'Graph Neural Networks for Molecules', url: 'https://arxiv.org/a', domain: 'arxiv.org', contentPreview: 'graph neural networks molecules', metadata: { publishedAt: 1699000000000, authors: ['Ada'], accessibilityStatus: 'open' }, fetchedAt: 1700000000000 };
const sC = { id: 's3', title: 'Baking Sourdough Bread', url: 'https://example.com/bread', domain: 'example.com', contentPreview: 'flour water salt baking', metadata: { publishedAt: 1600000000000, authors: ['Baker'] , accessibilityStatus: 'paywalled' }, fetchedAt: 1700000000000 };
const out1 = r.executeResearch(q, [sA, sB, sC]);
assert out1.dedupReport.duplicatesRemoved === 1;
assert out1.sources.length === 2;
assert out1.sources[0].relevanceScore >= out1.sources[1].relevanceScore;
assert out1.sources[0].relevanceScore >= 0 && out1.sources[0].relevanceScore <= 1;
const out2 = r.executeResearch(q, [sA, sB, sC]);
assert out2.auditSummary.executionHash === out1.auditSummary.executionHash;
const bindings = r.bindToClaims(out1, [{ id: 'c1', text: 'graph neural networks for molecules' }]);
assert bindings.length >= 1;
assert bindings[0].sourceId === out1.sources[0].id;`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `Synthesized deterministic researcher (maxSources ${maxSources}, minRelevance ${minRelevance}, dedupThreshold ${dedupThreshold}) with evidence bridge`,
      selfHealingGuards: withHealing ? ['QueryTopicGuard', 'SourceArrayGuard'] : [],
    };
  },
  selfHost: {
    stateful: true,
    ctorParamIds: ['maxSources', 'minRelevance', 'dedupThreshold'],
    methods: [
      { method: 'executeResearch', label: 'Run deterministic research' },
      { method: 'bindToClaims', label: 'Bind sources to claims' },
    ],
  },
};

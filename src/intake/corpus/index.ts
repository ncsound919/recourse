/**
 * Corpus index + dispatch — pure helpers on top of the scanner.
 *
 * summarize():    real rollups (per-project / per-kind / topic frequency).
 * digest():       honest markdown digest of the corpus for fleet readout.
 * toSignals():    turn the highest-value insight artifacts into intake signals
 *                 (source 'corpus') so the existing grounding loop can turn a
 *                 paper into a verified capability when the model is online.
 *
 * Nothing here reads the network or the model; it is fully unit-testable and
 * never fabricates content.
 */
import type { ExternalSignal } from '../types.js';
import { makeSignal } from '../util.js';
import type { CorpusArtifact, CorpusRoot, CorpusSnapshot, CorpusSummary, InsightKind } from './types.js';

/** Kinds that are treated as grounding-signal candidates (research value). */
const SIGNAL_KINDS: InsightKind[] = ['paper', 'whitepaper', 'research', 'knowledge', 'spec'];

/** Aggregate real counts. */
export function summarize(artifacts: CorpusArtifact[]): CorpusSummary {
  const byProject: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  const topics: Record<string, number> = {};
  for (const a of artifacts) {
    byProject[a.project] = (byProject[a.project] ?? 0) + 1;
    byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
    for (const t of a.topics) topics[t] = (topics[t] ?? 0) + 1;
  }
  return {
    total: artifacts.length,
    byProject,
    byKind: byKind as Record<InsightKind, number>,
    topics,
  };
}

/** Build an honest markdown digest of the current corpus snapshot. */
export function corpusDigest(snapshot: CorpusSnapshot): string {
  const L: string[] = [];
  L.push(`## Ecosystem Research Corpus`);
  L.push('');
  if (!snapshot.roots.length) { L.push('- No corpus roots configured.'); return L.join('\n'); }
  if (snapshot.lastScanAt == null) {
    L.push('- Not scanned yet. Trigger a scan to ingest the sibling projects.');
    L.push('- Roots: ' + snapshot.roots.map((r) => r.project).join(', '));
    return L.join('\n');
  }
  const s = snapshot.summary;
  const at = new Date(snapshot.lastScanAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  L.push(`- Last scan: ${at} | artifacts indexed: ${s?.total ?? 0}`);
  if (s && Object.keys(s.byProject).length) {
    L.push(`- By project: ${Object.entries(s.byProject).map(([p, n]) => `${p}: ${n}`).join(', ')}`);
  }
  if (s && Object.keys(s.byKind).length) {
    L.push(`- By kind: ${Object.entries(s.byKind).map(([k, n]) => `${k}: ${n}`).join(', ')}`);
  }
  if (s && Object.keys(s.topics).length) {
    const top = Object.entries(s.topics).sort((a, b) => b[1] - a[1]).slice(0, 6);
    L.push(`- Topics: ${top.map(([t, n]) => `${t} (${n})`).join(', ')}`);
  }
  if (snapshot.errors.length) {
    L.push(`- Scan errors: ${snapshot.errors.length} (${snapshot.errors[0].root}: ${snapshot.errors[0].error})`);
  }
  if (snapshot.dispatchedSignals > 0) {
    L.push(`- Dispatched ${snapshot.dispatchedSignals} research artifacts as grounding signals (pending → capability).`);
  }
  return L.join('\n');
}

/**
 * Turn the highest-value research artifacts into intake grounding signals.
 * Deterministic ordering (kind rank, then word count desc), capped. Every
 * signal carries a corpus:// url + the real document excerpt; dedupe keys are
 * stable across rescans via content hash.
 */
export function artifactsToSignals(
  artifacts: CorpusArtifact[],
  cap = 150,
): ExternalSignal[] {
  const rank: Record<InsightKind, number> = {
    whitepaper: 0, paper: 1, research: 2, knowledge: 3, spec: 4, data: 5, readme: 6, config: 7, other: 8,
  };
  const sorted = [...artifacts]
    .filter((a) => SIGNAL_KINDS.includes(a.kind) && a.excerpt && !a.excerpt.startsWith('[unreadable') && !a.excerpt.startsWith('[skipped'))
    .sort((a, b) => (rank[a.kind] - rank[b.kind]) || (b.words - a.words));
  return sorted.slice(0, cap).map((a) => {
    const title = a.name.replace(/\.[^.]+$/, '');
    const url = `corpus://${a.project}/${a.rel}`;
    return makeSignal(
      'corpus',
      url,
      title,
      a.excerpt,
      a.topics,
      new Date(a.mtime).toISOString(),
    );
  });
}

export const DEFAULT_CORPUS_ROOTS: CorpusRoot[] = [
  {
    project: 'hempforge',
    root: 'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\Biotech\\HempForge-main',
  },
  {
    project: 'hemp-os',
    root: 'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\Biotech\\Hemp-OS-main',
  },
  {
    project: 'overlay-oncology',
    root: 'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\Overlay Oncology',
  },
];


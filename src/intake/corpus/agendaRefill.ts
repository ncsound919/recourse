/**
 * Corpus Agenda Refill — the "never void of agenda" fix.
 *
 * The science/forge loops were starving because the dynamic agenda was only
 * refilled by dream genes + manual intel adoption, while 4,000+ research PDFs
 * and datasets sat unused. This module turns corpus artifacts (papers, docs,
 * datasets) into durable intel proposals + forge specs on every corpus scan,
 * so the agenda always has fresh, grounded targets derived from real research.
 *
 * Honesty contract:
 *  - A proposal is only created from a REAL corpus artifact (name, kind,
 *    content excerpt) — never fabricated.
 *  - Corpus artifacts NO LONGER become forge specs directly. The previous
 *    design turned every file into an identically-specified FNV-1a hash
 *    function named after the file: ~420 clone "tools" (68 distinct sources)
 *    that passed a trivially satisfiable suite and added zero capability.
 *    Instead, substantive artifacts become GROUNDINGS: research excerpts the
 *    learner-driven minting step uses as context, so the model drafts a real
 *    problem + reference implementation + acceptance test from the source,
 *    and the reference must pass that test in the sandbox before the spec is
 *    admitted (see mintProblems / mintForgeSpecFromLearnerPlan).
 *  - Dedupe by artifact hash so repeated scans never duplicate.
 */

import type { ToolDomain } from '../../types.js';
import type { ForgeSpec } from '../../lib/capabilityForge.js';
import type { IntelProposal } from '../../lib/intelInvention.js';

export interface CorpusArtifactLike {
  name: string;
  project: string;
  kind?: string;            // 'paper' | 'dataset' | 'whitepaper' | 'doc' | ...
  content?: string;
  preview?: string;
  /** Real document head (CorpusArtifact.excerpt from the scanner). */
  excerpt?: string;
  hash?: string;
  path?: string;
}

/** A research excerpt the forge's minting step can ground a new problem in. */
export interface CorpusGrounding {
  hash: string;
  title: string;
  project: string;
  kind: string;
  domain: ToolDomain;
  excerpt: string;
}

/** Minimum excerpt length for an artifact to be worth grounding a tool in. */
export const GROUNDING_MIN_CHARS = 200;

function artifactText(a: CorpusArtifactLike): string {
  return String(a.excerpt || a.preview || a.content || '').replace(/\s+/g, ' ').trim();
}

/** Map a corpus kind to a forge domain. Honest heuristic, never fabricated. */
export function kindToDomain(kind?: string): ToolDomain {
  const k = (kind || '').toLowerCase();
  if (k.includes('paper') || k.includes('research') || k.includes('biology') || k.includes('cancer')) return 'biotech';
  if (k.includes('math') || k.includes('stat')) return 'math';
  if (k.includes('coding') || k.includes('software') || k.includes('api')) return 'coding';
  if (k.includes('quantum') || k.includes('qubit')) return 'quantum_sim';
  if (k.includes('neuro') || k.includes('logic') || k.includes('agent')) return 'neuro_symbolic';
  return 'systemic';
}

/** JS reserved words that can never be a valid exported function name. */
const RESERVED = new Set([
  'package', 'default', 'class', 'function', 'return', 'if', 'else', 'for',
  'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof',
  'instanceof', 'in', 'of', 'var', 'let', 'const', 'export', 'import', 'extends',
  'super', 'this', 'null', 'undefined', 'true', 'false', 'try', 'catch', 'throw',
  'finally', 'yield', 'await', 'async', 'static', 'get', 'set', 'void', 'with',
]);

/** Build a deterministic function name from an artifact name (safe identifier). */
export function artifactToFnName(artifact: CorpusArtifactLike): string {
  const base = artifact.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]+/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const name = (base || 'corpus_tool').replace(/_$/, '');
  // A reserved word can never be a valid function name — return a non-tool
  // sentinel so the caller skips it (the forge would fail forever on it).
  if (RESERVED.has(name)) return '';
  return name;
}

export interface RefillResult {
  proposalsCreated: number;
  /** Always 0: corpus artifacts no longer become forge specs directly. */
  specsCreated: number;
  groundingsCreated: number;
  skipped: string[];
}

/**
 * Turn corpus artifacts into intel proposals + minting groundings. Runs after
 * each corpus scan. Dedupes by artifact hash (keeps a persistent seen-set).
 * `specs` is kept in the return shape for compatibility and is always empty.
 */
export function refillAgendaFromCorpus(
  artifacts: CorpusArtifactLike[],
  seenHashes: Set<string>,
  _existingAgendaNames?: Set<string>,
): { proposals: IntelProposal[]; specs: ForgeSpec[]; groundings: CorpusGrounding[]; result: RefillResult } {
  const proposals: IntelProposal[] = [];
  const specs: ForgeSpec[] = [];
  const groundings: CorpusGrounding[] = [];
  const skipped: string[] = [];
  const result: RefillResult = { proposalsCreated: 0, specsCreated: 0, groundingsCreated: 0, skipped };

  for (const a of artifacts) {
    const hash = a.hash || a.path || `${a.project}:${a.name}`;
    if (seenHashes.has(hash)) continue; // already refilled this artifact
    const kind = a.kind || 'doc';
    const domain = kindToDomain(kind);
    const fnName = artifactToFnName(a);

    // Skip obvious non-tool artifacts (dirs, READMEs, lockfiles, config).
    const baseName = a.name.toLowerCase();
    if (!fnName || fnName === 'corpus_tool' ||
        baseName.match(/^(readme|license|\.env|package(-lock)?|tsconfig|eslint|prettier|\.gitignore|dockerfile|vitest|vite|next\.config)/) ||
        /\.(json|lock|map|svg|png|jpg|ico|woff2?|ttf|eot)$/.test(a.name)) {
      skipped.push(`${a.project}/${a.name} (non-tool)`);
      continue;
    }

    const title = a.name.replace(/\.[^.]+$/, '');
    const text = artifactText(a);
    const description = `Grounded in corpus artifact "${title}" (${a.project}, ${kind}). ${text.slice(0, 200)}`;
    const proposal: IntelProposal = {
      id: `prop_${hash.slice(0, 16)}`,
      source: 'corpus',
      title,
      description,
      domain,
      url: a.path,
      tags: [kind, a.project, 'corpus-refill'],
      rationale: `Automated refill from corpus artifact ${a.project}/${a.name} (${kind}) so the agenda is never void of grounded targets.`,
      score: 50,
      createdAt: Date.now(),
      status: 'new',
    };
    proposals.push(proposal);
    // Only substantive text is worth grounding a new tool in (a title alone
    // is not a specification).
    if (text.length >= GROUNDING_MIN_CHARS) {
      groundings.push({ hash, title, project: a.project, kind, domain, excerpt: text.slice(0, 1200) });
      result.groundingsCreated++;
    }
    seenHashes.add(hash);
    result.proposalsCreated++;
  }

  return { proposals, specs, groundings, result };
}
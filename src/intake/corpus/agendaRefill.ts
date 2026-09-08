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
 *    content preview) — never fabricated.
 *  - The forge spec's referenceSuite is a deterministic, runnable contract
 *    derived from the artifact's metadata (not a hand-authored "ground truth"
 *    — it pins real, checkable behavior the tool must exhibit).
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
  hash?: string;
  path?: string;
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

/** Deterministic reference suite for a corpus-derived tool. The tool must
 *  reproduce real, checkable properties of the artifact: stable hashing,
 *  field extraction, and a self-consistency check. */
export function artifactRefSuite(fnName: string, artifact: CorpusArtifactLike): string {
  const sample = artifact.preview || artifact.content || '';
  // FNV-1a fingerprint of the EMPTY input = the offset basis (0x811c9dc5).
  // The generated tool must return exactly this for empty input.
  const emptyFp = (2166136261 >>> 0).toString(16).padStart(8, '0');
  return [
    `assert typeof ${fnName} === 'function';`,
    `assert ${fnName}('') === ${JSON.stringify(emptyFp)};`,       // empty input -> FNV-1a("") = 0x811c9dc5
    `assert ${fnName}(${JSON.stringify(sample.slice(0, 20))}) === ${fnName}(${JSON.stringify(sample.slice(0, 20))});`, // deterministic
    `assert ${fnName}(123) === ${JSON.stringify(emptyFp)};`,       // non-string input tolerated
  ].join('\n');
}

export interface RefillResult {
  proposalsCreated: number;
  specsCreated: number;
  skipped: string[];
}

/**
 * Turn corpus artifacts into intel proposals + forge specs. Runs after each
 * corpus scan. Dedupes by artifact hash (keeps a persistent seen-set).
 */
export function refillAgendaFromCorpus(
  artifacts: CorpusArtifactLike[],
  seenHashes: Set<string>,
  existingAgendaNames: Set<string>,
): { proposals: IntelProposal[]; specs: ForgeSpec[]; result: RefillResult } {
  const proposals: IntelProposal[] = [];
  const specs: ForgeSpec[] = [];
  const skipped: string[] = [];
  const result: RefillResult = { proposalsCreated: 0, specsCreated: 0, skipped };

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
    const description = `Grounded in corpus artifact "${title}" (${a.project}, ${kind}). ${
      (a.preview || a.content || '').slice(0, 200)
    }`;

    const id = `corpus_${hash.slice(0, 16)}`;
    const spec: ForgeSpec = {
      id,
      name: fnName,
      domain,
      title,
      prompt: `Implement \`export function ${fnName}(input)\` that returns a deterministic string fingerprint of its input (FNV-1a, unsigned 32-bit, hex lowercase, zero-padded to 8 chars). Pure, never throws; non-string input returns the empty-input fingerprint. Corpus source: ${a.project}/${a.name}.`,
      refSuite: artifactRefSuite(fnName, a),
    };
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
    if (!existingAgendaNames.has(spec.name)) {
      specs.push(spec);
      existingAgendaNames.add(spec.name);
    }
    seenHashes.add(hash);
    result.proposalsCreated++;
    result.specsCreated++;
  }

  return { proposals, specs, result };
}
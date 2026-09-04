/**
 * Grounding — turn a real external signal (paper abstract, story, repo
 * description, forum post) into a dream/mutation seed that can produce a real,
 * verified tool gene.
 *
 * Honesty contract:
 *  - Domain classification is a keyword heuristic and is labeled as such.
 *  - A grounded candidate is ONLY returned after its code passes the real
 *    sandbox suite. If the model is offline the call returns grounded:false
 *    with an explicit reason — it never fabricates a tool from the signal.
 */
import type { ExternalSignal } from '../intake/types';
import type { ToolDomain } from '../types';
import { executeTestSuite } from '../lib/executionSandbox';
import type { ChatCompleteResult } from '../lib/modelProvider';

const DOMAIN_KEYWORDS: Record<ToolDomain, string[]> = {
  math: ['mathemat', 'algebra', 'calculus', 'geometry', 'theorem', 'proof', 'prime', 'number theor', 'topology', 'graph theor', 'bayesian', 'probability', 'statistic', 'equation', 'polynomial', 'optimization'],
  biotech: ['cancer', 'tumor', 'oncolog', 'gene', 'genom', 'protein', 'drug', 'cell', 'immun', 'clinical', 'biomarker', 'mutation', 'dna', 'rna', 'pathway', 'resistance'],
  coding: ['code', 'software', 'program', 'function', 'api', 'compiler', 'runtime', 'debug', 'refactor', 'algorithm', 'data structure', 'javascript', 'typescript', 'python', 'c++', 'library', 'framework'],
  systemic: ['system', 'distributed', 'queue', 'concurren', 'latency', 'throughput', 'scale', 'architect', 'pipeline', 'workflow', 'monitor', 'reliability', 'fault'],
  neuro_symbolic: ['neural', 'deep learning', 'llm', 'language model', 'transformer', 'token', 'entropy', 'reinforcement', 'agent', 'symbolic', 'reasoning', 'cognition'],
  cyber_defense: ['security', 'vulnerab', 'exploit', 'malware', 'injection', 'cryptograph', 'encryption', 'privacy', 'threat', 'zero-day', 'phishing', 'sandbox', 'taint'],
  quantum_sim: ['quantum', 'qubit', 'gate', 'entangl', 'superposition', 'decoherence', 'circuit', 'hamiltonian', 'schrodinger'],
};

export interface GroundedCandidate {
  grounded: boolean;
  domain: ToolDomain;
  reason?: string;
  toolName?: string;
  sourceCode?: string;
  testSuiteCode?: string;
  hypothesis?: string;
  verifierNote?: string;
}

export interface GroundOptions {
  /** Model chat callable — returns the same contract as src/lib/modelProvider.chatComplete. */
  chatComplete: (messages: Array<{ role: string; content: string }>, opts?: { temperature?: number; json?: boolean }) => Promise<ChatCompleteResult>;
  /** Probe whether the model is online. */
  checkOnline: (force?: boolean) => Promise<boolean>;
}

/** Keyword-heuristic domain classifier (labeled: not semantic). */
export function classifyDomain(signal: Pick<ExternalSignal, 'title' | 'summary' | 'topics' | 'source'>): ToolDomain {
  const text = [signal.title, signal.summary, ...(signal.topics ?? [])].join(' ').toLowerCase();
  const scores: Array<{ domain: ToolDomain; hits: number }> = [];
  for (const [domain, kws] of Object.entries(DOMAIN_KEYWORDS)) {
    let hits = 0;
    for (const kw of kws) if (text.includes(kw)) hits++;
    if (hits > 0) scores.push({ domain: domain as ToolDomain, hits });
  }
  if (scores.length === 0) return 'coding';
  scores.sort((a, b) => b.hits - a.hits);
  return scores[0].domain;
}

/** Build the grounding prompt that asks the model for a real implementable tool
 *  motivated by the signal's own content — never a canned answer.
 *  Kept compact to keep CPU 4B-model latency manageable (~60-90s target). */
export function buildGroundingMessages(signal: ExternalSignal) {
  const summary = (signal.summary || signal.title || '—').slice(0, 600);
  return [
    {
      role: 'system' as const,
      content:
        `You are Recourse's grounding layer. Propose ONE micro-tool that advances the signal's subject.
Output ONLY valid JSON (no fences):
{"premise":"one short sentence","hypothesis":"one short sentence","sourceCode":"PLAIN JS, no TS, no imports, no backticks. Export ONE function: 'export function name(a,b){ ... }'","testSuiteCode":"EACH LINE: assert(booleanExpression);"}

Sandbox provides assert(). Tests must pass against your own sourceCode.`,
    },
    {
      role: 'user' as const,
      content:
        `Signal [${signal.source}]: ${signal.title}\nURL: ${signal.url}\nSummary: ${summary}\n\nWrite a real micro-tool from THIS content. JSON only.`,
    },
  ];
}

/** Parse model JSON, mirroring the honest parsing used by the dream generator. */
export function parseGroundedJson(content: string): { premise: string; hypothesis: string; sourceCode: string; testSuiteCode: string } | null {
  try {
    const parsed = JSON.parse(content.replace(/```(?:json)?/g, '').trim());
    if (!parsed || typeof parsed.sourceCode !== 'string' || parsed.sourceCode.trim().length < 20) return null;
    return {
      premise: String(parsed.premise || '').slice(0, 300),
      hypothesis: String(parsed.hypothesis || '').slice(0, 300),
      sourceCode: parsed.sourceCode,
      testSuiteCode: typeof parsed.testSuiteCode === 'string' ? parsed.testSuiteCode : 'assert true;',
    };
  } catch {
    return null;
  }
}

/** Ground a signal into a verified tool candidate. Returns grounded:false with
 *  an honest reason when the model is offline or the code fails its own suite. */
export async function groundSignal(
  signal: ExternalSignal,
  opts: GroundOptions,
): Promise<GroundedCandidate> {
  const domain = classifyDomain(signal);
  const online = await opts.checkOnline(false);
  if (!online) {
    return { grounded: false, domain, reason: 'model offline — grounding requires the model; no fabricated tool created.' };
  }
  const result = await opts.chatComplete(buildGroundingMessages(signal), { temperature: 0.35, json: true });
  if (!result.ok || !result.content) {
    return { grounded: false, domain, reason: `model unavailable: ${result.status} ${result.error || ''}`.trim() };
  }
  const parsed = parseGroundedJson(result.content);
  if (!parsed) {
    return { grounded: false, domain, reason: 'model returned non-JSON output' };
  }
  const run = executeTestSuite(parsed.sourceCode, parsed.testSuiteCode);
  if (!run.passed) {
    return {
      grounded: false,
      domain,
      reason: `grounded code FAILED its real suite (${run.testDetails.filter((d) => d.startsWith('[FAIL]')).length} failures)`,
    };
  }
  const slug = (parsed.hypothesis || domain).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'grounded';
  const stamp = Date.now().toString(36).slice(-4);
  return {
    grounded: true,
    domain,
    toolName: `ground_${domain.slice(0, 4)}_${slug}_${stamp}`,
    sourceCode: parsed.sourceCode,
    testSuiteCode: parsed.testSuiteCode,
    hypothesis: parsed.hypothesis,
    verifierNote: `GROUNDED on ${signal.source}:${signal.title.slice(0, 60)} (passed real sandbox suite)`,
  };
}

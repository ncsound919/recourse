// v5/deciders.ts — Decision layer: LocalJEV + Dev-Brain inside the no-LLM pipeline.
//
// Both are UNTRUSTED PROPOSERS, exactly like the LLM. The kernel disposes.
// What they buy is versatility, not authority:
//
//   LocalJEV   — answers interrogation questions with a typed decision instead
//                of prose. Non-generative, local, no API cost. This is what
//                lets the pipeline finish tasks the LLM could not settle.
//   Dev-Brain  — triages the task and recommends a SYNTHESIS STRATEGY
//                (depth, question budget, whether to widen the grammar, or
//                escalate to a human).
//
// The accuracy mechanism is ENSEMBLE DISAGREEMENT, not any single oracle:
// when two independent sources answer the same question differently, the
// kernel does not pick a winner — it escalates. A single source that is
// wrong is caught by the exhaustive scope; two sources that disagree is a
// signal that the task itself is under-specified.

import { decideSystemOne, type SystemOneInput } from '../jevClient';

// ==========================================
// Interfaces (injected so this is testable offline)
// ==========================================

export interface Question {
  input: number[];
  /** Distinct outputs across the surviving candidates. */
  options: string[];
}

export interface Decider {
  name: string;
  /** Returns the chosen option, or null when it cannot answer. */
  answer(q: Question, context: DeciderContext): Promise<string | null>;
}

export interface DeciderContext {
  intent: string;
  examples: Array<{ input: number[]; output: number[] }>;
  /** Programs still in play, for context. */
  candidates: string[];
}

export type Strategy = 'shallow' | 'deep' | 'widen' | 'escalate';

export interface StrategyAdvice {
  strategy: Strategy;
  maxDepth: number;
  maxQuestions: number;
  source: string;
  rationale?: string;
}

export interface StrategyAdvisor {
  name: string;
  advise(ctx: StrategyContext): Promise<StrategyAdvice | null>;
}

export interface StrategyContext {
  intent: string;
  examples: Array<{ input: number[]; output: number[] }>;
  /** Classes the kernel sees initially. */
  classes: number;
  /** Whether a proposal was offered and survived so far. */
  hasProposal: boolean;
}

// ==========================================
// LocalJEV oracle
// ==========================================

/**
 * LocalJEV answers an interrogation question with a TYPED choice.
 *
 * The question is rebuilt in plain terms: "for this input, which of these
 * outputs is right, given the intent?" JEV returns the key it chose; we map
 * that back to the exact output string the kernel offered.
 *
 * JEV never writes code — it only picks between kernel-generated options,
 * so a hallucination cannot express a program that is not already in the
 * candidate set.
 */
export class JevDecider implements Decider {
  name = 'localjev';
  /**
   * Hard wall-clock bound on one decision. The underlying client may retry
   * across tiers, so its own timeout can be exceeded; a decider that hangs
   * must degrade to an abstention rather than stall the whole pipeline.
   */
  private timeoutMs: number;

  constructor(timeoutMs = 4000) {
    this.timeoutMs = timeoutMs;
  }

  async answer(q: Question, ctx: DeciderContext): Promise<string | null> {
    if (q.options.length < 2) return null;

    // Build criteria keyed by the exact option strings, so the mapping back
    // is lossless.
    const criteria: Record<string, unknown> = {};
    for (const opt of q.options) {
      criteria[opt] = `the output is exactly ${opt}`;
    }

    const input: SystemOneInput = {
      state: {
        intent: ctx.intent,
        question: `For the input ${JSON.stringify(q.input)}, which output is correct?`,
        input: q.input,
        options: q.options,
        knownExamples: ctx.examples,
      },
      questions: {
        output: {
          type: 'choice',
          instructions: `A list transform with this intent is applied: ${ctx.intent}. Given the input ${JSON.stringify(q.input)}, choose the correct output. The known examples are ${JSON.stringify(ctx.examples)}.`,
          criteria,
        },
      },
    };

    let res;
    try {
      // Race the client against our own bound so a hung tier cannot block.
      res = await Promise.race([
        decideSystemOne(input),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), this.timeoutMs)),
      ]);
    } catch {
      return null;
    }

    if (!res || !res.ok || !res.answers?.output) return null;
    const answer = res.answers.output as { type: string; choice?: string };
    if (answer.type !== 'choice' || typeof answer.choice !== 'string') return null;

    // Only accept an answer that is one of the options we actually offered.
    if (!q.options.includes(answer.choice)) return null;
    return answer.choice;
  }
}

// ==========================================
// Dev-Brain strategy advisor
// ==========================================

const DEV_BRAIN_URL_DEFAULT = 'http://127.0.0.1:8722';

/**
 * Dev-Brain triages a task and recommends a synthesis strategy.
 *
 * Choices are deterministic labels the kernel already understands:
 *   shallow  — few candidates, 1-2 questions (fast path for a clear task)
 *   deep     — full depth, generous question budget
 *   widen    — the grammar looks too small; escalate for a new primitive
 *   escalate — genuinely under-specified; hand to a human
 *
 * Dev-Brain cannot make the kernel accept anything. Its only power is to
 * choose how hard to look and when to give up — both recorded in the report.
 */
export class DevBrainAdvisor implements StrategyAdvisor {
  name = 'devbrain';
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl = DEV_BRAIN_URL_DEFAULT, timeoutMs = 8000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  async advise(ctx: StrategyContext): Promise<StrategyAdvice | null> {
    const problem =
      `Synthesize a verified list transform. Intent: "${ctx.intent}". ` +
      `${ctx.examples.length} example(s) given; ${ctx.classes} behavior class(es) survive; ` +
      `${ctx.hasProposal ? 'a proposal is available' : 'no proposal available'}. ` +
      `Choose the search strategy.`;

    const candidates = [
      { name: 'shallow', description: 'task looks clear; depth 2, up to 3 questions' },
      { name: 'deep', description: 'ambiguous; depth 4, up to 12 questions' },
      { name: 'widen', description: 'no in-grammar program fits; needs a new primitive' },
      { name: 'escalate', description: 'under-specified; a human must decide' },
    ];

    let body: any;
    try {
      const res = await fetch(`${this.baseUrl}/api/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, candidates }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      body = await res.json();
    } catch {
      return null;
    }

    const chosen = extractChoice(body);
    if (!chosen) return null;
    return fromStrategy(chosen, this.name, body?.rationale ?? body?.reason);
  }
}

/** Dev-Brain's response shape is not guaranteed; accept the common spellings. */
function extractChoice(body: any): string | null {
  if (!body || typeof body !== 'object') return null;
  for (const key of ['chosen', 'decision', 'pick', 'winner', 'selected', 'action', 'strategy']) {
    const v = body[key];
    if (typeof v === 'string') return v.toLowerCase();
    if (v && typeof v === 'object' && typeof v.name === 'string') return v.name.toLowerCase();
  }
  // Nested result shape.
  const nested = body.result ?? body.data ?? body.decision;
  if (nested && typeof nested === 'object') return extractChoice(nested);
  return null;
}

function fromStrategy(name: string, source: string, rationale?: unknown): StrategyAdvice {
  const s = (name as Strategy);
  switch (s) {
    case 'shallow':
      return { strategy: 'shallow', maxDepth: 2, maxQuestions: 3, source, rationale: str(rationale) };
    case 'deep':
      return { strategy: 'deep', maxDepth: 4, maxQuestions: 12, source, rationale: str(rationale) };
    case 'widen':
      return { strategy: 'widen', maxDepth: 4, maxQuestions: 12, source, rationale: str(rationale) };
    case 'escalate':
    default:
      return { strategy: 'escalate', maxDepth: 3, maxQuestions: 10, source, rationale: str(rationale) };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

// ==========================================
// Decision chain
// ==========================================

export interface ChainOutcome {
  answer: string | null;
  /** Which tier produced the answer. */
  source: string;
  /** Sources that disagreed — a signal the task is under-specified. */
  disagreement: string[];
  /** Sources whose answer was discarded because it was not an offered option. */
  rejected: string[];
}

export interface ChainContext extends DeciderContext {
  /** The proposal's answer for this question, if the LLM offered one. */
  proposalAnswer?: string | null;
}

/**
 * Ask every available source, then reconcile.
 *
 * Priority: a usable proposal wins, because it is grounded in the task's own
 * examples. JEV is consulted for corroboration — if it agrees, we have two
 * independent sources; if it disagrees, that is recorded and escalated.
 *
 * No source at all -> null -> the kernel records a gap and refuses.
 */
export async function consultChain(
  q: Question,
  ctx: ChainContext,
  deciders: Decider[]
): Promise<ChainOutcome> {
  const allowed = new Set(q.options);
  const answers: Array<{ source: string; answer: string }> = [];
  const rejected: string[] = [];

  // Every answer — from the proposal AND from each decider — must be one of
  // the options the kernel actually offered. A source that returns anything
  // else is discarded, so no oracle can smuggle in a value the kernel never
  // considered. This is the single most important line in the file.
  if (ctx.proposalAnswer) {
    if (allowed.has(ctx.proposalAnswer)) {
      answers.push({ source: 'proposal', answer: ctx.proposalAnswer });
    } else {
      rejected.push('proposal');
    }
  }

  for (const d of deciders) {
    const a = await d.answer(q, ctx);
    if (a === null) continue;
    if (allowed.has(a)) answers.push({ source: d.name, answer: a });
    else rejected.push(d.name);
  }

  if (answers.length === 0) {
    return { answer: null, source: 'none', disagreement: [], rejected };
  }

  const distinct = new Set(answers.map((a) => a.answer));
  if (distinct.size === 1) {
    return {
      answer: answers[0].answer,
      source: answers.map((a) => a.source).join('+'),
      disagreement: [],
      rejected,
    };
  }

  // Disagreement: do NOT pick a winner. Prefer the proposal if it is present
  // (it is grounded in the task's examples) but flag it so the certificate
  // records that the task is contested.
  const proposal = answers.find((a) => a.source === 'proposal');
  const chosen = proposal ? proposal.answer : answers[0].answer;
  const dissenting = answers.filter((a) => a.answer !== chosen).map((a) => a.source);
  return { answer: chosen, source: answers.map((a) => a.source).join('+'), disagreement: dissenting, rejected };
}

// ==========================================
// Intent-property decider (model-free)
// ==========================================

/**
 * A predicate the intent's own words commit to, testable against a candidate
 * output without any model.
 */
export type IntentPredicate = (input: number[], output: number[]) => boolean;

const isSorted = (xs: number[]): boolean => xs.every((v, i) => i === 0 || xs[i - 1] <= v);
const isDescending = (xs: number[]): boolean => xs.every((v, i) => i === 0 || xs[i - 1] >= v);
const noDuplicates = (xs: number[]): boolean => new Set(xs).size === xs.length;
const isReversalOf = (input: number[], output: number[]): boolean =>
  input.length === output.length && input.every((v, i) => v === output[input.length - 1 - i]);
const isAllPositive = (xs: number[]): boolean => xs.every((v) => v > 0);
const isAllNegative = (xs: number[]): boolean => xs.every((v) => v < 0);
const isIncrementOf = (input: number[], output: number[]): boolean =>
  input.length === output.length && input.every((v, i) => output[i] === v + 1);
const isSameMultiset = (input: number[], output: number[]): boolean => {
  const a = [...input].sort((x, y) => x - y).join(',');
  const b = [...output].sort((x, y) => x - y).join(',');
  return a === b;
};

/**
 * Predicates implied by the intent text, with the phrases that imply each.
 *
 * Every predicate has the (input, output) shape and judges the OUTPUT, which
 * is what the candidate is being scored on. Unary checks are lifted so they
 * cannot accidentally be applied to the input.
 *
 * Deliberately small and explicit: an unmatched intent yields NO predicates,
 * which makes this decider abstain rather than guess.
 */
const INTENT_RULES: Array<{ re: RegExp; pred: IntentPredicate; label: string }> = [
  { re: /\b(ascending|increasing|sorted|in order|smallest first)\b/i, pred: (_i, out) => isSorted(out), label: 'sorted' },
  { re: /\b(descending|decreasing|reverse order|descending order|largest first)\b/i, pred: (_i, out) => isDescending(out), label: 'descending' },
  { re: /\b(remove duplicates?|dedupe|deduplicate|unique|distinct|no repeats?)\b/i, pred: (_i, out) => noDuplicates(out), label: 'no-duplicates' },
  { re: /\b(reverse|reversed|backwards|mirrored)\b/i, pred: (inp, out) => isReversalOf(inp, out), label: 'reversed' },
  { re: /\b(increment|add (?:1|one)|plus one|increase by 1)\b/i, pred: (inp, out) => isIncrementOf(inp, out), label: 'increment' },
  { re: /\b(keep only positive|positive (?:elements|numbers|values) only|greater than zero)\b/i, pred: (_i, out) => isAllPositive(out), label: 'all-positive' },
  { re: /\b(keep only negative|negative (?:elements|numbers|values) only|less than zero)\b/i, pred: (_i, out) => isAllNegative(out), label: 'all-negative' },
  { re: /\b(keep (?:all|every)|contains all|no elements? lost|preserve elements?)\b/i, pred: (inp, out) => isSameMultiset(inp, out), label: 'same-elements' },
];

/** Which predicates does this intent commit to? */
export function predicatesForIntent(intent: string): Array<{ pred: IntentPredicate; label: string }> {
  return INTENT_RULES.filter((r) => r.re.test(intent)).map((r) => ({ pred: r.pred, label: r.label }));
}

/**
 * Resolve an interrogation question by checking the intent's own words
 * against each candidate output. No model, no API, fully deterministic.
 *
 * This is the decider that actually works for list transforms. A preference
 * model ranks plausibility; this checks semantics — and it abstains whenever
 * the intent names no checkable property, or the options tie.
 */
export class IntentPropertyDecider implements Decider {
  name = 'intent-properties';

  async answer(q: Question, ctx: DeciderContext): Promise<string | null> {
    const rules = predicatesForIntent(ctx.intent);
    if (rules.length === 0) return null; // nothing checkable -> abstain
    if (q.options.length < 2) return null;

    // Score each option by how many intent predicates its output satisfies.
    let best: { opt: string; satisfied: number } | null = null;
    let ties = 0;

    for (const opt of q.options) {
      let output: number[];
      try {
        output = JSON.parse(opt);
      } catch {
        continue;
      }
      if (!Array.isArray(output) || output.some((v) => typeof v !== 'number')) continue;

      let satisfied = 0;
      for (const { pred } of rules) {
        try {
          if (pred(q.input, output)) satisfied++;
        } catch {
          // A predicate that cannot be evaluated for this shape is not counted.
        }
      }

      if (!best || satisfied > best.satisfied) {
        best = { opt, satisfied };
        ties = 1;
      } else if (satisfied === best.satisfied) {
        ties++;
      }
    }

    // No parseable option -> abstain.
    if (!best) return null;

    // A genuine tie: every option satisfies the intent equally. Before giving
    // up, apply the one default a human would assume — unless the intent
    // mentions filtering (which legitimately changes the multiset).
    if (ties > 1 && best.satisfied > 0) {
      const filters = /keep only|filter|positive|negative|greater than zero|less than zero/i.test(ctx.intent);
      if (!filters) {
        let bestKeep: { opt: string; keeps: boolean } | null = null;
        let keepTies = 0;
        for (const opt of q.options) {
          let output: number[];
          try { output = JSON.parse(opt); } catch { continue; }
          if (!Array.isArray(output)) continue;
          const keeps = isSameMultiset(q.input, output);
          if (!bestKeep || (keeps && !bestKeep.keeps)) {
            bestKeep = { opt, keeps };
            keepTies = 1;
          } else if (keeps === bestKeep.keeps) {
            keepTies++;
          }
        }
        if (bestKeep && bestKeep.keeps && keepTies === 1) return bestKeep.opt;
      }
    }

    if (best.satisfied === 0 || ties > 1) return null;
    return best.opt;
  }
}

// ==========================================
// Local fallback so the pipeline never hard-stops
// ==========================================

/** A decider that always abstains — used when nothing is available. */
export class NullDecider implements Decider {
  name = 'none';
  async answer(): Promise<string | null> {
    return null;
  }
}

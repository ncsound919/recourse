// v5/planner.ts — Goal → plan → deterministic pipeline → certificates.
//
// This is the "LLM initiates, system takes over" handoff. The LLM produces a
// plan (tasks + grounding examples + a candidate program). From that point on
// every decision is the kernel's:
//
//   1. Validate the LLM's examples for self-consistency
//   2. Enumerate the whole hypothesis space (exhaustive, not LLM-guided)
//   3. Group candidates by behavior over the exhaustive scope
//   4. Compare the LLM's proposal against the kernel's own answer
//   5. Interrogate only if the kernel is still ambiguous
//   6. Emit a certificate recording the proposal AND the kernel's verdict
//
// The proposal never reduces kernel work. A wrong proposal costs tokens, never
// correctness — which is what makes it safe to let an LLM drive the intake.

import {
  LIST_GRAMMAR,
  DEFAULT_SCOPE,
  enumeratePrograms,
  consistentPrograms,
  groupByBehavior,
  bestSplitInput,
  runProgram,
  randomLongLists,
  type Example,
  type Program,
} from './enumerate';
import {
  runOracleLoop,
  buildCertificate,
  AnswerLog,
  type Certificate,
  type OracleStatus,
} from './oracleRun';
import { proposePlan, proposeProgram, isWellFormedTerm, type LLMChat, type Plan, type PlanTask } from './intake';
import { termToModule, examplesToTestSuite } from './codegen';
import {
  consultChain,
  JevDecider,
  DevBrainAdvisor,
  NullDecider,
  type Decider,
  type StrategyAdvice,
} from './deciders';

// ==========================================
// Disposal report
// ==========================================

/** What the kernel did with the LLM's proposal. */
export type ProposalVerdict =
  | 'agreed-proved'       // examples uniquely determine it AND it matches
  | 'accepted-on-proposal' // consistent, but uniqueness not proved — weaker tier
  | 'accepted-on-decider'  // a local decision model supplied the disambiguation
  | 'proved-independently'// kernel converged with nobody's help — strongest
  | 'corrected'           // proposal contradicted its own examples
  | 'not-consistent'      // proposal not in the grammar, or inconsistent
  | 'malformed'           // proposal was not a term in the grammar
  | 'not-offered'         // the LLM gave no proposal
  | 'refused';            // nothing in the grammar fits

export interface Disposal {
  taskId: string;
  intent: string;
  verdict: ProposalVerdict;
  /** The kernel's final program (undefined when refused). */
  program?: string;
  llmProgram?: string;
  questionsAsked: number;
  /** Behavior classes surviving before interrogation. */
  classesBefore: number;
  certificate?: Certificate;
  /** Which decision sources answered, and which disagreed. */
  answerSources?: string;
  disagreements?: string[];
  /** Sources whose answer was discarded for not being an offered option. */
  rejectedSources?: string[];
  /** The strategy Dev-Brain recommended, if it was reachable. */
  strategy?: string;
  error?: string;
}

export interface PlanReport {
  goal: string;
  fromLLM: boolean;
  engine?: string;
  tasks: Disposal[];
  summary: {
    total: number;
    agreed: number;
    corrected: number;
    refused: number;
    /** Share of offered proposals the kernel confirmed. */
    agreementRate: number;
    /** Share the kernel had to overrule. */
    correctionRate: number;
    avgQuestions: number;
  };
  notes?: string;
}

export interface PlannerConfig {
  chat: LLMChat;
  maxDepth?: number;
  maxQuestions?: number;
  scope?: number[][];
  /** When true, never accept a consistent-but-unique-by-luck proposal without
   *  proving uniqueness on the scope. Default true (kernel disposes fully). */
  requireUnique?: boolean;
  /** Local decision oracles (LocalJEV by default). */
  deciders?: Decider[];
  /** Strategy advisor (Dev-Brain by default; pass [] to disable). */
  advisor?: DevBrainAdvisor | null;
}

// ==========================================
// The handoff
// ==========================================

/**
 * Run a goal end to end: the LLM proposes, the kernel disposes.
 */
export async function runGoal(
  goal: string,
  config: PlannerConfig
): Promise<PlanReport> {
  const plan = await proposePlan(goal, config.chat);

  // Operator-supplied tasks bypass the LLM entirely (offline / human path).
  const tasks = plan.tasks.length > 0 ? plan.tasks : [];

  if (plan.fromLLM && tasks.length === 0) {
    return emptyReport(goal, plan, plan.notes ?? 'LLM produced no usable tasks');
  }
  if (!plan.fromLLM) {
    return emptyReport(goal, plan, plan.notes ?? 'LLM unavailable — kernel had no grounding examples');
  }

  const disposals: Disposal[] = [];
  for (const task of tasks) {
    disposals.push(await disposeTask(task, config));
  }

  return summarise(goal, plan, disposals);
}

/** Empty-but-honest report: no tasks means nothing was verified. */
function emptyReport(goal: string, plan: Plan, notes: string): PlanReport {
  return {
    goal,
    fromLLM: plan.fromLLM,
    engine: plan.engine,
    tasks: [],
    summary: {
      total: 0, agreed: 0, corrected: 0, refused: 0,
      agreementRate: 0, correctionRate: 0, avgQuestions: 0,
    },
    notes,
  };
}

// ==========================================
// Disposal of one task
// ==========================================

async function disposeTask(task: PlanTask, config: PlannerConfig): Promise<Disposal> {
  const maxDepth = config.maxDepth ?? 3;
  const maxQuestions = config.maxQuestions ?? 10;
  const scope = config.scope ?? DEFAULT_SCOPE;

  // 0. The plan must have grounding examples. Without them there is nothing
  //    to verify against — refuse rather than pretend.
  if (task.examples.length === 0) {
    return {
      taskId: task.id, intent: task.intent, verdict: 'refused',
      questionsAsked: 0, classesBefore: 0,
      error: 'No grounding examples — the kernel cannot verify a transform with nothing to check it against',
    };
  }

  // 1. Reject self-contradictory examples before doing anything else.
  const contradictions = findContradictions(task.examples);
  if (contradictions.length > 0) {
    return {
      taskId: task.id, intent: task.intent,
      verdict: 'refused',
      llmProgram: task.program,
      questionsAsked: 0, classesBefore: 0,
      error: `Plan's own examples contradict themselves at input ${JSON.stringify(contradictions[0].input)}`,
    };
  }

  // 2. Take the proposal, discarding anything outside the grammar. This is
  //    validation, not trust — it decides only whether the term is *usable*.
  let llmProgram = task.program;
  if (llmProgram && !isWellFormedTerm(llmProgram)) {
    llmProgram = undefined; // out of grammar — discarded, not trusted
  }

  // 3. A second attempt when the LLM offered nothing usable. This is still an
  //    LLM call, still untrusted — the kernel checks it the same way.
  if (!llmProgram) {
    const retry = await proposeProgram(task.intent, task.examples, config.chat);
    if (retry.program && isWellFormedTerm(retry.program) && matchesExamples(retry.program, task.examples)) {
      llmProgram = retry.program;
    }
  }

  // 4. Strategy triage. Dev-Brain picks HOW HARD to look before we look at all.
  const deciders = config.deciders ?? [new JevDecider()];
  const advisor = config.advisor === undefined ? new DevBrainAdvisor() : config.advisor;

  let advice: StrategyAdvice | null = null;
  try {
    advice = (await advisor?.advise({
      intent: task.intent,
      examples: task.examples,
      classes: countClasses(task.examples, maxDepth),
      hasProposal: Boolean(llmProgram),
    })) ?? null;
  } catch {
    advice = null;
  }

  // Dev-Brain can only widen the budget, never shrink below the floor, and
  // never authorize accepting something the kernel has not proven.
  const effectiveDepth = Math.max(maxDepth, advice?.maxDepth ?? 0);
  const effectiveQuestions = Math.max(maxQuestions, advice?.maxQuestions ?? 0);

  // 5. Hand off to the kernel. It enumerates exhaustively regardless of what
  //    the LLM said, and may interrogate if the space is still ambiguous.
  //
  //    The DECISION CHAIN answers interrogation questions: the LLM's proposal
  //    first (it is grounded in the task's own examples), then LocalJEV. When
  //    two sources disagree we do NOT pick a winner — the disagreement is
  //    recorded on the disposal and surfaced in the report.
  const proposalUsable = Boolean(llmProgram) && matchesExamples(llmProgram!, task.examples);
  const uniqueBeforeQuestions = countClasses(task.examples, effectiveDepth) === 1;

  const sourcesSeen = new Set<string>();
  const disagreements = new Set<string>();
  const rejectedSources = new Set<string>();
  let decidersAnswered = 0;
  let questionsAnswered = 0;

  const askUser = async (q: { input: number[]; options: string[] }): Promise<string> => {
    const proposalAnswer = proposalUsable && llmProgram
      ? (() => {
          const out = runProgram(LIST_GRAMMAR, llmProgram, q.input);
          return out === null ? null : JSON.stringify(out);
        })()
      : null;

    const outcome = await consultChain(q, {
      intent: task.intent,
      examples: task.examples,
      candidates: task.examples.map(() => ''), // programs are not exposed to deciders
      proposalAnswer,
    }, deciders);

    for (const s of outcome.source.split('+')) sourcesSeen.add(s);
    for (const d of outcome.disagreement) disagreements.add(d);
    for (const r of outcome.rejected) rejectedSources.add(r);

    if (!outcome.answer) return 'none';
    questionsAnswered++;
    // Count how many answers came from something other than the LLM proposal.
    const fromDecider = outcome.source.split('+').filter((s) => s !== 'proposal' && s !== 'none');
    if (fromDecider.length > 0) decidersAnswered++;
    return outcome.answer;
  };

  const result = await runOracleLoop({
    taskId: task.id,
    examples: task.examples,
    maxDepth: effectiveDepth,
    maxQuestions: effectiveQuestions,
    scope,
    askUser,
  });

  // 5. Reconcile the kernel's answer with the proposal.
  const kernelProgram = result.code;
  let finalVerdict: ProposalVerdict;

  if (result.status !== 'converged' || !kernelProgram) {
    finalVerdict = 'refused';
  } else if (!proposalUsable || !llmProgram) {
    // No usable proposal. Did a local decider supply the disambiguation?
    // If so the kernel did NOT prove this alone, and must not claim it did.
    finalVerdict = decidersAnswered > 0 ? 'accepted-on-decider' : 'proved-independently';
  } else if (behaviorallyEqual(llmProgram, kernelProgram, scope)) {
    // The proposal survived. How strong a claim can we make?
    finalVerdict = uniqueBeforeQuestions ? 'agreed-proved' : 'accepted-on-proposal';
  } else {
    // Looked fine on the plan's own examples, but the kernel proved it is not
    // the program those examples imply.
    finalVerdict = 'not-consistent';
  }

  return {
    taskId: task.id,
    intent: task.intent,
    verdict: finalVerdict,
    program: kernelProgram,
    llmProgram,
    questionsAsked: result.answerLog.length,
    classesBefore: countClasses(task.examples, effectiveDepth),
    certificate: result.certificate,
    answerSources: Array.from(sourcesSeen).join('+') || 'none',
    disagreements: Array.from(disagreements),
    rejectedSources: Array.from(rejectedSources),
    strategy: advice?.strategy,
    error: result.error,
  };
}

// ==========================================
// Helpers
// ==========================================

function matchesExamples(program: string, examples: Example[]): boolean {
  for (const ex of examples) {
    const out = runProgram(LIST_GRAMMAR, program, ex.input);
    if (out === null) return false;
    if (JSON.stringify(out) !== JSON.stringify(ex.output)) return false;
  }
  return true;
}

/** Same input must not map to two different outputs. */
function findContradictions(examples: Example[]): Example[] {
  const seen = new Map<string, string>();
  const bad: Example[] = [];
  for (const ex of examples) {
    const k = JSON.stringify(ex.input);
    const v = JSON.stringify(ex.output);
    if (seen.has(k) && seen.get(k) !== v) bad.push(ex);
    else seen.set(k, v);
  }
  return bad;
}

function behaviorallyEqual(a: string, b: string, scope: number[][]): boolean {
  if (a === b) return true;
  for (const input of [...scope, ...randomLongLists(100, 7, [0, 1, 2, 3, 4, 5])]) {
    const oa = runProgram(LIST_GRAMMAR, a, input);
    const ob = runProgram(LIST_GRAMMAR, b, input);
    if (oa === null || ob === null) continue;
    if (JSON.stringify(oa) !== JSON.stringify(ob)) return false;
  }
  return true;
}

function countClasses(examples: Example[], maxDepth: number): number {
  const programs = enumeratePrograms(LIST_GRAMMAR, maxDepth);
  const consistent = consistentPrograms(LIST_GRAMMAR, programs, examples);
  return groupByBehavior(LIST_GRAMMAR, consistent, DEFAULT_SCOPE).size;
}

function summarise(goal: string, plan: Plan, disposals: Disposal[]): PlanReport {
  const offered = disposals.filter((d) => d.llmProgram);
  // "agreed" covers both strong and weak tiers — the proposal survived.
  const agreed = disposals.filter(
    (d) => d.verdict === 'agreed-proved' || d.verdict === 'accepted-on-proposal'
  ).length;
  const proved = disposals.filter((d) => d.verdict === 'agreed-proved').length;
  const corrected = disposals.filter(
    (d) => d.verdict === 'corrected' || d.verdict === 'not-consistent'
  ).length;
  const refused = disposals.filter((d) => d.verdict === 'refused').length;
  const totalQuestions = disposals.reduce((s, d) => s + d.questionsAsked, 0);

  return {
    goal,
    fromLLM: plan.fromLLM,
    engine: plan.engine,
    tasks: disposals,
    summary: {
      total: disposals.length,
      agreed,
      corrected,
      refused,
      agreementRate: offered.length > 0 ? agreed / offered.length : 0,
      correctionRate: offered.length > 0 ? corrected / offered.length : 0,
      avgQuestions: disposals.length > 0 ? totalQuestions / disposals.length : 0,
    },
    notes: `proved ${proved}/${disposals.length}; the rest were accepted on the proposal without a uniqueness proof`,
  };
}

// ==========================================
// Codegen passthrough (so callers can emit real modules)
// ==========================================

export function emitModule(program: string, name: string, examples: Example[]): {
  sourceCode: string;
  testSuiteCode: string;
} {
  return {
    sourceCode: termToModule(program, name),
    testSuiteCode: examplesToTestSuite(program, name, examples),
  };
}

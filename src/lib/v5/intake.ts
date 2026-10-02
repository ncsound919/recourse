// v5/intake.ts — LLM intake: the ONE place an LLM touches the pipeline.
//
// The LLM is an untrusted proposer. It emits a plan (tasks + examples + a
// candidate program). The kernel then does everything: it enumerates the
// hypothesis space, decides whether the proposal was right, corrects it, or
// throws it away, and emits the certificate.
//
// The critical property: **the proposal never reduces the kernel's work.**
// The kernel always enumerates. A proposal is only ever compared against the
// kernel's own result after the fact, so a wrong or malicious proposal costs
// nothing but a wasted token. If the LLM is offline, the pipeline still runs —
// it simply has no hypothesis to compare against.
//
// Purely: no side effects here. The disposal lives in `planner.ts`.

import { LIST_GRAMMAR, runProgram, enumeratePrograms, type Example } from './enumerate';

// ==========================================
// Injectable LLM
// ==========================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  status: 'online' | 'offline' | 'error';
  text: string;
  engine?: string;
}

/** Injected so the pipeline is testable with no LLM present. */
export type LLMChat = (messages: ChatMessage[]) => Promise<ChatResult>;

// ==========================================
// Plan shape
// ==========================================

export interface PlanTask {
  id: string;
  intent: string;
  examples: Example[];
  /** The LLM's candidate program. Absent or invalid when it guessed wrong. */
  program?: string;
  /** Whether the term parsed and is in the grammar. */
  programWellFormed: boolean;
  /** Raw LLM output, kept for the audit trail. */
  raw?: string;
}

export interface Plan {
  goal: string;
  tasks: PlanTask[];
  /** False when the LLM was offline — the kernel then plans nothing. */
  fromLLM: boolean;
  engine?: string;
  notes?: string;
}

// ==========================================
// Grammar description (for the prompt)
// ==========================================

function describeGrammar(): string {
  const ops = Object.keys(LIST_GRAMMAR.unary);
  const bodies = ops.map((op) => {
    switch (op) {
      case 'rev': return 'reverse the list';
      case 'sortf': return 'sort ascending';
      case 'dedupef': return 'remove duplicates, keep first occurrences';
      case 'inc': return 'add 1 to every element';
      case 'pos': return 'keep only elements > 0';
      case 'neg': return 'keep only elements < 0';
      default: return op;
    }
  });
  return `- x            (the input list)\n- nil          (the empty list)\n- ${ops.map((op, i) => `(${op} E)  ${bodies[i]}`).join('\n- ')}`;
}

// ==========================================
// Task proposal
// ==========================================

const PLAN_SYSTEM = `You are a program-specification proposer for a verified synthesizer.

You are given a goal. Propose 1-3 small, concrete tasks that together satisfy it.
Each task is a pure transform on a list of integers.

You MUST reply with JSON only. No prose, no markdown fences.

Schema:
{
  "tasks": [
    {
      "intent": "one line describing the transform",
      "program": "(sortf x)",
      "examples": [ { "input": [3,1,2], "output": [1,2,3] } ]
    }
  ]
}

Rules:
- "program" must be a term built ONLY from the grammar below.
- "examples" must be 2 or 3 input/output pairs. Compute the outputs yourself,
  applying your proposed program to each input. They must be consistent.
- Prefer 3 examples; they help the synthesizer verify your guess.

Grammar (E is any term):
${describeGrammar()}`;

const TASK_SYSTEM = `You are a program-specification proposer for a verified synthesizer.

Given an intent and some input/output examples, propose the single program that
best explains them.

You MUST reply with JSON only. No prose, no markdown fences.

Schema: { "program": "(sortf x)" }

Grammar (E is any term):
${describeGrammar()}`;

/**
 * Ask the LLM for a plan. Returns a plan with `fromLLM: false` when offline —
 * the kernel then proceeds with an empty task list.
 */
export async function proposePlan(goal: string, chat: LLMChat): Promise<Plan> {
  const res = await chat([
    { role: 'system', content: PLAN_SYSTEM },
    { role: 'user', content: `Goal: ${goal}` },
  ]);

  if (res.status !== 'online') {
    return { goal, tasks: [], fromLLM: false, notes: `LLM unavailable (${res.status})` };
  }

  const parsed = parsePlanJson(res.text);
  if (!parsed) {
    return {
      goal, tasks: [], fromLLM: true, engine: res.engine,
      notes: 'LLM reply was not parseable as a plan JSON — kernel plans nothing',
    };
  }

  const tasks: PlanTask[] = parsed.tasks.map((t, i) => normalizeTask(t, i));
  return { goal, tasks, fromLLM: true, engine: res.engine };
}

/** Ask the LLM for a program for one task (used when a task has no program). */
export async function proposeProgram(
  intent: string,
  examples: Example[],
  chat: LLMChat
): Promise<{ program?: string; wellFormed: boolean; raw?: string; engine?: string }> {
  const res = await chat([
    { role: 'system', content: TASK_SYSTEM },
    {
      role: 'user',
      content:
        `Intent: ${intent}\n` +
        `Examples:\n${examples.map((e) => `  ${JSON.stringify(e.input)} -> ${JSON.stringify(e.output)}`).join('\n')}`,
    },
  ]);

  if (res.status !== 'online') return { wellFormed: false };
  const parsed = parseProgramJson(res.text);
  if (!parsed) return { wellFormed: false, raw: res.text, engine: res.engine };
  return { program: parsed, wellFormed: isWellFormedTerm(parsed), raw: res.text, engine: res.engine };
}

// ==========================================
// Parsing — defensive, because LLMs wander
// ==========================================

function stripFences(s: string): string {
  return s.replace(/```(?:json)?/gi, '').trim();
}

function parsePlanJson(text: string): { tasks: Array<{ intent: string; program?: string; examples: Example[] }> } | null {
  const cleaned = stripFences(text);
  // Try the whole thing, then the first bracketed object.
  const candidates = [cleaned];
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && Array.isArray(obj.tasks)) return obj;
    } catch {
      // try next
    }
  }
  return null;
}

function parseProgramJson(text: string): string | null {
  const cleaned = stripFences(text);
  const candidates = [cleaned];
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj.program === 'string') return obj.program;
    } catch {
      // try next
    }
  }
  // Fall back to the first grammar-shaped term in the prose.
  const m = cleaned.match(/(\((?:rev|sortf|dedupef|inc|pos|neg)\b[^\n]*?\))/);
  return m ? m[1] : null;
}

// ==========================================
// Normalization + validation
// ==========================================

function normalizeTask(
  t: { intent: string; program?: string; examples: Example[] },
  index: number
): PlanTask {
  const examples: Example[] = Array.isArray(t.examples)
    ? t.examples
        .filter((e) => Array.isArray(e?.input) && Array.isArray(e?.output))
        .map((e) => ({
          input: e.input.map((n: any) => Number(n)),
          output: e.output.map((n: any) => Number(n)),
        }))
        .slice(0, 5)
    : [];

  const program = typeof t.program === 'string' ? t.program.trim() : undefined;
  return {
    id: `T${index + 1}`,
    intent: typeof t.intent === 'string' ? t.intent.trim() : '(no intent given)',
    examples,
    program,
    programWellFormed: program ? isWellFormedTerm(program) : false,
  };
}

/** A term is well-formed if it parses AND is a member of the grammar. */
export function isWellFormedTerm(term: string): boolean {
  const t = term.trim();
  if (t === 'x' || t === 'nil') return true;
  const m = t.match(/^\((\w+)\s+(.+)\)$/);
  if (!m) return false;
  const [, op, inner] = m;
  if (!Object.prototype.hasOwnProperty.call(LIST_GRAMMAR.unary, op)) return false;
  return isWellFormedTerm(inner);
}

/** True when the term evaluates (does not throw) on the given input. */
export function termRunsOn(program: string, input: number[]): boolean {
  return runProgram(LIST_GRAMMAR, program, input) !== null;
}

/** Every program in the grammar at this depth — used for the term check. */
export function grammarPrograms(maxDepth: number): string[] {
  return enumeratePrograms(LIST_GRAMMAR, maxDepth).map((p) => p.term);
}

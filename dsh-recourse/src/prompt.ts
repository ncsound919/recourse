/**
 * The model-facing usage section.
 *
 * This is what makes Recourse the *centerpiece* rather than just another set of
 * tools. Without an explicit protocol the model treats `recourse_evolve` as one
 * more function to call opportunistically, and the recursive loop never closes.
 *
 * The section is written as policy rather than documentation: what to do, in what
 * order, and which results are allowed to be believed.
 */

import type { RecoursePluginConfig } from './config.js';
import { DISPATCH_TOOL_NAME } from './tools.js';

/** Tool names grouped by the role they play in the loop. */
interface ToolRoles {
  readonly observe: readonly string[];
  readonly propose: readonly string[];
  readonly advance: readonly string[];
}

const OBSERVE_TOOLS = ['recourse_status', 'recourse_registry', 'recourse_nightly_report', 'recourse_slopbench_status'] as const;
const PROPOSE_TOOLS = ['recourse_evolve'] as const;
const ADVANCE_TOOLS = ['recourse_promote', 'recourse_run_forge', 'recourse_slopbench_run'] as const;

function groupByRole(toolNames: readonly string[]): ToolRoles {
  const present = new Set(toolNames);
  const keep = (names: readonly string[]): readonly string[] => names.filter((name) => present.has(name));
  return {
    observe: keep(OBSERVE_TOOLS),
    propose: keep(PROPOSE_TOOLS),
    advance: keep(ADVANCE_TOOLS),
  };
}

/** Render a tool group, degrading honestly when the host registered none of them. */
function list(names: readonly string[]): string {
  return names.length === 0 ? '(none registered on this host)' : names.map((n) => `\`${n}\``).join(', ');
}

/**
 * Build the usage text.
 *
 * Returned as a thunk because the host calls it on every prompt assembly, so it
 * must stay pure and cheap.
 */
export function buildUsageSection(
  toolNames: readonly string[],
  config: RecoursePluginConfig,
): () => string {
  const roles = groupByRole(toolNames);

  const registrySentence = roles.observe.includes('recourse_registry')
    ? '`recourse_registry` shows a tool that nearly solves the problem'
    : 'the registry shows a tool that nearly solves the problem';

  const mutationStatus = config.apiSecret.length > 0
    ? 'The harness carries RECOURSE_API_SECRET, so the mutating tools can authenticate.'
    : 'The harness has no RECOURSE_API_SECRET, so the mutating tools will fail closed with an explicit error until it is set. Read tools still work.';

  // Only claim the dispatcher exists when the host actually registered it.
  const dispatcher = toolNames.includes(DISPATCH_TOOL_NAME)
    ? `\n\nNot every tool is registered individually - every registered tool schema is paid for on each turn, so the long tail is reached through \`${DISPATCH_TOOL_NAME}\`. Call it with \`{ name, args }\`; its description lists the full set, and a dispatched call behaves exactly like the tool itself. Recourse tools named above but not listed as native are called that way.`
    : '';

  return () => `## Recourse - the ecosystem's recursive self-improvement engine

Recourse is the centerpiece of this ecosystem's self-improvement and tool
development. It keeps its own tool registry, evolves new capabilities, verifies
them against a real sandbox + lint gate, promotes only what passes, and records
a provenance chain. Tools it verifies are exported as agent skills, so they
reach every client without anyone hand-installing them.

Recourse speaks HTTP, not MCP. This plugin is the bridge.

### The loop

1. **Orient.** Call ${list(roles.observe)} before acting. Never propose a
   change without knowing the current generation and whether the verifier is
   healthy.
2. **Find the gap.** If ${registrySentence}, mutate it with \`recourse_evolve\`
   and \`targetToolName\`. If nothing does, call \`recourse_evolve\` with no target
   to propose a new capability.
3. **Advance.** ${list(roles.advance)} are the calls that move the generation.
   Prefer \`recourse_run_forge\` when the goal is "make the system better";
   prefer \`recourse_evolve\` when you know precisely what you want changed.
4. **Gate.** \`recourse_promote\` only accepts genes the verifier already passed.
   Surface the pending list and let the human decide; do not promote on your
   own initiative.
5. **Measure.** \`recourse_nightly_report\` carries the self-attested delta.
   Quote it when you claim the system improved, and say plainly when it is
   empty.
6. **Evaluate code quality.** \`recourse_slopbench_status\` reports whether the
   iterative refinement benchmark is ready. \`recourse_slopbench_run\` executes
   a full benchmark cycle — the agent implements a spec, then extends its own
   code as the spec changes, exposing code erosion and structural degradation
   that single-shot tests miss. Use it when you need evidence that the system's
   code quality holds up under iterative development.

### What you may believe

- A tool exists in the registry only if the verifier passed. "Promoted" is
  evidence; "rejected" is a normal, useful outcome, not a failure to hide.
- Never tell the user a tool works because a proposal was made. Read the
  verifier fields on the result.
- If Recourse is unreachable or its guarded routes are closed, report exactly
  that. Do not simulate an outcome, and do not retry the same mutation hoping a
  different answer appears.

### Current wiring

${mutationStatus}${dispatcher}`;
}
/**
 * toolCalling — the bounded agent loop that lets a model natively call Recourse
 * tools (OpenAI-compatible `tools`/`tool_calls`), executes each call through the
 * injected registry, feeds the results back as `role: 'tool'` messages, and
 * stops when the model answers or the turn cap is hit.
 *
 * Local-model hardening:
 *  - Only a small, task-relevant shortlist of tools is exposed each turn
 *    (`toolSelect`), with an `agent_search_tools` meta-tool for expansion.
 *  - Tool arguments are alias-normalized and schema-validated; a malformed call
 *    gets one off-cap strict-JSON repair call before it is reported as failed.
 *  - Malformed calls are counted (`malformed`) so misconfiguration is visible.
 *
 * Honesty: the loop never fabricates a tool result or a final answer. Offline
 * and error turns are surfaced verbatim; unknown tools and unrepaired bad JSON
 * are returned to the model as `{ok:false,error}`. Every call is recorded.
 */
import type { ChatMessage, ChatCompleteOptions, ChatCompleteResult, ToolChoice } from './modelProvider.js';
import { extractJsonBlock } from './modelProvider.js';
import type { AgentToolRegistry, AgentToolSpec } from './agentTools.js';
import { toOpenAITools } from './agentTools.js';
import { selectTools, findMoreTools, isSearchTool, SEARCH_TOOLS_NAME } from './toolSelect.js';
import { normalizeToolArgs, validateToolArgs, buildRepairMessages } from './toolArgs.js';

export interface ToolInvocationRecord {
  id: string;
  name: string;
  arguments: unknown;
  ok: boolean;
  result?: unknown;
  error?: string;
  source: string;
}

export interface ToolCallingDeps {
  /** Model call (already routes local-first / falls back to API). */
  chat: (messages: ChatMessage[], opts: ChatCompleteOptions) => Promise<ChatCompleteResult>;
  registry: AgentToolRegistry;
  /** Maximum model turns (default 4). */
  maxTurns?: number;
  temperature?: number;
  /** Tool-choice policy sent to the model each turn (default 'auto'). */
  toolChoice?: ToolChoice;
  /** Cap on a single tool result's serialized size fed back to the model. */
  maxToolResultChars?: number;
  /** Text used to select the per-turn tool shortlist (default: last user msg). */
  toolQuery?: string;
  /** Max tools exposed per turn (default env AGENT_TOOLS_MAX_PER_TURN or 8). */
  toolLimit?: number;
  /** Include the agent_search_tools meta-tool (default env AGENT_TOOLS_SEARCH !== '0'). */
  toolSearch?: boolean;
  /** Try an off-cap strict-JSON repair of malformed args (default env AGENT_TOOLS_REPAIR !== '0'). */
  repairArgs?: boolean;
  /** When false, mutating tools are refused (default true). The HTTP route sets
   *  this from RECOURSE_API_SECRET; internal loops are trusted. */
  authorized?: boolean;
  onToolCall?: (record: ToolInvocationRecord) => void;
  onMalformed?: (info: { tool: string; error: string }) => void;
}

export type ToolCallingStatus = 'completed' | 'max_turns' | 'offline' | 'error';

export interface ToolCallingResult {
  ok: boolean;
  status: ToolCallingStatus;
  content: string | null;
  transcript: ChatMessage[];
  toolInvocations: ToolInvocationRecord[];
  turns: number;
  model?: string;
  error?: string;
  /** Tool calls whose arguments could not be parsed/validated/repaired. */
  malformed?: number;
}

const DEFAULT_MAX_TURNS = 4;
const DEFAULT_MAX_TOOL_RESULT_CHARS = 4000;

type ParsedArgs = { value: Record<string, unknown>; error?: string };

/** Parse a tool call's JSON arguments. A non-object payload is wrapped as
 *  `{ args: <value> }` so positional self-hosted calls still work. */
export function parseToolArguments(raw: string): ParsedArgs {
  if (!raw || !raw.trim()) return { value: {} };
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { value: value as Record<string, unknown> };
    }
    return { value: { args: value } };
  } catch (err: any) {
    return { value: {}, error: `invalid JSON arguments: ${err?.message || err}` };
  }
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && typeof messages[i].content === 'string') return messages[i].content;
  }
  return '';
}

function toolContent(record: ToolInvocationRecord, maxChars: number): string {
  const payload = record.ok
    ? { ok: true, result: record.result }
    : { ok: false, error: record.error || 'tool failed' };
  let text: string;
  try {
    text = JSON.stringify(payload);
  } catch {
    text = JSON.stringify({ ok: false, error: 'tool result was not JSON-serializable' });
  }
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}…[truncated ${text.length - maxChars} chars]`;
  }
  return text;
}

async function repairToolArgs(
  chat: ToolCallingDeps['chat'],
  name: string,
  schema: Record<string, unknown>,
  raw: string,
  error: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await chat(buildRepairMessages(name, schema, raw, error), { temperature: 0, json: true });
    if (!res.ok || !res.content) return null;
    const block = extractJsonBlock(res.content) ?? res.content;
    const obj = JSON.parse(block);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function runToolCallingAgent(
  initialMessages: ChatMessage[],
  deps: ToolCallingDeps,
): Promise<ToolCallingResult> {
  const maxTurns = Math.max(1, deps.maxTurns ?? DEFAULT_MAX_TURNS);
  const maxToolResultChars = Math.max(200, deps.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS);
  const repairEnabled = deps.repairArgs ?? process.env.AGENT_TOOLS_REPAIR !== '0';
  const includeSearch = deps.toolSearch ?? process.env.AGENT_TOOLS_SEARCH !== '0';
  // Default open (internal loops are trusted); the HTTP route passes the real value.
  const authorized = deps.authorized !== false;
  const transcript: ChatMessage[] = initialMessages.map((m) => ({ ...m }));
  const toolInvocations: ToolInvocationRecord[] = [];
  let malformed = 0;

  const allSpecs = await deps.registry.list();
  const query = (deps.toolQuery || lastUserText(transcript)).trim();
  const limitRaw = deps.toolLimit ?? Number(process.env.AGENT_TOOLS_MAX_PER_TURN || 8);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 30) : 8;
  // Mutable active shortlist; `agent_search_tools` can expand it mid-loop.
  const activeSpecs: AgentToolSpec[] = selectTools(allSpecs, query, { limit, includeSearch });

  const buildTools = () => (activeSpecs.length ? toOpenAITools(activeSpecs) : undefined);

  let lastModel = '';
  let lastContent: string | null = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    const tools = buildTools();
    const res = await deps.chat(transcript, {
      temperature: deps.temperature,
      ...(tools ? { tools, toolChoice: deps.toolChoice ?? 'auto' } : {}),
    });
    lastModel = res.model || lastModel;

    if (!res.ok) {
      return {
        ok: false,
        status: res.status === 'offline' ? 'offline' : 'error',
        content: null,
        transcript,
        toolInvocations,
        turns: turn + 1,
        model: lastModel,
        error: res.error,
        malformed,
      };
    }

    const toolCalls = res.toolCalls ?? [];
    if (toolCalls.length === 0) {
      lastContent = res.content ?? '';
      transcript.push({ role: 'assistant', content: lastContent });
      return {
        ok: true,
        status: 'completed',
        content: lastContent,
        transcript,
        toolInvocations,
        turns: turn + 1,
        model: lastModel,
        malformed,
      };
    }

    if (res.content && res.content.trim()) lastContent = res.content;
    transcript.push({ role: 'assistant', content: res.content ?? '', tool_calls: toolCalls });

    for (const call of toolCalls) {
      const parsed = parseToolArguments(call.function.arguments);
      let record: ToolInvocationRecord;

      // 1) Meta-tool: expand the active tool set (never hits the registry).
      if (isSearchTool(call.function.name)) {
        const q = String(parsed.value.query ?? parsed.value.q ?? '');
        const requested = Number(parsed.value.limit);
        const moreLimit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, limit) : 5;
        const more = findMoreTools(allSpecs, q, new Set(activeSpecs.map((s) => s.name)), moreLimit);
        for (const m of more) activeSpecs.push(m);
        record = {
          id: call.id,
          name: SEARCH_TOOLS_NAME,
          arguments: parsed.value,
          ok: true,
          result: { added: more.map((m) => ({ name: m.name, description: m.description, source: m.source })) },
          source: 'meta',
        };
        toolInvocations.push(record);
        try { deps.onToolCall?.(record); } catch { /* never break the loop */ }
        transcript.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: toolContent(record, maxToolResultChars) });
        continue;
      }

      // 2) Resolve the spec from the FULL catalog (the model may name a tool that
      //    was not in the shortlist) so mutation gating can never be bypassed.
      const spec = allSpecs.find((s) => s.name === call.function.name) ?? activeSpecs.find((s) => s.name === call.function.name);
      const schema = (spec?.parameters ?? {}) as Record<string, unknown>;

      // 3) Per-tool mutation gate FIRST — before spending a repair call.
      if (spec?.mutating && !authorized) {
        record = {
          id: call.id,
          name: call.function.name,
          arguments: parsed.value,
          ok: false,
          error: `tool "${call.function.name}" changes state and requires mutation authorization (RECOURSE_API_SECRET)`,
          source: spec.source,
        };
        toolInvocations.push(record);
        try { deps.onToolCall?.(record); } catch { /* never break the loop */ }
        transcript.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: toolContent(record, maxToolResultChars) });
        continue;
      }

      // 4) Normalize + validate arguments, then repair once (off-cap) if needed.
      let argsValue: Record<string, unknown> | null = parsed.value;
      let argError = parsed.error;

      if (!argError && argsValue && Object.keys(schema).length) {
        argsValue = normalizeToolArgs(schema, argsValue);
        const v = validateToolArgs(schema, argsValue);
        if (!v.ok) { argError = v.errors.join('; '); argsValue = v.value; }
      }
      if (argError && repairEnabled && spec) {
        const repaired = await repairToolArgs(deps.chat, call.function.name, schema, call.function.arguments, argError);
        if (repaired) {
          const normalized = Object.keys(schema).length ? normalizeToolArgs(schema, repaired) : repaired;
          const v2 = Object.keys(schema).length ? validateToolArgs(schema, normalized) : { ok: true, errors: [], value: normalized };
          if (v2.ok) { argsValue = v2.value; argError = undefined; }
        }
      }

      if (argError || !argsValue) {
        malformed += 1;
        try { deps.onMalformed?.({ tool: call.function.name, error: argError || 'invalid arguments' }); } catch { /* a callback must never break the loop */ }
        record = { id: call.id, name: call.function.name, arguments: call.function.arguments, ok: false, error: argError || 'invalid arguments', source: 'unknown' };
      } else {
        try {
          const tr = await deps.registry.invoke(call.function.name, argsValue);
          record = { id: call.id, name: call.function.name, arguments: argsValue, ok: tr.ok, result: tr.result, error: tr.error, source: tr.source };
        } catch (err: any) {
          record = { id: call.id, name: call.function.name, arguments: argsValue, ok: false, error: `tool invocation threw: ${err?.message || String(err)}`, source: spec?.source ?? 'unknown' };
        }
      }
      toolInvocations.push(record);
      try { deps.onToolCall?.(record); } catch { /* a callback must never break the loop */ }
      transcript.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: toolContent(record, maxToolResultChars),
      });
    }
  }

  return {
    ok: false,
    status: 'max_turns',
    content: lastContent,
    transcript,
    toolInvocations,
    turns: maxTurns,
    model: lastModel,
    error: `reached the ${maxTurns}-turn tool-calling cap`,
    malformed,
  };
}

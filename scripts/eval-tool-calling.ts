/**
 * eval-tool-calling — a small, self-contained BFCL-style harness for the
 * configured local model.
 *
 * For each case it sends the OpenAI `tools` and scores:
 *   - tool name match (AST-level: exact declared function)
 *   - argument match (normalized JSON equality)
 *   - no-tool cases (the model must NOT call a tool)
 * and reports accuracy plus the malformed-call rate. This is the local
 * regression signal; for the official board use `pip install bfcl-eval` and
 * point it at the same llama-server endpoint.
 *
 * Run:  npx tsx scripts/eval-tool-calling.ts
 * Env:  EVAL_LIMIT (max cases), EVAL_PROFILE (auto|local|api)
 */
import 'dotenv/config';
import { chatComplete, type OpenAITool, type ChatMessage } from '../src/lib/modelProvider.js';

interface Case {
  id: string;
  messages: ChatMessage[];
  tools: OpenAITool[];
  expect: { name: string | null; args?: Record<string, unknown> };
}

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): OpenAITool => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});

const WEATHER = fn('get_weather', 'Get the current weather for a city.', { city: { type: 'string' }, unit: { type: 'string', enum: ['c', 'f'] } }, ['city']);
const SEARCH = fn('search_docs', 'Search the documentation for a query.', { query: { type: 'string' }, limit: { type: 'number' } }, ['query']);
const EVENT = fn('create_event', 'Create a calendar event.', { title: { type: 'string' }, date: { type: 'string' }, location: { type: 'string' } }, ['title', 'date']);
const VOLUME = fn('set_volume', 'Set the output volume.', { level: { type: 'string', enum: ['low', 'medium', 'high'] } }, ['level']);
const TOOLS = [WEATHER, SEARCH, EVENT, VOLUME];

const CASES: Case[] = [
  {
    id: 'weather-paris',
    messages: [{ role: 'user', content: 'What is the weather in Paris? Use the tool.' }],
    tools: TOOLS,
    expect: { name: 'get_weather', args: { city: 'Paris' } },
  },
  {
    id: 'search-limit',
    messages: [{ role: 'user', content: 'Search the docs for "tool calling", return 3 results.' }],
    tools: TOOLS,
    expect: { name: 'search_docs', args: { query: 'tool calling', limit: 3 } },
  },
  {
    id: 'event-two-args',
    messages: [{ role: 'user', content: 'Create an event titled "Standup" on 2026-10-01 in the Berlin office.' }],
    tools: TOOLS,
    expect: { name: 'create_event', args: { title: 'Standup', date: '2026-10-01', location: 'Berlin' } },
  },
  {
    id: 'volume-enum',
    messages: [{ role: 'user', content: 'Set the volume to medium.' }],
    tools: TOOLS,
    expect: { name: 'set_volume', args: { level: 'medium' } },
  },
  {
    id: 'no-tool-hello',
    messages: [{ role: 'user', content: 'Reply with exactly: hello' }],
    tools: TOOLS,
    expect: { name: null },
  },
];

function normalizeValue(v: unknown): unknown {
  if (typeof v === 'string') return v.trim().toLowerCase();
  return v;
}

function argsMatch(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  for (const [k, ev] of Object.entries(expected)) {
    if (normalizeValue(actual[k]) !== normalizeValue(ev)) {
      // numeric-string tolerance
      if (String(actual[k]) !== String(ev)) return false;
    }
  }
  return true;
}

async function main() {
  const limit = Number(process.env.EVAL_LIMIT || CASES.length);
  const cases = CASES.slice(0, Math.max(1, limit));
  const toolCases = cases.filter((c) => c.expect.name !== null).length;
  let nameHits = 0;
  let argHits = 0;
  let malformed = 0;
  let answered = 0;

  for (const c of cases) {
    const started = Date.now();
    const res = await chatComplete(c.messages, { tools: c.tools, toolChoice: 'auto', temperature: 0 });
    const calls = res.toolCalls ?? [];
    const call = calls[0];
    let nameOk = false;
    let argsOk = false;
    let badJson = false;
    if (c.expect.name === null) {
      nameOk = calls.length === 0;
    } else if (call) {
      nameOk = call.function.name === c.expect.name;
      try {
        const parsed = JSON.parse(call.function.arguments || '{}');
        argsOk = nameOk && argsMatch(parsed, c.expect.args ?? {});
      } catch {
        badJson = true;
      }
    }
    if (res.ok) answered += 1;
    if (nameOk) nameHits += 1;
    if (nameOk && argsOk) argHits += 1;
    if (badJson) malformed += 1;
    console.log(JSON.stringify({
      id: c.id,
      status: res.status,
      expected: c.expect.name,
      got: call ? call.function.name : null,
      arguments: call?.function.arguments,
      nameOk,
      argsOk,
      malformedJson: badJson,
      elapsedMs: Date.now() - started,
    }));
  }

  const n = cases.length;
  console.log('\n=== summary ===');
  console.log(JSON.stringify({
    cases: n,
    toolCases,
    answered,
    toolNameAccuracy: n ? +(nameHits / n * 100).toFixed(1) : 0,
    argumentAccuracy: toolCases ? +(argHits / toolCases * 100).toFixed(1) : 0,
    malformed,
  }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });

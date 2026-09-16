/**
 * Minimal but real Agent-to-Agent (A2A) surface.
 *
 * Exposes Recourse as a callable agent: an Agent Card at
 * `/.well-known/agent.json` and a JSON-RPC endpoint (`POST /api/a2a`) that
 * accepts A2A `message/send` and `tasks/get`. Text parts name a skill; the
 * injected operation runs it for real and the result is returned as a task
 * artifact. Mutating skills require the same mutation authorization as the
 * REST surface — an unauthorized call returns HTTP 401, never a fake success.
 *
 * The handler is pure with respect to its injected operations, so it is fully
 * unit-testable without a live server.
 */
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './durableJson';

export interface A2aSkill {
  /** Stable id, also the canonical skill name (e.g. `recourse.status`). */
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  /** Mutating skills require mutation authorization. */
  mutating?: boolean;
}

export interface A2aOperation {
  skill: A2aSkill;
  run(args: Record<string, unknown>): Promise<unknown> | unknown;
}

export interface A2aTask {
  kind: 'task';
  id: string;
  contextId?: string;
  status: { state: 'submitted' | 'working' | 'completed' | 'failed'; timestamp: string; message?: unknown };
  artifacts?: Array<{ artifactId: string; name: string; parts: Array<{ type: 'text'; text: string }> }>;
}

export interface A2aHandleOptions {
  /** Whether the caller presented valid mutation credentials. */
  authorized: boolean;
  operations: Record<string, A2aOperation>;
  /** Task store; defaults to a module-level map. Pass the durable store to survive restarts. */
  tasks?: A2aTaskStore;
  now?: () => number;
  idFactory?: () => string;
}

export interface A2aRpcResult {
  httpStatus: number;
  body: unknown;
}

const DEFAULT_TASK_STORE = new Map<string, A2aTask>();

/** Minimal task-store contract. A `Map` satisfies it; so does the durable store. */
export interface A2aTaskStore {
  get(id: string): A2aTask | undefined;
  set(id: string, task: A2aTask): void;
}

export function a2aTasksFile(): string {
  return process.env.RECOURSE_A2A_TASKS_FILE || path.join(process.cwd(), 'data', 'a2a-tasks.json');
}

export interface DurableA2aTaskStore extends A2aTaskStore {
  all(): A2aTask[];
  size(): number;
}

/**
 * Durable, bounded task store so `tasks/get` survives a restart instead of
 * returning 404 for a task this process created before recycling. Newest wins;
 * the oldest entries are trimmed past `limit`.
 */
export function openA2aTaskStore(file = a2aTasksFile(), limit = 500): DurableA2aTaskStore {
  const doc = readJsonFile<{ version: number; tasks: A2aTask[] }>(file, { version: 1, tasks: [] });
  const map = new Map<string, A2aTask>();
  for (const t of Array.isArray(doc.tasks) ? doc.tasks : []) {
    if (t && typeof t.id === 'string') map.set(t.id, t);
  }
  const persist = () => {
    try {
      writeJsonFile(file, { version: 1, tasks: [...map.values()].slice(-limit) });
    } catch {
      /* persistence must never break task handling */
    }
  };
  return {
    get: (id) => map.get(id),
    set(id, task) {
      // Re-insert to move to the end (most-recent), then trim.
      map.delete(id);
      map.set(id, task);
      while (map.size > limit) {
        const oldest = map.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
      persist();
    },
    all: () => [...map.values()],
    size: () => map.size,
  };
}

/** All A2A skills Recourse advertises (metadata mirrors the MCP tool surface). */
export const A2A_SKILLS: A2aSkill[] = [
  { id: 'recourse.status', name: 'Recourse status', description: 'Live system status, readiness, tool counts.', tags: ['read'] },
  { id: 'recourse.registry', name: 'Recourse gene registry', description: 'List registered tools/genes and promoted state.', tags: ['read'] },
  { id: 'recourse.selfhosted', name: 'Recourse self-hosted artifacts', description: 'List live self-hosted tools and kinds.', tags: ['read'] },
  { id: 'recourse.sandbox_status', name: 'Capability sandbox status', description: 'Whether the WASM capability sandbox runtime is live.', tags: ['read'] },
  { id: 'recourse.memory_tiered', name: 'Tiered memory status', description: 'Episodic + semantic store driver and counts.', tags: ['read'] },
  { id: 'recourse.recall_memory', name: 'Recall memory', description: 'Semantic recall over vector memory for a query.', tags: ['read'] },
  { id: 'recourse.inspect_learner', name: 'Inspect learner', description: 'Recursive learner status and gene beliefs.', tags: ['read'] },
  { id: 'recourse.problems', name: 'List hard problems', description: 'The curated hard/unsolved problem bank.', tags: ['read'] },
  {
    id: 'recourse.run_forge',
    name: 'Run capability forge',
    description: 'Run the honest self-improvement forge (agenda -> model impl -> sandbox verify -> promote).',
    tags: ['write'],
    mutating: true,
  },
  {
    id: 'recourse.execute_selfhosted',
    name: 'Execute a self-hosted tool',
    description: 'Call a self-hosted tool method through the capability sandbox.',
    tags: ['write'],
    mutating: true,
  },
  {
    id: 'recourse.consolidate_memory',
    name: 'Consolidate tiered memory',
    description: 'Fold episode clusters into durable semantic facts.',
    tags: ['write'],
    mutating: true,
  },
  {
    id: 'recourse.promote_skills',
    name: 'Promote generalist genes to skills',
    description: 'Run the verify -> lint -> export skill promotion pass.',
    tags: ['write'],
    mutating: true,
  },
  {
    id: 'recourse.revert',
    name: 'Revert a fleet patch',
    description: 'Revert an applied patch by its revert token.',
    tags: ['write'],
    mutating: true,
  },
  { id: 'recourse.traces', name: 'Recent traces', description: 'Recent distributed-trace spans (W3C trace context).', tags: ['read'] },
  { id: 'recourse.tracing_status', name: 'Tracing status', description: 'Whether an OTLP exporter is configured, and the buffered span count.', tags: ['read'] },
  { id: 'recourse.skills', name: 'List published skills', description: 'The signed, versioned skill registry.', tags: ['read'] },
  { id: 'recourse.skill_verify', name: 'Verify a published skill', description: 'Signature/verification status for one skill id.', tags: ['read'] },
  { id: 'recourse.connectors', name: 'List connectors', description: 'Registered external connectors and their health.', tags: ['read'] },
  { id: 'recourse.validate_plugin', name: 'Validate a plugin manifest', description: 'Schema + capability + signature validation of a plugin manifest.', tags: ['read'] },
  {
    id: 'recourse.publish_skill',
    name: 'Publish a skill',
    description: 'Publish a signed, versioned skill to the registry.',
    tags: ['write'],
    mutating: true,
  },
];

/** A2A Agent Card for a given public base URL. */
export function agentCard(baseUrl: string, skills: A2aSkill[] = A2A_SKILLS): Record<string, unknown> {
  return {
    protocolVersion: '0.2.5',
    name: 'Recourse',
    description:
      'Self-developing architectural OS that only believes what it can verify. Promotions pass a real sandbox suite + lint gate.',
    url: `${baseUrl.replace(/\/$/, '')}/api/a2a`,
    preferredTransport: 'JSONRPC',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/plain'],
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags ?? [],
      examples: s.examples ?? [],
    })),
  };
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

function rpcError(id: unknown, code: number, message: string): A2aRpcResult {
  return { httpStatus: 200, body: { jsonrpc: '2.0', id: id ?? null, error: { code, message } } };
}

function rpcResult(id: unknown, result: unknown): A2aRpcResult {
  return { httpStatus: 200, body: { jsonrpc: '2.0', id: id ?? null, result } };
}

/** Extract a skill id from an A2A message: explicit params.skill/operation wins,
 *  else the first text part that names a known skill. */
function resolveSkillId(params: any, operations: Record<string, A2aOperation>): string | null {
  const explicit = params?.skill ?? params?.operation ?? params?.metadata?.skill;
  if (typeof explicit === 'string' && operations[explicit]) return explicit;
  const parts = Array.isArray(params?.message?.parts) ? params.message.parts : [];
  for (const p of parts) {
    const t = typeof p?.text === 'string' ? p.text.trim() : '';
    if (!t) continue;
    if (operations[t]) return t;
    const first = t.split(/\s+/)[0];
    if (operations[first]) return first;
  }
  return null;
}

/** Handle one JSON-RPC A2A request. Never throws for a malformed request. */
export async function handleA2aRpc(payload: unknown, opts: A2aHandleOptions): Promise<A2aRpcResult> {
  const store = opts.tasks ?? DEFAULT_TASK_STORE;
  const now = opts.now ?? (() => Date.now());
  const req = (payload ?? {}) as JsonRpcRequest;
  const id = req.id ?? null;

  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return rpcError(id, -32600, 'invalid JSON-RPC request');
  }

  if (req.method === 'tasks/get') {
    const taskId = String(req.params?.id ?? '');
    const task = store.get(taskId);
    if (!task) return { httpStatus: 404, body: { jsonrpc: '2.0', id, error: { code: -32001, message: `task ${taskId} not found` } } };
    return rpcResult(id, task);
  }

  if (req.method === 'message/send' || req.method === 'tasks/send') {
    const skillId = resolveSkillId(req.params, opts.operations);
    if (!skillId) {
      return rpcError(
        id,
        -32602,
        `no known skill named. Available: ${Object.keys(opts.operations).join(', ')}`,
      );
    }
    const operation = opts.operations[skillId];
    if (operation.skill.mutating && !opts.authorized) {
      return {
        httpStatus: 401,
        body: { jsonrpc: '2.0', id, error: { code: -32001, message: `skill ${skillId} requires mutation authorization` } },
      };
    }

    const args = (req.params?.arguments ?? req.params?.args ?? {}) as Record<string, unknown>;
    const taskId = opts.idFactory ? opts.idFactory() : `task-${now()}-${Math.random().toString(36).slice(2, 8)}`;
    const contextId = typeof req.params?.contextId === 'string' ? req.params.contextId : undefined;
    const base: A2aTask = {
      kind: 'task',
      id: taskId,
      contextId,
      status: { state: 'working', timestamp: new Date(now()).toISOString() },
    };
    store.set(taskId, base);

    try {
      const result = await operation.run(args);
      const task: A2aTask = {
        ...base,
        status: { state: 'completed', timestamp: new Date(now()).toISOString() },
        artifacts: [
          {
            artifactId: `${taskId}-out`,
            name: skillId,
            parts: [{ type: 'text', text: JSON.stringify(result) }],
          },
        ],
      };
      store.set(taskId, task);
      return rpcResult(id, task);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const task: A2aTask = {
        ...base,
        status: {
          state: 'failed',
          timestamp: new Date(now()).toISOString(),
          message: { role: 'agent', parts: [{ type: 'text', text: message }] },
        },
      };
      store.set(taskId, task);
      return rpcResult(id, task);
    }
  }

  return rpcError(id, -32601, `method not found: ${req.method}`);
}

/** Test/maintenance helper: clear the default task store. */
export function clearA2aTaskStore(): void {
  DEFAULT_TASK_STORE.clear();
}

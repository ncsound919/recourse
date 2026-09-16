/**
 * OpenAPI 3.1 description of Recourse's public API surface, plus an operation
 * index. This is the machine-readable contract behind the typed SDK
 * (`src/lib/recourseSdk.ts`) and the discoverable route list served at
 * `GET /api/recourse/routes`. It documents the stable, productized surface —
 * not every internal route.
 */

export interface OpenApiOperation {
  summary: string;
  tags: string[];
  mutating?: boolean;
  parameters?: Array<{ name: string; in: 'query' | 'path' | 'body'; required?: boolean; description?: string; type?: string }>;
  responses?: Record<string, { description: string }>;
}

export interface OpenApiSpec {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
}

function op(o: OpenApiOperation): OpenApiOperation {
  return { responses: { '200': { description: 'OK' } }, ...o };
}

/** Build the OpenAPI document for a given base URL. */
export function buildOpenApiSpec(baseUrl: string): OpenApiSpec {
  const b = baseUrl.replace(/\/$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: 'Recourse API',
      version: '1.0.0',
      description:
        'Self-developing OS that only believes what it can verify. Mutating routes require the x-api-secret / Bearer secret; promotions pass a real sandbox suite + lint gate.',
    },
    servers: [{ url: b }],
    tags: [
      { name: 'system', description: 'Status, registry, provenance' },
      { name: 'selfhosted', description: 'Self-hosted tools + capability sandbox' },
      { name: 'memory', description: 'Tiered + vector memory' },
      { name: 'benchmark', description: 'Self-attested benchmark ledger' },
      { name: 'wallet', description: 'Budgeted action wallet' },
      { name: 'telemetry', description: 'Machine + git sensors' },
      { name: 'audio', description: 'Transcription + offline render' },
      { name: 'synergy', description: 'Cross-domain transfer + replay' },
      { name: 'agent', description: 'MCP/A2A agent surfaces' },
    ],
    paths: {
      '/api/recourse/status': {
        get: op({ summary: 'Live system status', tags: ['system'] }),
      },
      '/api/recourse/registry': {
        get: op({ summary: 'List registered tools/genes', tags: ['system'] }),
      },
      '/api/recourse/selfhosted': {
        get: op({ summary: 'List self-hosted tools', tags: ['selfhosted'] }),
      },
      '/api/recourse/selfhosted/sandbox': {
        get: op({ summary: 'Capability sandbox runtime status', tags: ['selfhosted'] }),
      },
      '/api/recourse/selfhosted/{name}/execute': {
        post: op({
          summary: 'Execute a self-hosted tool method (sandboxed)',
          tags: ['selfhosted'],
          mutating: true,
          parameters: [
            { name: 'name', in: 'path', required: true, type: 'string' },
            { name: 'method', in: 'body', required: true, type: 'string' },
            { name: 'args', in: 'body', type: 'array' },
            { name: 'mode', in: 'body', type: 'string', description: 'auto | sandbox | direct' },
          ],
        }),
      },
      '/api/recourse/memory/tiered': {
        get: op({ summary: 'Durable episodic/semantic memory status', tags: ['memory'] }),
      },
      '/api/recourse/memory/consolidate': {
        post: op({ summary: 'Consolidate episode clusters into semantic facts', tags: ['memory'], mutating: true }),
      },
      '/api/recourse/memory/promote-skills': {
        post: op({ summary: 'Promote generalist genes to exportable skills', tags: ['memory'], mutating: true }),
      },
      '/api/recourse/memory/recall': {
        get: op({
          summary: 'Semantic recall over vector memory',
          tags: ['memory'],
          parameters: [{ name: 'q', in: 'query', required: true, type: 'string' }],
        }),
      },
      '/api/recourse/benchmark/leaderboard': {
        get: op({ summary: 'Self-attested benchmark leaderboard', tags: ['benchmark'] }),
      },
      '/api/recourse/benchmark/ledger': {
        get: op({ summary: 'Benchmark ledger + chain validity', tags: ['benchmark'] }),
      },
      '/api/recourse/benchmark/run': {
        post: op({ summary: 'Run the external benchmark and attest it', tags: ['benchmark'] }),
      },
      '/api/recourse/wallet': {
        get: op({ summary: 'Wallet balances + chain validity', tags: ['wallet'] }),
      },
      '/api/recourse/wallet/budget': {
        post: op({ summary: 'Set a token budget', tags: ['wallet'], mutating: true }),
      },
      '/api/recourse/telemetry': {
        get: op({ summary: 'Machine + git telemetry snapshot', tags: ['telemetry'] }),
      },
      '/api/recourse/audio/status': {
        get: op({ summary: 'Transcription sidecar status', tags: ['audio'] }),
      },
      '/api/recourse/audio/transcribe': {
        post: op({ summary: 'Transcribe audio/video (url or base64)', tags: ['audio'] }),
      },
      '/api/recourse/replay': {
        post: op({
          summary: 'Deterministically replay a subsystem stream',
          tags: ['synergy'],
          parameters: [{ name: 'stream', in: 'body', type: 'string', description: 'trend | goals | selfhosted' }],
        }),
      },
      '/api/recourse/forge/run': {
        post: op({ summary: 'Run the capability forge cycle', tags: ['synergy'], mutating: true }),
      },
      '/api/recourse/compose/wav': {
        get: op({
          summary: 'Render a composed track to WAV',
          tags: ['audio'],
          parameters: [
            { name: 'style', in: 'query', type: 'string' },
            { name: 'seed', in: 'query', type: 'number' },
            { name: 'stem', in: 'query', type: 'string' },
          ],
        }),
      },
      '/api/recourse/compose/midi': {
        get: op({ summary: 'Download a composed track as Standard MIDI', tags: ['audio'] }),
      },
      '/api/recourse/compose/stems': {
        get: op({ summary: 'Render per-part stems', tags: ['audio'] }),
      },
      '/api/recourse/compose/rate': {
        post: op({ summary: 'Rate a composed track (feeds the learner)', tags: ['audio'], mutating: true }),
      },
      '/api/recourse/skills/exportable': {
        get: op({ summary: 'List verified tools exportable as SKILL.md', tags: ['agent'] }),
      },
      '/api/recourse/skills/export': {
        post: op({ summary: 'Export a verified tool as a SKILL.md folder', tags: ['agent'], mutating: true }),
      },
      '/api/a2a': {
        post: op({ summary: 'A2A JSON-RPC (message/send, tasks/get)', tags: ['agent'] }),
      },
      '/.well-known/agent.json': {
        get: op({ summary: 'A2A agent card', tags: ['agent'] }),
      },
    },
  };
}

export interface OperationIndexEntry {
  method: string;
  path: string;
  summary: string;
  tags: string[];
  mutating: boolean;
}

/** Flatten the spec into a discoverable operation index (sorted). */
export function listOperations(spec: OpenApiSpec): OperationIndexEntry[] {
  const out: OperationIndexEntry[] = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, o] of Object.entries(methods)) {
      out.push({ method: method.toUpperCase(), path, summary: o.summary, tags: o.tags, mutating: Boolean(o.mutating) });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/**
 * Recourse MCP server â€” exposes the live Recourse system to any MCP host
 * (Claude, Cursor, opencode, DSH...) over stdio.
 *
 * Read tools reflect live state; write tools (skills export/import) drive the
 * Recourse HTTP API's GUARDED mutation routes, so they require the operator's
 * mutation secret. If RECOURSE_API_SECRET is unset the guarded server routes
 * fail closed (503) and the write tool reports that honestly.
 *
 * Run:   npx tsx mcp-server.ts
 * Config an MCP server with a command pointing at this file and stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = process.env.RECOURSE_API_URL || 'http://localhost:3050';
const SECRET = process.env.RECOURSE_API_SECRET || '';
const VERSION = '0.2.0';

async function apiGet(path: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    // Send the secret when configured so config-gated GET routes authenticate
    // (open when RECOURSE_API_SECRET is unset, enforced when it is set).
    const headers: Record<string, string> = SECRET ? { Authorization: `Bearer ${SECRET}` } : {};
    const res = await fetch(`${API}${path}`, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error(`Recourse API ${path} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Mutating call against a server route that enforces RECOURSE_API_SECRET. The
 *  secret is sent as `Authorization: Bearer` (matching api/recourse/_guard.ts
 *  and the Express guard). A missing secret => honest failure, never a fake. */
async function apiPost(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  if (!SECRET) {
    return { ok: false, status: 503, data: { success: false, error: `RECOURSE_API_SECRET is not set in the MCP environment â€” cannot authenticate a write (server is fail-closed)` } };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SECRET}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    let data: any = {};
    try { data = await res.json(); } catch { /* non-JSON body */ }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function text(content: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text: content }] };
}

const server = new McpServer({ name: 'recourse', version: VERSION });

/**
 * Tool registry.
 *
 * Every tool is DEFINED through `defineTool`, which records it here. Two things
 * consume this map:
 *
 *  - `NATIVE_TOOLS`: a small curated subset registered as first-class MCP tools,
 *    so an MCP host sees the handful of tools it reaches constantly without
 *    paying a schema for the rest.
 *  - `recourse_call`: one dispatcher whose `name` enum is EVERY registered tool.
 *    The long tail stays reachable through it.
 *
 * That split is the point. Registering all 59 tools natively costs the host 59
 * schemas on every turn, most of which a given session never calls; registering
 * only the subset would make the other 54 unreachable. The dispatcher gives both.
 */
type ToolConfig = {
  title: string;
  description: string;
  inputSchema?: Record<string, z.ZodTypeAny>;
};
type ToolHandler = (args: any) => Promise<{ content: Array<{ type: 'text'; text: string }> }> | { content: Array<{ type: 'text'; text: string }> };

const TOOL_DEFS = new Map<string, { config: ToolConfig; handler: ToolHandler }>();

/**
 * The tools registered as first-class MCP tools.
 *
 * Read-only, cheap, and asked for constantly — status, the gene registry, the
 * capability catalogue, the tool inventory and the two ledgers an operator
 * checks. Everything else is reached through `recourse_call`.
 */
const NATIVE_TOOLS = [
  'recourse.status',
  'recourse.fleet_health',
  'recourse.registry',
  'recourse.selfhosted',
  'recourse.inspect_gene',
  'recourse.recall_memory',
  'recourse.problems',
  'recourse.research_ground',
  'recourse.grounding_status',
  'recourse.dsh_plugins',
  'recourse.evolve',
  'recourse.run_forge',
  'recourse.promote',
  'recourse.benchmark',
  'recourse.coding_pipelines',
] as const;

/** Build the zod object the SDK wants from a raw shape, or an empty object. */
function inputSchemaFor(config: ToolConfig) {
  return config.inputSchema ? z.object(config.inputSchema) : z.object({});
}

/** Register a tool definition. Does NOT register it with the MCP server. */
function defineTool(name: string, config: ToolConfig, handler: ToolHandler): void {
  if (TOOL_DEFS.has(name)) {
    // A duplicate would make the dispatcher's enum ambiguous.
    throw new Error(`duplicate tool definition: ${name}`);
  }
  TOOL_DEFS.set(name, { config, handler });
}

function registerNativeTool(name: string): void {
  const def = TOOL_DEFS.get(name);
  if (!def) throw new Error(`native tool not defined: ${name}`);
  server.registerTool(
    name,
    {
      title: def.config.title,
      description: def.config.description,
      inputSchema: inputSchemaFor(def.config),
    },
    def.handler as never,
  );
}

defineTool('recourse.status', {
  title: 'Recourse status',
  description: 'Live system status, model, tool counts, readiness.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/status');
    const s = j?.status ?? {};
    return text(JSON.stringify({
      generation: s.generation, readiness: s.readinessScore, tools: s.registeredToolsCount,
      verifierPassRate: s.verifierPassRate, totalUpgrades: s.totalUpgrades,
      model: s.providerStatus?.model, modelOnline: s.providerStatus?.online,
      selfRepairHealed: s.selfRepair?.totalHealedCount,
    }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.registry', {
  title: 'Recourse gene registry',
  description: 'List registered tools/genes and their current promoted state.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/registry');
    const tools = (j?.registry ?? []).map((t: any) => {
      const v = (t.versions ?? []).find((x: any) => x.version === t.currentVersion);
      return { name: t.name, domain: t.domain, version: t.currentVersion, score: v?.score, passed: v?.passed_verifier === true, selfHosted: (t.entrypoint || '').includes('.selfhosted/'), health: t.healthStatus };
    });
    return text(JSON.stringify(tools, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.upgrade_report', {
  title: 'Recourse upgrade delta',
  description: 'How the upgraded system differs from the boot baseline.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/system/upgrade-report');
    const d = j?.diff ?? {};
    return text(JSON.stringify({
      added: d.addedTools?.length, removed: d.removedTools?.length, upgraded: d.upgradedTools?.length,
      healthChanged: d.healthChangedTools?.length, capabilityChanges: d.capabilityChanges,
      benchmarkSolvedDelta: d.benchmarkSolvedDelta, selfhostedDelta: d.selfhostedDelta,
      totals: d.totals,
    }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.nightly_report', {
  title: 'Recourse nightly self-improvement report',
  description: 'The latest self-attested nightly upgrade report (dream -> forge -> benchmark delta). Empty until the first nightly cycle runs.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/self-improvement/report');
    const md: string = j?.reportMarkdown ?? '';
    const verdict = md.split('\n').find((l: string) => l.startsWith('**Verdict'));
    return text(JSON.stringify({ key: j?.key, finishedAt: j?.finishedAt, steps: j?.steps, verdict }, null, 2));
  } catch (e: any) { return text(`No nightly report yet (${e.message})`); }
});

defineTool('recourse.self_mod_status', {
  title: 'Recourse self-modification status',
  description: 'Harness self-modification status: last nightly run, pending approvals, applied/reverted patches, and the protected-path policy.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/self-improvement/status');
    return text(JSON.stringify({
      nightly: j?.nightly,
      pendingApprovals: j?.approvals?.pending,
      patches: j?.patches,
      protected: (j?.policy?.safety ?? []).map((r: any) => r.id),
    }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.capabilities', {
  title: 'Recourse capability adoption',
  description: 'Which self-hosted tools Recourse adopted to back its own internal operations (dogfood).',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/capabilities');
    return text(JSON.stringify({ adoptions: j?.adoptions, served: j?.served }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.selfhosted', {
  title: 'Recourse self-hosted artifacts',
  description: 'List live self-hosted tools/artifacts and their kinds (function/cli/api/mcp/a2a/loop).',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/selfhosted');
    const list = (j?.tools ?? []).map((t: any) => ({ name: t.name, kind: t.artifactKind ?? 'function', templateId: t.templateId, verified: t.lastVerified?.passed === true, file: t.file }));
    return text(JSON.stringify(list, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

// ---------------------------------------------------------------------------
// Distribution write tools (Phase 4). All hit GUARDED server mutation routes.
// ---------------------------------------------------------------------------

defineTool('recourse.exportable', {
  title: 'Recourse tools that can be exported as skills',
  description: 'List verified registry tools that carry real source + suite and can therefore be exported as SKILL.md folders.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/skills/exportable');
    return text(JSON.stringify({ exportRoot: j?.exportRoot, count: j?.count, tools: j?.tools }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.export_skill', {
  title: 'Export a verified tool as a SKILL.md folder',
  description: 'Write a verified registry tool into the configured export root as an open SKILL.md folder (source + test suite embedded). Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: { toolName: z.string().describe('Name of the verified registry tool to export'), outRoot: z.string().optional().describe('Optional override directory for the export') },
}, async ({ toolName, outRoot }) => {
  if (!toolName) return text('toolName is required.');
  const r = await apiPost('/api/recourse/skills/export', { toolName, outRoot });
  if (!r.ok) return text(`export_skill failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({ ok: true, toolName: r.data.toolName, version: r.data.version, dir: r.data.dir, files: r.data.files }, null, 2));
});

defineTool('recourse.import_skill', {
  title: 'Ingest a foreign SKILL.md as an UNVERIFIED candidate',
  description: 'Import a skill from a configured skill library (rootId + rel) through the promotion gate. If it embeds code + suite in a code domain it is verified for real; prose-only skills are recorded as pending and never fabricated into the registry. Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: {
    rootId: z.string().describe('Configured skill library id (e.g. ecc, fleet-skills)'),
    rel: z.string().describe('Path of the SKILL.md relative to the library root'),
    domain: z.string().optional().describe('Tool domain to verify under (default coding)'),
  },
}, async ({ rootId, rel, domain }) => {
  if (!rootId || !rel) return text('rootId and rel are required.');
  const r = await apiPost('/api/recourse/skills/import', { rootId, rel, domain });
  if (!r.ok) return text(`import_skill failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({ outcome: r.data.outcome, candidate: r.data.candidate, reason: r.data.reason, registeredTool: r.data.registeredTool }, null, 2));
});

defineTool('recourse.inspect_gene', {
  title: 'Inspect one registry gene/tool in detail',
  description: 'Read the full record for a named registry tool: domain, health, current version, score, pass state, verifier notes.',
  inputSchema: { name: z.string().describe('Exact registry tool/gene name') },
}, async ({ name }) => {
  if (!name) return text('name is required.');
  try {
    const j = await apiGet('/api/recourse/registry');
    const tool = (j?.registry ?? []).find((t: any) => t.name === name);
    if (!tool) return text(`No registry tool named "${name}".`);
    const cur = tool.versions?.find((v: any) => v.version === tool.currentVersion);
    return text(JSON.stringify({
      name: tool.name, domain: tool.domain, health: tool.healthStatus,
      currentVersion: tool.currentVersion, score: cur?.score, passedVerifier: cur?.passed_verifier,
      verifierNotes: cur?.verifier_notes, entrypoint: tool.entrypoint,
      pending: (tool.pendingVersions ?? []).length,
    }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

// ---------------------------------------------------------------------------
// Full recursive-loop write tools (Phase 4 #14). These hit the /mutate routes,
// which are now config-gated: when RECOURSE_API_SECRET is set the server enforces
// it and these authenticate; MCP still requires the secret locally so a write is
// never sent unauthenticated.
// ---------------------------------------------------------------------------

const VALID_DOMAINS = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];

defineTool('recourse.evolve', {
  title: 'Evolve a new tool/gene',
  description: 'Ask the mutator to propose a new capability for a domain. Promotions only land if the produced code passes the real sandbox + lint gate. Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: {
    domain: z.enum(VALID_DOMAINS as [string, ...string[]]).describe('Tool domain to evolve in'),
    instructions: z.string().min(4).describe('What capability to build / how to mutate'),
    targetToolName: z.string().optional().describe('Optional existing tool name to target a mutation'),
  },
}, async ({ domain, instructions, targetToolName }) => {
  const r = await apiPost('/api/recourse/mutate/evolve', { domain, instructions, targetToolName });
  if (!r.ok) return text(`evolve failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  const d = r.data ?? {};
  return text(JSON.stringify({
    ok: d.success,
    outcome: d.outcome,            // 'promoted' | 'rejected' | ...
    toolName: d.toolName,
    version: d.version,
    engine: d.engine,
    generation: d.generation,
    versionHash: d.versionHash,
    verifierPassed: d.verifierResult?.verified ?? undefined,
    verifierSummary: d.verifierResult?.summary,
    error: d.error,
  }, null, 2));
});

defineTool('recourse.promote', {
  title: 'Approve / promote a pending gene',
  description: 'Promote a pending gene by its id through the approval gate. Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: { geneId: z.string().describe('Id of the pending gene to promote') },
}, async ({ geneId }) => {
  if (!geneId) return text('geneId is required.');
  const r = await apiPost('/api/recourse/mutate/approve', { geneId });
  if (!r.ok) return text(`promote failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  const g = r.data?.gene ?? {};
  return text(JSON.stringify({ ok: r.data?.success, name: g.name, domain: g.domain, status: g.status, version: g.version }, null, 2));
});

defineTool('recourse.compose', {
  title: 'Compose an original track in a studied style',
  description: 'Generate an original "in the vein of" track (steely-dan | jasper-ballad | dangelo-glasper | airplane). Loop mode (default): a deterministic 4/8/16-bar loop -> .mid + a SoundLab .seq pocket. Mode "arr": a non-looping written-out arc (intro/A/bridge/final/outro, jasper final key-lift) -> .mid only. Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: {
    style: z.enum(['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane']).describe('Studied style lexicon to compose from'),
    key: z.number().min(0).max(11).optional().describe('Tonic pitch class 0-11 (C=0); omit to let the style choose'),
    major: z.boolean().optional().describe('Major (true) or minor-ish tonic color'),
    bpm: z.number().int().min(30).max(200).optional().describe('Beats per minute override'),
    bars: z.union([z.literal(4), z.literal(8), z.literal(16)]).optional().describe('Loop length in bars'),
    seed: z.number().int().optional().describe('Deterministic seed'),
    title: z.string().optional().describe('Track title (affects output filename)'),
    mode: z.enum(['loop', 'arr']).optional().describe('loop (default) or arr (written-out non-loop arc)'),
  },
}, async ({ style, key, major, bpm, bars, seed, title, mode }) => {
  const r = await apiPost('/api/recourse/compose', { style, key, major, bpm, bars, seed, title, mode });
  if (!r.ok) return text(`compose failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({
    ok: true, mode: r.data.mode ?? 'loop', style: r.data.style, key: r.data.key, bpm: r.data.bpm, bars: r.data.bars, seed: r.data.seed,
    chords: r.data.chords, events: r.data.events, sections: r.data.sections, files: r.data.files, summary: r.data.summary,
  }, null, 2));
});

defineTool('recourse.rate_track', {
  title: 'Rate a composed track (feeds the learner loop)',
  description: 'Record your 1-5 rating for a reproducible composition so the composer learns to steer toward what you like. Same style+seed+rating updates the episode. Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: {
    style: z.enum(['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane']),
    seed: z.number().int(),
    rating: z.number().min(1).max(5),
    bars: z.union([z.literal(4), z.literal(8), z.literal(16)]).optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
  },
}, async ({ style, seed, rating, bars, tags, notes }) => {
  const r = await apiPost('/api/recourse/compose/rate', { style, seed, rating, bars, tags, notes });
  if (!r.ok) return text(`rate_track failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  const ep = r.data.episode ?? {};
  return text(JSON.stringify({ ok: true, id: ep.id, style: ep.style, seed: ep.brief?.seed, rating: ep.rating, chords: ep.chords, rootMoves: ep.rootMoves }, null, 2));
});

defineTool('recourse.learned', {
  title: 'Show the composer learner state',
  description: 'Read per-style learned quality biases, episodes, and leaderboard so you can see how ratings are shaping composition.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/compose/learned');
    return text(JSON.stringify({ styles: j?.styles, leaderboard: j?.leaderboard, adjustments: j?.adjustments }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.benchmark', {
  title: 'Run the objective composer benchmark',
  description: 'Grade the composer on computed metrics (integrity, harmony, loop closure, style root-motion adherence, voice-leading, richness, nuance) across all styles. Does NOT grade taste/timbre â€” that needs your ears + recourse.rate_track.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/compose/benchmark');
    return text(JSON.stringify({ aggregate: j?.aggregate, grade: j?.grade, markdown: j?.markdown, styles: j?.styles }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.benchmark_leaderboard', {
  title: 'Self-attested benchmark leaderboard',
  description: 'The hash-chained record of every external benchmark run, ranked by solved count, with per-run deltas and registry attestations. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/benchmark/leaderboard');
    return text(JSON.stringify({ count: j?.count, entries: j?.entries }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.benchmark_ledger', {
  title: 'Benchmark ledger (chain validity)',
  description: 'Recent self-attested benchmark records and whether the hash chain is intact. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/benchmark/ledger');
    return text(JSON.stringify({ chain: j?.chain, records: j?.records }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.wallet', {
  title: 'Budgeted action wallet status',
  description: 'Per-token spend budgets, remaining balances, and whether the hash-chained ledger is intact. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/wallet');
    return text(JSON.stringify({ chainValid: j?.chainValid, brokenAt: j?.brokenAt, balances: j?.balances }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.telemetry', {
  title: 'Environment telemetry',
  description: 'Machine load/memory and git state, plus the work-window decision used to schedule heavy jobs. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/telemetry');
    return text(JSON.stringify(j?.snapshot ?? j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.audio_status', {
  title: 'Transcription sidecar status',
  description: 'Whether the audio/video transcription sidecar is reachable and its ASR backend is available. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/audio/status');
    return text(JSON.stringify(j?.health ?? j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.compose_soundlab', {
  title: 'Emit a piece for SoundLab playback',
  description: 'Compose a style-driven piece and emit the SoundLab bridge contract. Feed the returned JSON to a running SoundLab via window.__recourse.load(piece), then __recourse.play(). Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: {
    style: z.enum(['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane']),
    key: z.number().min(0).max(11).optional(),
    bpm: z.number().int().min(30).max(200).optional(),
    seed: z.number().int().optional(),
    title: z.string().optional(),
  },
}, async ({ style, key, bpm, seed, title }) => {
  const r = await apiPost('/api/recourse/compose/soundlab', { style, key, bpm, seed, title });
  if (!r.ok) return text(`compose_soundlab failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({
    ok: r.data.valid === true,
    valid: r.data.valid === true,
    problems: r.data.problems,
    style: r.data.style,
    headChord: r.data.piece?.headChord,
    layers: r.data.piece?.layers?.map((l: any) => `${l.id}:${l.role}`),
    file: r.data.file,
    note: 'Feed piece JSON to SoundLab: window.__recourse.load(piece); window.__recourse.play();  (audio needs a user gesture/click).',
  }, null, 2));
});

defineTool('recourse.axiom_status', {
  title: 'Check Axiom Agent harness status',
  description: 'Probe Axiom harness reachability and capability grid from Recourse.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/axiom/status');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.fleet_health', {
  title: 'Fleet service reachability',
  description: 'Probe every fleet service Recourse talks to (Keywire, OpenHub, OmniResearch, Axiom, Draymond, Dev-Brain, LiteLLM, Global Lens): resolved URL, env override, reachable. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/fleet/services');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.fleet_signal', {
  title: 'OpenHub fleet signal',
  description: 'Latest OpenHub self-report folded into Recourse fleet memory: beliefs, audit signals, health, and whether it is degraded. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/fleet/signal');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.draymond_status', {
  title: 'Draymond bridge status',
  description: 'Draymond bridge config (URL, secret configured?), live reachability and the last dogfood cycle snapshot. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/fleet/draymond');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.kg_live_status', {
  title: 'Live evidence provider status',
  description: 'Probe Open Targets Platform and PubTator 3.0 availability for the live oncology evidence layer.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/kg/live/status');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.kg_live_graph', {
  title: 'Build the live oncology knowledge graph',
  description: 'Query Open Targets + PubTator 3.0 and merge with the canonical curated KG into a grounded, provenance-tagged graph. Providers that are down are reported ok:false and simply contribute nothing.',
  inputSchema: {
    diseases: z.array(z.string()).optional().describe('Override MONDO/EFO disease ids (defaults to the validated oncology set)'),
    topics: z.array(z.string()).optional().describe('Override PubTator search topics'),
  },
}, async ({ diseases, topics }) => {
  try {
    const r = await apiPost('/api/recourse/kg/live/graph', { diseases, topics });
    if (!r.ok) return text(`kg_live_graph failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
    return text(JSON.stringify({
      ok: r.data.success,
      counts: r.data.counts,
      providers: r.data.providers,
      nodeTotal: r.data.payload?.nodes?.length,
      edgeTotal: r.data.payload?.edges?.length,
      generatedAt: r.data.generatedAt,
    }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.ode_synthesize', {
  title: 'Synthesize evidence-to-ODE kinetic parameters',
  description: 'Build the live graph and map Open Targets + PubTator evidence into a concrete OdeSimulationParams bundle (Overlay Oncology solveOdeTumorImmuneSystem contract) with per-parameter provenance. Parameters are labeled evidence-derived / literature-prior / canonical / calibrated.',
  inputSchema: {
    diseaseId: z.string().optional().describe('MONDO/EFO disease id to anchor target evidence to (defaults to the graph set)'),
  },
}, async ({ diseaseId }) => {
  try {
    const r = await apiPost('/api/recourse/kg/live/ode-params', { diseaseId });
    if (!r.ok) return text(`ode_synthesize failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
    return text(JSON.stringify({
      ok: r.data.success,
      params: r.data.params,
      provenance: r.data.provenance?.map((p: any) => ({ key: p.key, value: p.value, origin: p.origin, confidence: p.confidence, evidence: p.evidence })),
      synthesisNote: r.data.synthesisNote,
      providers: r.data.providers,
    }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.dosing_optimize', {
  title: 'Run the combinatorial adaptive dosing optimizer',
  description: 'Synthesize evidence-to-ODE params then sweep therapy modes Ã— dose levels, computing per-arm cure-reachability and a seeded subclone-extinction probability. Arms are real deterministic ODE runs; extinctionProbability is an ensemble fraction, not a fitted clinical statistic.',
  inputSchema: {
    diseaseId: z.string().optional().describe('MONDO/EFO disease id to anchor target evidence to'),
    doses: z.array(z.number().positive()).optional().describe('Dose levels to sweep (uM)'),
    modes: z.array(z.enum(['continuous_mtd', 'adaptive_pulsed', 'metronomic', 'awaken_senescence'])).optional().describe('Therapy modes to sweep'),
  },
}, async ({ diseaseId, doses, modes }) => {
  try {
    const r = await apiPost('/api/recourse/kg/live/optimize', { diseaseId, doses, modes });
    if (!r.ok) return text(`dosing_optimize failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
    const summary = {
      ok: r.data.success,
      bestArmKey: r.data.bestArmKey,
      rankedArms: r.data.rankedArms,
      extinctionProbability: r.data.extinction?.extinctionProbability,
      extinctionRuns: `${r.data.extinction?.extinctRuns}/${r.data.extinction?.nRuns}`,
      arms: r.data.arms?.map((a: any) => ({
        arm: `${a.therapyMode}@${a.drugDose}`,
        finalVolume: a.finalVolume_mm3,
        resistantFraction: a.finalResistantFraction,
        minHealthy: a.minHealthy,
        reachable: a.reachability?.isReachable,
        failureReason: a.reachability?.failureReason,
        stable: a.stable,
      })),
      note: r.data.note,
    };
    return text(JSON.stringify(summary, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.pipeline_dossier', {
  title: 'Run the full evidence pipeline and produce a cryptographic dossier',
  description: 'One call: live graph â†’ ODE params â†’ dosing optimization â†’ SBML Level 3 + PhysiCell XML exports, then hash-chain every stage into a verifiable evidence dossier. Reads the real providers; a down provider contributes nothing.',
  inputSchema: {
    diseaseId: z.string().optional().describe('MONDO/EFO disease id to anchor target evidence to'),
  },
}, async ({ diseaseId }) => {
  try {
    const r = await apiPost('/api/recourse/kg/live/pipeline', { diseaseId });
    if (!r.ok) return text(`pipeline_dossier failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
    return text(JSON.stringify({
      ok: r.data.success,
      dossierHash: r.data.dossier?.hash,
      stages: r.data.dossier?.stages?.map((s: any) => ({ stage: s.stage, hash: s.hash?.slice(0, 16), prev: s.prevHash?.slice(0, 16) })),
      provenanceSources: r.data.dossier?.provenanceSources?.length,
      sbml: r.data.sbml,
      physicell: r.data.physicell,
      bestArmKey: r.data.optimization?.bestArmKey,
      extinctionProbability: r.data.optimization?.extinction?.extinctionProbability,
      params: r.data.params,
    }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.axiom_build', {
  title: 'Build and self-host a tool via Axiom Agent',
  description: 'Delegate tool synthesis to Axiom Agent harness, verify with Recourse executionSandbox, and materialize into .selfhosted/ manifest. Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: {
    name: z.string().describe('Function/tool name to create (e.g. dedupeStable)'),
    domain: z.enum(['math', 'coding', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim']).describe('Tool domain'),
    prompt: z.string().describe('Detailed prompt / contract for the tool function'),
    refSuite: z.string().describe('Assertion suite code for real verification (assert ...)'),
  },
}, async ({ name, domain, prompt, refSuite }) => {
  const r = await apiPost('/api/recourse/axiom/build-tool', { name, domain, prompt, refSuite });
  if (!r.ok) return text(`Axiom build failed (HTTP ${r.status}): ${r.data?.error ?? 'unknown error'}`);
  return text(JSON.stringify(r.data, null, 2));
});

// ---------------------------------------------------------------------------
// Full-loop control tools (Phase 4 #14 continued). Read tools proxy live state;
// write tools hit the guarded REST routes and require RECOURSE_API_SECRET.
// ---------------------------------------------------------------------------

defineTool('recourse.sandbox_status', {
  title: 'Capability sandbox status',
  description: 'Whether the WASM capability sandbox runtime (QuickJS) is live, the warm guest-context count, and the effective default execution path.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/selfhosted/sandbox');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.memory_tiered', {
  title: 'Tiered memory status',
  description: 'Durable episodic + semantic memory backend (SQLite/memory), DB path, episode count, fact count.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/memory/tiered');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.recall_memory', {
  title: 'Recall from Recourse memory',
  description: 'Semantic recall over Recourse vector memory for a query. Read-only.',
  inputSchema: {
    q: z.string().describe('Query text'),
    kind: z.string().optional().describe('Optional memory kind filter'),
    topK: z.number().int().min(1).max(20).optional().describe('Number of hits (default 5)'),
  },
}, async ({ q, kind, topK }) => {
  try {
    const qs = new URLSearchParams({ q: String(q ?? '') });
    if (kind) qs.set('kind', kind);
    if (topK) qs.set('topK', String(topK));
    const j = await apiGet(`/api/recourse/memory/recall?${qs.toString()}`);
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.inspect_learner', {
  title: 'Inspect the recursive learner',
  description: 'Learner status: episodes, gene beliefs, directives, and last report.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/learn/status');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.problems', {
  title: 'List hard/unsolved problems',
  description: 'The curated hard-math problem bank with acceptance tests and tier.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/math/problems');
    return text(JSON.stringify({ count: j?.count, total: j?.total, problems: j?.problems }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.run_forge', {
  title: 'Run the capability forge',
  description: 'Run the honest self-improvement forge loop (agenda -> model implementation -> sandbox verify -> promote). Promotions only land on a real green suite. Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: { count: z.number().int().min(1).max(3).optional().describe('Forge cycles to run (default 1)') },
}, async ({ count }) => {
  const r = await apiPost('/api/recourse/forge/run', { count: count ?? 1 });
  if (!r.ok) return text(`run_forge failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({ ok: r.data?.success, results: r.data?.results, forge: r.data?.forge }, null, 2));
});

defineTool('recourse.execute_selfhosted', {
  title: 'Execute a self-hosted tool (through the sandbox)',
  description: 'Call a self-hosted tool method. Execution goes through the WASM capability sandbox by default (default-deny grants); the response reports which mode actually ran. Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: {
    name: z.string().describe('Self-hosted tool name'),
    method: z.string().describe('Method from the tool\'s declared whitelist'),
    args: z.array(z.any()).optional().describe('Method arguments'),
    mode: z.enum(['auto', 'sandbox', 'direct']).optional().describe('Execution path (default auto)'),
  },
}, async ({ name, method, args, mode }) => {
  if (!name || !method) return text('name and method are required.');
  const r = await apiPost(`/api/recourse/selfhosted/${encodeURIComponent(name)}/execute`, { method, args: args ?? [], mode });
  if (!r.ok) return text(`execute_selfhosted failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({ ok: true, tool: r.data?.tool, method: r.data?.method, mode: r.data?.mode, grantUse: r.data?.grantUse, result: r.data?.result, executionTimeMs: r.data?.executionTimeMs }, null, 2));
});

defineTool('recourse.consolidate_memory', {
  title: 'Consolidate tiered memory',
  description: 'Fold episode clusters into durable semantic facts (idempotent). Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: { minClusterSize: z.number().int().min(1).max(50).optional().describe('Minimum loss episodes per cluster (default 2)') },
}, async ({ minClusterSize }) => {
  const r = await apiPost('/api/recourse/memory/consolidate', { minClusterSize });
  if (!r.ok) return text(`consolidate_memory failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({ ok: true, created: r.data?.created, episodes: r.data?.episodes, facts: r.data?.facts, factsCreated: r.data?.facts_created ?? undefined, driver: r.data?.kind }, null, 2));
});

defineTool('recourse.promote_skills', {
  title: 'Promote generalist genes to exportable skills',
  description: 'Run the skill auto-promotion pass: generalist genes -> backing tool re-verified in the sandbox -> lint gate -> SKILL.md export. Rejected/skipped outcomes are reported honestly. Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: {
    minDistinctProblemWins: z.number().int().min(1).max(20).optional().describe('Distinct-problem wins required (default 2)'),
    maxPerRun: z.number().int().min(1).max(10).optional().describe('Max candidates per pass (default 3)'),
  },
}, async ({ minDistinctProblemWins, maxPerRun }) => {
  const r = await apiPost('/api/recourse/memory/promote-skills', { minDistinctProblemWins, maxPerRun });
  if (!r.ok) return text(`promote_skills failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({ ok: true, candidates: r.data?.candidates, outRoot: r.data?.outRoot, outcomes: r.data?.outcomes }, null, 2));
});

defineTool('recourse.revert', {
  title: 'Revert an applied fleet patch',
  description: 'Revert an applied patch by its revert token (as recorded in provenance). Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: { token: z.string().describe('Revert token of the applied patch') },
}, async ({ token }) => {
  if (!token) return text('token is required.');
  const r = await apiPost('/api/recourse/develop/revert', { token });
  if (!r.ok) return text(`revert failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({ ok: true, file: r.data?.file, token }, null, 2));
});

defineTool('recourse.skills', {
  title: 'List published skills',
  description: 'The signed, versioned skill registry (id, version, license, author, signature presence). Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/ecosystem/skills');
    return text(JSON.stringify({ count: j?.count, skills: j?.skills }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.publish_skill', {
  title: 'Publish a signed skill',
  description: 'Publish a versioned skill to the registry (signed with the local skill secret when configured). Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: {
    id: z.string(), name: z.string(), version: z.string().describe('semver, e.g. 1.0.0'),
    description: z.string().optional(), domain: z.string().optional(), license: z.string().optional(),
    author: z.string().optional(), source: z.string().optional(),
  },
}, async (args) => {
  const r = await apiPost('/api/recourse/ecosystem/skills/publish', args);
  if (!r.ok) return text(`publish_skill failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({ ok: true, signed: r.data?.signed, skill: r.data?.skill }, null, 2));
});

defineTool('recourse.connectors', {
  title: 'List connectors + health',
  description: 'Registered external connectors and their live health probes. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/ecosystem/connectors');
    return text(JSON.stringify({ count: j?.count, connectors: j?.connectors, health: j?.health }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.validate_plugin', {
  title: 'Validate a plugin manifest',
  description: 'Validate a plugin manifest (schema + default-deny capabilities) and report its signature status. Read-only.',
  inputSchema: { manifest: z.record(z.string(), z.any()).describe('The plugin manifest object') },
}, async ({ manifest }) => {
  const r = await apiPost('/api/recourse/ecosystem/plugins/validate', { manifest });
  if (!r.ok) return text(`validate_plugin failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify(r.data, null, 2));
});

defineTool('recourse.dsh_plugins', {
  title: 'Scaffolded DSH bundles',
  description: 'DeepSeek Harness cordis bundles generated by Recourse, with each manifest\'s signature state, plus the profiles the harness has. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/dsh-plugins');
    return text(JSON.stringify({
      scaffoldRoot: j?.scaffoldRoot,
      dshHome: j?.dshHome,
      profiles: j?.profiles,
      bundles: j?.bundles?.map((b: any) => ({ name: b.name, signed: b.signature?.signed, signatureValid: b.signature?.valid, hasSources: b.hasSources })),
      signatureFailures: j?.signatureFailures,
    }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

/** POST to a route that does not mutate. Render-only endpoints answer to POST
 *  because they take a request body, but they are guarded by no secret â€” so this
 *  must not go through `apiPost`, which fails 503 without one. */
async function apiReadPost(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { success: false, error: e.message } };
  } finally {
    clearTimeout(timer);
  }
}

defineTool('recourse.dsh_scaffold', {
  title: 'Render or write a DSH harness plugin bundle',
  description: 'Generate a DeepSeek Harness cordis bundle from a declarative spec (id, packageName, description, tools[]). dryRun renders the file list and signed manifest without touching disk. Mutating unless dryRun: requires RECOURSE_API_SECRET.',
  inputSchema: {
    spec: z.object({
      id: z.string().describe('Cordis plugin id, lowercase alphanumerics, e.g. "openhub"'),
      packageName: z.string().describe('npm package name, e.g. "dsh-openhub"'),
      description: z.string().describe('One paragraph on what the bundle is for'),
      version: z.string().optional().describe('semver (default 1.0.0)'),
      apiBaseUrl: z.string().optional().describe('Recourse origin (defaults to this service)'),
      apiSecretEnvVar: z.string().optional().describe('Env var NAME holding the mutation secret (default RECOURSE_API_SECRET)'),
      promptSectionOrder: z.number().int().positive().optional(),
      tools: z.array(z.object({
        name: z.string().describe('Model-facing function name, [A-Za-z0-9_-], <=64 chars'),
        title: z.string(),
        description: z.string(),
        method: z.enum(['GET', 'POST']),
        path: z.string().describe('Recourse route path starting with /'),
        mutating: z.boolean().optional(),
        long: z.boolean().optional().describe('Use the long timeout budget (minutes)'),
      })).min(1),
    }),
    dryRun: z.boolean().optional().describe('Render only; do not write (default false)'),
    overwrite: z.boolean().optional(),
  },
}, async ({ spec, dryRun, overwrite }) => {
  if (dryRun === true) {
    // Render is a read: it writes nothing, so it does not need the secret.
    const r = await apiReadPost('/api/recourse/dsh-plugins/render', { spec });
    if (!r.ok) return text(`dsh_scaffold render failed (HTTP ${r.status}): ${JSON.stringify(r.data)}`);
    return text(JSON.stringify(r.data, null, 2));
  }
  const r = await apiPost('/api/recourse/dsh-plugins/scaffold', { spec, overwrite });
  if (!r.ok) return text(`dsh_scaffold failed (HTTP ${r.status}): ${JSON.stringify(r.data)}`);
  return text(JSON.stringify(r.data, null, 2));
});

defineTool('recourse.grounding_status', {
  title: 'Research grounding configuration and trust registry',
  description: 'Grounding config, the trust registry (which providers may be quoted and why), and live reachability of both research services. Read-only.',
}, async () => {
  try {
    const [config, health] = await Promise.all([
      apiGet('/api/recourse/grounding'),
      apiGet('/api/recourse/grounding/health'),
    ]);
    return text(JSON.stringify({ enabled: config?.enabled, services: config?.services, trustRegistry: config?.trustRegistry, health }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.grounding_ledger', {
  title: 'Research grounding record',
  description: 'The hash-chained record of what grounded a build: query, source ids with trust levels, and chain integrity. Answers "what was this tool actually built from?". Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/grounding/ledger');
    return text(JSON.stringify({ count: j?.count, chain: j?.chain, degradedCount: j?.degradedCount, recent: j?.recent }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.dsh_scaffold_render', {
  title: 'Render a DSH plugin bundle',
  description: 'Generate a DeepSeek Harness cordis bundle from a declarative spec and return the file list plus the signed manifest WITHOUT writing to disk. Read-only.',
  inputSchema: {
    spec: z.object({
      id: z.string(),
      packageName: z.string(),
      description: z.string(),
      tools: z.array(z.object({
        name: z.string(),
        title: z.string(),
        description: z.string(),
        method: z.enum(['GET', 'POST']),
        path: z.string(),
        mutating: z.boolean().optional(),
        long: z.boolean().optional(),
      })).min(1),
    }),
  },
}, async ({ spec }) => {
  const r = await apiReadPost('/api/recourse/dsh-plugins/render', { spec });
  if (!r.ok) return text(`dsh_scaffold_render failed (HTTP ${r.status}): ${JSON.stringify(r.data)}`);
  return text(JSON.stringify(r.data, null, 2));
});

defineTool('recourse.research_ground', {
  title: 'Ground a capability in external research',
  description: 'Gather real external literature for a tool idea before writing it, and return exactly what would be injected into the forge prompt. Only "retrieved" sources are quotable; others are returned as leads with their trust level and reason. Reports honestly when a research service is down.',
  inputSchema: {
    idea: z.string().describe('The tool idea or contract, in one or two sentences'),
    domain: z.string().optional().describe('coding | math | biotech | systemic | neuro_symbolic | cyber_defense | quantum_sim'),
    minRelevance: z.number().min(0).max(1).optional().describe('Query-term overlap a source must reach (default 0.34)'),
  },
}, async ({ idea, domain, minRelevance }) => {
  const r = await apiReadPost('/api/recourse/grounding/preview', {
    title: idea,
    prompt: idea,
    ...(domain ? { domain } : {}),
    ...(minRelevance !== undefined ? { minRelevance } : {}),
  });
  if (!r.ok) return text(`research_ground failed (HTTP ${r.status}): ${JSON.stringify(r.data)}`);
  const d = r.data;
  // Report the prompt section first: the caller wants to read what the generator
  // would read, and everything else is provenance for that text.
  return text([
    `QUERY: ${d.query}`,
    `STATUS: ${d.summary}${d.degraded ? ' [DEGRADED]' : ''}`,
    '',
    '--- what would reach the model ---',
    d.promptSection,
    '',
    '--- provenance ---',
    JSON.stringify({ degraded: d.degraded, degradedReasons: d.degradedReasons, providers: d.providers, hash: d.hash }, null, 2),
  ].join('\n'));
});

defineTool('recourse.traces', {
  title: 'Recent distributed traces',
  description: 'Recently finished spans with W3C trace context (name, ids, status, duration). Read-only.',
  inputSchema: { limit: z.number().int().min(1).max(500).optional().describe('Max spans (default 100)') },
}, async ({ limit }) => {
  try {
    const qs = limit ? `?limit=${limit}` : '';
    const j = await apiGet(`/api/recourse/ops/traces${qs}`);
    return text(JSON.stringify({ count: j?.count, spans: j?.spans }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.tracing_status', {
  title: 'Tracing / OTLP status',
  description: 'Whether an OTLP exporter is configured, the service name, and the buffered span count. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/ops/tracing/status');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.slopbench_status', {
  title: 'SlopCodeBench status',
  description: 'Probe SlopCodeBench availability: CLI on PATH, Docker daemon, uv, and configured agent/model. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/slopbench/status');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.slopbench_run', {
  title: 'Run SlopCodeBench benchmark',
  description: 'Run a SlopCodeBench iterative specification refinement benchmark. Measures code erosion, verbosity, and structural degradation across checkpoints. Requires Docker and an API key.',
  inputSchema: {
    problems: z.array(z.string()).optional().describe('Problem names to benchmark'),
    agent: z.string().optional().describe('Agent runner (default: claude_code)'),
    model: z.string().optional().describe('Model identifier'),
    timeoutMs: z.number().optional().describe('Wall-clock budget in ms'),
  },
}, async ({ problems, agent, model, timeoutMs }) => {
  const r = await apiPost('/api/recourse/slopbench/run', { problems, agent, model, timeoutMs });
  if (!r.ok) return text(`slopbench_run failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify(r.data, null, 2));
});

defineTool('recourse.slopbench_eval', {
  title: 'Evaluate a SlopCodeBench run',
  description: 'Evaluate a completed SlopCodeBench run directory: per-checkpoint pass rates, verbosity, structural erosion, and quality metrics. Read-only.',
  inputSchema: {
    runDir: z.string().describe('Path to the run directory (outputs/...)'),
  },
}, async ({ runDir }) => {
  const r = await apiPost('/api/recourse/slopbench/eval', { runDir });
  if (!r.ok) return text(`slopbench_eval failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify(r.data, null, 2));
});

defineTool('recourse.slopbench_metrics', {
  title: 'SlopCodeBench quality metrics',
  description: 'Compute quality metrics (verbosity, erosion, LOC, cyclomatic complexity, maintainability) for a run directory or code snapshot. Read-only.',
  inputSchema: {
    target: z.string().optional().describe('Run directory or code path to analyze. Omit for latest run.'),
  },
}, async ({ target }) => {
  const r = await apiPost('/api/recourse/slopbench/metrics', { target });
  if (!r.ok) return text(`slopbench_metrics failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify(r.data, null, 2));
});

defineTool('recourse.slopbench_list_runs', {
  title: 'List SlopCodeBench runs',
  description: 'List completed SlopCodeBench run directories with their problem sets, agents, and timestamps. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/slopbench/runs');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.coding_pipelines', {
  title: 'List coding pipelines',
  description: 'Discover all registered coding pipelines (opencode, deepseek, axiom, settlement, slopcodebench) with live availability and standings. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/coding-pipelines');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

defineTool('recourse.coding_pipelines_ledger', {
  title: 'Coding pipeline benchmark ledger',
  description: 'Hash-chained history of pipeline benchmark runs with per-pipeline standings. Read-only.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/coding-pipelines/ledger');
    return text(JSON.stringify(j, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

/**
 * Register the curated native subset, then the single dispatcher that reaches
 * every tool. Order matters: the dispatcher's enum is built from the full
 * definition map, so it must be assembled AFTER all `defineTool` calls above.
 */
for (const name of NATIVE_TOOLS) registerNativeTool(name);

server.registerTool(
  'recourse_call',
  {
    title: 'Call any Recourse tool',
    description:
      'Invoke any Recourse tool by name. Use this for tools that are not registered as ' +
      'first-class tools on this server. Mutating tools require RECOURSE_API_SECRET.',
    inputSchema: {
      name: z
        .enum([...TOOL_DEFS.keys()] as [string, ...string[]])
        .describe('The Recourse tool to call'),
      args: z.record(z.string(), z.unknown()).optional().describe('Arguments for the tool'),
    },
  },
  (async ({ name, args }: { name: string; args?: Record<string, unknown> }) => {
    const def = TOOL_DEFS.get(name);
    if (!def) {
      // Unreachable via the enum, but a hand-written call could still name a
      // tool that was removed; say so rather than throwing.
      return text(`unknown tool: ${name}`);
    }
    // Validate the arguments against the TARGET tool's own schema, exactly as
    // the native path does.
    //
    // Note what is deliberately NOT done here: `args ?? {}`. The native MCP
    // path validates the raw `arguments` value, so an OMITTED argument object
    // fails against an object schema. Substituting `{}` for it made this
    // dispatcher fail OPEN — a dispatched `run_forge` with no arguments ran the
    // forge, where the native path refused it. A mutating route must never be
    // more permissive through the dispatcher than it is natively.
    const schema = inputSchemaFor(def.config);
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path?.length ? issue.path.join('.') : 'arguments';
      throw new Error(
        `${name}: invalid arguments (${where}: ${issue?.message ?? 'schema mismatch'})`,
      );
    }
    try {
      return await def.handler(parsed.data);
    } catch (e: any) {
      return text(`${name} failed: ${e?.message ?? e}`);
    }
  }) as never,
);

const transport = new StdioServerTransport();
await server.connect(transport);
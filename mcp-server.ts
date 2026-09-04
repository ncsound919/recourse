/**
 * Recourse MCP server �?" exposes the live Recourse system to any MCP host
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
    const res = await fetch(`${API}${path}`, { signal: ctrl.signal });
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
    return { ok: false, status: 503, data: { success: false, error: `RECOURSE_API_SECRET is not set in the MCP environment — cannot authenticate a write (server is fail-closed)` } };
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

server.registerTool('recourse.status', {
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

server.registerTool('recourse.registry', {
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

server.registerTool('recourse.upgrade_report', {
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

server.registerTool('recourse.capabilities', {
  title: 'Recourse capability adoption',
  description: 'Which self-hosted tools Recourse adopted to back its own internal operations (dogfood).',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/capabilities');
    return text(JSON.stringify({ adoptions: j?.adoptions, served: j?.served }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

server.registerTool('recourse.selfhosted', {
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

server.registerTool('recourse.exportable', {
  title: 'Recourse tools that can be exported as skills',
  description: 'List verified registry tools that carry real source + suite and can therefore be exported as SKILL.md folders.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/skills/exportable');
    return text(JSON.stringify({ exportRoot: j?.exportRoot, count: j?.count, tools: j?.tools }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

server.registerTool('recourse.export_skill', {
  title: 'Export a verified tool as a SKILL.md folder',
  description: 'Write a verified registry tool into the configured export root as an open SKILL.md folder (source + test suite embedded). Mutating: requires RECOURSE_API_SECRET.',
  inputSchema: { toolName: z.string().describe('Name of the verified registry tool to export'), outRoot: z.string().optional().describe('Optional override directory for the export') },
}, async ({ toolName, outRoot }) => {
  if (!toolName) return text('toolName is required.');
  const r = await apiPost('/api/recourse/skills/export', { toolName, outRoot });
  if (!r.ok) return text(`export_skill failed (HTTP ${r.status}): ${r.data?.error ?? 'see server log'}`);
  return text(JSON.stringify({ ok: true, toolName: r.data.toolName, version: r.data.version, dir: r.data.dir, files: r.data.files }, null, 2));
});

server.registerTool('recourse.import_skill', {
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

server.registerTool('recourse.inspect_gene', {
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

server.registerTool('recourse.evolve', {
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

server.registerTool('recourse.promote', {
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

server.registerTool('recourse.compose', {
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

server.registerTool('recourse.rate_track', {
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

server.registerTool('recourse.learned', {
  title: 'Show the composer learner state',
  description: 'Read per-style learned quality biases, episodes, and leaderboard so you can see how ratings are shaping composition.',
}, async () => {
  try {
    const j = await apiGet('/api/recourse/compose/learned');
    return text(JSON.stringify({ styles: j?.styles, leaderboard: j?.leaderboard, adjustments: j?.adjustments }, null, 2));
  } catch (e: any) { return text(`Recourse unreachable: ${e.message}`); }
});

const transport = new StdioServerTransport();
await server.connect(transport);
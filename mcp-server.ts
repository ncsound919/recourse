/**
 * Recourse MCP server — exposes the live Recourse system to any MCP host
 * (Claude, Cursor, opencode, DSH...) as read-only tools over stdio.
 *
 * Tools talk to the Recourse HTTP API so they always reflect live state, not a
 * stale file. If Recourse is unreachable a tool returns an honest error string
 * — it never fabricates state.
 *
 * Run:   npx tsx mcp-server.ts
 * Config an MCP server with a command pointing at this file and stdio transport.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const API = process.env.RECOURSE_API_URL || 'http://localhost:3050';
const VERSION = '0.1.0';

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

const transport = new StdioServerTransport();
await server.connect(transport);

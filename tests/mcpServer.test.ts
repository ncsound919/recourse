import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(__dirname, '..');
const tsxCli = path.join(cwd, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const serverFile = path.join(cwd, 'mcp-server.ts');

describe('Recourse MCP server (stdio)', () => {
  it('exposes the recourse.* tool set over a real MCP stdio handshake', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsxCli, serverFile],
      cwd,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'test-client', version: '0.1.0' });
    await client.connect(transport);

    const tools = await client.listTools();
    const names = tools.tools.map((t: any) => t.name).sort();
    expect(names).toContain('recourse.status');
    expect(names).toContain('recourse.registry');
    expect(names).toContain('recourse.upgrade_report');
    expect(names).toContain('recourse.capabilities');
    expect(names).toContain('recourse.selfhosted');
    // Phase 4 distribution surface.
    expect(names).toContain('recourse.exportable');
    expect(names).toContain('recourse.export_skill');
    expect(names).toContain('recourse.import_skill');
    expect(names).toContain('recourse.inspect_gene');

    // A tools/call round-trips regardless of whether the live Recourse API is
    // up: the handler returns an MCP text result either way (state or an
    // honest "unreachable" note), so the response must be shaped content.
    const res = await client.callTool({ name: 'recourse.status', arguments: {} });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0]).toHaveProperty('type', 'text');

    // A write tool with no secret configured reports the fail-closed state as
    // text — it never throws and never pretends the write happened.
    const writeRes = await client.callTool({ name: 'recourse.export_skill', arguments: { toolName: 'whatever' } });
    expect(Array.isArray(writeRes.content)).toBe(true);
    expect(String(writeRes.content[0].text)).toContain('RECOURSE_API_SECRET is not set');

    await client.close();
    transport.close();
  }, 30000);
});

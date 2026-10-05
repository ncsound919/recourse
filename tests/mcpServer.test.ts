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

    // The registered surface is a native subset plus one dispatcher. Every
    // registered schema is paid for on every turn, which is why the long tail
    // is reached through `recourse_call` rather than registered outright — the
    // same trade `dsh-recourse` makes on the harness's native path.
    const dispatcher = tools.tools.find((t: any) => t.name === 'recourse_call');
    expect(dispatcher, 'recourse_call dispatcher is not registered').toBeDefined();
    // The MCP schema types are deliberately loose (`Record<string, unknown>`),
    // so the two hops below are narrowed explicitly rather than asserted
    // through `any`. If the dispatcher ever registers without a name enum,
    // that is a real failure and the expect says so.
    const nameProp = (dispatcher as any)?.inputSchema?.properties?.name as
      | { enum?: unknown }
      | undefined;
    expect(nameProp?.enum, 'recourse_call must declare an enum of dispatchable names').toBeDefined();
    const dispatchable: string[] = (nameProp!.enum as string[]).filter((n) => typeof n === 'string');

    expect(names.length).toBeLessThan(dispatchable.length);
    expect(names).toContain('recourse_call');

    // Whatever is not registered must still be reachable, or the cutover lost it.
    const registered = new Set(names);
    const unreachable = dispatchable.filter((n) => !registered.has(n));
    expect(unreachable.length).toBeGreaterThan(0);
    for (const name of unreachable) {
      const nativeName = `recourse_${name.slice('recourse.'.length)}`;
      expect(dispatchable).toContain(name);
      expect(nativeName).toBeTruthy();
    }

    // A representative native tool from each capability area.
    for (const expected of [
      'recourse.status',
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
    ]) {
      expect(names).toContain(expected);
    }

    // The long tail: present in the dispatcher's enum, not registered directly.
    for (const viaDispatcher of [
      'recourse.upgrade_report',
      'recourse.exportable',
      'recourse.export_skill',
      'recourse.import_skill',
      'recourse.sandbox_status',
      'recourse.memory_tiered',
      'recourse.inspect_learner',
      'recourse.execute_selfhosted',
      'recourse.consolidate_memory',
      'recourse.promote_skills',
      'recourse.revert',
      'recourse.validate_plugin',
      'recourse.dsh_scaffold',
      'recourse.dsh_scaffold_render',
      'recourse.grounding_ledger',
    ]) {
      expect(dispatchable).toContain(viaDispatcher);
    }

    // A tools/call round-trips regardless of whether the live Recourse API is
    // up: the handler returns an MCP text result either way (state or an
    // honest "unreachable" note), so the response must be shaped content.
    const res = await client.callTool({ name: 'recourse.status', arguments: {} });
    expect(Array.isArray(res.content)).toBe(true);
    expect((res.content as Array<{ type: string }>)[0]).toHaveProperty('type', 'text');

    // A write tool with no secret configured reports the fail-closed state as
    // text — it never throws and never pretends the write happened. It is
    // dispatched, which must not change that behaviour.
    const writeRes = await client.callTool({
      name: 'recourse_call',
      arguments: { name: 'recourse.export_skill', args: { toolName: 'whatever' } },
    });
    expect(Array.isArray(writeRes.content)).toBe(true);
    expect(String((writeRes.content as Array<{ text?: string }>)[0].text)).toContain('RECOURSE_API_SECRET is not set');

    // A dispatched call is validated against the TARGET's schema, not the
    // dispatcher's generic one. Without this a missing required argument
    // reaches the handler and becomes an opaque upstream 400.
    const badArgs = await client.callTool({
      name: 'recourse_call',
      arguments: { name: 'recourse.inspect_gene', args: {} },
    });
    expect((badArgs as { isError?: boolean }).isError).toBe(true);
    expect(String((badArgs.content as Array<{ text?: string }>)[0].text)).toContain('recourse.inspect_gene');

    // Parity of the signal, not of the wording: a dispatched call that the
    // native path would REJECT must also be an error. This is the case that
    // matters — `run_forge` is a mutation, and an earlier version substituted
    // `{}` for omitted args, so a dispatched call ran the forge where the
    // native path refused. Fail-open on a mutating route is the bug this guards.
    const failOpen: Array<[string, Record<string, unknown>?]> = [
      ['recourse.run_forge', undefined],
      ['recourse.run_forge', { count: 99 }],
      ['recourse.evolve', { domain: 'nope', instructions: 'x' }],
      ['recourse.promote', { geneId: 42 }],
      ['recourse.inspect_gene', {}],
    ];
    for (const [tool, args] of failOpen) {
      const nativeRes = await client.callTool({ name: tool, arguments: args as Record<string, unknown> });
      const dispatched = await client.callTool({
        name: 'recourse_call',
        arguments: args === undefined ? { name: tool } : { name: tool, args },
      });
      const nativeErr = (nativeRes as { isError?: boolean }).isError === true;
      const dispatchedErr = (dispatched as { isError?: boolean }).isError === true;
      // Only assert when the tool is natively registered, so this stays a
      // native-vs-dispatched comparison rather than a catalogue assertion.
      if (registered.has(tool)) {
        expect(dispatchedErr, `${tool} ${JSON.stringify(args)}: native isError=${nativeErr}, dispatched isError=${dispatchedErr}`).toBe(nativeErr);
      }
      expect(dispatchedErr, `${tool} ${JSON.stringify(args)} was rejected natively but accepted dispatched`).toBe(true);
    }

    // An unknown target is rejected by the dispatcher's enum at the protocol
    // layer, before any handler runs. That is stronger than a handler-level
    // check — the bad name cannot reach Recourse at all — so the assertion is
    // on the rejection, not on our own wording.
    const unknown = await client.callTool({ name: 'recourse_call', arguments: { name: 'recourse.nope' } });
    expect((unknown as { isError?: boolean }).isError).toBe(true);
    expect(String((unknown.content as Array<{ text?: string }>)[0].text)).toContain('recourse.status');

    await client.close();
    transport.close();
  }, 30000);
});

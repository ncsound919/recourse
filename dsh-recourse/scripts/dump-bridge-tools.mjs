/**
 * Dump the MCP bridge's full tool contract as JSON.
 *
 * This is the source of truth for the native migration. Reading it off the live
 * `tools/list` response is far more reliable than parsing mcp-server.ts by hand:
 * it is exactly what the harness saw, already schema-normalised.
 *
 *   node scripts/dump-bridge-tools.mjs > bridge-tools.json
 */

import { writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const RECOURSE_ROOT = 'C:/Users/User/Downloads/BUSINESS/INFRASTRUCTURE/recourse';
const API_BASE = process.env.RECOURSE_API_URL ?? 'http://127.0.0.1:3050';

const client = new Client({ name: 'dsh-recourse-dump', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: ['node_modules/tsx/dist/cli.mjs', 'mcp-server.ts'],
  cwd: RECOURSE_ROOT,
  env: { ...process.env, RECOURSE_API_URL: API_BASE },
});

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync('bridge-tools.json', `${JSON.stringify(sorted, null, 2)}\n`);
  console.error(`dumped ${sorted.length} tools to bridge-tools.json`);
} finally {
  await client.close().catch(() => {});
}
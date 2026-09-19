/**
 * Registry hygiene CLI.
 *
 *   npx tsx scripts/registry-hygiene.ts <registry.json>
 *
 * Reads a registry JSON file (either a bare array or an object with a
 * `registry` / `tools` array, as served by `GET /api/recourse/registry`) and
 * prints the `hygieneReport` as JSON.
 */
import { readFileSync } from 'node:fs';
import { hygieneReport, type RegistryToolLike } from '../src/lib/registryHygiene.js';

function extractTools(parsed: unknown): RegistryToolLike[] | null {
  if (Array.isArray(parsed)) return parsed as RegistryToolLike[];
  if (!parsed || typeof parsed !== 'object') return null;
  const container = parsed as { registry?: unknown; tools?: unknown };
  if (Array.isArray(container.registry)) return container.registry as RegistryToolLike[];
  if (Array.isArray(container.tools)) return container.tools as RegistryToolLike[];
  return null;
}

function main(argv: string[]): number {
  const file = argv[0];
  if (!file) {
    console.error('usage: tsx scripts/registry-hygiene.ts <registry.json>');
    return 1;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`failed to read/parse ${file}: ${(err as Error).message}`);
    return 1;
  }

  const tools = extractTools(parsed);
  if (!tools) {
    console.error(`no registry array found in ${file}`);
    return 1;
  }

  console.log(JSON.stringify(hygieneReport(tools), null, 2));
  return 0;
}

process.exit(main(process.argv.slice(2)));

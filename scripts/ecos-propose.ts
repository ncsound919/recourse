/**
 * ECOS proposal driver — lets Recourse propose IDS improvements for Overlay
 * Environmental initiatives, applied only through the ECOS gate.
 *
 *   npx tsx scripts/ecos-propose.ts
 *
 * Honesty contract:
 *  - If the local model is offline, it reports that and proposes NOTHING.
 *  - The proposal must keep code/id stable; the ECOS gate then verifies it.
 *    A rejected proposal is reported with the verifier's real reasons.
 *  - It never writes an IDS itself.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chatComplete, checkOnline, extractJsonBlock, type ChatMessage } from '../src/lib/modelProvider.js';
import { applyEcosIdsPatch, ecosRepoRoot, ecosGateAvailable } from '../src/lib/ecosDevelopment.js';

const DRIVER_ID = 'recourse-ecos';

interface RegistryEntry {
  rel: string;
  data: Record<string, any>;
  gaps: number;
}

function loadRegistry(): RegistryEntry[] {
  const dir = join(ecosRepoRoot(), 'initiatives', 'registry');
  if (!existsSync(dir)) {
    console.error(`no registry at ${dir}`);
    process.exit(2);
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const gaps =
        (data.hardware?.individual?.missing?.length ?? 0) + (data.hardware?.enterprise?.missing?.length ?? 0);
      return { rel: `initiatives/registry/${f}`, data, gaps };
    });
}

async function main(): Promise<void> {
  if (!ecosGateAvailable()) {
    console.error(`ECOS gate not found under ${ecosRepoRoot()} (set ECOS_REPO)`);
    process.exit(1);
  }

  const ranked = loadRegistry()
    .filter((e) => e.gaps > 0)
    .sort((a, b) => b.gaps - a.gaps);
  if (ranked.length === 0) {
    console.log('no draft initiatives with gaps — nothing to propose');
    return;
  }

  const target = ranked[0];
  const online = await checkOnline(true);
  console.log(`target: ${target.data.code} (${target.gaps} gaps) | model online: ${online}`);

  if (!online) {
    console.log('model offline: no proposal generated (honest no-op). Start the configured model (MODEL_BASE_URL/MODEL_NAME).');
    return;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a hardware specification editor. Output ONE JSON object only, no prose, no code fences.' },
    {
      role: 'user',
      content: [
        'Update this ECOS Initiative Development Spec to fill as many hardware gaps as you can with real, sourceable components.',
        'Return the COMPLETE updated IDS JSON (identical shape). Rules:',
        '- Keep code, id, name, type, phase, stage, tracks, software unchanged.',
        '- hardware.individual.mode must be "community"; hardware.enterprise.mode must be "commercial".',
        '- Every BOM line: part, qty (integer >=1), unitUsd (number), supplier, source.',
        '- Only set a tier status to "verified" if you fully specify it (priced+sourced BOM, power, buildHours, verification[]); otherwise keep "draft" and list missing[].',
        '- founding.parent is "Overlay 365", founding.division is "Overlay Environmental".',
        '',
        JSON.stringify(target.data, null, 2),
      ].join('\n'),
    },
  ];

  const res = await chatComplete(messages, { json: true, temperature: 0.2 });
  if (!res.ok || !res.content) {
    console.log(`model did not answer (status ${res.status}${res.error ? `: ${res.error}` : ''}) — no proposal`);
    return;
  }

  const block = extractJsonBlock(res.content);
  if (!block) {
    console.log('model output had no parseable JSON — no proposal');
    return;
  }
  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(block);
  } catch (e) {
    console.log(`proposal parse failed: ${(e as Error).message}`);
    return;
  }
  if (parsed.code !== target.data.code || parsed.id !== target.data.id) {
    console.log('proposal changed code/id — refused');
    return;
  }

  const result = applyEcosIdsPatch({ driverId: DRIVER_ID, file: target.rel, source: JSON.stringify(parsed, null, 2) });
  console.log(result.applied ? `APPLIED ${target.data.code} (token ${result.token})` : `REJECTED ${target.data.code}: ${result.reason}`);
  if (result.raw) console.log(result.raw.slice(0, 1200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

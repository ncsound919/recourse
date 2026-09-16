/**
 * gen-v1-client.ts — writes `src/lib/v1Client.generated.ts` from the /v1 route
 * table in `src/lib/openapiV1.ts`. Run with `npx tsx scripts/gen-v1-client.ts`
 * whenever V1_ROUTES changes. The generated file is committed so consumers do
 * not need a codegen step at build time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateV1ClientSource } from '../src/lib/openapiV1.js';

const out = path.join(process.cwd(), 'src', 'lib', 'v1Client.generated.ts');
fs.writeFileSync(out, generateV1ClientSource(), 'utf-8');
console.log(`[gen-v1-client] wrote ${out}`);

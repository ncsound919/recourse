import { describe, it } from 'vitest';
import { z } from 'zod';

describe('debug zod2', () => {
  it('converts', () => {
    const s = z.object({ x: z.number() });
    let out: any;
    try { out = (z as any).toJSONSchema ? (z as any).toJSONSchema(s) : 'no toJSONSchema'; } catch (e) { out = 'ERR: ' + (e as any).message; }
    require('fs').writeFileSync('debug_zod2_out.txt', JSON.stringify(out, null, 2));
  });
});

import { describe, it } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

describe('debug zod', () => {
  it('converts', () => {
    const s = z.object({ x: z.number() });
    const j = zodToJsonSchema(s);
    require('fs').writeFileSync('debug_zod_out.txt', JSON.stringify(j, null, 2));
  });
});

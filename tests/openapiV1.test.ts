import { describe, it, expect, afterEach } from 'vitest';
import { buildV1OpenApi, listV1Operations, generateV1ClientSource, V1_ROUTES } from '../src/lib/openapiV1';
import fs from 'node:fs';
import path from 'node:path';

describe('v1 openapi contract', () => {
  it('documents every route with an api-key security scheme', () => {
    const spec = buildV1OpenApi('https://api.example.test/');
    expect(spec.servers[0].url).toBe('https://api.example.test');
    expect(spec.components.securitySchemes.apiKey).toMatchObject({ type: 'apiKey', in: 'header', name: 'x-api-key' });
    for (const route of V1_ROUTES) {
      const method = route.method.toLowerCase();
      expect(spec.paths[route.path]?.[method]).toBeTruthy();
      expect(spec.paths[route.path][method].operationId).toBe(route.name.replace(/\./g, '_'));
    }
  });

  it('lists operations sorted by path then method', () => {
    const ops = listV1Operations();
    expect(ops.length).toBe(V1_ROUTES.length);
    const sorted = [...ops].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    expect(ops).toEqual(sorted);
    expect(ops.find((o) => o.path === '/v1/billing/webhook')!.auth).toBe(false);
  });

  it('keeps the committed generated client in sync with the route table', () => {
    const committed = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'v1Client.generated.ts'), 'utf-8');
    expect(committed).toBe(generateV1ClientSource());
  });
});

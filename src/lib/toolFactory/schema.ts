import { z } from 'zod';
import type { ComponentTemplateParam } from '../../types';

/**
 * Convert Recourse's param list into a JSON Schema object suitable for MCP
 * `tools/list` inputSchema and OpenAPI. Keeps a single source of truth.
 */
export function paramsToJsonSchema(params: ComponentTemplateParam[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    let s: Record<string, unknown>;
    switch (p.type) {
      case 'number':
        s = { type: 'number' };
        if (p.min !== undefined) s.minimum = p.min;
        if (p.max !== undefined) s.maximum = p.max;
        break;
      case 'boolean':
        s = { type: 'boolean' };
        break;
      case 'select':
        s = { type: 'string', enum: p.options ?? [] };
        break;
      case 'string':
      default:
        s = { type: 'string' };
        break;
    }
    if (p.description) s.description = p.description;
    if (p.default !== undefined) s.default = p.default;
    properties[p.id] = s;
    if (p.default === undefined) required.push(p.id);
  }
  const schema: Record<string, unknown> = {
    type: 'object',
    properties,
    additionalProperties: false
  };
  if (required.length > 0) schema.required = required;
  return schema;
}

/**
 * Convert a Zod schema to JSON Schema (for tools that declare Zod directly).
 */
export function zodSchemaToJson(schema: z.ZodTypeAny): Record<string, unknown> {
  return (z as any).toJSONSchema(schema) as Record<string, unknown>;
}

export { z };

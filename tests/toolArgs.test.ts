import { describe, it, expect } from 'vitest';
import { normalizeToolArgs, validateToolArgs, matchProperty, buildRepairMessages } from '../src/lib/toolArgs.js';

const SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    limit: { type: 'number' },
    level: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['query'],
  additionalProperties: false,
};

describe('normalizeToolArgs', () => {
  it('maps common aliases onto canonical keys', () => {
    expect(normalizeToolArgs(SCHEMA, { q: 'x' })).toEqual({ query: 'x' });
    expect(normalizeToolArgs(SCHEMA, { top_k: 5 })).toMatchObject({ limit: 5 });
    expect(normalizeToolArgs(SCHEMA, { search: 'y', max: 2 })).toEqual({ query: 'y', limit: 2 });
  });

  it('drops unknown keys when the schema is strict', () => {
    expect(normalizeToolArgs(SCHEMA, { query: 'a', bogus: 1 })).toEqual({ query: 'a' });
  });

  it('does not overwrite an explicitly provided canonical key', () => {
    expect(normalizeToolArgs(SCHEMA, { query: 'a', q: 'b' }).query).toBe('a');
  });

  it('matchProperty tolerates case and snake/camel', () => {
    expect(matchProperty('Query', ['query'])).toBe('query');
    expect(matchProperty('topK', ['top_k'])).toBe('top_k');
    expect(matchProperty('nope', ['query'])).toBeNull();
  });
});

describe('validateToolArgs', () => {
  it('accepts a valid object', () => {
    expect(validateToolArgs(SCHEMA, { query: 'x', limit: 3 }).ok).toBe(true);
  });

  it('reports missing required, wrong type, bad enum and extra keys', () => {
    expect(validateToolArgs(SCHEMA, {}).errors.join(' ')).toMatch(/missing required/);
    expect(validateToolArgs(SCHEMA, { query: 5 }).errors.join(' ')).toMatch(/wrong type/);
    expect(validateToolArgs(SCHEMA, { query: 'x', level: 'loud' }).errors.join(' ')).toMatch(/must be one of/);
    expect(validateToolArgs(SCHEMA, { query: 'x', extra: 1 }).errors.join(' ')).toMatch(/unknown argument/);
  });
});

describe('buildRepairMessages', () => {
  it('produces a strict-JSON repair prompt carrying the schema and error', () => {
    const msgs = buildRepairMessages('search_docs', SCHEMA, '{"q":1}', 'missing required argument "query"');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/ONLY a JSON object/);
    const payload = JSON.parse(msgs[1].content);
    expect(payload.tool).toBe('search_docs');
    expect(payload.problem).toMatch(/missing required/);
  });
});

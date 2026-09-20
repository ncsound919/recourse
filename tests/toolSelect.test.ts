import { describe, it, expect } from 'vitest';
import {
  selectTools,
  findMoreTools,
  searchToolsSpec,
  scoreToolSpec,
  isSearchTool,
  SEARCH_TOOLS_NAME,
} from '../src/lib/toolSelect.js';
import { cleanTaskQuery, queryWords, wordMatches } from '../src/lib/textQuery.js';
import type { AgentToolSpec } from '../src/lib/agentTools.js';

const spec = (name: string, description: string): AgentToolSpec => ({
  name,
  description,
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  source: 'system',
  target: name,
});

const REGISTRY = [
  spec('get_weather', 'Get the current weather for a city'),
  spec('send_email', 'Send an email to a recipient'),
  spec('search_docs', 'Search documentation for a query'),
  spec('create_event', 'Create a calendar event'),
  spec('set_volume', 'Set the output volume'),
];

describe('textQuery', () => {
  it('cleans queries and splits identifiers/camelCase', () => {
    expect(cleanTaskQuery('Please get the WEATHER for Paris!')).toContain('weather');
    expect(cleanTaskQuery('a b c')).toBe('');
    expect(queryWords('getWeather now')).toEqual(['get', 'weather', 'now']);
    expect(wordMatches('weather', 'weathers')).toBe(true);
  });
});

describe('selectTools', () => {
  it('keeps only task-relevant tools and drops unrelated ones', () => {
    const picked = selectTools(REGISTRY, 'What is the weather in Paris?', { limit: 8, includeSearch: true });
    const names = picked.map((s) => s.name);
    expect(names).toContain(SEARCH_TOOLS_NAME);
    expect(names).toContain('get_weather');
    expect(names).not.toContain('send_email');
  });

  it('scoreToolSpec ranks name hits above description hits', () => {
    const tokens = cleanTaskQuery('weather').split(' ');
    expect(scoreToolSpec(REGISTRY[0], tokens)).toBeGreaterThan(0);
    expect(scoreToolSpec(REGISTRY[1], tokens)).toBe(0);
  });

  it('falls back to the catalog when nothing matches (never zero tools)', () => {
    const picked = selectTools(REGISTRY, 'zzz qqq', { limit: 3 });
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThanOrEqual(3);
  });

  it('findMoreTools excludes active tools and the search meta-tool', () => {
    const more = findMoreTools(REGISTRY, 'send an email', new Set(['get_weather']), 5);
    expect(more.map((s) => s.name)).toContain('send_email');
    expect(more.map((s) => s.name)).not.toContain('get_weather');
    expect(isSearchTool(searchToolsSpec().name)).toBe(true);
  });
});

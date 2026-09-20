import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  configureSkillAwareness,
  resetSkillAwareness,
  findRelevantSkills,
  buildSkillContext,
  lastUserText,
  cleanTaskQuery,
  skillAwareChat,
} from '../src/lib/skillContext.js';
import type { SkillDef } from '../src/skills/types.js';
import type { ChatCompleteResult, ChatMessage } from '../src/lib/modelProvider.js';
import type { SkillToolProvider } from '../src/lib/skillTools.js';

const skill = (name: string, description: string): SkillDef => ({
  id: `lib:${name}`,
  name,
  description,
  rootId: 'lib',
  rel: `${name}/SKILL.md`,
  dir: name,
  words: 5,
  excerpt: '',
  topics: [],
  hasScripts: false,
  files: [],
  frontmatterKeys: ['name'],
  mtime: 0,
});

const CATALOG = [
  skill('seo-audit', 'Audit a website for technical SEO issues'),
  skill('react-patterns', 'React hooks and component patterns'),
  skill('pdf', 'Read, merge and fill PDF files'),
];

const completion = (content: string | null, extra: Record<string, unknown> = {}): ChatCompleteResult => ({
  ok: true,
  status: 'online',
  model: 'test',
  latencyMs: 1,
  content,
  ...extra,
});

const provider = (): SkillToolProvider => ({
  list: async () => [{ name: 'list', description: 'List skills', parameters: { type: 'object', properties: {} }, target: 'list' }],
  invoke: async () => ({ ok: true, result: { listed: true } }),
});

beforeEach(() => resetSkillAwareness());
afterEach(() => {
  resetSkillAwareness();
  vi.unstubAllEnvs();
});

describe('findRelevantSkills + buildSkillContext', () => {
  it('ranks the catalog against the task text', () => {
    const hits = findRelevantSkills(CATALOG, 'audit seo', 3);
    expect(hits.map((s) => s.name)).toContain('seo-audit');
    expect(findRelevantSkills(CATALOG, '', 3)).toEqual([]);
  });

  it('cleans the query of stopwords and short tokens', () => {
    expect(cleanTaskQuery('Please use the PDF skill for this task')).toBe('pdf skill task');
    expect(cleanTaskQuery('a b c')).toBe('');
  });

  it('builds a context block with an optional tool hint and inlined body', () => {
    const block = buildSkillContext([CATALOG[0]], {
      toolHint: true,
      includeBody: true,
      readSkill: (s) => `BODY:${s.name}`,
    });
    expect(block).toContain('seo-audit');
    expect(block).toContain('skills_read');
    expect(block).toContain('BODY:seo-audit');
    expect(buildSkillContext([], {})).toBe('');
  });

  it('derives the task text from the last user message', () => {
    const messages: ChatMessage[] = [{ role: 'system', content: 's' }, { role: 'user', content: 'first' }, { role: 'user', content: 'last' }];
    expect(lastUserText(messages)).toBe('last');
  });
});

describe('skillAwareChat', () => {
  it('is a passthrough when the catalog is empty', async () => {
    const chat = vi.fn(async (_m: ChatMessage[], _o?: Record<string, unknown>) => completion('plain'));
    configureSkillAwareness({ getCatalog: () => [], provider: provider(), chat });
    const msgs: ChatMessage[] = [{ role: 'user', content: 'audit seo' }];
    const res = await skillAwareChat(msgs, { json: true });
    expect(res.content).toBe('plain');
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[0][0]).toEqual(msgs);
  });

  it('is a passthrough when nothing matches the task', async () => {
    const chat = vi.fn(async (_m: ChatMessage[], _o?: Record<string, unknown>) => completion('plain'));
    configureSkillAwareness({ getCatalog: () => CATALOG, provider: provider(), chat });
    const res = await skillAwareChat([{ role: 'user', content: 'quantum chromodynamics lagrangian' }], {});
    expect(res.content).toBe('plain');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('injects the matched skill but skips the tool loop when tools are disabled', async () => {
    vi.stubEnv('AGENT_SKILLS_AUTONOMY_TOOLS', '0');
    const chat = vi.fn(async (_m: ChatMessage[], _o?: Record<string, unknown>) => completion('{"answer":1}'));
    configureSkillAwareness({ getCatalog: () => CATALOG, provider: provider(), chat, readSkill: (s) => `BODY:${s.name}` });
    const res = await skillAwareChat([{ role: 'system', content: 'sys' }, { role: 'user', content: 'audit seo' }], { json: true });
    expect(res.content).toBe('{"answer":1}');
    expect(chat).toHaveBeenCalledTimes(1);
    const sent = chat.mock.calls[0][0] as ChatMessage[];
    expect(sent[0].content).toContain('seo-audit');
    expect(sent[0].content).toContain('sys');
  });

  it('runs the skill tool loop and returns the model final answer', async () => {
    const chat = vi
      .fn(async (_m: ChatMessage[], _o?: Record<string, unknown>) => completion(''))
      .mockResolvedValueOnce(completion(null, {
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'skills_list', arguments: '{"query":"seo"}' } }],
      }))
      .mockResolvedValueOnce(completion('Final answer using the skill'));
    configureSkillAwareness({ getCatalog: () => CATALOG, provider: provider(), chat });
    const res = await skillAwareChat([{ role: 'user', content: 'audit seo' }], {});
    expect(res.content).toBe('Final answer using the skill');
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('falls back to a strict JSON call when the tool loop ends without JSON', async () => {
    const chat = vi
      .fn(async (_m: ChatMessage[], _o?: Record<string, unknown>) => completion(''))
      .mockResolvedValueOnce(completion(null, {
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'skills_list', arguments: '{}' } }],
      }))
      .mockResolvedValueOnce(completion('sorry, no json')) // loop completes without JSON
      .mockResolvedValueOnce(completion('{"sourceCode":"x"}')); // strict fallback
    configureSkillAwareness({ getCatalog: () => CATALOG, provider: provider(), chat });
    const res = await skillAwareChat([{ role: 'user', content: 'audit seo' }], { json: true });
    expect(res.content).toBe('{"sourceCode":"x"}');
    expect(chat).toHaveBeenCalledTimes(3);
    // The final fallback call carries json:true.
    expect((chat.mock.calls[2][1] as any).json).toBe(true);
  });

  it('does not report a max_turns interstitial as a success for non-JSON callers', async () => {
    vi.stubEnv('AGENT_SKILLS_AUTONOMY_TURNS', '2');
    const toolCall = {
      finishReason: 'tool_calls',
      toolCalls: [{ id: 'c1', type: 'function', function: { name: 'skills_list', arguments: '{}' } }],
    };
    const chat = vi
      .fn(async (_m: ChatMessage[], _o?: Record<string, unknown>) => completion(''))
      .mockResolvedValueOnce(completion('preamble one', toolCall))
      .mockResolvedValueOnce(completion('preamble two', toolCall))
      .mockResolvedValueOnce(completion('final plain answer'));
    configureSkillAwareness({ getCatalog: () => CATALOG, provider: provider(), chat });
    const res = await skillAwareChat([{ role: 'user', content: 'audit seo' }], {});
    expect(res.content).toBe('final plain answer');
    expect(chat).toHaveBeenCalledTimes(3);
  });

  it('reports offline without a second model call', async () => {
    const chat = vi.fn(async (_m: ChatMessage[], _o?: Record<string, unknown>) => ({
      ok: false,
      status: 'offline' as const,
      model: 'test',
      latencyMs: 1,
      content: null,
      error: 'ECONNREFUSED',
    }));
    configureSkillAwareness({ getCatalog: () => CATALOG, provider: provider(), chat });
    const res = await skillAwareChat([{ role: 'user', content: 'audit seo' }], {});
    expect(res.status).toBe('offline');
    expect(res.ok).toBe(false);
    expect(chat).toHaveBeenCalledTimes(1);
  });
});

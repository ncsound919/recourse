/**
 * skillContext — makes Recourse's autonomous generation skill-aware.
 *
 * For every self-improvement / research task, Recourse searches the on-disk
 * skill libraries for relevant skills and injects a compact context block into
 * the system prompt. Where it is safe (non-strict-JSON, or when the model is
 * allowed to call tools), the generator is additionally run through the bounded
 * skill tool loop so it can call `skills_list` / `skills_read` / `skills_run`
 * on its own. Strict-JSON paths that cannot tolerate extra turns fall back to a
 * plain `chatComplete` with the injected context, so nothing is broken.
 *
 * Honesty: with no configured catalog or no relevant match, this is a plain
 * `chatComplete` — it never injects a skill that does not exist and never
 * fabricates a tool result.
 *
 * Env:
 *   AGENT_SKILLS_AUTONOMY=0            disable skill awareness for autonomy
 *   AGENT_SKILLS_AUTONOMY_TOOLS=0      inject only (no tool loop)
 *   AGENT_SKILLS_AUTONOMY_JSON_TOOLS=0 never use the tool loop for json:true
 *   AGENT_SKILLS_AUTONOMY_TURNS=3      max turns per tool loop
 *   AGENT_SKILLS_AUTONOMY_MAX_SKILLS=3 max skills injected
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ChatCompleteOptions, ChatCompleteResult, ChatMessage } from './modelProvider.js';
import { chatComplete, extractJsonBlock } from './modelProvider.js';
import { searchSkills } from '../skills/index.js';
import type { SkillDef } from '../skills/types.js';
import type { SkillToolProvider } from './skillTools.js';
import { createAgentToolRegistry, type AgentToolRegistry } from './agentTools.js';
import { runToolCallingAgent } from './toolCalling.js';
import { cleanTaskQuery, queryWords, wordMatches } from './textQuery.js';

export { cleanTaskQuery };

type ChatFn = (messages: ChatMessage[], opts: ChatCompleteOptions) => Promise<ChatCompleteResult>;

export interface SkillAwarenessConfig {
  /** Live skill catalog (may be empty before the first scan). */
  getCatalog: () => SkillDef[];
  /** Skill tool provider (list/read/file/run). */
  provider: SkillToolProvider;
  /** Model call; defaults to the shared provider's chatComplete. */
  chat?: ChatFn;
  /** Read a skill's SKILL.md body (for inlining the top match). */
  readSkill?: (s: SkillDef) => string | null;
}

export interface SkillContextOptions {
  limit?: number;
  includeBody?: boolean;
  maxBodyChars?: number;
  /** Advertise the skills_* tools in the block. */
  toolHint?: boolean;
  readSkill?: (s: SkillDef) => string | null;
}

let config: SkillAwarenessConfig | null = null;
let cachedRegistry: AgentToolRegistry | null = null;
let cachedRegistryProvider: SkillToolProvider | null = null;

export function configureSkillAwareness(cfg: SkillAwarenessConfig): void {
  config = cfg;
  cachedRegistry = null;
  cachedRegistryProvider = null;
}

/** Test helper: clear the configured awareness. */
export function resetSkillAwareness(): void {
  config = null;
  cachedRegistry = null;
  cachedRegistryProvider = null;
}

/** Rank the catalog against a task string. A skill is only considered a match
 *  when a task token appears in its NAME or a detected TOPIC — keeps autonomous
 *  injection precise instead of pulling in loose description hits. */
export function findRelevantSkills(catalog: SkillDef[], taskText: string, limit = 3): SkillDef[] {
  if (!catalog.length) return [];
  const query = cleanTaskQuery(taskText);
  if (!query) return [];
  const tokens = query.split(' ');
  const ranked = searchSkills(catalog, query, Math.max(12, limit * 4));
  const precise = ranked.filter((s) => {
    const nameWords = queryWords(s.name);
    const topicWords = (s.topics ?? []).flatMap(queryWords);
    return tokens.some((t) => [...nameWords, ...topicWords].some((w) => wordMatches(t, w)));
  });
  return precise.slice(0, Math.max(1, limit));
}

// --- Semantic fill (only when an embedding model is configured) --------------

const embedCache = new Map<string, number[]>();

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embedSkill(s: SkillDef): Promise<number[] | null> {
  const cached = embedCache.get(s.id);
  if (cached) return cached;
  try {
    const { embedText } = await import('./vectorMemory.js');
    const { vec } = await embedText(`${s.name}. ${s.description} ${(s.topics ?? []).join(' ')}`);
    embedCache.set(s.id, vec);
    return vec;
  } catch {
    return null;
  }
}

/**
 * Hybrid retrieval: precise lexical matches first, then semantic fill from the
 * embedding model when configured (no-op without EMBEDDING_MODEL, so nothing is
 * fabricated). This lifts recall for paraphrased/external-repo skill wording.
 */
export async function findRelevantSkillsHybrid(catalog: SkillDef[], taskText: string, limit = 3): Promise<SkillDef[]> {
  const lexical = findRelevantSkills(catalog, taskText, limit);
  if (lexical.length >= limit || !process.env.EMBEDDING_MODEL || !catalog.length) return lexical;
  try {
    const { embedText } = await import('./vectorMemory.js');
    const { vec: q } = await embedText(taskText);
    const have = new Set(lexical.map((s) => s.id));
    const scored: Array<{ s: SkillDef; score: number }> = [];
    for (const s of catalog) {
      if (have.has(s.id)) continue;
      const v = await embedSkill(s);
      if (v) scored.push({ s, score: cosine(q, v) });
    }
    scored.sort((a, b) => b.score - a.score);
    const fill = scored.filter((x) => x.score >= 0.35).slice(0, limit - lexical.length).map((x) => x.s);
    return [...lexical, ...fill].slice(0, limit);
  } catch {
    return lexical;
  }
}

/** Optional LLM rerank of a small candidate set (env AGENT_SKILLS_RERANK=1). */
export async function rerankSkills(matches: SkillDef[], taskText: string, chat: ChatFn): Promise<SkillDef[]> {
  if (matches.length <= 1 || process.env.AGENT_SKILLS_RERANK !== '1') return matches;
  try {
    const list = matches.map((s, i) => `${i}. ${s.name}: ${s.description}`).join('\n');
    const res = await chat([
      { role: 'system', content: 'Rank skills by relevance to the task. Return ONLY JSON: {"order":[indices]}. Include only clearly relevant skills, best first.' },
      { role: 'user', content: `Task: ${taskText}\n\nSkills:\n${list}` },
    ], { temperature: 0, json: true });
    const block = res.ok && res.content ? extractJsonBlock(res.content) : null;
    const parsed = block ? JSON.parse(block) : null;
    const order: number[] = Array.isArray(parsed?.order) ? parsed.order.filter((n: unknown) => Number.isInteger(n)) : [];
    const ranked = order.map((i) => matches[i]).filter(Boolean);
    return ranked.length ? ranked : matches;
  } catch {
    return matches;
  }
}

/** Build the injectable context block for a set of matched skills. */
export function buildSkillContext(matches: SkillDef[], opts: SkillContextOptions = {}): string {
  if (!matches.length) return '';
  const lines: string[] = ['## Relevant skills (on-disk skill libraries)'];
  if (opts.toolHint) {
    lines.push(
      'You can use these tools before answering: skills_list({query}), skills_read({name}), ' +
        'skills_file({name,file}), skills_run({name,script,args}).',
    );
  }
  for (const s of matches) {
    lines.push(`- ${s.name}: ${s.description} [library=${s.rootId}${s.hasScripts ? ', has scripts' : ''}]`);
  }
  const best = matches[0];
  if (opts.includeBody && best && opts.readSkill) {
    const body = opts.readSkill(best);
    if (body && body.trim()) {
      const cap = opts.maxBodyChars ?? 4000;
      const truncated = body.length > cap;
      lines.push('', `### ${best.name} — SKILL.md${truncated ? ' (truncated)' : ''}`, body.slice(0, cap));
    }
  }
  return lines.join('\n');
}

function injectBlock(messages: ChatMessage[], block: string): ChatMessage[] {
  if (!block) return messages;
  const out = messages.map((m) => ({ ...m }));
  const idx = out.findIndex((m) => m.role === 'system');
  if (idx >= 0) {
    out[idx] = { ...out[idx], content: `${out[idx].content}\n\n${block}` };
    return out;
  }
  return [{ role: 'system', content: block }, ...out];
}

export function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && typeof messages[i].content === 'string') return messages[i].content;
  }
  return '';
}

function autonomyRegistry(provider: SkillToolProvider): AgentToolRegistry {
  if (cachedRegistry && cachedRegistryProvider === provider) return cachedRegistry;
  cachedRegistry = createAgentToolRegistry({ selfHosted: false, skills: provider });
  cachedRegistryProvider = provider;
  return cachedRegistry;
}

/**
 * Skill-aware generation. Injects relevant skills and, when safe, lets the
 * model call the skills tools. Falls back to a plain `chatComplete` (with the
 * injected context) whenever the tool loop cannot produce a usable answer.
 */
export async function skillAwareChat(
  messages: ChatMessage[],
  opts: ChatCompleteOptions = {},
  taskText?: string,
): Promise<ChatCompleteResult> {
  const cfg = config;
  const chat = cfg?.chat ?? chatComplete;
  if (!cfg || process.env.AGENT_SKILLS_AUTONOMY === '0') return chat(messages, opts);

  const text = (taskText || lastUserText(messages) || '').trim();
  if (!text) return chat(messages, opts);

  let catalog: SkillDef[] = [];
  try { catalog = cfg.getCatalog(); } catch { catalog = []; }
  if (!catalog.length) return chat(messages, opts);

  const limitRaw = Number(process.env.AGENT_SKILLS_AUTONOMY_MAX_SKILLS || 3);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 10) : 3;
  let matches = await findRelevantSkillsHybrid(catalog, text, limit);
  if (!matches.length) return chat(messages, opts);
  if (process.env.AGENT_SKILLS_RERANK === '1') matches = await rerankSkills(matches, text, chat);
  const bodyCharsRaw = Number(process.env.AGENT_SKILLS_BODY_CHARS || 2500);
  const maxBodyChars = Number.isFinite(bodyCharsRaw) && bodyCharsRaw > 0 ? bodyCharsRaw : 2500;

  const toolsEnabled = (process.env.AGENT_SKILLS_AUTONOMY_TOOLS ?? '1') !== '0';
  const jsonTools = (process.env.AGENT_SKILLS_AUTONOMY_JSON_TOOLS ?? '1') !== '0';
  const wantTools = toolsEnabled && (!opts.json || jsonTools);
  const readSkill = cfg.readSkill;

  if (wantTools) {
    const block = buildSkillContext(matches, { toolHint: true, includeBody: true, readSkill, maxBodyChars });
    const augmented = injectBlock(messages, block);
    const started = Date.now();
    const turnsRaw = Number(process.env.AGENT_SKILLS_AUTONOMY_TURNS || 3);
    const maxTurns = Number.isFinite(turnsRaw) && turnsRaw > 0 ? Math.min(turnsRaw, 8) : 3;
    const run = await runToolCallingAgent(augmented, {
      chat,
      registry: autonomyRegistry(cfg.provider),
      maxTurns,
      temperature: opts.temperature,
    });
    // Offline is authoritative: report it rather than making a second full call.
    if (run.status === 'offline') {
      return {
        ok: false,
        content: null,
        status: 'offline',
        model: run.model || 'unknown',
        latencyMs: Date.now() - started,
        error: run.error,
      };
    }
    // Honesty: a non-JSON caller only accepts a *completed* final answer; a
    // JSON caller accepts any turn that actually carries JSON (including one
    // that hit the turn cap after producing it).
    const usableContent =
      run.content &&
      run.status !== 'error' &&
      (opts.json ? Boolean(extractJsonBlock(run.content)) : run.status === 'completed');
    if (usableContent) {
      return {
        ok: true,
        content: run.content,
        status: 'online',
        model: run.model || 'unknown',
        latencyMs: Date.now() - started,
      };
    }
    // Fallback: no tool hint (tools are not offered on this plain call).
    const safeBlock = buildSkillContext(matches, { toolHint: false, includeBody: true, readSkill, maxBodyChars });
    return chat(injectBlock(messages, safeBlock), opts);
  }

  const block = buildSkillContext(matches, { toolHint: false, includeBody: true, readSkill, maxBodyChars });
  return chat(injectBlock(messages, block), opts);
}

/** Default SKILL.md reader factory from configured roots (used by server.ts). */
export function makeSkillBodyReader(
  getRoots: () => Array<{ id: string; root: string }>,
  maxBytes = 20000,
): (s: SkillDef) => string | null {
  return (s: SkillDef) => {
    try {
      const root = getRoots().find((r) => r.id === s.rootId);
      if (!root) return null;
      const abs = path.join(root.root, ...s.dir.split('/'), 'SKILL.md');
      const text = fs.readFileSync(abs, 'utf-8');
      return text.length > maxBytes ? text.slice(0, maxBytes) : text;
    } catch {
      return null;
    }
  };
}

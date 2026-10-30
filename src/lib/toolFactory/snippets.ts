import type { SnippetPlugin } from './types.js';

const SNIPPETS: Record<string, SnippetPlugin> = {};
const ID_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export function registerSnippet(snippet: SnippetPlugin): void {
  if (!snippet || typeof snippet !== 'object') throw new Error('Snippet must be an object');
  if (!snippet.id || typeof snippet.id !== 'string') throw new Error('Snippet requires a string "id"');
  if (!ID_RE.test(snippet.id)) throw new Error(`Invalid snippet id "${snippet.id}"`);
  if (typeof snippet.code !== 'string' || !snippet.code.trim()) throw new Error(`Snippet "${snippet.id}" requires "code"`);
  if (SNIPPETS[snippet.id]) throw new Error(`A snippet with id "${snippet.id}" is already registered`);
  SNIPPETS[snippet.id] = { ...snippet };
}

export function isSnippetRegistered(id: string): boolean {
  return Boolean(SNIPPETS[id]);
}

export function getSnippet(id: string): SnippetPlugin | undefined {
  return SNIPPETS[id];
}

export function listSnippets(): SnippetPlugin[] {
  return Object.values(SNIPPETS);
}

export function countRegisteredSnippets(): number {
  return Object.keys(SNIPPETS).length;
}

export function clearSnippetsForTests(): void {
  for (const k of Object.keys(SNIPPETS)) delete SNIPPETS[k];
}

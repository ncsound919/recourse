import Handlebars from 'handlebars';
import type { ChunkPlugin } from './types.js';

const CHUNKS: Record<string, ChunkPlugin> = {};

const ID_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export function registerChunk(chunk: ChunkPlugin): void {
  if (!chunk || typeof chunk !== 'object') throw new Error('Chunk must be an object');
  if (!chunk.id || typeof chunk.id !== 'string') throw new Error('Chunk requires a string "id"');
  if (!ID_RE.test(chunk.id)) throw new Error(`Invalid chunk id "${chunk.id}"`);
  if (typeof chunk.body !== 'string' || !chunk.body.trim()) throw new Error(`Chunk "${chunk.id}" requires a "body"`);
  if (CHUNKS[chunk.id]) throw new Error(`A chunk with id "${chunk.id}" is already registered`);
  CHUNKS[chunk.id] = { ...chunk, deps: chunk.deps ? [...chunk.deps] : [] };
  // Register as a Handlebars partial so composers can use {{> id}}.
  Handlebars.registerPartial(chunk.id, chunk.body);
}

export function isChunkRegistered(id: string): boolean {
  return Boolean(CHUNKS[id]);
}

export function getChunk(id: string): ChunkPlugin | undefined {
  return CHUNKS[id];
}

export function listChunks(): ChunkPlugin[] {
  return Object.values(CHUNKS);
}

export function countRegisteredChunks(): number {
  return Object.keys(CHUNKS).length;
}

export function clearChunksForTests(): void {
  for (const k of Object.keys(CHUNKS)) delete CHUNKS[k];
}

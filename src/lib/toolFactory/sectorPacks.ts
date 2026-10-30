import { z } from 'zod';
import yaml from 'yaml';
import type { SectorPack, ToolRecipe } from './types.js';

const SectorPackSchema = z.object({
  id: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
  paramDefaults: z.record(z.string(), z.unknown()).optional(),
  forcedChunks: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

const PACKS: Record<string, SectorPack> = {};

export function registerSectorPack(pack: SectorPack): void {
  const parsed = SectorPackSchema.parse(pack);
  if (PACKS[parsed.id]) throw new Error(`Sector pack "${parsed.id}" already registered`);
  PACKS[parsed.id] = parsed as SectorPack;
}

export function getSectorPack(id: string): SectorPack | undefined {
  return PACKS[id];
}

export function listSectorPacks(): SectorPack[] {
  return Object.values(PACKS);
}

export function clearSectorPacksForTests(): void {
  for (const k of Object.keys(PACKS)) delete PACKS[k];
}

/**
 * Parse a sector pack from YAML text and register it.
 */
export function loadSectorPackFromYaml(text: string): SectorPack {
  const parsed = yaml.parse(text);
  const pack = SectorPackSchema.parse(parsed) as SectorPack;
  registerSectorPack(pack);
  return pack;
}

/**
 * Apply a sector pack to a recipe: override param defaults, append forced chunks,
 * and merge tags. Returns a new recipe (does not mutate input).
 */
export function applySectorPack(recipe: ToolRecipe, packId: string): ToolRecipe {
  const pack = PACKS[packId];
  if (!pack) throw new Error(`Unknown sector pack "${packId}"`);
  const params = recipe.params.map((p) => {
    const override = pack.paramDefaults?.[p.id];
    return override !== undefined ? { ...p, default: override } : { ...p };
  });
  const chunks = Array.from(new Set([...(recipe.chunks ?? []), ...(pack.forcedChunks ?? [])]));
  const tags = Array.from(new Set([...(recipe.tags ?? []), ...(pack.tags ?? [])]));
  return { ...recipe, params, chunks, tags, sectorPack: packId };
}

// Built-in packs
registerSectorPack({ id: 'generic', tags: ['generic'] });
registerSectorPack({
  id: 'oncology',
  paramDefaults: {},
  forcedChunks: [],
  tags: ['oncology', 'sector:oncology']
});
registerSectorPack({
  id: 'finance',
  paramDefaults: {},
  forcedChunks: [],
  tags: ['finance', 'sector:finance']
});
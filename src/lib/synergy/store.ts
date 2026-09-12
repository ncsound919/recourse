// src/lib/synergy/store.ts
/**
 * File-backed synergy map store. Env override SYNERGY_MAP_FILE keeps tests
 * isolated from the real data/synergy-map.json. Fail-soft reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SynergyMap } from './types.js';

const DEFAULT_FILE = path.join(process.cwd(), 'data', 'synergy-map.json');

export function synergyMapPath(): string {
  return process.env.SYNERGY_MAP_FILE || DEFAULT_FILE;
}

export function readSynergyMap(): SynergyMap | null {
  const file = synergyMapPath();
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  if (!raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`synergy map corrupt (invalid JSON): ${file}`);
  }
  const shape = parsed as SynergyMap;
  if (!shape || typeof shape !== 'object' || !Array.isArray(shape.edges) || !Array.isArray(shape.candidates)) {
    throw new Error(`synergy map corrupt (unexpected shape): ${file}`);
  }
  return shape;
}

export function writeSynergyMap(map: SynergyMap): void {
  const file = synergyMapPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(map, null, 2), 'utf-8');
}

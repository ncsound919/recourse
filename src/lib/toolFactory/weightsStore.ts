/**
 * Persistent ranking weights — learner-driven discovery weights survive restarts.
 * Stored as JSON in the factory root directory.
 */

import fs from 'node:fs';
import path from 'node:path';

const WEIGHTS_FILE = '.factory_weights.json';

export function weightsPath(root: string): string {
  return path.join(root, WEIGHTS_FILE);
}

export function loadRankingWeights(root: string): Record<string, number> {
  try {
    const raw = fs.readFileSync(weightsPath(root), 'utf-8');
    const parsed = JSON.parse(raw);
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRankingWeights(root: string, weights: Record<string, number>): void {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(weightsPath(root), JSON.stringify(weights, null, 2), 'utf-8');
}

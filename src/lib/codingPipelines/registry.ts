/**
 * Pipeline registry — the selector seam.
 *
 * Callers ask for a pipeline by id or list them for Benchmark Olympics
 * discovery. The four built-ins are installed through `installDefaultPipelines`
 * which is idempotent, so importing this module from a router and from a script
 * at once does not double-register.
 */

import type { CodingPipeline, PipelineId, PipelineSpec, PipelineStatus } from './types.js';
import { opencodePipeline } from './opencodePipeline.js';
import { deepseekPipeline } from './deepseekPipeline.js';
import { axiomPipeline } from './axiomPipeline.js';
import { settlementPipeline } from './settlementPipeline.js';

const _registry = new Map<PipelineId, CodingPipeline>();

export function registerPipeline(pipeline: CodingPipeline): void {
  if (!pipeline?.spec?.id) throw new Error('pipeline requires a spec.id');
  _registry.set(pipeline.spec.id, pipeline);
}

export function getPipeline(id: string): CodingPipeline | undefined {
  return _registry.get(id as PipelineId);
}

export function listPipelines(): CodingPipeline[] {
  return [..._registry.values()];
}

export function pipelineSpecs(): PipelineSpec[] {
  return listPipelines().map((p) => p.spec);
}

/** Probe every registered pipeline's availability. Never throws. */
export async function pipelineStatuses(): Promise<PipelineStatus[]> {
  const out: PipelineStatus[] = [];
  for (const p of listPipelines()) {
    try {
      out.push(await p.status());
    } catch (err) {
      out.push({
        id: p.spec.id,
        name: p.spec.name,
        transport: p.spec.transport,
        available: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

const DEFAULT_PIPELINES: CodingPipeline[] = [
  opencodePipeline,
  deepseekPipeline,
  axiomPipeline,
  settlementPipeline,
];

export function installDefaultPipelines(): void {
  for (const p of DEFAULT_PIPELINES) {
    if (!_registry.has(p.spec.id)) _registry.set(p.spec.id, p);
  }
}

/** Test hook: drop all registrations. */
export function resetPipelineRegistry(): void {
  _registry.clear();
}

// Register on import so `getPipeline('axiom')` works without a boot step.
installDefaultPipelines();

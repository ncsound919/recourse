/**
 * Auto-composition — given a natural-language intent, search the tool
 * catalogue, build a multi-step pipeline of the best-matching tools, and
 * optionally publish it as a single composite capability.
 *
 * This is the "invent new capabilities from existing ones" loop: no new code
 * is hand-written; the factory recombines verified tools and indexes the
 * result for discovery.
 */

import { searchTools, indexTool } from './toolDiscovery.js';
import { runPipeline, describePipeline, type PipelineStep } from './toolPipeline.js';
import { recordToolCall } from './toolHealth.js';
import type { ToolRunner } from './toolPipeline.js';
import fs from 'node:fs';
import path from 'node:path';

export interface AutoComposeResult {
  intent: string;
  selected: string[];
  pipeline: PipelineStep[];
  compositeName: string;
  indexed: boolean;
}

export interface AutoComposeOptions {
  limit?: number;
  /** If provided, execute the pipeline immediately and record health. */
  runner?: ToolRunner;
  initial?: unknown;
  /** Publish/index the composite in the discovery catalogue. Default true. */
  index?: boolean;
}

export async function autoCompose(intent: string, opts: AutoComposeOptions = {}): Promise<AutoComposeResult | null> {
  const limit = opts.limit ?? 3;
  const hits = searchTools(intent, limit);
  if (hits.length === 0) return null;

  const pipeline: PipelineStep[] = hits.map((h, i) => {
    const step: PipelineStep = { tool: h.name };
    if (i > 0) step.transform = (prev: unknown) => (prev && typeof prev === 'object' && !Array.isArray(prev) ? (prev as Record<string, unknown>) : { input: prev });
    return step;
  });

  const compositeName = `composite_${intent.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`;

  if (opts.index !== false) {
    const desc = describePipeline(compositeName, intent, pipeline);
    indexTool({ name: compositeName, description: desc.description, tags: desc.tags, schema: { type: 'object', additionalProperties: true } });
  }

  if (opts.runner) {
    const started = Date.now();
    const result = await runPipeline(pipeline, opts.runner, opts.initial);
    recordToolCall(compositeName, result.ok, Date.now() - started);
  }

  return {
    intent,
    selected: hits.map((h) => h.name),
    pipeline,
    compositeName,
    indexed: opts.index !== false,
  };
}

/**
 * Persist a composite pipeline as a manifest record (not a self-hosted module,
 * since composites execute via the server-side runner). Returns the file path.
 */
export function publishComposite(composite: AutoComposeResult, root: string): string {
  const dir = path.join(root, 'composites');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${composite.compositeName}.json`);
  fs.writeFileSync(file, JSON.stringify(composite, null, 2), 'utf-8');
  return file;
}

/**
 * Auto-publish a composite to the self-hosted runtime so it becomes a discoverable
 * tool in the agent-support hub ecosystem. Optionally, also index it for semantic search.
 */
export async function autoPublishComposite(composite: AutoComposeResult, root: string, index = true): Promise<string> {
  const manifestPath = publishComposite(composite, root);
  if (index) {
    // index tool via the discovery index so hub can ingest it
    indexTool({ name: composite.compositeName, description: composite.intent, tags: ['composite'] });
  }
  // Note: The actual self-hosted module is not created; the composite executes via server-side runner.
  // For full self-hosting, a separate code generation step would be needed.
  return manifestPath;
}

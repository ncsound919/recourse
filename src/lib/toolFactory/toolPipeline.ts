/**
 * Tool pipeline — composes multiple factory tools into a single composite
 * capability. Each step names a tool and a (optional) arg-transform that
 * maps the previous step's result into the next step's args.
 *
 * Pipelines are themselves indexable as a single tool (via toolDiscovery) so
 * agents can discover and execute multi-step capabilities as one unit.
 */

export interface PipelineStep {
  tool: string;
  /** Transform previous result into args for this step. If omitted, previous result is passed as the sole arg. */
  transform?: (prev: unknown) => Record<string, unknown> | unknown[];
}

export interface PipelineResult {
  steps: Array<{ tool: string; result: unknown; ok: boolean; error?: string }>;
  final: unknown;
  ok: boolean;
}

export type ToolRunner = (name: string, args: Record<string, unknown> | unknown[]) => Promise<unknown> | unknown;

export async function runPipeline(steps: PipelineStep[], runner: ToolRunner, initial?: unknown): Promise<PipelineResult> {
  const out: PipelineResult = { steps: [], final: initial, ok: true };
  let prev: unknown = initial;
  for (const step of steps) {
    let args: Record<string, unknown> | unknown[];
    if (step.transform) {
      const t = step.transform(prev);
      args = Array.isArray(t) ? t : (t as Record<string, unknown>);
    } else {
      args = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? (prev as Record<string, unknown>) : { input: prev };
    }
    try {
      const result = await runner(step.tool, args);
      out.steps.push({ tool: step.tool, result, ok: true });
      prev = result;
      out.final = result;
    } catch (err: any) {
      out.steps.push({ tool: step.tool, result: null, ok: false, error: err?.message || String(err) });
      out.ok = false;
      out.final = null;
      break;
    }
  }
  return out;
}

/** Describe a pipeline as a single tool index entry. */
export function describePipeline(name: string, description: string, steps: PipelineStep[]): { name: string; description: string; tags: string[] } {
  return {
    name,
    description: `${description} (pipeline: ${steps.map((s) => s.tool).join(' -> ')})`,
    tags: ['pipeline', 'composite', ...steps.map((s) => s.tool)],
  };
}

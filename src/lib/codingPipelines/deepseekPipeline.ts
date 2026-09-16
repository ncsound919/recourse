/**
 * DeepSeek pipeline — OpenCode CLI pinned to a DeepSeek model.
 *
 * Same transport as the opencode pipeline, but always passes `--model` so the
 * comparison against plain OpenCode isolates the model choice. The default is
 * the repo's own model id (see src/lib/modelProvider.ts) and can be overridden
 * with PIPELINE_DEEPSEEK_MODEL / OPENCODE_MODEL.
 */

import type { CodingPipeline, PipelineRunResult, PipelineStatus } from './types.js';
import { commandExists } from './subprocess.js';
import { opencodeBin, runOpencodeLike } from './opencodePipeline.js';

export function deepseekModel(): string {
  return (
    process.env.PIPELINE_DEEPSEEK_MODEL?.trim() ||
    process.env.OPENCODE_MODEL?.trim() ||
    process.env.API_MODEL_NAME?.trim() ||
    'deepseek-v4-flash-0731'
  );
}

export const deepseekPipeline: CodingPipeline = {
  spec: {
    id: 'deepseek',
    name: 'DeepSeek Harness',
    transport: 'subprocess',
    description: 'OpenCode CLI pinned to a DeepSeek model (isolates model choice).',
    capabilities: ['codegen', 'cli', 'opencode', 'deepseek'],
  },
  async status(): Promise<PipelineStatus> {
    const command = opencodeBin();
    const available = commandExists(command);
    return {
      id: this.spec.id,
      name: this.spec.name,
      transport: this.spec.transport,
      available,
      detail: available
        ? `CLI on PATH, model ${deepseekModel()}`
        : `CLI '${command}' not found on PATH`,
      command,
    };
  },
  run(req): Promise<PipelineRunResult> {
    return runOpencodeLike('deepseek', req, deepseekModel());
  },
};

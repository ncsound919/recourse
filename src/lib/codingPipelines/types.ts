/**
 * Coding pipelines — the selectable "harness" abstraction.
 *
 * A pipeline is a way to drive a coding agent/endpoint against an isolated
 * worktree. The four registered providers are the ones Benchmark Olympics
 * scores head-to-head:
 *
 *   opencode   — plain OpenCode CLI subprocess
 *   deepseek   — OpenCode CLI pinned to a DeepSeek model
 *   axiom      — Axiom OS deterministic agent loop (HTTP, :3198)
 *   settlement — settlement-harness supervisor (admission -> shadow -> settle)
 *
 * Everything here is honest-by-construction: `status()` reports availability
 * from a real probe and `run()` returns `ok:false` with the real error when a
 * provider is unreachable, never a fabricated result.
 */

export type PipelineId = 'opencode' | 'deepseek' | 'axiom' | 'settlement';

export type PipelineTransport = 'subprocess' | 'http';

export interface PipelineSpec {
  id: PipelineId;
  name: string;
  transport: PipelineTransport;
  description: string;
  /** Capability tags surfaced to Benchmark Olympics fleet discovery. */
  capabilities: string[];
}

export interface PipelineStatus {
  id: PipelineId;
  name: string;
  transport: PipelineTransport;
  available: boolean;
  /** Human-readable reason the pipeline is (un)available. */
  detail: string;
  /** Resolved executable for subprocess pipelines. */
  command?: string;
  /** Resolved base URL for http pipelines. */
  endpoint?: string;
}

export interface PipelineRunRequest {
  /** Natural-language coding task handed to the pipeline. */
  task: string;
  /** Isolated directory the pipeline is allowed to modify. */
  workdir: string;
  /** Contract path, required by the settlement pipeline. */
  contractPath?: string;
  /** Wall-clock budget for the whole pipeline invocation. */
  timeoutMs?: number;
  /** Extra environment for the child process. */
  env?: Record<string, string>;
}

export interface PipelineRunResult {
  ok: boolean;
  id: PipelineId;
  command?: string;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
}

export interface CodingPipeline {
  spec: PipelineSpec;
  status(): Promise<PipelineStatus>;
  run(req: PipelineRunRequest): Promise<PipelineRunResult>;
}

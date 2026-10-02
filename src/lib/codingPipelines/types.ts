/**
 * Coding pipelines — the selectable "harness" abstraction.
 *
 * A pipeline is a way to drive a coding agent/endpoint against an isolated
 * worktree. The five registered providers are:
 *
 *   opencode      — plain OpenCode CLI subprocess
 *   deepseek      — OpenCode CLI pinned to a DeepSeek model
 *   axiom         — Axiom OS deterministic agent loop (HTTP, :3198)
 *   settlement    — settlement-harness supervisor (admission -> shadow -> settle)
 *   slopcodebench — SlopCodeBench iterative refinement benchmark (standalone)
 *
 * The first four are `mode: 'worktree'`: Benchmark Olympics copies a target
 * repo into a fresh worktree, runs the pipeline against it, and scores the
 * diff head-to-head. `slopcodebench` is `mode: 'standalone'`: it drives its own
 * Docker-based problems and never touches the worktree, so the worktree runner
 * excludes it (a worktree diff would always be empty and score zero). It is
 * still registered so discovery/status can see it, and it runs through its own
 * `/api/recourse/slopbench/*` surface.
 *
 * Everything here is honest-by-construction: `status()` reports availability
 * from a real probe and `run()` returns `ok:false` with the real error when a
 * provider is unreachable, never a fabricated result.
 */

export type PipelineId = 'opencode' | 'deepseek' | 'axiom' | 'settlement' | 'slopcodebench';

export type PipelineTransport = 'subprocess' | 'http';

/**
 * How a pipeline is driven. `worktree` (default) means the runner prepares a
 * target-repo worktree and scores its diff. `standalone` means the pipeline
 * owns its own inputs and must not be run through the worktree harness.
 */
export type PipelineMode = 'worktree' | 'standalone';

export interface PipelineSpec {
  id: PipelineId;
  name: string;
  transport: PipelineTransport;
  description: string;
  /** Capability tags surfaced to Benchmark Olympics fleet discovery. */
  capabilities: string[];
  /** Defaults to `'worktree'` when omitted. */
  mode?: PipelineMode;
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
  /** Bare-harness provenance, e.g. `"dev@350c726"` or `"master@0d1f500"`. */
  version?: string;
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
  /**
   * Artifact directory the run produced, when the pipeline writes one
   * (SlopCodeBench). Undefined for pipelines that mutate the worktree in place.
   */
  runDir?: string;
}

export interface CodingPipeline {
  spec: PipelineSpec;
  status(): Promise<PipelineStatus>;
  run(req: PipelineRunRequest): Promise<PipelineRunResult>;
}

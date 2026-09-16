/**
 * Coding pipelines — public surface.
 *
 *   import { installDefaultPipelines, getPipeline, runPipelineBenchmarks } from '../lib/codingPipelines/index.js';
 */

export type {
  PipelineId,
  PipelineTransport,
  PipelineSpec,
  PipelineStatus,
  PipelineRunRequest,
  PipelineRunResult,
  CodingPipeline,
} from './types.js';

export {
  registerPipeline,
  getPipeline,
  listPipelines,
  pipelineSpecs,
  pipelineStatuses,
  installDefaultPipelines,
  resetPipelineRegistry,
} from './registry.js';

export { opencodePipeline } from './opencodePipeline.js';
export { deepseekPipeline } from './deepseekPipeline.js';
export { axiomPipeline } from './axiomPipeline.js';
export { settlementPipeline, settlementHarnessDir, settlementHarnessAvailable, settlementAdapterPath, settlementAgentExecutable, settlementOpencodeEnv } from './settlementPipeline.js';

export { opencodeBareDir, opencodeBareEntry, opencodeModel, opencodeProvider, opencodeRunEnv } from './opencodePipeline.js';
export { deepseekBareDir, dshBin, deepseekProfile, deepseekLlmConfig, writeWorkspaceOverlay } from './deepseekPipeline.js';
export { isGitCheckout, gitRevision, gitBranch, harnessProvenance } from './provenance.js';

export { snapshotDir, diffSnapshots } from './snapshot.js';
export type { Snapshot, SnapshotDiff, FileFingerprint } from './snapshot.js';

export {
  scorePipelineRun,
  resolveTestCommand,
  regressionRiskFor,
} from './scorer.js';
export type { PipelineScore, RegressionRisk } from './scorer.js';

export {
  prepareWorktree,
  runPipelineBenchmark,
  runPipelineBenchmarks,
  runAllPipelineBenchmarks,
  recordBenchmarkResults,
} from './runner.js';
export type { BenchmarkTarget, PipelineBenchmarkResult } from './runner.js';

export {
  pipelineLedgerFile,
  readPipelineLedger,
  appendPipelineBenchmark,
  verifyPipelineRecords,
  pipelineStandings,
} from './ledger.js';
export type { PipelineBenchmarkRecord, PipelineStanding } from './ledger.js';

export { runProcess, runShellCommand, commandExists } from './subprocess.js';

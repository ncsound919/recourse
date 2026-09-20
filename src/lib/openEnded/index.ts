/**
 * Open-Ended Capability Engine — public surface.
 *
 *   import { OpenEndedArchive, runOpenEndedCycle } from './src/lib/openEnded/index.js';
 */

export {
  canonicalToolKey,
  noveltyVerdict,
  filterNovel,
  pruneLearnerBeliefs,
  propertyGate,
} from './gates.js';
export type { BeliefLike, LearnerLike, BeliefPruneReport, PruneOptions, PropertyGateResult } from './gates.js';

export { mintProblems, parseProblemDrafts, problemDraftPrompt, problemIdFor, problemIsSolvable, stripFences, PROBLEM_DOMAINS } from './problemMint.js';
export type { MintedProblem, ProblemDraft, MintInput, MintResult, MintedRejection, MintVerifyResult } from './problemMint.js';

export { OpenEndedArchive } from './archive.js';
export type { ArchivedProblem, ArchiveCell, ArchiveSnapshot, ArchiveAddResult, ArchiveDoc } from './archive.js';

export { runOpenEndedCycle, rewardForResult, capabilityKeyFor } from './engine.js';
export type { OpenEndedDeps, OpenEndedCycleResult, OpenEndedMintConfig, SolverResult } from './engine.js';

export { parseSearchReplace, applySearchReplace, runPatchAttempt, patchPrompt } from './patchMode.js';
export type { SearchReplacePatch, PatchAttemptInput, PatchAttemptResult } from './patchMode.js';

export { FleetRecursionLedger, canonicalOutcomeId, dedupeFleetOutcomes, summarizeFleetRecursion, fleetRecursionFile } from './fleetRecursion.js';
export type { FleetOutcome, CanonicalOutcome, FleetRecursionEntry, FleetRecursionSummary } from './fleetRecursion.js';

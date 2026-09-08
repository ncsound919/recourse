/**
 * Pathosphere contribution-incentive adapter — IN-PROCESS, OFF-CHAIN ONLY.
 *
 * This module makes NO chain calls and NO RPC requests. It is the off-chain
 * validation + bundle layer for the Pathosphere contracts in
 * `Pathosphere-main/contracts` (BountyEscrow, CurationVoting, FeeRouter,
 * GenomeNFT, OutbreakOracle, PathToken, StakingPool).
 *
 * On-chain execution requires a hardhat deployment (see
 * `Pathosphere-main/Makefile`, needs PRIVATE_KEY). `chainBundle()` below
 * produces a hardhat-execution bundle that is explicitly labeled
 * NOT_SUBMITTED — it is never a submission and this module never submits it.
 *
 * All builders are fully deterministic and pure: ids are sha256 hex digests
 * of canonical JSON (object keys sorted recursively) via `node:crypto`.
 * Validation failures return `{ ok: false, error }` — nothing is thrown and
 * nothing is fabricated.
 */

import { createHash } from 'node:crypto';

// --- Contract catalogue -----------------------------------------------------

export interface PathosphereContractInfo {
  name: string;
  file: string;
  purpose: string;
  keyFunctions: string[];
}

/**
 * All 7 Pathosphere contracts. Purposes + key function names extracted from
 * the contract sources in `Pathosphere-main/contracts`.
 */
export const PATHOSPHERE_CONTRACTS: PathosphereContractInfo[] = [
  {
    name: 'BountyEscrow',
    file: 'BountyEscrow.sol',
    purpose:
      'Bounty escrow for pharma/NGOs to post $PATH bounties; scientists submit genome NFTs with auto-settlement and full escrow logic guarded by reentrancy protection.',
    keyFunctions: [
      'postBounty',
      'submitToBounty',
      'awardBounty',
      'cancelBounty',
      'claimExpiredBounty',
      'getBounty',
    ],
  },
  {
    name: 'CurationVoting',
    file: 'CurationVoting.sol',
    purpose:
      'Validators stake sPATH to vote on data quality; minority voters lose reputation points (not financial slashing); minimum 1000 sPATH curator threshold for Sybil resistance.',
    keyFunctions: [
      'registerCurator',
      'createProposal',
      'castVote',
      'finalizeProposal',
      'getProposal',
      'isCurator',
    ],
  },
  {
    name: 'FeeRouter',
    file: 'FeeRouter.sol',
    purpose:
      'Auto-splits all license payments on-chain with no intermediary: 50% lab, 30% staker pool, 10% treasury, 10% burn.',
    keyFunctions: [
      'distributeFees',
      'calculateDistribution',
      'getStats',
      'setStakingPool',
      'setTreasuryAddress',
      'emergencyWithdraw',
    ],
  },
  {
    name: 'GenomeNFT',
    file: 'GenomeNFT.sol',
    purpose:
      'ERC-721 data-NFT contract for minting immutable genome NFTs with IPFS metadata; ERC2981 royalties for automatic lab payouts.',
    keyFunctions: [
      'mintGenomeNFT',
      'getGenomeInfo',
      'verifyDataIntegrity',
      'totalSupply',
      'setFeeRouter',
      'supportsInterface',
    ],
  },
  {
    name: 'OutbreakOracle',
    file: 'OutbreakOracle.sol',
    purpose:
      'Chainlink oracle integration for automated outbreak detection: polls WHO APIs, auto-posts bounties on detection, and uses VRF for random validator selection during audits.',
    keyFunctions: [
      'reportOutbreak',
      'createBountyForAlert',
      'selectRandomValidator',
      'checkUpkeep',
      'calculateBountyAmount',
      'fund',
    ],
  },
  {
    name: 'PathToken',
    file: 'PathToken.sol',
    purpose:
      'ERC-20 $PATH token with fixed 1B supply; 35% community emissions over 6 years; ERC2612 permit for gasless approvals; 10% of license fees auto-burned for deflation.',
    keyFunctions: [
      'releaseCommunityEmissions',
      'releasableCommunityEmissions',
      'burnFromFees',
      'setFeeRouter',
      'getDistributionInfo',
    ],
  },
  {
    name: 'StakingPool',
    file: 'StakingPool.sol',
    purpose:
      'Staking pool minting the non-transferable sPATH governance token (StakedPathToken, defined in this file); lock-duration multipliers and on-chain reward distribution.',
    keyFunctions: [
      'stake',
      'withdraw',
      'distributeRewards',
      'claimRewards',
      'getPendingRewards',
      'getUserStake',
    ],
  },
];

// --- Deterministic id helpers ------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Canonical JSON: object keys sorted recursively so the same logical
 * payload always serializes to the same string. Arrays keep their order.
 * Non-finite numbers serialize as null (matching JSON.stringify); other
 * primitives use JSON.stringify.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`,
    );
    return `{${parts.join(',')}}`;
  }
  const fallback: unknown = JSON.stringify(value);
  return typeof fallback === 'string' ? fallback : 'null';
}

/** Deterministic sha256 hex id over the canonical JSON of a payload. */
function canonicalId(payload: unknown): string {
  return createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex');
}

// --- Bounty builder ----------------------------------------------------------

export interface BountySpec {
  title: string;
  organism?: string;
  dataHash?: string;
  rewardNote?: string;
  deadlineMs?: number;
}

export interface BuiltBounty {
  id: string;
  title: string;
  organism?: string;
  dataHash?: string;
  rewardNote?: string;
  deadlineMs?: number;
  status: 'DRAFT_OFFCHAIN';
  chain: 'Base (not submitted)';
}

export type BountyBuildResult =
  | { ok: true; bounty: BuiltBounty }
  | { ok: false; error: string };

/**
 * Validate an off-chain bounty draft. Title is required (≥8 chars after
 * trimming). Returns ok:false on validation failure — never throws.
 */
export function buildBounty(spec: BountySpec): BountyBuildResult {
  if (!isRecord(spec)) {
    return { ok: false, error: 'bounty spec must be an object' };
  }
  const title = spec.title;
  if (typeof title !== 'string' || title.trim().length < 8) {
    return { ok: false, error: 'bounty title is required and must be at least 8 characters' };
  }
  if (spec.organism !== undefined && (typeof spec.organism !== 'string' || spec.organism.trim().length === 0)) {
    return { ok: false, error: 'bounty organism, when provided, must be a non-empty string' };
  }
  if (spec.dataHash !== undefined && (typeof spec.dataHash !== 'string' || spec.dataHash.trim().length === 0)) {
    return { ok: false, error: 'bounty dataHash, when provided, must be a non-empty string' };
  }
  if (spec.rewardNote !== undefined && typeof spec.rewardNote !== 'string') {
    return { ok: false, error: 'bounty rewardNote, when provided, must be a string' };
  }
  if (
    spec.deadlineMs !== undefined &&
    (typeof spec.deadlineMs !== 'number' ||
      !Number.isFinite(spec.deadlineMs) ||
      spec.deadlineMs <= 0)
  ) {
    return { ok: false, error: 'bounty deadlineMs, when provided, must be a positive finite timestamp' };
  }
  const clean: Record<string, unknown> = { title: title.trim() };
  if (spec.organism !== undefined) clean.organism = spec.organism.trim();
  if (spec.dataHash !== undefined) clean.dataHash = spec.dataHash.trim();
  if (spec.rewardNote !== undefined) clean.rewardNote = spec.rewardNote;
  if (spec.deadlineMs !== undefined) clean.deadlineMs = spec.deadlineMs;
  const id = canonicalId(clean);
  const bounty: BuiltBounty = {
    id,
    title: title.trim(),
    status: 'DRAFT_OFFCHAIN',
    chain: 'Base (not submitted)',
  };
  if (typeof clean.organism === 'string') bounty.organism = clean.organism;
  if (typeof clean.dataHash === 'string') bounty.dataHash = clean.dataHash;
  if (typeof clean.rewardNote === 'string') bounty.rewardNote = clean.rewardNote;
  if (typeof clean.deadlineMs === 'number') bounty.deadlineMs = clean.deadlineMs;
  return { ok: true, bounty };
}

// --- Curation vote builder ---------------------------------------------------

export type CurationDecision = 'approve' | 'reject' | 'abstain';

export interface CurationVoteInput {
  artifactId: string;
  decision: CurationDecision;
  rationale?: string;
  weightBps?: number;
}

export interface BuiltCurationVote {
  id: string;
  artifactId: string;
  decision: CurationDecision;
  rationale?: string;
  weightBps?: number;
}

export type CurationVoteResult =
  | { ok: true; vote: BuiltCurationVote }
  | { ok: false; error: string };

/**
 * Validate an off-chain curation vote. artifactId required; decision must
 * be approve|reject|abstain; weightBps, when provided, must be an integer
 * 0..10000. Returns ok:false on validation failure — never throws.
 */
export function buildCurationVote(vote: CurationVoteInput): CurationVoteResult {
  if (!isRecord(vote)) {
    return { ok: false, error: 'curation vote must be an object' };
  }
  const artifactId = vote.artifactId;
  if (typeof artifactId !== 'string' || artifactId.trim().length === 0) {
    return { ok: false, error: 'curation vote artifactId is required' };
  }
  const decision = vote.decision;
  if (decision !== 'approve' && decision !== 'reject' && decision !== 'abstain') {
    return { ok: false, error: `curation vote decision must be approve|reject|abstain (got "${String(decision)}")` };
  }
  if (vote.rationale !== undefined && typeof vote.rationale !== 'string') {
    return { ok: false, error: 'curation vote rationale, when provided, must be a string' };
  }
  if (
    vote.weightBps !== undefined &&
    (typeof vote.weightBps !== 'number' ||
      !Number.isInteger(vote.weightBps) ||
      vote.weightBps < 0 ||
      vote.weightBps > 10000)
  ) {
    return { ok: false, error: 'curation vote weightBps, when provided, must be an integer 0..10000' };
  }
  const clean: Record<string, unknown> = {
    artifactId: artifactId.trim(),
    decision,
  };
  if (vote.rationale !== undefined) clean.rationale = vote.rationale;
  if (vote.weightBps !== undefined) clean.weightBps = vote.weightBps;
  const built: BuiltCurationVote = {
    id: canonicalId(clean),
    artifactId: artifactId.trim(),
    decision,
  };
  if (typeof clean.rationale === 'string') built.rationale = clean.rationale;
  if (typeof clean.weightBps === 'number') built.weightBps = clean.weightBps;
  return { ok: true, vote: built };
}

// --- Fee split builder -------------------------------------------------------

export interface FeeRecipient {
  addressOrLabel: string;
  bps: number;
}

export interface FeeSplitInput {
  recipients: FeeRecipient[];
}

export interface BuiltFeeSplit {
  id: string;
  recipients: FeeRecipient[];
}

export type FeeSplitResult =
  | { ok: true; split: BuiltFeeSplit }
  | { ok: false; error: string };

const MAX_FEE_RECIPIENTS = 32;

/**
 * Validate an off-chain fee split. Recipient bps must be integers ≥0 and
 * must sum to exactly 10000 (100%). Returns ok:false otherwise — never
 * throws.
 */
export function buildFeeSplit(split: FeeSplitInput): FeeSplitResult {
  if (!isRecord(split) || !Array.isArray(split.recipients)) {
    return { ok: false, error: 'fee split must provide a recipients array' };
  }
  const recipients = split.recipients;
  if (recipients.length < 1 || recipients.length > MAX_FEE_RECIPIENTS) {
    return { ok: false, error: `fee split needs 1..${MAX_FEE_RECIPIENTS} recipients (got ${recipients.length})` };
  }
  const clean: FeeRecipient[] = [];
  for (const r of recipients) {
    if (!isRecord(r)) {
      return { ok: false, error: 'each fee recipient must be an object' };
    }
    if (typeof r.addressOrLabel !== 'string' || r.addressOrLabel.trim().length === 0) {
      return { ok: false, error: 'each fee recipient needs a non-empty addressOrLabel' };
    }
    if (typeof r.bps !== 'number' || !Number.isInteger(r.bps) || r.bps < 0) {
      return { ok: false, error: 'each fee recipient bps must be an integer >= 0' };
    }
    clean.push({ addressOrLabel: r.addressOrLabel.trim(), bps: r.bps });
  }
  const total = clean.reduce((sum, r) => sum + r.bps, 0);
  if (total !== 10000) {
    return { ok: false, error: `fee split bps must sum to 10000 (got ${total})` };
  }
  return { ok: true, split: { id: canonicalId({ recipients: clean }), recipients: clean } };
}

// --- Chain bundle ------------------------------------------------------------

export type ChainBundleKind = 'bounty' | 'vote' | 'split';

export interface ChainBundle {
  contract: string;
  function: string;
  args: Record<string, unknown>;
  network: 'base-sepolia';
  status: 'NOT_SUBMITTED';
  note: string;
}

const BUNDLE_TARGETS: Record<ChainBundleKind, { contract: string; fn: string }> = {
  bounty: { contract: 'BountyEscrow', fn: 'postBounty' },
  vote: { contract: 'CurationVoting', fn: 'castVote' },
  split: { contract: 'FeeRouter', fn: 'distributeFees' },
};

const BUNDLE_NOTE =
  'Hardhat-execution bundle only — NOT submitted to any chain. ' +
  'Execute via a hardhat deployment (see Pathosphere-main/Makefile, requires PRIVATE_KEY).';

/**
 * Wrap a validated off-chain payload into a hardhat-execution bundle.
 * Pure and deterministic; never performs a chain call and never throws.
 * The bundle is explicitly labeled NOT_SUBMITTED — it is a plan for a
 * hardhat run, never a submission.
 */
export function chainBundle(kind: ChainBundleKind, payload: unknown): ChainBundle {
  const target = BUNDLE_TARGETS[kind];
  if (target === undefined) {
    return {
      contract: 'UNKNOWN',
      function: 'NONE',
      args: {},
      network: 'base-sepolia',
      status: 'NOT_SUBMITTED',
      note: `${BUNDLE_NOTE} Unsupported bundle kind: "${String(kind)}".`,
    };
  }
  const args: Record<string, unknown> = isRecord(payload)
    ? { ...payload }
    : { value: payload };
  return {
    contract: target.contract,
    function: target.fn,
    args,
    network: 'base-sepolia',
    status: 'NOT_SUBMITTED',
    note: BUNDLE_NOTE,
  };
}

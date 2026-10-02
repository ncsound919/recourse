/**
 * v5LockWriter.ts — G10 sign + log + lock.
 *
 * The final gate in the v5 pipeline. Takes the verifier's output (the
 * results of gates G0–G9), signs it, appends it to Recourse's hash-chained
 * provenance log, and writes the index.lock entry.
 *
 * The lock entry is the v5 "receipt": it records what was verified, at what
 * tier, with which checkers, against which TCB, and with what model gaps
 * discharged. It is the artifact that downstream consumers trust.
 *
 * This module is the bridge between the verifier pipeline (Axiom) and the
 * durable provenance chain (Recourse). It is pure — signing and logging
 * are injected — so it is unit-testable without booting either server.
 */

import crypto from 'crypto';
import type { V5IndexLockEntry, V5Manifest, AssuranceTier } from '../types';
import { hashManifest } from './v5manifest';

// ==========================================
// Types
// ==========================================

export interface GateResult {
  gate: string;
  passed: boolean;
  evidence: string;
  details: string[];
}

export interface LockWriterInput {
  manifest: V5Manifest;
  gateResults: GateResult[];
  /** The behavior hash (hash of the implementation's observable behavior). */
  behaviorSha: string;
  /** The statement hash from the manifest's freeze block. */
  statementSha: string;
  /** Achieved tier per obligation class (computed by the verifier). */
  achievedTier: Record<string, AssuranceTier>;
  /** Obligation counts. */
  obligations: { total: number; discharged: number; waived: number };
  /** Spec qualification results. */
  qualification: {
    mutation_kill: number;
    functional_check: 'pass' | 'fail';
    dual_spec: 'pass' | 'fail' | 'not-required';
  };
  /** Qualified checkers used. */
  checkers: Array<{ id: string; lineage: string }>;
  /** Trusted base list. */
  tcb: string[];
  /** Model gap discharge status. */
  model_gaps: { total: number; discharged: number };
  /** Targets verified for. */
  verifiedForTargets: string[];
  /** Build attestation hash. */
  buildAttestation: string;
  /** Signer identity (OIDC pattern). */
  signerIdentity: string;
  /** Current log index (for the chain). */
  logIndex: number;
}

export interface LockWriterResult {
  success: boolean;
  lockEntry?: V5IndexLockEntry;
  signature?: string;
  provenanceHash?: string;
  error?: string;
}

// ==========================================
// Signer interface (injected)
// ==========================================

export interface LockSigner {
  sign(data: string): string;
  identity(): string;
}

/** Production signer — HMAC-SHA256 with a secret key. */
export class HmacLockSigner implements LockSigner {
  constructor(private secret: string) {}

  sign(data: string): string {
    return crypto.createHmac('sha256', this.secret).update(data).digest('hex');
  }

  identity(): string {
    return `hmac-sha256:${crypto.createHash('sha256').update(this.secret).digest('hex').substring(0, 16)}`;
  }
}

/** No-op signer for testing. */
export class NoopSigner implements LockSigner {
  sign(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  identity(): string {
    return 'noop-signer';
  }
}

// ==========================================
// Provenance logger interface (injected)
// ==========================================

export interface ProvenanceLogger {
  append(eventType: string, data: Record<string, unknown>): { hash: string; prev: string };
  chainLength(): number;
}

// ==========================================
// G10 lock writer
// ==========================================

export function writeV5LockEntry(
  input: LockWriterInput,
  signer: LockSigner,
  provenanceLogger: ProvenanceLogger
): LockWriterResult {
  try {
    // Verify all gates passed
    const failedGates = input.gateResults.filter((g) => !g.passed);
    if (failedGates.length > 0) {
      return {
        success: false,
        error: `Cannot write lock: ${failedGates.length} gate(s) failed: ${failedGates.map((g) => g.gate).join(', ')}`,
      };
    }

    // Compute manifest root hash
    const manifestRoot = hashManifest(input.manifest);

    // Derive log index from the chain — never trust the caller
    const logIndex = provenanceLogger.chainLength();

    // Build the lock entry
    const lockEntry: V5IndexLockEntry = {
      id: input.manifest.id,
      version: input.manifest.version,
      manifest_root: manifestRoot,
      behavior_sha: input.behaviorSha,
      statement_sha: input.statementSha,
      achieved_tier: input.achievedTier,
      obligations: input.obligations,
      qualification: input.qualification,
      checkers: input.checkers,
      tcb: input.tcb,
      model_gaps: input.model_gaps,
      verified_for_targets: input.verifiedForTargets,
      build_attestation: input.buildAttestation,
      signature: '',
      log_index: logIndex,
    };

    // Sign the lock entry (without the signature field)
    const signable = { ...lockEntry, signature: '' };
    const signature = signer.sign(JSON.stringify(signable));
    lockEntry.signature = signature;

    // Append to provenance chain
    const provenanceData = {
      lockEntry,
      signature,
      signer: signer.identity(),
      manifestRoot,
    };
    const provenanceResult = provenanceLogger.append('v5_lock_written', provenanceData);

    return {
      success: true,
      lockEntry,
      signature,
      provenanceHash: provenanceResult.hash,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Lock write failed: ${err.message}`,
    };
  }
}

// ==========================================
// Lock entry verifier (for downstream consumers)
// ==========================================

export function verifyLockEntry(
  entry: V5IndexLockEntry,
  signer: LockSigner
): { valid: boolean; reason?: string } {
  // Recompute signature
  const { signature, ...signable } = entry;
  const expected = signer.sign(JSON.stringify(signable));
  if (signature !== expected) {
    return { valid: false, reason: 'Signature mismatch — lock entry was tampered with' };
  }

  // Verify obligations are fully discharged
  if (entry.obligations.discharged + entry.obligations.waived !== entry.obligations.total) {
    return { valid: false, reason: 'Obligations not fully discharged' };
  }

  // Verify model gaps are discharged
  if (entry.model_gaps.discharged !== entry.model_gaps.total) {
    return { valid: false, reason: 'Model gaps not fully discharged' };
  }

  // Verify statement_sha matches
  if (!entry.statement_sha || entry.statement_sha.length === 0) {
    return { valid: false, reason: 'Missing statement_sha' };
  }

  return { valid: true };
}

// ==========================================
// Production provenance logger (Recourse bridge)
// ==========================================

/**
 * Creates a provenance logger that calls Recourse's appendProvenance.
 * This is the production wiring — the lock writer itself stays pure.
 */
export function createRecourseProvenanceLogger(
  appendFn: (eventType: string, data: Record<string, unknown>) => { hash: string; prev: string },
  chainLengthFn: () => number
): ProvenanceLogger {
  return {
    append(eventType: string, data: Record<string, unknown>) {
      return appendFn(eventType, data);
    },
    chainLength() {
      return chainLengthFn();
    },
  };
}

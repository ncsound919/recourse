/**
 * v5manifest.ts — NextGenCoder v5 manifest schema validator (G0 gate).
 *
 * Implements the G0 verifier gate: canonicalize, hash, schema-validate,
 * reject unknown fields. This is the first gate in the v5 pipeline and
 * the foundation every other gate builds on.
 *
 * The validator is pure — no I/O, no side effects. It takes a raw manifest
 * object and returns either a canonicalized, hashed manifest or a structured
 * error. This mirrors the v5 spec's "G0: Canonicalize, hash, schema,
 * reject unknown fields" requirement.
 */

import crypto from 'crypto';
import type {
  V5Manifest,
  V5IndexLockEntry,
  V5AdapterManifest,
  AssuranceTier,
  V5Port,
  V5Claim,
  V5ModelGap
} from '../types';

// ==========================================
// Schema constants
// ==========================================

const MANIFEST_SCHEMA_VERSION = '5.0';
const VALID_TIERS: AssuranceTier[] = ['A0', 'A1', 'A2', 'A3', 'A4'];
const VALID_CROSS_TARGET = ['bit_exact', 'bounded_ulp'];
const VALID_DISCHARGE = ['hw_conformance_test', 'measured_sanity', 'proof', 'differential'];
const VALID_EMIT_VALIDATION = ['alive2', 'object_diff', 'double_build', 'reproducible'];
const VALID_EQUIVALENCE = ['smt', 'exhaustive-bounded'];
const VALID_LOG_UNREACHABLE = ['fail-closed', 'fail-open'];
const VALID_DEPENDENCIES = ['pinned-hashes', 'unpinned'];
const VALID_ON_VIOLATION = ['revoke', 'warn'];
const VALID_FMA = ['forbidden', 'allowed'];
const VALID_SPEC_FORMAT = ['fpcore'];

// ==========================================
// Validation result
// ==========================================

export interface V5ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  canonical?: V5Manifest;
  hash?: string;
}

// ==========================================
// Unknown-field rejection
// ==========================================

const MANIFEST_ALLOWED_FIELDS = new Set([
  'manifest_schema', 'id', 'version', 'provides',
  'assurance', 'spec_qualification', 'contract_checks', 'freeze',
  'numeric', 'model_gaps', 'emit', 'attestation',
  'ports', 'claims'
]);

const ASSURANCE_ALLOWED_FIELDS = new Set([
  'requested_tier', 'per_obligation_min'
]);

const SPEC_QUAL_ALLOWED_FIELDS = new Set([
  'atomic_requirements', 'functional_check', 'golden_examples',
  'mutation', 'dual_spec'
]);

const CONTRACT_ALLOWED_FIELDS = new Set([
  'assume_satisfiable', 'guarantee_satisfiable_under_assume',
  'realizable', 'non_trivial', 'witnesses'
]);

const FREEZE_ALLOWED_FIELDS = new Set([
  'statement_sha', 'forbidden', 'assumption_budget'
]);

const NUMERIC_ALLOWED_FIELDS = new Set([
  'spec_format', 'profile', 'cross_target', 'error_bound'
]);

const EMIT_ALLOWED_FIELDS = new Set([
  'mode', 'validation', 'reproducible', 'wcet_sanity'
]);

const ATTESTATION_ALLOWED_FIELDS = new Set([
  'signer_identity_pin', 'log', 'on_log_unreachable', 'dependencies'
]);

const PORT_ALLOWED_FIELDS = new Set([
  'name', 'direction', 'type', 'assume', 'guarantee'
]);

const CLAIM_ALLOWED_FIELDS = new Set([
  'id', 'kind', 'statement', 'atomic_requirements', 'tier_min'
]);

const MODEL_GAP_ALLOWED_FIELDS = new Set([
  'id', 'what', 'discharge', 'evidence'
]);

function rejectUnknownFields(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  errors: string[]
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      errors.push(`Unknown field "${key}" at ${path}`);
    }
  }
}

// ==========================================
// Field validators
// ==========================================

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function validateTier(v: unknown, path: string, errors: string[]): v is AssuranceTier {
  if (!VALID_TIERS.includes(v as AssuranceTier)) {
    errors.push(`Invalid tier "${v}" at ${path}. Valid: ${VALID_TIERS.join(', ')}`);
    return false;
  }
  return true;
}

// ==========================================
// Sub-section validators
// ==========================================

function validateAssurance(raw: unknown, errors: string[]): V5Manifest['assurance'] | undefined {
  if (typeof raw !== 'object' || raw === null) {
    errors.push('Field "assurance" must be an object');
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, ASSURANCE_ALLOWED_FIELDS, 'assurance', errors);

  const result: V5Manifest['assurance'] = { requested_tier: 'A0' };

  if (!validateTier(obj.requested_tier, 'assurance.requested_tier', errors)) {
    return undefined;
  }
  result.requested_tier = obj.requested_tier as AssuranceTier;

  if (obj.per_obligation_min !== undefined) {
    if (typeof obj.per_obligation_min !== 'object' || obj.per_obligation_min === null) {
      errors.push('Field "assurance.per_obligation_min" must be an object');
      return undefined;
    }
    const min: Record<string, AssuranceTier> = {};
    for (const [k, v] of Object.entries(obj.per_obligation_min)) {
      if (!validateTier(v, `assurance.per_obligation_min.${k}`, errors)) {
        return undefined;
      }
      min[k] = v as AssuranceTier;
    }
    result.per_obligation_min = min;
  }

  return result;
}

function validateSpecQualification(raw: unknown, errors: string[]): V5Manifest['spec_qualification'] | undefined {
  if (typeof raw !== 'object' || raw === null) {
    errors.push('Field "spec_qualification" must be an object');
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, SPEC_QUAL_ALLOWED_FIELDS, 'spec_qualification', errors);

  if (!isNonEmptyString(obj.atomic_requirements)) {
    errors.push('Field "spec_qualification.atomic_requirements" must be a non-empty string');
    return undefined;
  }
  if (!isNonEmptyString(obj.functional_check)) {
    errors.push('Field "spec_qualification.functional_check" must be a non-empty string');
    return undefined;
  }
  if (typeof obj.golden_examples !== 'object' || obj.golden_examples === null) {
    errors.push('Field "spec_qualification.golden_examples" must be an object');
    return undefined;
  }
  const ge = obj.golden_examples as Record<string, unknown>;
  if (!isNonEmptyString(ge.path)) {
    errors.push('Field "spec_qualification.golden_examples.path" must be a non-empty string');
    return undefined;
  }
  if (!isNonEmptyString(ge.confirmed_by)) {
    errors.push('Field "spec_qualification.golden_examples.confirmed_by" must be a non-empty string');
    return undefined;
  }
  if (typeof obj.mutation !== 'object' || obj.mutation === null) {
    errors.push('Field "spec_qualification.mutation" must be an object');
    return undefined;
  }
  const mut = obj.mutation as Record<string, unknown>;
  if (!isNumber(mut.min_kill) || mut.min_kill < 0 || mut.min_kill > 1) {
    errors.push('Field "spec_qualification.mutation.min_kill" must be a number in [0, 1]');
    return undefined;
  }
  if (!isBoolean(mut.per_requirement_unique_kill)) {
    errors.push('Field "spec_qualification.mutation.per_requirement_unique_kill" must be a boolean');
    return undefined;
  }

  const result: V5Manifest['spec_qualification'] = {
    atomic_requirements: obj.atomic_requirements,
    functional_check: obj.functional_check as 'required' | 'optional',
    golden_examples: { path: ge.path, confirmed_by: ge.confirmed_by },
    mutation: { min_kill: mut.min_kill, per_requirement_unique_kill: mut.per_requirement_unique_kill }
  };

  if (obj.dual_spec !== undefined) {
    if (typeof obj.dual_spec !== 'object' || obj.dual_spec === null) {
      errors.push('Field "spec_qualification.dual_spec" must be an object');
      return undefined;
    }
    const ds = obj.dual_spec as Record<string, unknown>;
    if (!Array.isArray(ds.required_for)) {
      errors.push('Field "spec_qualification.dual_spec.required_for" must be an array');
      return undefined;
    }
    if (typeof ds.second_spec !== 'object' || ds.second_spec === null) {
      errors.push('Field "spec_qualification.dual_spec.second_spec" must be an object');
      return undefined;
    }
    const ss = ds.second_spec as Record<string, unknown>;
    if (!isNonEmptyString(ss.path) || !isNonEmptyString(ss.origin)) {
      errors.push('Field "spec_qualification.dual_spec.second_spec" requires "path" and "origin" strings');
      return undefined;
    }
    if (!VALID_EQUIVALENCE.includes(ds.equivalence as string)) {
      errors.push(`Invalid equivalence "${ds.equivalence}" at spec_qualification.dual_spec. Valid: ${VALID_EQUIVALENCE.join(', ')}`);
      return undefined;
    }
    result.dual_spec = {
      required_for: ds.required_for as string[],
      second_spec: { path: ss.path, origin: ss.origin },
      equivalence: ds.equivalence as 'smt' | 'exhaustive-bounded'
    };
  }

  return result;
}

function validateContractChecks(raw: unknown, errors: string[]): V5Manifest['contract_checks'] | undefined {
  if (typeof raw !== 'object' || raw === null) {
    errors.push('Field "contract_checks" must be an object');
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, CONTRACT_ALLOWED_FIELDS, 'contract_checks', errors);

  const boolFields = ['assume_satisfiable', 'guarantee_satisfiable_under_assume', 'realizable', 'non_trivial'] as const;
  for (const f of boolFields) {
    if (typeof obj[f] !== 'boolean') {
      errors.push(`Field "contract_checks.${f}" must be a boolean`);
      return undefined;
    }
  }
  if (typeof obj.witnesses !== 'string' || obj.witnesses.length === 0) {
    errors.push('Field "contract_checks.witnesses" must be a non-empty string');
    return undefined;
  }

  return {
    assume_satisfiable: obj.assume_satisfiable as boolean,
    guarantee_satisfiable_under_assume: obj.guarantee_satisfiable_under_assume as boolean,
    realizable: obj.realizable as boolean,
    non_trivial: obj.non_trivial as boolean,
    witnesses: obj.witnesses as string
  };
}

function validateFreeze(raw: unknown, errors: string[]): V5Manifest['freeze'] | undefined {
  if (typeof raw !== 'object' || raw === null) {
    errors.push('Field "freeze" must be an object');
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, FREEZE_ALLOWED_FIELDS, 'freeze', errors);

  if (!isNonEmptyString(obj.statement_sha)) {
    errors.push('Field "freeze.statement_sha" must be a non-empty string');
    return undefined;
  }
  if (!Array.isArray(obj.forbidden)) {
    errors.push('Field "freeze.forbidden" must be an array');
    return undefined;
  }
  if (!isNumber(obj.assumption_budget) || obj.assumption_budget < 0) {
    errors.push('Field "freeze.assumption_budget" must be a non-negative number');
    return undefined;
  }

  return {
    statement_sha: obj.statement_sha,
    forbidden: obj.forbidden as string[],
    assumption_budget: obj.assumption_budget
  };
}

function validateNumeric(raw: unknown, errors: string[]): V5Manifest['numeric'] | undefined {
  if (typeof raw !== 'object' || raw === null) {
    errors.push('Field "numeric" must be an object');
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, NUMERIC_ALLOWED_FIELDS, 'numeric', errors);

  if (!VALID_SPEC_FORMAT.includes(obj.spec_format as string)) {
    errors.push(`Invalid spec_format "${obj.spec_format}" at numeric. Valid: ${VALID_SPEC_FORMAT.join(', ')}`);
    return undefined;
  }
  if (!VALID_CROSS_TARGET.includes(obj.cross_target as string)) {
    errors.push(`Invalid cross_target "${obj.cross_target}" at numeric. Valid: ${VALID_CROSS_TARGET.join(', ')}`);
    return undefined;
  }
  if (typeof obj.profile !== 'object' || obj.profile === null) {
    errors.push('Field "numeric.profile" must be an object');
    return undefined;
  }
  const prof = obj.profile as Record<string, unknown>;
  if (!VALID_FMA.includes(prof.fma as string)) {
    errors.push(`Invalid fma "${prof.fma}" at numeric.profile. Valid: ${VALID_FMA.join(', ')}`);
    return undefined;
  }
  if (!isNonEmptyString(prof.rounding)) {
    errors.push('Field "numeric.profile.rounding" must be a non-empty string');
    return undefined;
  }
  if (!isNonEmptyString(prof.denormals)) {
    errors.push('Field "numeric.profile.denormals" must be a non-empty string');
    return undefined;
  }
  if (!isNonEmptyString(prof.libm)) {
    errors.push('Field "numeric.profile.libm" must be a non-empty string');
    return undefined;
  }
  if (typeof obj.error_bound !== 'object' || obj.error_bound === null) {
    errors.push('Field "numeric.error_bound" must be an object');
    return undefined;
  }
  const eb = obj.error_bound as Record<string, unknown>;
  if (!Array.isArray(eb.analyzers)) {
    errors.push('Field "numeric.error_bound.analyzers" must be an array');
    return undefined;
  }
  if (typeof eb.per_target !== 'object' || eb.per_target === null) {
    errors.push('Field "numeric.error_bound.per_target" must be an object');
    return undefined;
  }
  if (typeof eb.empirical_guard !== 'object' || eb.empirical_guard === null) {
    errors.push('Field "numeric.error_bound.empirical_guard" must be an object');
    return undefined;
  }
  const eg = eb.empirical_guard as Record<string, unknown>;
  if (!isNumber(eg.samples) || eg.samples < 0) {
    errors.push('Field "numeric.error_bound.empirical_guard.samples" must be a non-negative number');
    return undefined;
  }
  if (!isBoolean(eg.adversarial)) {
    errors.push('Field "numeric.error_bound.empirical_guard.adversarial" must be a boolean');
    return undefined;
  }
  if (!isBoolean(eg.must_not_exceed_proven)) {
    errors.push('Field "numeric.error_bound.empirical_guard.must_not_exceed_proven" must be a boolean');
    return undefined;
  }

  const perTarget: Record<string, { metric: string; max: number }> = {};
  for (const [target, val] of Object.entries(eb.per_target)) {
    if (typeof val !== 'object' || val === null) {
      errors.push(`Field "numeric.error_bound.per_target.${target}" must be an object`);
      return undefined;
    }
    const t = val as Record<string, unknown>;
    if (!isNonEmptyString(t.metric) || !isNumber(t.max)) {
      errors.push(`Field "numeric.error_bound.per_target.${target}" requires "metric" (string) and "max" (number)`);
      return undefined;
    }
    perTarget[target] = { metric: t.metric, max: t.max };
  }

  return {
    spec_format: 'fpcore',
    profile: {
      fma: prof.fma as 'forbidden' | 'allowed',
      rounding: prof.rounding,
      denormals: prof.denormals,
      libm: prof.libm
    },
    cross_target: obj.cross_target as 'bit_exact' | 'bounded_ulp',
    error_bound: {
      analyzers: eb.analyzers as string[],
      per_target: perTarget,
      empirical_guard: {
        samples: eg.samples,
        adversarial: eg.adversarial,
        must_not_exceed_proven: eg.must_not_exceed_proven
      }
    }
  };
}

function validateModelGaps(raw: unknown, errors: string[]): V5ModelGap[] | undefined {
  if (!Array.isArray(raw)) {
    errors.push('Field "model_gaps" must be an array');
    return undefined;
  }
  const result: V5ModelGap[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`Field "model_gaps[${i}]" must be an object`);
      return undefined;
    }
    const obj = item as Record<string, unknown>;
    rejectUnknownFields(obj, MODEL_GAP_ALLOWED_FIELDS, `model_gaps[${i}]`, errors);
    if (!isNonEmptyString(obj.id)) {
      errors.push(`Field "model_gaps[${i}].id" must be a non-empty string`);
      return undefined;
    }
    if (!isNonEmptyString(obj.what)) {
      errors.push(`Field "model_gaps[${i}].what" must be a non-empty string`);
      return undefined;
    }
    if (!VALID_DISCHARGE.includes(obj.discharge as string)) {
      errors.push(`Invalid discharge "${obj.discharge}" at model_gaps[${i}]. Valid: ${VALID_DISCHARGE.join(', ')}`);
      return undefined;
    }
    if (!isNonEmptyString(obj.evidence)) {
      errors.push(`Field "model_gaps[${i}].evidence" must be a non-empty string`);
      return undefined;
    }
    result.push({
      id: obj.id,
      what: obj.what,
      discharge: obj.discharge as V5ModelGap['discharge'],
      evidence: obj.evidence
    });
  }
  return result;
}

function validateEmit(raw: unknown, errors: string[]): V5Manifest['emit'] | undefined {
  if (typeof raw !== 'object' || raw === null) {
    errors.push('Field "emit" must be an object');
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, EMIT_ALLOWED_FIELDS, 'emit', errors);

  if (obj.mode !== 'credible') {
    errors.push('Field "emit.mode" must be "credible"');
    return undefined;
  }
  if (!Array.isArray(obj.validation)) {
    errors.push('Field "emit.validation" must be an array');
    return undefined;
  }
  for (const v of obj.validation) {
    if (!VALID_EMIT_VALIDATION.includes(v as string)) {
      errors.push(`Invalid validation "${v}" at emit.validation. Valid: ${VALID_EMIT_VALIDATION.join(', ')}`);
      return undefined;
    }
  }
  if (!isBoolean(obj.reproducible)) {
    errors.push('Field "emit.reproducible" must be a boolean');
    return undefined;
  }
  if (typeof obj.wcet_sanity !== 'object' || obj.wcet_sanity === null) {
    errors.push('Field "emit.wcet_sanity" must be an object');
    return undefined;
  }
  const ws = obj.wcet_sanity as Record<string, unknown>;
  if (!isBoolean(ws.measured_must_not_exceed_analyzed)) {
    errors.push('Field "emit.wcet_sanity.measured_must_not_exceed_analyzed" must be a boolean');
    return undefined;
  }
  if (!VALID_ON_VIOLATION.includes(ws.on_violation as string)) {
    errors.push(`Invalid on_violation "${ws.on_violation}" at emit.wcet_sanity. Valid: ${VALID_ON_VIOLATION.join(', ')}`);
    return undefined;
  }

  return {
    mode: 'credible',
    validation: obj.validation as V5Manifest['emit']['validation'],
    reproducible: obj.reproducible,
    wcet_sanity: {
      measured_must_not_exceed_analyzed: ws.measured_must_not_exceed_analyzed,
      on_violation: ws.on_violation as 'revoke' | 'warn'
    }
  };
}

function validateAttestation(raw: unknown, errors: string[]): V5Manifest['attestation'] | undefined {
  if (typeof raw !== 'object' || raw === null) {
    errors.push('Field "attestation" must be an object');
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, ATTESTATION_ALLOWED_FIELDS, 'attestation', errors);

  if (!isNonEmptyString(obj.signer_identity_pin)) {
    errors.push('Field "attestation.signer_identity_pin" must be a non-empty string');
    return undefined;
  }
  if (!isNonEmptyString(obj.log)) {
    errors.push('Field "attestation.log" must be a non-empty string');
    return undefined;
  }
  if (!VALID_LOG_UNREACHABLE.includes(obj.on_log_unreachable as string)) {
    errors.push(`Invalid on_log_unreachable "${obj.on_log_unreachable}" at attestation. Valid: ${VALID_LOG_UNREACHABLE.join(', ')}`);
    return undefined;
  }
  if (!VALID_DEPENDENCIES.includes(obj.dependencies as string)) {
    errors.push(`Invalid dependencies "${obj.dependencies}" at attestation. Valid: ${VALID_DEPENDENCIES.join(', ')}`);
    return undefined;
  }

  return {
    signer_identity_pin: obj.signer_identity_pin,
    log: obj.log,
    on_log_unreachable: obj.on_log_unreachable as 'fail-closed' | 'fail-open',
    dependencies: obj.dependencies as 'pinned-hashes' | 'unpinned'
  };
}

function validatePorts(raw: unknown, errors: string[]): V5Port[] | undefined {
  if (!Array.isArray(raw)) {
    errors.push('Field "ports" must be an array');
    return undefined;
  }
  const result: V5Port[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`Field "ports[${i}]" must be an object`);
      return undefined;
    }
    const obj = item as Record<string, unknown>;
    rejectUnknownFields(obj, PORT_ALLOWED_FIELDS, `ports[${i}]`, errors);
    if (!isNonEmptyString(obj.name)) {
      errors.push(`Field "ports[${i}].name" must be a non-empty string`);
      return undefined;
    }
    if (obj.direction !== 'in' && obj.direction !== 'out') {
      errors.push(`Invalid direction "${obj.direction}" at ports[${i}]. Valid: in, out`);
      return undefined;
    }
    if (!isNonEmptyString(obj.type)) {
      errors.push(`Field "ports[${i}].type" must be a non-empty string`);
      return undefined;
    }
    const port: V5Port = { name: obj.name, direction: obj.direction, type: obj.type };
    if (obj.assume !== undefined) {
      if (!isNonEmptyString(obj.assume)) {
        errors.push(`Field "ports[${i}].assume" must be a non-empty string`);
        return undefined;
      }
      port.assume = obj.assume;
    }
    if (obj.guarantee !== undefined) {
      if (!isNonEmptyString(obj.guarantee)) {
        errors.push(`Field "ports[${i}].guarantee" must be a non-empty string`);
        return undefined;
      }
      port.guarantee = obj.guarantee;
    }
    result.push(port);
  }
  return result;
}

function validateClaims(raw: unknown, errors: string[]): V5Claim[] | undefined {
  if (!Array.isArray(raw)) {
    errors.push('Field "claims" must be an array');
    return undefined;
  }
  const result: V5Claim[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`Field "claims[${i}]" must be an object`);
      return undefined;
    }
    const obj = item as Record<string, unknown>;
    rejectUnknownFields(obj, CLAIM_ALLOWED_FIELDS, `claims[${i}]`, errors);
    if (!isNonEmptyString(obj.id)) {
      errors.push(`Field "claims[${i}].id" must be a non-empty string`);
      return undefined;
    }
    if (!isNonEmptyString(obj.kind)) {
      errors.push(`Field "claims[${i}].kind" must be a non-empty string`);
      return undefined;
    }
    if (!isNonEmptyString(obj.statement)) {
      errors.push(`Field "claims[${i}].statement" must be a non-empty string`);
      return undefined;
    }
    if (!Array.isArray(obj.atomic_requirements)) {
      errors.push(`Field "claims[${i}].atomic_requirements" must be an array`);
      return undefined;
    }
    if (!validateTier(obj.tier_min, `claims[${i}].tier_min`, errors)) {
      return undefined;
    }
    result.push({
      id: obj.id,
      kind: obj.kind,
      statement: obj.statement,
      atomic_requirements: obj.atomic_requirements as string[],
      tier_min: obj.tier_min as AssuranceTier
    });
  }
  return result;
}

// ==========================================
// Canonicalization
// ==========================================

/**
 * Produce a canonical string representation of the manifest for hashing.
 * Keys are sorted recursively, whitespace is normalized. This ensures
 * semantically identical manifests produce identical hashes regardless
 * of key ordering or formatting.
 */
export function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const sorted = Object.keys(obj as Record<string, unknown>).sort();
    return '{' + sorted.map(k => JSON.stringify(k) + ':' + canonicalize((obj as Record<string, unknown>)[k])).join(',') + '}';
  }
  return JSON.stringify(obj);
}

/**
 * Compute the SHA-256 hash of a manifest's canonical form.
 */
export function hashManifest(obj: unknown): string {
  return crypto.createHash('sha256').update(canonicalize(obj)).digest('hex');
}

// ==========================================
// G0 validator entry point
// ==========================================

/**
 * Validate a v5 manifest against the schema (G0 gate).
 *
 * Returns a V5ValidationResult with:
 * - valid: true if the manifest passes all G0 checks
 * - errors: list of validation errors (empty if valid)
 * - warnings: list of non-fatal warnings
 * - canonical: the canonicalized manifest (only if valid)
 * - hash: the SHA-256 hash of the canonical form (only if valid)
 */
export function validateV5Manifest(raw: unknown): V5ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Manifest must be an object'], warnings };
  }

  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, MANIFEST_ALLOWED_FIELDS, 'manifest', errors);

  if (obj.manifest_schema !== MANIFEST_SCHEMA_VERSION) {
    errors.push(`Invalid manifest_schema "${obj.manifest_schema}". Expected "${MANIFEST_SCHEMA_VERSION}"`);
    return { valid: false, errors, warnings };
  }
  if (!isNonEmptyString(obj.id)) {
    errors.push('Field "id" must be a non-empty string');
    return { valid: false, errors, warnings };
  }
  if (!isNonEmptyString(obj.version)) {
    errors.push('Field "version" must be a non-empty string');
    return { valid: false, errors, warnings };
  }
  if (!isNonEmptyString(obj.provides)) {
    errors.push('Field "provides" must be a non-empty string');
    return { valid: false, errors, warnings };
  }

  const assurance = validateAssurance(obj.assurance, errors);
  const specQual = validateSpecQualification(obj.spec_qualification, errors);
  const contracts = validateContractChecks(obj.contract_checks, errors);
  const freeze = validateFreeze(obj.freeze, errors);
  const numeric = validateNumeric(obj.numeric, errors);
  const modelGaps = validateModelGaps(obj.model_gaps, errors);
  const emit = validateEmit(obj.emit, errors);
  const attestation = validateAttestation(obj.attestation, errors);
  const ports = validatePorts(obj.ports, errors);
  const claims = validateClaims(obj.claims, errors);

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const canonical: V5Manifest = {
    manifest_schema: '5.0',
    id: obj.id,
    version: obj.version,
    provides: obj.provides,
    assurance: assurance!,
    spec_qualification: specQual!,
    contract_checks: contracts!,
    freeze: freeze!,
    numeric: numeric!,
    model_gaps: modelGaps!,
    emit: emit!,
    attestation: attestation!,
    ports: ports!,
    claims: claims!
  };

  const hash = hashManifest(canonical);

  if (canonical.assurance.requested_tier === 'A4') {
    warnings.push('A4 tier requires two or more diverse kernels — ensure checker quorum is met');
  }
  if (canonical.numeric.cross_target === 'bit_exact') {
    warnings.push('bit_exact cross-target mode requires correctly-rounded IEEE operations or shared soft-float');
  }

  return { valid: true, errors: [], warnings, canonical, hash };
}

// ==========================================
// index.lock entry validator
// ==========================================

const INDEX_LOCK_ALLOWED_FIELDS = new Set([
  'id', 'version', 'manifest_root', 'behavior_sha', 'statement_sha',
  'achieved_tier', 'obligations', 'qualification', 'checkers', 'tcb',
  'model_gaps', 'verified_for_targets', 'build_attestation', 'signature', 'log_index'
]);

export function validateIndexLockEntry(raw: unknown): { valid: boolean; errors: string[]; entry?: V5IndexLockEntry } {
  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['index.lock entry must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, INDEX_LOCK_ALLOWED_FIELDS, 'index.lock', errors);

  if (!isNonEmptyString(obj.id)) errors.push('Field "id" must be a non-empty string');
  if (!isNonEmptyString(obj.version)) errors.push('Field "version" must be a non-empty string');
  if (!isNonEmptyString(obj.manifest_root)) errors.push('Field "manifest_root" must be a non-empty string');
  if (!isNonEmptyString(obj.behavior_sha)) errors.push('Field "behavior_sha" must be a non-empty string');
  if (!isNonEmptyString(obj.statement_sha)) errors.push('Field "statement_sha" must be a non-empty string');
  if (!isNonEmptyString(obj.signature)) errors.push('Field "signature" must be a non-empty string');
  if (!isNonEmptyString(obj.build_attestation)) errors.push('Field "build_attestation" must be a non-empty string');

  if (typeof obj.achieved_tier !== 'object' || obj.achieved_tier === null) {
    errors.push('Field "achieved_tier" must be an object');
  } else {
    for (const [k, v] of Object.entries(obj.achieved_tier)) {
      if (!validateTier(v, `achieved_tier.${k}`, errors)) break;
    }
  }

  if (typeof obj.obligations !== 'object' || obj.obligations === null) {
    errors.push('Field "obligations" must be an object');
  } else {
    const o = obj.obligations as Record<string, unknown>;
    if (!isNumber(o.total) || !isNumber(o.discharged) || !isNumber(o.waived)) {
      errors.push('Field "obligations" requires total, discharged, waived numbers');
    }
  }

  if (!Array.isArray(obj.checkers)) {
    errors.push('Field "checkers" must be an array');
  }
  if (!Array.isArray(obj.tcb)) {
    errors.push('Field "tcb" must be an array');
  }
  if (!Array.isArray(obj.verified_for_targets)) {
    errors.push('Field "verified_for_targets" must be an array');
  }
  if (!isNumber(obj.log_index)) {
    errors.push('Field "log_index" must be a number');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], entry: obj as unknown as V5IndexLockEntry };
}

// ==========================================
// Adapter manifest validator
// ==========================================

const ADAPTER_ALLOWED_FIELDS = new Set([
  'manifest_schema', 'kind', 'id', 'params', 'contract', 'proof'
]);

export function validateAdapterManifest(raw: unknown): { valid: boolean; errors: string[]; entry?: V5AdapterManifest } {
  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Adapter manifest must be an object'] };
  }
  const obj = raw as Record<string, unknown>;
  rejectUnknownFields(obj, ADAPTER_ALLOWED_FIELDS, 'adapter', errors);

  if (obj.manifest_schema !== '5.0') {
    errors.push(`Invalid manifest_schema "${obj.manifest_schema}". Expected "5.0"`);
  }
  if (obj.kind !== 'adapter') {
    errors.push(`Invalid kind "${obj.kind}". Expected "adapter"`);
  }
  if (!isNonEmptyString(obj.id)) {
    errors.push('Field "id" must be a non-empty string');
  }
  if (typeof obj.params !== 'object' || obj.params === null) {
    errors.push('Field "params" must be an object');
  }
  if (typeof obj.contract !== 'object' || obj.contract === null) {
    errors.push('Field "contract" must be an object');
  } else {
    const c = obj.contract as Record<string, unknown>;
    if (!isNonEmptyString(c.in_clock) || !isNonEmptyString(c.out_clock)) {
      errors.push('Field "contract" requires "in_clock" and "out_clock" strings');
    }
  }
  if (typeof obj.proof !== 'object' || obj.proof === null) {
    errors.push('Field "proof" must be an object');
  } else {
    const p = obj.proof as Record<string, unknown>;
    if (!isNonEmptyString(p.path)) {
      errors.push('Field "proof.path" must be a non-empty string');
    }
    if (!validateTier(p.tier, 'proof.tier', errors)) {
      // already added to errors
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], entry: obj as unknown as V5AdapterManifest };
}

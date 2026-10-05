import { describe, it, expect } from 'vitest';

import {
  HmacLockSigner,
  NoopSigner,
  resolveLockKeys,
  verifyLockEntry,
  writeV5LockEntry,
  type LockWriterInput,
  type ProvenanceLogger,
} from '../src/lib/v5LockWriter';
import type { V5IndexLockEntry } from '../src/types';

const SECRET = 'test-key-0123456789abcdef';
const PREVIOUS = 'previous-key-9876543210fedcba';

const logger: ProvenanceLogger = {
  append: () => ({ hash: 'h', prev: 'p' }),
  chainLength: () => 7,
};

function input(): LockWriterInput {
  return {
    manifest: { id: 'm', version: '1' } as never,
    gateResults: [{ gate: 'g0', passed: true, evidence: 'e', details: [] }],
    behaviorSha: 'b'.repeat(8),
    statementSha: 's'.repeat(8),
    achievedTier: {},
    obligations: { total: 2, discharged: 2, waived: 0 },
    qualification: { mutation_kill: 1, functional_check: 'pass', dual_spec: 'pass' },
    checkers: [{ id: 'c', lineage: 'l' }],
    tcb: ['tcb'],
    model_gaps: { total: 0, discharged: 0 },
    verifiedForTargets: ['t'],
    buildAttestation: 'a',
    signerIdentity: 'test',
    logIndex: 0,
  };
}

function signed(secret = SECRET): V5IndexLockEntry {
  const r = writeV5LockEntry(input(), new HmacLockSigner(secret), logger);
  expect(r.success).toBe(true);
  return r.lockEntry!;
}

describe('verifyLockEntry', () => {
  it('verifies a well-formed entry and names the key that signed it', () => {
    const verdict = verifyLockEntry(signed(), new HmacLockSigner(SECRET));
    expect(verdict).toEqual({ valid: true, verifiedBy: 'current' });
  });

  it('rejects a tampered entry', () => {
    const entry = signed();
    const verdict = verifyLockEntry({ ...entry, behavior_sha: 'tampered!' }, new HmacLockSigner(SECRET));
    expect(verdict.valid).toBe(false);
    expect(verdict.verifiedBy).toBeNull();
    expect(verdict.reason).toContain('tampered');
  });

  it('accepts the retiring key during a rotation and says which one verified', () => {
    const entry = signed(PREVIOUS);
    const verdict = verifyLockEntry(entry, { current: new HmacLockSigner(SECRET), previous: new HmacLockSigner(PREVIOUS) });
    expect(verdict.valid).toBe(true);
    expect(verdict.verifiedBy).toBe('previous');
  });

  it('reports unverifiable rather than valid-or-tampered when no key is configured', () => {
    const verdict = verifyLockEntry(signed(), { current: null, previous: null });
    expect(verdict.valid).toBe(false);
    expect(verdict.verifiedBy).toBeNull();
    expect(verdict.reason).toContain('No signing key');
  });

  it('still enforces obligations, model gaps and statement_sha', () => {
    const key = new HmacLockSigner(SECRET);
    // Mutating AFTER signing breaks the signature first (correct), so each
    // case re-signs the tampered entry to reach the check under test.
    const resign = (mutate: (e: V5IndexLockEntry) => void): V5IndexLockEntry => {
      const entry = signed();
      mutate(entry);
      const { signature: _old, ...signable } = entry;
      return { ...entry, signature: key.sign(JSON.stringify(signable)) };
    };
    expect(verifyLockEntry(resign((e) => { e.obligations = { total: 2, discharged: 1, waived: 0 }; }), key).reason).toContain('Obligations');
    expect(verifyLockEntry(resign((e) => { e.model_gaps = { total: 1, discharged: 0 }; }), key).reason).toContain('Model gaps');
    expect(verifyLockEntry(resign((e) => { e.statement_sha = ''; }), key).reason).toContain('statement_sha');
  });

  it('refuses to write when a gate failed, so the check is not the only gate', () => {
    const bad = { ...input(), gateResults: [{ gate: 'g0', passed: false, evidence: 'e', details: [] }] };
    const r = writeV5LockEntry(bad, new HmacLockSigner(SECRET), logger);
    expect(r.success).toBe(false);
    expect(r.error).toContain('gate(s) failed');
  });

  it('the NoopSigner verifies its own entries (test-only, never production)', () => {
    const r = writeV5LockEntry(input(), new NoopSigner(), logger);
    expect(verifyLockEntry(r.lockEntry!, new NoopSigner()).valid).toBe(true);
  });
});

describe('resolveLockKeys', () => {
  it('reads current and previous keys, and refuses short ones', () => {
    const keys = resolveLockKeys({
      V5_LOCK_HMAC_KEY: SECRET,
      V5_LOCK_HMAC_KEY_PREVIOUS: PREVIOUS,
    } as NodeJS.ProcessEnv);
    expect(keys.current).not.toBeNull();
    expect(keys.previous).not.toBeNull();

    const short = resolveLockKeys({ V5_LOCK_HMAC_KEY: 'tiny' } as NodeJS.ProcessEnv);
    expect(short.current).toBeNull();

    const empty = resolveLockKeys({});
    expect(empty).toEqual({ current: null, previous: null });
  });

  it('a key shorter than 16 chars signs nothing because it resolves to null', () => {
    // 16 chars is the floor: anything shorter is closer to a typo than a key.
    const keys = resolveLockKeys({ V5_LOCK_HMAC_KEY: '123456789012345' } as NodeJS.ProcessEnv);
    expect(keys.current).toBeNull();
  });
});

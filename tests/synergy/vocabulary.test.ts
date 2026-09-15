// tests/synergy/vocabulary.test.ts
import { describe, it, expect } from 'vitest';
import {
  PRIMITIVES,
  FUNCTORS,
  VOCAB_VERSION,
  canonicalizeTerm,
  isKnownPrimitive,
  vocabularyTerms,
  vocabularyHash,
  bridgeTerms,
} from '../../src/lib/synergy/vocabulary.js';
import { manifestHash } from '../../src/lib/synergy/manifest.js';

describe('controlled vocabulary', () => {
  it('canonicalizes surface terms to stable ids', () => {
    expect(canonicalizeTerm('Time Series!')).toBe('time_series');
    expect(canonicalizeTerm('  Graph  ')).toBe('graph');
    expect(canonicalizeTerm('optimization')).toBe('optimization');
  });

  it('recognizes only known primitives', () => {
    expect(isKnownPrimitive('graph')).toBe(true);
    expect(isKnownPrimitive('nonsense')).toBe(false);
  });

  it('terms = primitives + functors; bridges = primitives only', () => {
    expect(vocabularyTerms()).toContain('graph');
    expect(vocabularyTerms().length).toBe(PRIMITIVES.length + FUNCTORS.length);
    expect(bridgeTerms()).not.toContain('depends_on');
    expect(bridgeTerms().length).toBe(PRIMITIVES.length);
    expect(VOCAB_VERSION).toBe('1.0.0');
  });

  it('pins the vocabulary fingerprint and detects any change', () => {
    const digest = vocabularyHash();
    expect(digest).toHaveLength(64);
    // Golden value: pin the exact digest so any vocabulary/encoding change fails.
    expect(digest).toBe('f6cb72357f01b72d70558132ed5b3201943d7372f807f8569e22d9a5dcbfa42e');
  });

  it('length-prefixes separate primitive/functor lists so the boundary is load-bearing', () => {
    const separated = manifestHash([
      VOCAB_VERSION,
      ...PRIMITIVES.map((p) => `P:${p}`),
      ...FUNCTORS.map((f) => `F:${f}`),
    ]);
    expect(separated).toBe(vocabularyHash());

    const collapsed = manifestHash([
      VOCAB_VERSION,
      ...[...PRIMITIVES, ...FUNCTORS].map((t) => `T:${t}`),
    ]);
    expect(collapsed).not.toBe(vocabularyHash());
  });
});

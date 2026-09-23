import { describe, it, expect } from 'vitest';
import {
  canonicalDomain,
  canonicalForDraymond,
  draymondDomainsFor,
  draymondPrimaryFor,
  sectorsFor,
  canonicalForTrendDomain,
  aliasFor,
} from '../src/lib/crossDomainVocabulary';

describe('crossDomainVocabulary — one join key for trend + synergy + Draymond', () => {
  it('canonicalizes trend domains and sectors onto one alias id', () => {
    expect(canonicalDomain('oncology')).toBe('health_oncology');
    expect(canonicalDomain('ai_health')).toBe('health_oncology');
    expect(canonicalDomain('health_oncology')).toBe('health_oncology');
    expect(canonicalDomain('aging')).toBe('aging');
  });

  it('returns unknown domains unchanged (lower-cased), never forced into an alias', () => {
    expect(canonicalDomain('Weird_Domain')).toBe('weird_domain');
    expect(aliasFor('weird_domain')).toBeUndefined();
  });

  it('maps aliases to Draymond science domains and back (fan-out for biotech)', () => {
    expect(draymondPrimaryFor('health_oncology')).toBe('biotech');
    expect(draymondPrimaryFor('sports')).toBe('sports');
    expect(draymondDomainsFor('mathematics')).toEqual([]);
    expect(canonicalForDraymond('biotech').sort()).toEqual(['aging', 'health_oncology']);
    expect(canonicalForDraymond('sports')).toEqual(['sports']);
  });

  it('exposes sectors and trend-domain lookups', () => {
    expect(sectorsFor('health_oncology')).toEqual(['health_oncology']);
    expect(canonicalForTrendDomain('ai_health')).toBe('health_oncology');
    expect(canonicalForTrendDomain('nope')).toBeNull();
  });
});

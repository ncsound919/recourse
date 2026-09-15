import { describe, it, expect } from 'vitest';
import { sha256Hex, stableStringify, manifestHash } from '../../src/lib/synergy/manifest.js';

describe('manifest hashing', () => {
  it('sha256Hex matches the known SHA-256 vector', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('stableStringify sorts object keys but keeps array order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify([2, 1])).toBe('[2,1]');
    expect(stableStringify({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}');
  });

  it('manifestHash pins the length-prefixed encoding', () => {
    expect(manifestHash(['a', 'b'])).toBe('741ec24e4655101bc81a027de2d70fb867ca1045735cb596aa643d91b9b3bce6');
    expect(manifestHash(['a', 'b'])).not.toBe(manifestHash(['b', 'a']));
  });

  it('manifestHash encoding is injective (no newline collision)', () => {
    expect(manifestHash(['a\nb'])).not.toBe(manifestHash(['a', 'b']));
  });
});

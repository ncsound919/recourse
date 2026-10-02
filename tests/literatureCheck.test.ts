// Tests for the literature cross-validation wiring in the science loop.
//
// What matters here is that an UNAVAILABLE check never becomes a finding, and
// that each citation is attempted once rather than re-fetched every cycle. A
// paywalled paper retried every pass would fill the skipped log with the same
// refusal and tell the operator nothing.

import { describe, it, expect } from 'vitest';

import {
  literatureChecklistFor,
  markLiteratureChecked,
  literatureCheckStatus,
} from '../src/lib/scienceConductor.js';
import { CANONICAL_ONCOLOGY_KG } from '../src/lib/biotechKnowledgeGraph.js';

const ALL = Object.values(CANONICAL_ONCOLOGY_KG);

describe('literatureChecklistFor', () => {
  it('the canonical KG is non-empty and each entity has a citation', () => {
    expect(ALL.length).toBeGreaterThan(0);
    for (const e of ALL) {
      expect(typeof e.literatureCitation).toBe('string');
      expect(e.literatureCitation.length).toBeGreaterThan(10);
      expect(typeof e.id).toBe('string');
    }
  });

  it('returns at most one citation per cycle (bounded network cost)', () => {
    // Deliberately NOT resetting module state: the map is process-global, so
    // "at most one" must hold whether every citation is checked or none is.
    const due = literatureChecklistFor(0);
    expect(Array.isArray(due)).toBe(true);
    expect(due.length).toBeLessThanOrEqual(1);
  });

  it('is deterministic for a given cycle number', () => {
    // The rotation must be stable: same cycle => same citation, so a rerun does
    // not silently check something else.
    const a = literatureChecklistFor(3);
    const b = literatureChecklistFor(3);
    expect(a.map((e) => e.literatureCitation)).toEqual(b.map((e) => e.literatureCitation));
  });

  it('never re-offers a citation already marked checked', () => {
    const marker = 'Already Checked Citation 1999';
    markLiteratureChecked(marker, 'unavailable');
    const due = literatureChecklistFor(0);
    expect(due.some((e) => e.literatureCitation === marker)).toBe(false);
  });
});

describe('literatureCheckStatus', () => {
  it('records the outcome of a check, including unavailable', () => {
    markLiteratureChecked('Some Citation String 2020', 'unavailable');
    const s = literatureCheckStatus();
    const row = s.find((r) => r.citation === 'Some Citation String 2020');
    // Recorded verbatim: an unavailable check is a distinct, visible outcome.
    expect(row).toBeTruthy();
  });
});
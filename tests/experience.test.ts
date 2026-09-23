import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordExperience, principlesFor, experienceHint, experienceSnapshot, readExperienceStore } from '../src/lib/experience';

const dirs: string[] = [];
function tmpFile(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-'));
  dirs.push(d);
  return path.join(d, 'experience.json');
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  delete process.env.EXPERIENCE_FILE;
});

describe('experience — self-distilled principles (arXiv:2510.16079)', () => {
  it('distills a Laplace-smoothed pass rate per (domain, strategy)', () => {
    process.env.EXPERIENCE_FILE = tmpFile();
    recordExperience('coding', 'edge-correctness', true);
    recordExperience('coding', 'edge-correctness', true);
    recordExperience('coding', 'edge-correctness', false);
    const p = principlesFor('coding')[0];
    expect(p.strategy).toBe('edge-correctness');
    expect(p.wins).toBe(2);
    expect(p.losses).toBe(1);
    // (2+1)/(3+2) = 0.6
    expect(p.passRate).toBe(0.6);
  });

  it('orders principles by pass rate and only hints past a min observation count', () => {
    process.env.EXPERIENCE_FILE = tmpFile();
    recordExperience('math', 'minimal', false);
    recordExperience('math', 'minimal', false);
    recordExperience('math', 'edge-correctness', true);
    recordExperience('math', 'edge-correctness', true);
    const principles = principlesFor('math');
    expect(principles[0].strategy).toBe('edge-correctness');
    // 2 observations each >= 3? default minObservations is 3 -> no hint yet.
    expect(experienceHint('math')).toBeNull();
    recordExperience('math', 'edge-correctness', true);
    const hint = experienceHint('math');
    expect(hint).toContain('edge-correctness');
    expect(experienceSnapshot().domains).toContain('math');
    expect(readExperienceStore().principles.length).toBe(2);
  });

  it('has no hint for a domain with no real outcomes', () => {
    process.env.EXPERIENCE_FILE = tmpFile();
    expect(experienceHint('biotech')).toBeNull();
    expect(experienceSnapshot().principles).toBe(0);
  });
});

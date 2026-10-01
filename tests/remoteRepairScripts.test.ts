import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  learnerStressEvalScript,
  stuckDiagnosisScript,
  diagnosisConfidenceActionable,
} from '../src/lib/remoteRepairScripts';
import { parseRemoteResult, REMOTE_RESULT_MARKER } from '../src/lib/remoteCompute';

// Executing the generated scripts spawns a real Python+numpy/scipy process
// (scipy import can take ~10s), so it is OPT-IN via RECOURSE_PY_EXEC_TESTS=1.
// The default suite still validates script shape deterministically and fast.
const RUN_PY = process.env.RECOURSE_PY_EXEC_TESTS === '1';
let PYTHON_OK = false;
if (RUN_PY) {
  try {
    execFileSync('python', ['-c', 'import numpy, scipy'], { stdio: 'ignore', timeout: 120_000 });
    PYTHON_OK = true;
  } catch {
    PYTHON_OK = false;
  }
}
const EXEC = 120_000;

/** Run a script that sets `result` and return the parsed JSON envelope. */
function runScript(script: string): Record<string, unknown> | null {
  const code = `import json\n${script}\nprint("${REMOTE_RESULT_MARKER}" + json.dumps(result))`;
  const out = execFileSync('python', ['-c', code], { encoding: 'utf-8', timeout: 60_000 });
  return parseRemoteResult(out).data ?? null;
}

describe('remoteRepairScripts', () => {
  it('learnerStressEvalScript returns null with too little forecast history', () => {
    const pairs = Array.from({ length: 5 }, (_, i) => ({ predicted: 0.5, realized: i % 2 }));
    expect(learnerStressEvalScript(pairs)).toBeNull();
  });

  it('learnerStressEvalScript embeds the real window and leaves the envelope to the job builder', () => {
    const pairs = Array.from({ length: 20 }, (_, i) => ({ predicted: 0.5, realized: i % 2 }));
    const script = learnerStressEvalScript(pairs)!;
    expect(script).not.toBeNull();
    expect(script.script).toContain('np.array');
    expect(script.script).not.toContain(REMOTE_RESULT_MARKER);
    expect(script.requirements).toContain('numpy');
  });

  it.skipIf(!PYTHON_OK)('learner stress eval computes a bounded externalScore', () => {
    const pairs = Array.from({ length: 40 }, (_, i) => ({ predicted: 0.5 + 0.2 * Math.sin(i), realized: (i % 2) }));
    const script = learnerStressEvalScript(pairs, { bootstrap: 64 })!;
    const result = runScript(script.script)!;
    expect(result.ok).toBe(true);
    expect(result.n).toBe(40);
    expect(result.externalScore as number).toBeGreaterThanOrEqual(0);
    expect(result.externalScore as number).toBeLessThanOrEqual(1);
  }, EXEC);

  it('stuckDiagnosisScript returns null without enough points', () => {
    const out = stuckDiagnosisScript({ id: 'goal:x', name: 'X', detail: 'd' }, { series: [1, 2, 3], label: 'x' });
    expect(out).toBeNull();
  });

  it.skipIf(!PYTHON_OK)('flags a genuine sustained regression', () => {
    const series = [1.0, 1.0, 1.0, 1.0, 0.2, 0.15, 0.1, 0.05];
    const script = stuckDiagnosisScript({ id: 'goal:math-no-solve', name: 'Math goal', detail: 'stalled' }, { series, label: 'math attempt score' })!;
    const result = runScript(script.script)!;
    expect(result.ok).toBe(true);
    expect(result.issueId).toBe('goal:math-no-solve');
    expect(result.regressed).toBe(true);
    expect(result.confidence as number).toBeGreaterThan(0.9);
    expect(diagnosisConfidenceActionable(result.confidence)).toBe(true);
  }, EXEC);

  it.skipIf(!PYTHON_OK)('does not flag noise as a regression', () => {
    const series = [0.5, 0.6, 0.4, 0.55, 0.45, 0.6, 0.5, 0.55];
    const script = stuckDiagnosisScript({ id: 'x', name: 'X', detail: 'd' }, { series, label: 'metric' })!;
    const result = runScript(script.script)!;
    expect(result.ok).toBe(true);
    expect(result.regressed).toBe(false);
  }, EXEC);

  it('diagnosisConfidenceActionable gates on 0.9', () => {
    expect(diagnosisConfidenceActionable(0.95)).toBe(true);
    expect(diagnosisConfidenceActionable(0.5)).toBe(false);
    expect(diagnosisConfidenceActionable('nope')).toBe(false);
  });
});

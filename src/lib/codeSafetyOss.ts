// src/lib/codeSafetyOss.ts
//
// Semgrep-backed static code safety screen. Replacement for the regex-based
// screen in codeSafety.ts — uses Semgrep's pattern matching for robust
// detection of dangerous code patterns (eval, process access, etc.).

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface SafetyViolation {
  rule: string;
  message: string;
  line: number;
  severity: 'error' | 'warning';
}

export interface SafetyScreenResult {
  safe: boolean;
  violations: SafetyViolation[];
  scanned: boolean;
  reason?: string;
}

const SEMGREP_RULES = `
rules:
  - id: no-eval
    pattern: eval(...)
    message: "eval() is not allowed in sandboxed code"
    severity: ERROR
    languages: [javascript, typescript]
  - id: no-process-access
    patterns:
      - pattern: process.$_
    message: "process access is not allowed in sandboxed code"
    severity: ERROR
    languages: [javascript, typescript]
  - id: no-require
    pattern: require(...)
    message: "require() is not allowed in sandboxed code"
    severity: ERROR
    languages: [javascript, typescript]
  - id: no-child-process
    pattern: require('child_process')
    message: "child_process is not allowed in sandboxed code"
    severity: ERROR
    languages: [javascript, typescript]
  - id: no-fs-access
    pattern: require('fs')
    message: "fs access is not allowed in sandboxed code"
    severity: ERROR
    languages: [javascript, typescript]
  - id: no-global-this
    pattern: globalThis
    message: "globalThis is not allowed in sandboxed code"
    severity: ERROR
    languages: [javascript, typescript]
  - id: no-constructor-access
    patterns:
      - pattern: $_.constructor
    message: "constructor access is not allowed in sandboxed code"
    severity: WARNING
    languages: [javascript, typescript]
`;

let semgrepAvailable: boolean | null = null;

/** Wall-clock budget for a single semgrep invocation.
 *
 *  A fixed 10s budget was too tight once several scans run concurrently: the
 *  child was killed mid-run, the catch at the bottom turned that into
 *  `scanned: false`, and a genuinely scanned file reported as "not scanned" —
 *  a silent hole in the safety screen rather than a visible failure. The budget
 *  is now configurable and defaults well above cold-start cost; anything below
 *  1s is treated as invalid so a typo cannot silently disable the timeout. */
export const SEMGREP_TIMEOUT_DEFAULT_MS = 30_000;

export function semgrepTimeoutMs(): number {
  const raw = Number(process.env.SEMGREP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1_000 ? raw : SEMGREP_TIMEOUT_DEFAULT_MS;
}

export function isSemgrepAvailable(): boolean {
  if (semgrepAvailable !== null) return semgrepAvailable;
  try {
    execSync('semgrep --version', { stdio: 'pipe', timeout: semgrepTimeoutMs() });
    semgrepAvailable = true;
  } catch {
    semgrepAvailable = false;
  }
  return semgrepAvailable;
}

export function screenCodeWithSemgrep(code: string): SafetyScreenResult {
  if (!isSemgrepAvailable()) {
    return {
      safe: true,
      violations: [],
      scanned: false,
      reason: 'semgrep not installed — falling back to regex screen',
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semgrep-'));
  const codeFile = path.join(tmpDir, 'code.ts');
  const rulesFile = path.join(tmpDir, 'rules.yaml');

  try {
    fs.writeFileSync(codeFile, code);
    fs.writeFileSync(rulesFile, SEMGREP_RULES);

    const output = execSync(
      `semgrep --config ${rulesFile} --json ${codeFile}`,
      { encoding: 'utf-8', timeout: semgrepTimeoutMs(), stdio: ['pipe', 'pipe', 'pipe'] },
    );

    const result = JSON.parse(output);
    const violations: SafetyViolation[] = (result.results || []).map((r: any) => ({
      rule: r.check_id,
      message: r.extra?.message || 'violation',
      line: r.start?.line || 0,
      severity: r.extra?.severity?.toLowerCase() === 'error' ? 'error' : 'warning',
    }));

    return {
      safe: violations.filter((v) => v.severity === 'error').length === 0,
      violations,
      scanned: true,
    };
  } catch (err: any) {
    // A killed/expired scan is NOT a clean bill of health: `safe` stays true
    // only because the caller falls back to the regex screen, but `scanned`
    // remains false and the reason names the timeout so a stalled screen can
    // never be mistaken for a screen that found nothing.
    const timedOut = err?.code === 'ETIMEDOUT' || /timed? ?out/i.test(String(err?.message ?? ''));
    return {
      safe: true,
      violations: [],
      scanned: false,
      reason: timedOut
        ? `semgrep timed out after ${semgrepTimeoutMs()}ms — falling back to regex screen`
        : err?.message || 'semgrep execution failed',
    };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

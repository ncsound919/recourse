/**
 * Real open-source lint gate — oxlint (Rust-based JS/TS linter).
 *
 * Candidate source is written to a temp file and linted with the actual
 * oxlint binary. Only severity-2 (error) diagnostics block a promotion;
 * warnings are reported but tolerated, and the report says exactly what ran.
 * If the binary is missing the gate reports `available:false` — it never
 * pretends code was linted when it was not.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export interface LintReport {
  available: boolean;
  clean: boolean;
  errors: number;
  warnings: number;
  details: string[];
}

function oxlintBin(): string | null {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'oxlint', 'bin', 'oxlint'),
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'node_modules', 'oxlint', 'bin', 'oxlint'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function lintSource(source: string, language: 'js' | 'ts' = 'js'): LintReport {
  const bin = oxlintBin();
  if (!bin) {
    return { available: false, clean: false, errors: 0, warnings: 0, details: ['oxlint binary not installed; lint gate did not run'] };
  }

  const file = path.join(os.tmpdir(), `recourse_lint_${crypto.randomBytes(4).toString('hex')}.${language}`);
  try {
    fs.writeFileSync(file, source, 'utf-8');
    const res = spawnSync(process.execPath, [
      bin,
      '--format', 'json',
      // Only two noise-tolerant categories are enabled at warn level.
      '-W', 'suspicious',
      '-W', 'perf',
      // The actual safety gate: explicit deny on unsafe constructs (these
      // are errors and block promotion).
      '-D', 'no-eval',
      '-D', 'no-implied-eval',
      '-D', 'no-new-func',
      '-D', 'no-const-assign',
      '-D', 'no-debugger',
      '-D', 'no-unreachable',
      '-D', 'no-unsafe-optional-chaining',
      file,
    ], {
      encoding: 'utf-8',
      timeout: 20000,
      windowsHide: true,
    });

    let errors = 0;
    let warnings = 0;
    const details: string[] = [];
    try {
      const parsed = JSON.parse(res.stdout || '[]');
      // oxlint emits either { diagnostics: [...] } or a per-file array.
      const messages: any[] = Array.isArray(parsed)
        ? parsed.flatMap((f: any) => f?.messages || [])
        : parsed?.diagnostics || [];
      for (const m of messages) {
        const rawSev = m?.severity;
        const isErr = rawSev === 'error' || Number(rawSev) >= 2;
        if (isErr) errors++;
        else warnings++;
        const line = m?.labels?.[0]?.span?.line ?? m?.line ?? '?';
        const col = m?.labels?.[0]?.span?.column ?? m?.column ?? '?';
        details.push(`[${isErr ? 'error' : 'warning'}] ${m?.code || m?.rule_id || 'rule'}:${line}:${col} ${m?.message || ''}`.trim());
      }
    } catch {
      // Non-JSON output — fall back to exit code.
      if (res.status !== 0) {
        errors = 1;
        details.push((res.stdout || res.stderr || '').split('\n').filter(Boolean).slice(0, 8).join('\n'));
      }
    }

    return { available: true, clean: errors === 0, errors, warnings, details };
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

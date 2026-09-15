/**
 * ECOS Development Integration — the seam that lets Recourse continuously
 * develop Overlay Environmental initiatives through the IDS apply gate.
 *
 * Honesty contract:
 *  - Recourse never writes an IDS itself. It proposes a candidate; the ECOS
 *    gate (`initiatives/gate.mjs`) runs the real verifier and only then keeps
 *    the change. `applied:true` is returned ONLY when the gate exits 0.
 *  - Rejections return the verifier's real reasons verbatim — never softened.
 *  - The gate enforces the path boundary (initiatives/registry/P##_*.json),
 *    so a driver cannot touch ECOS source, env, or CI.
 *  - Missing gate / missing ECOS_REPO => honest `applied:false` with a reason,
 *    never a fabricated success.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface EcosPatchResult {
  applied: boolean;
  token?: string;
  reason: string;
  raw: string;
}

const REGISTRY_RE = /^initiatives\/registry\/P\d{2}_[A-Z_]+\.json$/;

export function ecosRepoRoot(): string {
  return path.resolve(
    process.env.ECOS_REPO ??
      'C:/Users/User/Downloads/Uplift/01_Platforms/ECOS-Environmental-Initiatives',
  );
}

function gatePath(): string {
  return path.join(ecosRepoRoot(), 'initiatives', 'gate.mjs');
}

export function ecosGateAvailable(): boolean {
  return existsSync(gatePath());
}

function runGate(extraArgs: string[], input?: string): { status: number | null; raw: string; error?: string } {
  const res = spawnSync('node', [gatePath(), ...extraArgs], {
    cwd: ecosRepoRoot(),
    input,
    encoding: 'utf8',
    timeout: 60_000,
  });
  const raw = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  const error = res.error ? String(res.error) : undefined;
  return { status: res.status, raw, error };
}

/**
 * Propose a new IDS for one initiative. `source` is the complete JSON text.
 * Only a gate pass promotes it; a rejection is reported with the verifier's
 * exact output and leaves ECOS untouched.
 */
export function applyEcosIdsPatch(opts: { driverId: string; file: string; source: string }): EcosPatchResult {
  const file = opts.file.replace(/\\/g, '/');
  if (!REGISTRY_RE.test(file)) {
    return { applied: false, reason: `refused: file must match initiatives/registry/P##_CODE.json (got ${file})`, raw: '' };
  }
  try {
    JSON.parse(opts.source);
  } catch (e) {
    return { applied: false, reason: `refused: candidate is not valid JSON (${(e as Error).message})`, raw: '' };
  }
  if (!ecosGateAvailable()) {
    return { applied: false, reason: `ECOS gate not found at ${gatePath()} — set ECOS_REPO`, raw: '' };
  }

  const { status, raw, error } = runGate(['--driver', opts.driverId, '--file', file], opts.source);
  if (error) return { applied: false, reason: `gate spawn error: ${error}`, raw };
  if (status === 0) {
    const token = /rollback token: ([0-9a-f]+)/.exec(raw)?.[1];
    return { applied: true, token, reason: 'gate passed: verifier green', raw };
  }
  return { applied: false, reason: 'gate rejected the candidate (verifier failed)', raw };
}

export function revertEcosPatch(token: string): EcosPatchResult {
  if (!ecosGateAvailable()) return { applied: false, reason: 'ECOS gate not found', raw: '' };
  const { status, raw, error } = runGate(['--revert', token]);
  if (error) return { applied: false, reason: `gate spawn error: ${error}`, raw };
  return { applied: status === 0, reason: status === 0 ? 'reverted' : 'revert failed', raw };
}

export function listEcosPatches(): unknown[] {
  if (!ecosGateAvailable()) return [];
  const { raw } = runGate(['--list']);
  try {
    return JSON.parse(raw || '[]') as unknown[];
  } catch {
    return [];
  }
}

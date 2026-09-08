/**
 * Capability adoption — the dogfood loop.
 *
 * Recourse has internal operations it genuinely performs (provenance integrity,
 * dedupe, numeric kernels). Each is a "capability." A capability can be *backed*
 * by a verified, self-hosted tool that Recourse built from its own templates,
 * or it falls back to a built-in implementation. Once adopted, the running
 * system actually routes its own work through the generated tool — it is
 * applied, not just stored and displayed.
 *
 * Honesty / determinism contract:
 *  - Only self-hosted tools whose owning registry gene is PROMOTED and
 *    PASSED_VERIFIER are adoptable (real suite evidence, not a cached claim).
 *  - Aggressive mode ("best-available always") picks the highest-scoring
 *    adoptable backing even if its output differs from the builtin. Every
 *    adoption and every served call is recorded so any behavior drift is
 *    attributable and auditable.
 *  - Adoption is additive: if nothing adoptable exists, the builtin serves and
 *    the capability is reported as "builtin". It never fabricates an adoption.
 *
 * This module is pure (no server imports) so the picker is unit-testable.
 */

import type { ToolEntry } from '../types';
import type { SelfHostedManifestEntry } from './selfHosting';

export type CapabilityId =
  | 'provenance_merkle'
  | 'dedupe'
  | 'numeric_kernel'
  | 'text_encode'
  | 'scheduler'
  | 'math_sequence'
  | 'verify_gate';

export interface CapabilityDef<TCtx = any, TOut = unknown> {
  id: CapabilityId;
  label: string;
  /** Template id that may back this capability. */
  backableTemplateId: string;
  /** Self-hosted method name invoked when a tool backs the capability. */
  method: string;
  /** Build the invocation arg array from an operation context. */
  args: (ctx: TCtx) => unknown[];
  /** Built-in deterministic implementation (serves until adoption). */
  builtin: (ctx: TCtx) => TOut;
}

export type BackingSource = 'builtin' | 'selfhosted';

export interface CapabilityBacking {
  id: CapabilityId;
  source: BackingSource;
  /** Self-hosted tool name (when source === 'selfhosted'). */
  toolName?: string;
  templateId?: string;
  /** The owning registry gene's current promoted score. */
  score?: number;
  /** Content hash of the adopted module. */
  hash?: string;
}

/**
 * Look up the owning registry gene for a self-hosted entry. Only a gene whose
 * CURRENT promoted version passed the verifier counts as adoptable.
 */
export function owningGeneScore(
  entry: SelfHostedManifestEntry,
  registry: ToolEntry[]
): { score: number; hash?: string } | null {
  const gene = registry.find((g) => g.name === entry.name);
  if (!gene) return null;
  const cur = gene.versions.find((v) => v.version === gene.currentVersion);
  if (!cur || cur.promoted !== true || cur.passed_verifier !== true) return null;
  return { score: typeof cur.score === 'number' ? cur.score : 0, hash: cur.hash };
}

/** Stable equality used to detect when an adoption should (not) change. */
export function backingKey(b: CapabilityBacking): string {
  return b.source === 'builtin' ? 'builtin' : `${b.source}:${b.toolName}@${b.hash}`;
}

/** Parse the assertion count from a live-verify detail line, e.g.
 *  "Module import OK + 7 stored assertions green" -> 7. Verification depth:
 *  adoption prefers tools whose live verify exercised MORE assertions (a real
 *  behavioral signal, not just "imports without throwing"). */
function verifyDepth(entry: SelfHostedManifestEntry): number {
  const d = entry.lastVerified?.detail ?? '';
  const m = d.match(/(\d+)\s*stored assertions?/i);
  if (m) return Number(m[1]) || 0;
  if (/import\s+ok/i.test(d)) return 1; // import-only verify is depth 1
  return 0;
}

/**
 * Select the best adoptable backing for a capability (aggressive: highest
 * verified score, else builtin). Tiebreakers prefer deeper verification:
 * score (real sandbox pass-rate) > assertion depth > newest live-verify.
 * Pure and deterministic.
 */
export function selectBestBacking(
  cap: CapabilityDef,
  selfHosted: SelfHostedManifestEntry[],
  registry: ToolEntry[]
): CapabilityBacking {
  let best: { backing: CapabilityBacking; score: number; depth: number; at: number } | null = null;
  for (const entry of selfHosted) {
    if (!entry.lastVerified?.passed) continue; // must be live-import verified
    if (entry.templateId !== cap.backableTemplateId) continue;
    const gene = owningGeneScore(entry, registry);
    if (!gene) continue;
    const hasMethod = (entry.methods || []).some((m) => m.method === cap.method);
    if (!hasMethod) continue;
    const depth = verifyDepth(entry);
    const at = entry.lastVerifiedAt ?? 0;
    const isBetter =
      !best ||
      gene.score > best.score ||
      (gene.score === best.score && depth > best.depth) ||
      (gene.score === best.score && depth === best.depth && at > best.at);
    if (isBetter) {
      best = {
        score: gene.score,
        depth,
        at,
        backing: {
          id: cap.id,
          source: 'selfhosted',
          toolName: entry.name,
          templateId: entry.templateId,
          score: gene.score,
          hash: gene.hash ?? entry.hash,
        },
      };
    }
  }
  if (best) return best.backing;
  return { id: cap.id, source: 'builtin' };
}

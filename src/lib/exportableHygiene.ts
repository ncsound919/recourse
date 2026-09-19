/**
 * Drop-in hygiene for the `/api/recourse/skills/exportable` response.
 *
 * The route currently returns every registered tool (thousands), which is why
 * the Axiom port loop saw ~5,771 entries and only ~28 worth adopting. This wraps
 * the registry-hygiene primitives into the exact response payload the route
 * builds, so the wiring is a single call:
 *
 *   const { count, tools, hygiene } = buildExportableResponse(registry);
 *   res.json({ success: true, exportRoot, count, tools, hygiene });
 *
 * `raw: true` preserves the old behavior for callers that need the full list.
 */

import {
  dedupeRegistry,
  pruneDegraded,
  hygieneReport,
  type HygieneReport,
  type RegistryToolLike,
} from './registryHygiene';

export interface ExportableResponse<T> {
  success: true;
  count: number;
  tools: T[];
  hygiene: HygieneReport;
}

/**
 * Build the cleaned exportable payload: a tool must have a verified current
 * version and must be the best representative of its behavior key. Pure and
 * order-preserving (best representative keeps its original input position).
 */
export function buildExportableResponse<T extends RegistryToolLike>(
  tools: T[],
  opts: { raw?: boolean } = {}
): ExportableResponse<T> {
  const hygiene = hygieneReport(tools);
  const clean = opts.raw ? tools : dedupeRegistry(pruneDegraded(tools)).kept;
  return { success: true, count: clean.length, tools: clean, hygiene };
}

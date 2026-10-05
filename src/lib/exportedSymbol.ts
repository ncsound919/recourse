/**
 * Recover the function a generated tool actually exports.
 *
 * Registry entry names are LABELS, not symbols. Measured 2026-10-04 on the live
 * 1,289-row registry:
 *
 *   entry `swarm_systemic_505821`          holds `projectUtilization`
 *   entry `CODI_CYCLOMATIC_1a20`           holds `cyclomaticPressureScorer`
 *   entry `crossover_fibonacc_runLengt_69bf` holds `fibonacciN`
 *
 * `executionSandbox.ts` resolves a callee only from an explicit `functionName` or a
 * hardcoded 14-name allowlist, so all 1,199 of these were UNREACHABLE by
 * `toolName` despite containing working code. Proof, same tool and same args:
 *
 *   {toolName}                        -> success:false "No callable entrypoint"
 *   {toolName, functionName}          -> success:true
 *
 * That is a name-link defect, not inert inventory — and the inventory report that
 * called these rows phantom is what would have had them deleted.
 *
 * This lives in `lib/` rather than in the route because the registry
 * executability metric must use exactly the same resolution rule as the executor.
 * Two copies of this logic would let the metric and the runtime disagree, which is
 * how a "0 executable" reading becomes a deletion decision.
 */
export function resolveExportedFunctionName(source: string, entryName?: string): string | undefined {
  if (!source || typeof source !== 'string') return undefined;

  // Comments first: a commented-out `export function` is not a definition, and
  // selecting it binds a symbol that does not exist at runtime.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  const callable: string[] = [];
  const other: string[] = [];

  // One ordered pass. Each declaration is classified from the text immediately
  // AFTER it — never from the whole file, and never through a bounded lookahead to
  // the next export. A `[\s\S]{0,200}` cap silently matched nothing when the final
  // export's body exceeded 200 chars, which is exactly the case for
  // `redactSecrets` (1,782 chars) and `isPrivateIPv4` (1,218): the best-known
  // working tools resolved to nothing and would have been written off as dead.
  const decl = /export\s+(async\s+)?(function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g;
  for (const m of code.matchAll(decl)) {
    const kind = m[2];
    const name = m[3];

    if (kind === 'function') {
      callable.push(name);
      continue;
    }
    if (kind === 'class') {
      other.push(name);
      continue;
    }

    // const/let/var: decide from the INITIALIZER only. `export const f = (…) => {}`
    // is callable; `export const TABLE = [...]` is data and must never be bound as
    // the callee.
    const after = code.slice(m.index + m[0].length, m.index + m[0].length + 240);
    const eq = after.indexOf('=');
    if (eq === -1) {
      other.push(name);
      continue;
    }
    const init = after.slice(eq + 1).trim();
    const isArrow = /^(?:async\s+)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/.test(init);
    const isFnExpr = /^(?:async\s+)?function\b/.test(init);
    if (isArrow || isFnExpr) callable.push(name);
    else other.push(name);
  }

  if (entryName && callable.includes(entryName)) return entryName;
  if (entryName && other.includes(entryName)) return entryName;
  return callable[0] ?? other[0];
}

/**
 * The 14 names `executionSandbox.ts` will fall back to when no `functionName` is
 * supplied. Kept beside the resolver so the metric and the executor cannot drift.
 */
export const SANDBOX_CALLEE_FALLBACKS = [
  'execute', 'run', 'solveHornClauses', 'sanitizeBuffer', 'createBellState',
  'groverDiffusion', 'planRoutes', 'cosineDistance', 'sumOfRoots', 'fizzbuzz',
  'L2Cache', 'LRUCache', 'ReentrancyGuard', 'AsyncMutex',
] as const;

/**
 * Classify one registry entry against the real execution rules.
 *
 * The three tiers exist because a binary reading is actively dangerous here:
 * it labels working code as inert, which is precisely the error that would have
 * had 1,199 real tools deleted.
 */
export function classifyEntryExecutability(
  entryName: string | null | undefined,
  source: string | null | undefined,
  manifestVerified: boolean,
  entrypointExists: boolean,
): 'invocableByName' | 'nameLinkActivated' | 'notExecutable' {
  if (manifestVerified) return 'invocableByName';
  if (entrypointExists) return 'invocableByName';
  if (!entryName) return 'notExecutable';

  const resolved = resolveExportedFunctionName(source ?? '', entryName);
  if (!resolved) return 'notExecutable';
  if (resolved === entryName) return 'invocableByName';
  if ((SANDBOX_CALLEE_FALLBACKS as readonly string[]).includes(resolved)) return 'invocableByName';
  // Real code, wrong label: reachable now that the name link is resolved.
  return 'nameLinkActivated';
}

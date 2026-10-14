/**
 * Registry hygiene — collapse the near-duplicate / degraded noise that makes up
 * the bulk of the generated tool registry.
 *
 * The registry holds thousands of generated tools, most of which are the same
 * behavior template re-materialized with a machine id suffix
 * (`learner_coding_lru_cache_2332` vs `..._3444`) or failed verifier runs
 * (`passed_verifier: false`, `score: 0`). Hygiene is defined as observation +
 * pruning only: it never mutates or renames the input tools.
 *
 * These helpers accept either the full `ToolEntry` shape (with `versions[]` +
 * `currentVersion`) or a flattened shape carrying `passed_verifier` / `score` /
 * `source_code` at the top level, so both registry serializations work.
 */

export interface RegistryVersionLike {
  version?: string;
  passed_verifier?: boolean;
  score?: number;
  promoted?: boolean;
  source_code?: string;
  test_suite_code?: string;
}

export interface RegistryToolLike {
  name: string;
  id?: string;
  domain?: string;
  entrypoint?: string;
  description?: string;
  versions?: RegistryVersionLike[];
  currentVersion?: string;
  passed_verifier?: boolean;
  score?: number;
  source_code?: string;
  test_suite_code?: string;
  healthStatus?: string;
}

const SEPARATOR_RE = /[^a-zA-Z0-9]+/;

/**
 * A machine-generated variant suffix: a 4+ digit id (Date.now().slice(-4)),
 * a hex hash, or a mixed alphanumeric id such as `0ke4`. Plain words (even ones
 * containing digits, like `utf8`) are best-effort: the heuristic strips a
 * trailing token only when at least one meaningful token remains.
 */
function isMachineToken(token: string): boolean {
  if (/^\d{3,}$/.test(token)) return true;
  if (/^[0-9a-f]{6,}$/i.test(token)) return true;
  if (/^[0-9a-z]{4,}$/i.test(token) && /\d/.test(token) && /[a-z]/i.test(token)) return true;
  return false;
}

/**
 * Stable identity for a tool's *behavior*, with machine variant suffixes folded
 * away. `learner_coding_lru_cache_2332`, `..._3444`, `..._5997` and the
 * hyphenated `learner-coding-lru-cache-5997` all map to
 * `learner_coding_lru_cache`.
 */
export function behaviorKey(tool: Pick<RegistryToolLike, 'name'> | string): string {
  const raw = typeof tool === 'string' ? tool : tool?.name ?? '';
  const tokens = raw.split(SEPARATOR_RE).filter(Boolean);
  let end = tokens.length;
  while (end > 1 && isMachineToken(tokens[end - 1])) end -= 1;
  return tokens.slice(0, end).join('_').toLowerCase();
}

/** The version a tool is currently serving, falling back to the newest one. */
function currentVersion(tool: RegistryToolLike): RegistryVersionLike | undefined {
  const versions = Array.isArray(tool.versions) ? tool.versions : [];
  if (tool.currentVersion) {
    const found = versions.find((v) => v && v.version === tool.currentVersion);
    if (found) return found;
  }
  return versions.length > 0 ? versions[versions.length - 1] : undefined;
}

export function currentScore(tool: RegistryToolLike): number {
  const version = currentVersion(tool);
  if (version && typeof version.score === 'number' && Number.isFinite(version.score)) {
    return version.score;
  }
  if (typeof tool.score === 'number' && Number.isFinite(tool.score)) return tool.score;
  return 0;
}

export function currentPassed(tool: RegistryToolLike): boolean {
  const version = currentVersion(tool);
  if (version && typeof version.passed_verifier === 'boolean') return version.passed_verifier;
  return tool.passed_verifier === true;
}

/** Degraded === the currently-served version has no verified pass. */
export function isDegraded(tool: RegistryToolLike): boolean {
  return !currentPassed(tool);
}

function isBetter(a: RegistryToolLike, b: RegistryToolLike): boolean {
  const aPassed = currentPassed(a);
  const bPassed = currentPassed(b);
  if (aPassed !== bPassed) return aPassed;
  const aScore = currentScore(a);
  const bScore = currentScore(b);
  if (aScore !== bScore) return aScore > bScore;
  const aVersions = Array.isArray(a.versions) ? a.versions.length : 0;
  const bVersions = Array.isArray(b.versions) ? b.versions.length : 0;
  return aVersions > bVersions;
}

/**
 * Keep the single best tool per behavior key (highest verified/passing score,
 * ties broken by version count then input order). Both returned arrays preserve
 * the original input order.
 */
export function dedupeRegistry<T extends RegistryToolLike>(tools: T[]): { kept: T[]; dropped: T[] } {
  const bestIndex = new Map<string, number>();
  tools.forEach((tool, index) => {
    const key = behaviorKey(tool);
    const incumbent = bestIndex.get(key);
    if (incumbent === undefined) {
      bestIndex.set(key, index);
    } else if (isBetter(tool, tools[incumbent])) {
      bestIndex.set(key, index);
    }
  });
  const keptIndexes = new Set<number>(bestIndex.values());
  const kept: T[] = [];
  const dropped: T[] = [];
  tools.forEach((tool, index) => {
    if (keptIndexes.has(index)) kept.push(tool);
    else dropped.push(tool);
  });
  return { kept, dropped };
}

/** Drop tools whose currently-served version never verified. */
export function pruneDegraded<T extends RegistryToolLike>(tools: T[]): T[] {
  return tools.filter((tool) => !isDegraded(tool));
}

/**
 * Failure-evidence classes for a gate-fail reason string.
 *
 * The registry used to label every gate-fail 'degraded', which lumps three
 * unrepairable realities (an artifactless claim, an unrunnable experiment, a
 * policy finding) with true behavioral regressions — measured 2026-10-12:
 * 1140/1171 'degraded' tools were claim-only re-verification bookkeeping whose
 * earlier version HAD passed, 17 had no entrypoint, 5 were Date.now policy
 * findings, and only ~9 were real behavioral failures (powerMod pre-fix).
 * This drove the repair driver to chase unfundable tickets.
 */
export type RecourseFailureClass = 'behavioral' | 'policy' | 'not-runnable' | 'claim-only' | 'unknown';

export function classifyFailureFromReasons(reasons: string | string[] | undefined | null): RecourseFailureClass {
  const s = Array.isArray(reasons) ? reasons.join('; ') : String(reasons ?? '');
  if (/no_entrypoint/i.test(s)) return 'not-runnable';
  if (/no_suite/i.test(s)) return 'claim-only';
  if (/does not declare/i.test(s)) return 'claim-only';
  if (/Date\.now/i.test(s)) return 'policy';
  if (/precision|diverges|reference/i.test(s)) return 'behavioral';
  return 'unknown';
}

/** Does ANY recorded version carry a verified pass? */
export function everVerified(tool: Pick<RegistryToolLike, 'versions' | 'passed_verifier'>): boolean {
  return Boolean(
    tool.passed_verifier === true ||
    (Array.isArray(tool.versions) && tool.versions.some((v) => v?.passed_verifier === true)),
  );
}

/**
 * The truthful healthStatus for a tool whose current version FAILED its gate.
 * `degraded` is reserved for behavioral failures a repair pass could plausibly
 * fix; everything else gets an honest, non-actionable label.
 */
export function failedHealthStatus<T extends Pick<RegistryToolLike, 'versions' | 'passed_verifier'>>(
  tool: T,
  reasons: string | string[] | undefined | null,
): string {
  const cls = classifyFailureFromReasons(reasons);
  if (cls === 'behavioral') return 'degraded';
  if (cls === 'policy') return 'policy-fail';
  if (cls === 'not-runnable') return 'not-runnable';
  if (cls === 'claim-only') return everVerified(tool) ? 'unverified-claim' : 'not-runnable';
  // Unknown evidence: a tool that never verified was never real; one that did
  // could have regressed — conservative choice stays actionable.
  return everVerified(tool) ? 'degraded' : 'not-runnable';
}

export interface HygieneSample {
  duplicateKeys: Array<{ key: string; kept: string; dropped: string[] }>;
  degraded: string[];
}

export interface HygieneReport {
  total: number;
  degraded: number;
  duplicate: number;
  kept: number;
  duplicateGroups: number;
  sample: HygieneSample;
}

const SAMPLE_LIMIT = 5;

/**
 * One-shot observation of a registry: prunes degraded tools, then collapses
 * duplicate behaviors. `kept` is the survivable set, `duplicate` counts the
 * non-degraded tools dropped as behavior duplicates.
 */
export function hygieneReport(tools: RegistryToolLike[]): HygieneReport {
  const total = tools.length;
  const passing = pruneDegraded(tools);
  const degraded = total - passing.length;
  const { kept, dropped } = dedupeRegistry(passing);

  const droppedByKey = new Map<string, string[]>();
  for (const tool of dropped) {
    const key = behaviorKey(tool);
    const bucket = droppedByKey.get(key);
    if (bucket) bucket.push(tool.name);
    else droppedByKey.set(key, [tool.name]);
  }

  const keptByKey = new Map<string, string>();
  for (const tool of kept) {
    const key = behaviorKey(tool);
    if (!keptByKey.has(key)) keptByKey.set(key, tool.name);
  }

  const duplicateKeys: HygieneSample['duplicateKeys'] = [];
  for (const [key, names] of droppedByKey) {
    if (duplicateKeys.length >= SAMPLE_LIMIT) break;
    duplicateKeys.push({ key, kept: keptByKey.get(key) ?? '', dropped: names.slice(0, SAMPLE_LIMIT) });
  }

  const degradedSample = tools
    .filter((tool) => isDegraded(tool))
    .slice(0, SAMPLE_LIMIT)
    .map((tool) => tool.name);

  return {
    total,
    degraded,
    duplicate: dropped.length,
    kept: kept.length,
    duplicateGroups: droppedByKey.size,
    sample: { duplicateKeys, degraded: degradedSample }
  };
}

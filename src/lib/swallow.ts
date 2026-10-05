/**
 * swallow.ts — make a caught-and-ignored failure visible.
 *
 * A `catch { return null; }` is indistinguishable, from the outside, between
 * "there is nothing here" and "this threw and nobody is telling you". Recourse
 * had ~19 of those in server.ts alone, which is how a route could answer with
 * an empty list while the thing that should have filled it was broken.
 *
 * `swallow(tag, err, fallback)` does three things a bare catch cannot:
 *   1. logs the error with a tag that says WHERE it was swallowed;
 *   2. counts it in `swallowCounts`, so `/api/recourse/ops/*` and the health
 *      surface can show a route that has been quietly failing;
 *   3. returns the caller's fallback, so the behaviour is unchanged.
 *
 * It never throws. A diagnostic that could fail the operation it is diagnosing
 * is worse than the silence it replaced.
 *
 * Counting is per-process and unbounded in key count but capped in magnitude,
 * so a hot loop cannot grow the map without limit.
 */

/** How many swallows per tag are retained in `swallowCounts`. */
const MAX_COUNT_PER_TAG = 1_000_000;

/** tag -> how many times something was swallowed under it. */
export const swallowCounts = new Map<string, number>();

/** tag -> the most recent message, so an operator can see the actual failure. */
export const swallowLastMessage = new Map<string, string>();

/**
 * Log, count, and return `fallback`.
 *
 * `tag` should name the route or function, not the error: a counter keyed by
 * "some fetch failed" cannot be acted on.
 *
 * This never throws, and that is not free. `String(err)` throws for an object
 * with a hostile `toString`, and `console.warn` throws for an object with a
 * hostile `Symbol.toPrimitive` — both are reachable from a parsed response body.
 * A diagnostic that can fail the operation it is diagnosing is worse than the
 * silence it replaced, so every part of the diagnostic is itself guarded and the
 * fallback is returned unconditionally.
 */
export function swallow<T>(tag: string, err: unknown, fallback: T): T {
  const message = describe(err);
  try {
    const count = (swallowCounts.get(tag) ?? 0) + 1;
    if (count <= MAX_COUNT_PER_TAG) swallowCounts.set(tag, count);
  } catch {
    /* a counter that cannot move must not stop the caller getting its value */
  }
  try {
    swallowLastMessage.set(tag, message);
  } catch {
    /* same */
  }
  try {
    // Two arguments, not one interpolated string: a structured logger keeps the
    // tag and the message separable, which is the whole point of tagging.
    console.warn(`[swallow:${tag}]`, message);
  } catch {
    /* logging must never propagate */
  }
  return fallback;
}

/** A message for `err` that cannot itself throw. */
function describe(err: unknown): string {
  try {
    return err instanceof Error ? err.message : String(err);
  } catch {
    return '<unprintable error>';
  }
}

/** A snapshot for the metrics/health surface: sorted, with the last message. */
export function swallowReport(): {
  total: number;
  tags: Array<{ tag: string; count: number; lastMessage: string | null }>;
} {
  const tags = [...swallowCounts.entries()]
    .map(([tag, count]) => ({ tag, count, lastMessage: swallowLastMessage.get(tag) ?? null }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return { total: tags.reduce((sum, t) => sum + t.count, 0), tags };
}

/** Reset the counters. Tests only. */
export function resetSwallowCounts(): void {
  swallowCounts.clear();
  swallowLastMessage.clear();
}

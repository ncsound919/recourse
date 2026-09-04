/**
 * Web artifact host helpers — the honest decision layer for serving a
 * self-hosted web tool's output as a real HTML document.
 *
 * Recourse's self-host runtime calls any module through a JSON-safe execute()
 * adapter (selfHosting.ts). A landing/web template's `render` method returns an
 * HTML string inside that envelope. This module decides, deterministically and
 * without trusting the caller, whether a result is safe to present as
 * `text/html`:
 *   - it must be a non-empty string, and
 *   - it must actually begin with a markup tag ('<'), so a JSON object, an
 *     error message, or a number is never dressed up as a web page.
 *
 * Pure (no fs / no network) so every branch is unit-testable.
 */

export type WebCategory = 'web';

/** Only templates in the `web` category are treated as renderable sites. */
export function isWebCategory(category: string | undefined | null): category is WebCategory {
  return category === 'web';
}

export type HtmlArtifactDecision =
  | { ok: true; html: string }
  | { ok: false; reason: string };

/** Decide whether a self-hosted execute() result is a real HTML document. */
export function htmlFromResult(result: unknown): HtmlArtifactDecision {
  if (typeof result !== 'string') {
    return { ok: false, reason: `artifact returned ${result === null ? 'null' : typeof result} — expected an HTML string` };
  }
  const trimmed = result.trimStart();
  if (!trimmed) {
    return { ok: false, reason: 'artifact returned an empty document' };
  }
  if (!trimmed.startsWith('<')) {
    return { ok: false, reason: 'artifact output is not an HTML document (does not start with "<")' };
  }
  return { ok: true, html: result };
}

/** Pick the renderable method off a whitelist (prefers `render`, else the first). */
export function pickRenderMethod(
  methods: Array<{ method: string }> | undefined
): { method: string } | null {
  if (!methods || methods.length === 0) return null;
  const render = methods.find((m) => m.method === 'render');
  return render || methods[0];
}

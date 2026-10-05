/**
 * httpClient.ts — one place where long-running HTTP calls are configured.
 *
 * WHY THIS EXISTS
 * Node's global `fetch` (undici) enforces its OWN timeouts that an
 * AbortSignal does not override: `headersTimeout` defaults to 300s and fires
 * first on any slow response. Two separate callers hit this exact wall:
 *
 *   - the OpenHub audit of Aetherdesk died at ~315s with a bare "fetch failed"
 *     while its own AbortSignal budget was 30 minutes;
 *   - the capability forge died the same way on a CPU-streamed local model,
 *     whose prompt prefill alone exceeds 300s.
 *
 * Both looked like "the server went offline" and neither was. Any call here
 * that may legitimately take minutes MUST go through `longFetch`, which
 * raises undici's headers/body timeouts to match the caller's AbortSignal.
 *
 * `require` is not defined in these ESM modules, so `createRequire` is used to
 * reach undici. An earlier attempt used a bare `require` inside a try/catch; it
 * threw ReferenceError, the throw was swallowed, and the code silently fell
 * back to the 300s default — which is why the fix appeared to do nothing.
 */
import { createRequire } from 'node:module';

/**
 * Agents keyed by the timeout they were created for.
 *
 * It is tempting to keep one Agent, but an Agent's `headersTimeout` is fixed at
 * construction — so a single shared Agent inherits whichever timeout happened to
 * be requested FIRST. `checkOnline` probes `/models` with a 2s budget before it
 * probes a completion, which built the shared Agent with 2s timeouts and made
 * every later request die at ~2s with a bare "fetch failed". Keying by timeout
 * keeps a short probe from constraining long calls.
 */
const agents = new Map<number, unknown>();
let warned = false;

/**
 * A pooled undici Agent whose timeouts match `timeoutMs`.
 * Returns undefined when undici cannot be loaded, so callers still work (with
 * default timeouts) rather than failing outright.
 */
function agentFor(timeoutMs: number): unknown {
  const cached = agents.get(timeoutMs);
  if (cached !== undefined) return cached;
  try {
    const req = createRequire(import.meta.url);
    const undici = req('undici');
    if (undici?.Agent) {
      const created = new undici.Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
      agents.set(timeoutMs, created);
      return created;
    }
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn(
        `[http] undici unavailable; requests slower than ~300s will fail at the HTTP layer: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  agents.set(timeoutMs, null);
  return null;
}

/**
 * fetch with undici's timeouts raised to cover `timeoutMs`.
 * The caller's AbortSignal still wins if it is shorter.
 *
 * NOT guarded by default: this is the internal client and many callers pass
 * loopback URLs (Recourse calling its own sidecars), which the SSRF guard would
 * correctly refuse. For any URL that arrived from OUTSIDE the trust boundary, use
 * `guardedFetch` from `outboundGuard.ts` instead — that is the enforcing path.
 */
export function longFetch(url: string, init: RequestInit = {}, timeoutMs = 300_000): Promise<Response> {
  const dispatcher = agentFor(timeoutMs);
  return fetch(url, {
    ...init,
    ...(dispatcher ? { dispatcher } : {}),
  } as RequestInit);
}

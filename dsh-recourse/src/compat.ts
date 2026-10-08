/**
 * Host capability detection.
 *
 * ## Why this file no longer probes anything
 *
 * The first version of this plugin resolved its host services by probing
 * `ctx.get('tools')` inside `apply` and degrading when a probe came back empty.
 * That was wrong, and the failure was silent -- which is the worst kind.
 *
 * A plugin with no `inject` list has its `apply` run as soon as the entry is
 * created, which is *before* the web app has provided `tools`, `systemPrompt`,
 * `webServer`, or `connection`. So every probe returned `undefined`, every
 * capability was reported missing, and the plugin registered nothing while
 * appearing to load cleanly.
 *
 * The correct Cordis primitive for an optional dependency is
 * `ctx.inject([...], cb)`: the callback fires when those services actually
 * appear, and returns an uninject disposer. `apply` therefore declares no hard
 * requirements at all, and each feature waits for exactly what it needs.
 *
 * What remains here is only the one thing `ctx.inject` cannot express: service
 * *aliases* across host versions.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Web-server service keys, newest alias first.
 *
 * `dsh-teams-x/lib/compat.js` records that these keys have had historical
 * aliases. `ctx.inject` takes exact key names, so a host that only provides the
 * older key needs its own subscription -- see `index.ts`.
 */
export const WEB_SERVER_KEYS = ['webServer', 'httpServer'] as const;

/** The `ctx.webServer.register(...)` subset we use. */
export interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
  }): () => void;
}

/**
 * The connection gate. `dsh-teams-x/lib/web-routes.js` wraps every raw route in
 * `gate.requestRejection(req)` because raw `webServer.register` routes do NOT
 * inherit the web app's authentication.
 */
export interface ConnectionLike {
  requestRejection(req: IncomingMessage): number | undefined;
}
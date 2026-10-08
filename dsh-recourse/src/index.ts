/**
 * dsh-recourse -- Recourse as the DeepSeek Harness's recursive self-improvement
 * centerpiece.
 *
 * This plugin replaces the `mcp-recourse` stdio bridge. Three things change
 * for the better:
 *
 * - **Names.** The bridge had to normalize `recourse.status` into
 *   `mcp__recourse__recourse_status_<12-hex-hash>` to satisfy DeepSeek's
 *   function-name contract (max 64 chars, `[A-Za-z0-9_-]`). Native
 *   registration uses the clean `recourse_status`.
 * - **Cost.** No subprocess, no JSON-RPC round trip, and no blanket 30 s
 *   timeout. Per-tool `timeoutMs` instead, so a forge run is allowed to take
 *   minutes while a status read stays snappy.
 * - **Session awareness.** The tool body receives `exec.signal` and the call
 *   identity, which a stdio bridge structurally cannot.
 *
 * ## Scheduling
 *
 * `apply` hard-requires nothing and registers nothing itself. Each feature is
 * wired through `ctx.inject`, which fires when that feature's services appear:
 *
 * | feature    | waits for                          |
 * |------------|------------------------------------|
 * | tools      | `tools`                            |
 * | prompt     | `systemPrompt`                     |
 * | web proxy  | `connection` + `webServer`/`httpServer` |
 *
 * That matters because `apply` runs BEFORE the web app has provided those
 * services. A plugin that probes for them at that moment sees nothing and
 * silently does nothing. See `compat.ts` for the full story.
 *
 * ## Dependencies
 *
 * Deliberately zero runtime dependencies: every `@deepseek-ai/*` reference is
 * `import type`, which TypeScript erases. That keeps the published plugin
 * working regardless of the state of the host's own `node_modules`.
 */

import type { Context } from '@deepseek-ai/cordis';
// Type-only: these imports exist to pull in the `Context` service
// augmentations for `systemPrompt`, `webServer`, and `connection`. Nothing is
// imported at runtime.
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-system-prompt';

import { RecourseApi } from './api.js';
import { WEB_SERVER_KEYS } from './compat.js';
import { normalizeConfig } from './config.js';
import { buildUsageSection } from './prompt.js';
import { buildToolDefinitions } from './tools.js';
import { mountProxy } from './web-routes.js';

export const name = 'recourse';

/**
 * No hard service requirements.
 *
 * Every dependency this plugin has is optional and is resolved with
 * `ctx.inject` below. Listing one here would make the whole entry wait for it,
 * and then fail the profile layer on a host that lacks it.
 */
export const inject: string[] = [];

/** Plugin entry point. Returns immediately; features attach as services appear. */
export function apply(ctx: Context, config?: unknown): void {
  const cfg = normalizeConfig(config);

  const api = new RecourseApi({
    baseUrl: cfg.apiBaseUrl,
    secret: cfg.apiSecret,
    defaultTimeoutMs: cfg.defaultTimeoutMs,
  });

  const tools = buildToolDefinitions(api, cfg.longTimeoutMs);

  // Emitted synchronously: at this point the tool set is fixed, so this is the
  // one line that is accurate regardless of which services have arrived.
  ctx.logger.info(
    `[dsh-recourse] upstream ${cfg.apiBaseUrl}; secret ${
      api.hasSecret ? 'present' : 'ABSENT - guarded routes will fail closed'
    }; ${tools.length} tool(s) pending service injection`,
  );

  // ---- tools -------------------------------------------------------------
  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.effect(() => {
      const disposers: Array<() => void> = [];
      for (const tool of tools) {
        try {
          disposers.push(toolCtx.tools.register(tool));
        } catch (error) {
          // A name collision with another plugin costs this one tool, not the
          // layer. Most likely cause is a leftover `mcp-recourse` bridge still
          // registering the old `mcp__recourse__*` names alongside ours.
          toolCtx.logger.warn(
            `[dsh-recourse] could not register ${tool.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      return () => {
        for (const dispose of disposers.reverse()) {
          try {
            dispose();
          } catch {
            /* one failing disposer must not block the rest */
          }
        }
      };
    }, 'dsh-recourse: tools');
  });

  // ---- model-facing usage policy ----------------------------------------
  if (cfg.contributePrompt) {
    ctx.inject(['systemPrompt'], (promptCtx) => {
      promptCtx.effect(
        () =>
          promptCtx.systemPrompt.section({
            name: 'recourse:usage',
            order: cfg.promptSectionOrder,
            text: buildUsageSection(
              tools.map((tool) => tool.name),
              cfg,
            ),
          }),
        'dsh-recourse: prompt',
      );
    });
  }

  // ---- authenticated web proxy ------------------------------------------
  if (!cfg.mountWebProxy) return;

  // `webServer` has had historical aliases, and `ctx.inject` matches exact key
  // names, so subscribe to each alias and let the host decide which fires. The
  // latch keeps a host that provides both from mounting two routes on one path.
  let webMounted = false;

  for (const webServerKey of WEB_SERVER_KEYS) {
    ctx.inject(['connection', webServerKey], (webCtx) => {
      if (webMounted) return;
      webMounted = true;
      webCtx.effect(
        () =>
          mountProxy(
            webCtx.webServer as unknown as Parameters<typeof mountProxy>[0],
            webCtx.connection as unknown as Parameters<typeof mountProxy>[1],
            api,
            cfg.longTimeoutMs,
          ),
        'dsh-recourse: web',
      );
    });
  }
}
 /**
 * capabilityRuntime.ts — capability dogfood + telemetry routes extracted from
 * `server.ts`: GET /capabilities/serve, POST /execute, GET /metrics (app-root),
 * GET /perf.
 *
 * Sandbox execution and metric snapshots are pure lib imports; host state
 * (provenance, capability adoption/served counters, registry), the capability
 * server, and the telemetry auth gate are injected. `metricsText` is reused
 * from the existing ops router.
 */
import { Router } from 'express';
import type { CapabilityId, CapabilityBacking } from '../lib/capabilities.js';
import { executeToolFunction } from '../lib/executionSandbox.js';
import { isIsolateAvailable, executeToolInIsolate } from '../lib/isolatedSandbox.js';
import { resolveExportedFunctionName } from '../lib/exportedSymbol.js';
export { resolveExportedFunctionName };
import { completionCacheSnapshot } from '../lib/modelProvider.js';
import { sleepComputeSnapshot } from '../lib/sleepCompute.js';
import { experienceSnapshot } from '../lib/experience.js';
import type { ProvenanceEvent, ToolEntry } from '../types.js';
import { metricsText } from './ops.js';

interface AdoptionView {
  backing: CapabilityBacking;
}

export interface CapabilityRuntimeRouterDeps {
  provenanceEventsRef(): ProvenanceEvent[];
  capabilityAdoptionsRef(): Partial<Record<CapabilityId, AdoptionView>>;
  capabilityServedRef(): Partial<Record<CapabilityId, number>>;
  serveCapability(capId: CapabilityId, ctx: unknown): Promise<unknown>;
  registryRef(): ToolEntry[];
  telemetryAuthorized(req: any, res: any): boolean;
  sleepComputeLimit(): number;
}

export function createCapabilityRuntimeRouter(deps: CapabilityRuntimeRouterDeps): Router {
  const router = Router();

  // Serve every adopted capability against real runtime state. This is the
  // dogfood proof: each call routes through the adopted self-hosted tool when
  // one is adopted, else the builtin. Counters increment per capability.
  router.get('/api/recourse/capabilities/serve', async (req, res) => {
    const provenanceEvents = deps.provenanceEventsRef();
    const capabilityAdoptions = deps.capabilityAdoptionsRef();
    const capabilityServed = deps.capabilityServedRef();
    const hashes = provenanceEvents.slice(-128).map((e) => e.hash);
    const types = provenanceEvents.slice(-128).map((e) => e.type || e.hash);
    const results: Record<string, { source: string; tool?: string; result: unknown; served: number }> = {};
    const calls: Array<[CapabilityId, unknown]> = [
      ['dedupe', { items: types }],
      ['numeric_kernel', { items: hashes, size: 7 }],
      ['text_encode', { str: types.slice(0, 40).join('') || 'aaaabbc' }],
      ['scheduler', { items: types, k: 5 }],
      ['math_sequence', { n: Math.min(Math.max(hashes.length % 25, 0), 20) }],
      ['verify_gate', { a: 48, b: 18 }],
    ];
    for (const [id, ctx] of calls) {
      const rec = capabilityAdoptions[id];
      try {
        const result = await deps.serveCapability(id, ctx);
        results[id] = {
          source: rec?.backing.source === 'selfhosted' ? 'selfhosted' : 'builtin',
          tool: rec?.backing.source === 'selfhosted' ? rec.backing.toolName : undefined,
          result,
          served: capabilityServed[id] ?? 0,
        };
      } catch (err: any) {
        results[id] = { source: 'error', result: String(err?.message ?? err), served: capabilityServed[id] ?? 0 };
      }
    }
    res.json({ success: true, results });
  });

  // REAL Interactive Sandbox Tool Execution Endpoint
  router.post('/api/recourse/execute', (req, res) => {
    try {
      const { toolName, sourceCode, functionName, args = [] } = req.body;

      let codeToRun = sourceCode;
      let targetFunc = functionName;
      let resolvedByNameLink = false;

      if (!codeToRun && toolName) {
        const tool = deps.registryRef().find(t => t.name === toolName);
        if (tool) {
          const latest = tool.versions[tool.versions.length - 1];
          codeToRun = latest?.source_code;
          // NAME-LINK RESOLUTION, measured 2026-10-04.
          //
          // 1,193 of 1,289 registry entries export a function whose name differs
          // from the registry entry name, so they could not be invoked by `toolName`
          // at all: executionSandbox.ts resolves a callee only from an explicit
          // `functionName` or a hardcoded 14-name allowlist, and a generated export
          // like `projectUtilization` is on neither.
          //
          // Proof the code was fine and only the name was wrong â€” same tool, same
          // args [50,5,100,3]:
          //   {toolName}                      -> success:false "No callable entrypoint"
          //   {toolName, functionName}        -> success:true
          //
          // So these are 1,193 latent tools, not 1,193 phantoms. Recover the real
          // export from the source instead of demanding the caller already know it.
          // This is the opposite of the deletion the inventory report invited.
          if (!targetFunc && typeof codeToRun === 'string') {
            const linked = resolveExportedFunctionName(codeToRun, tool.name);
            if (linked) {
              targetFunc = linked;
              resolvedByNameLink = true;
            }
          }
        }
      }

      if (!codeToRun) {
        return res.status(400).json({ error: 'No executable source code provided or found for tool' });
      }

      const execResult = process.env.RECOURSE_SANDBOX_MODE === 'isolated' && isIsolateAvailable()
        ? (() => {
            const r = executeToolInIsolate(codeToRun, targetFunc, args);
            return {
              success: r.success,
              returnValue: r.returnValue,
              stdout: r.stdout,
              stderr: r.stderr,
              executionTimeMs: r.executionTimeMs,
              error: r.error,
              _isolated: { available: true, timedOut: r.timedOut, memoryLimitMb: r.memoryLimitMb }
            };
          })()
        : executeToolFunction(codeToRun, targetFunc, args);

      res.json({
        success: execResult.success,
        returnValue: execResult.returnValue,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        executionTimeMs: execResult.executionTimeMs,
        error: execResult.error,
        // Observable, so the name-link repair is auditable rather than magic: a
        // caller can see which symbol was actually invoked and whether the
        // registry's own name was wrong.
        resolvedFunction: targetFunc ?? null,
        resolvedByNameLink,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Execution failed' });
    }
  });

  // Prometheus metrics exposition (Wave 2 observability).
  router.get('/metrics', async (req, res) => {
    if (!deps.telemetryAuthorized(req, res)) return;
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(await metricsText());
  });

  // Efficiency telemetry (P0/P1): completion-cache hit rate, sleep-time-compute
  // artifacts, and distillation coverage. Read-only.
  router.get('/api/recourse/perf', (_req, res) => {
    res.json({
      success: true,
      completionCache: completionCacheSnapshot(),
      sleepCompute: sleepComputeSnapshot(),
      experience: experienceSnapshot(),
      policy: {
        adaptiveBudgetMin: 1,
        adaptiveBudgetMax: Number(process.env.FORGE_BUDGET_MAX) || 3,
        modelCacheDisabled: process.env.MODEL_CACHE_DISABLED === '1',
        sleepComputeLimit: deps.sleepComputeLimit(),
      },
    });
  });

  return router;
}

/**
 * interop.ts — cross-protocol surface extracted from `server.ts`:
 * POST /api/recourse/replay, GET /api/openapi.json, GET /api/recourse/routes,
 * GET /.well-known/agent.json, POST /api/a2a, POST /api/mcp.
 *
 * Host helpers `a2aBaseUrl` and `buildA2aOperations` (the latter owns the
 * same-process `internalApiCall` bridge back into the REST routes) stay in
 * `server.ts` and are injected. Mounted once at the app root because the
 * paths intentionally span /api/recourse, /api, and /.well-known.
 */
import { Router } from 'express';
import { replayTrendLedger, replayGoalLedger, deterministicHash } from '../lib/replay.js';
import { buildOpenApiSpec, listOperations } from '../lib/openapi.js';
import { agentCard, handleA2aRpc } from '../lib/a2a.js';
import type { A2aOperation, A2aTaskStore } from '../lib/a2a.js';
import { handleMcpHttp } from '../lib/mcpHttp.js';
import { hasValidMutationSecret } from '../lib/mutationAuth.js';
import { verifyAllSelfHosted } from '../lib/selfHosting.js';

export interface InteropRouterDeps {
  a2aBaseUrl(req: { headers: Record<string, any>; protocol?: string }): string;
  buildA2aOperations(): Record<string, A2aOperation>;
  a2aTaskStore: A2aTaskStore;
}

export function createInteropRouter(deps: InteropRouterDeps): Router {
  const router = Router();

  // Deterministic replay: re-derive a subsystem from its ledger and compare to
  // live state. A mismatch is reported, never hidden.
  router.post('/api/recourse/replay', async (req, res) => {
    const stream = String(req.body?.stream ?? 'trend').toLowerCase();
    try {
      if (stream === 'trend') {
        return res.json({ success: true, report: replayTrendLedger() });
      }
      if (stream === 'goals') {
        return res.json({ success: true, report: replayGoalLedger() });
      }
      if (stream === 'selfhosted') {
        const entries = await verifyAllSelfHosted();
        const summary = entries.map((e) => ({ name: e.name, hash: e.hash, passed: e.lastVerified?.passed === true, sandbox: e.lastSandboxVerified?.passed === true }));
        const allPassed = summary.every((s) => s.passed);
        return res.json({
          success: true,
          report: {
            stream: 'selfhosted',
            records: summary.length,
            matches: allPassed,
            replayHash: deterministicHash(summary),
            details: [`re-verified ${summary.length} self-hosted module(s); ${summary.filter((s) => s.sandbox).length} green in the WASM sandbox`],
          },
        });
      }
      return res.status(400).json({ success: false, error: `unsupported replay stream "${stream}" (trend|goals|selfhosted)` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Productized API contract: OpenAPI document + a discoverable operation index.
  router.get('/api/openapi.json', (req, res) => {
    res.json(buildOpenApiSpec(deps.a2aBaseUrl(req)));
  });

  router.get('/api/recourse/routes', (req, res) => {
    const spec = buildOpenApiSpec(deps.a2aBaseUrl(req));
    res.json({ success: true, count: listOperations(spec).length, operations: listOperations(spec) });
  });

  router.get('/.well-known/agent.json', (req, res) => {
    res.json(agentCard(deps.a2aBaseUrl(req)));
  });

  router.post('/api/a2a', async (req, res) => {
    try {
      const result = await handleA2aRpc(req.body, {
        authorized: hasValidMutationSecret(req),
        operations: deps.buildA2aOperations(),
        tasks: deps.a2aTaskStore,
      });
      res.status(result.httpStatus).json(result.body);
    } catch (e: any) {
      res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: e.message } });
    }
  });

  // Remote MCP transport over HTTP (JSON-RPC). Same tool surface as the stdio MCP
  // server; scope-gated: a valid mutation secret grants `write`, callers without
  // it get read-only tools.
  router.post('/api/mcp', async (req, res) => {
    try {
      const scopes = hasValidMutationSecret(req) ? ['read', 'write'] : ['read'];
      const result = await handleMcpHttp(
        req.body,
        {
          operations: deps.buildA2aOperations(),
          authorize: (ctx, required) => ctx.scopes.includes(required),
        },
        scopes,
      );
      res.status(result.status).json(result.body);
    } catch (e: any) {
      res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: e.message } });
    }
  });

  return router;
}

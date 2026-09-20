/**
 * agentTools.ts — HTTP surface for model-native tool calling (extracted-router
 * convention, like selfhosted.ts).
 *
 *   GET  /agent/tools   list the tools a model may call
 *   POST /agent/tools   run one bounded tool-calling turn
 *
 * Per-tool mutation gating: read tools run without credentials, but any tool
 * flagged `mutating` is refused unless the caller presents RECOURSE_API_SECRET
 * (fail-closed; when no secret is configured, the operator has opted into open
 * mode). Every executed tool call is recorded to provenance. The loop lives in
 * src/lib/toolCalling.ts and is provider-agnostic.
 */
import { Router } from 'express';
import type { ChatCompleteOptions, ChatCompleteResult, ChatMessage } from '../lib/modelProvider.js';
import type { AgentToolRegistry } from '../lib/agentTools.js';
import { runToolCallingAgent, type ToolInvocationRecord } from '../lib/toolCalling.js';

export interface AgentToolsDeps {
  registry: AgentToolRegistry;
  chat: (messages: ChatMessage[], opts: ChatCompleteOptions) => Promise<ChatCompleteResult>;
  /** Whether this request may run mutating tools. Defaults to true (open mode). */
  isAuthorized?: (req: any) => boolean;
  /** Diagnostics for the MCP sources (server/connection status). */
  mcpStatus?: () => unknown;
  maxTurns?: number;
  appendProvenanceEvent?: (type: string, data: Record<string, unknown>) => void;
}

const ALLOWED_ROLES = new Set(['system', 'user', 'assistant']);

export function createAgentToolsRouter(deps: AgentToolsDeps): Router {
  const router = Router();

  router.get('/agent/tools', async (req, res) => {
    try {
      // The catalog reveals tool names/schemas/mutating flags; when a secret is
      // configured, require it (open mode leaves this readable).
      if (deps.isAuthorized && !deps.isAuthorized(req)) {
        return res.status(403).json({ success: false, error: 'mutation authorization required to list the tool catalog' });
      }
      const tools = await deps.registry.list();
      res.json({
        success: true,
        count: tools.length,
        mutating: tools.filter((t) => t.mutating).length,
        bySource: tools.reduce<Record<string, number>>((acc, t) => {
          acc[t.source] = (acc[t.source] ?? 0) + 1;
          return acc;
        }, {}),
        mcp: deps.mcpStatus ? deps.mcpStatus() : undefined,
        tools,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  router.post('/agent/tools', async (req, res) => {
    try {
      const body = req.body ?? {};
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const rawMessages = Array.isArray(body.messages) ? body.messages : null;
      if (!prompt && !rawMessages?.length) {
        return res.status(400).json({ success: false, error: 'prompt or messages is required' });
      }

      const initial: ChatMessage[] = [];
      if (typeof body.system === 'string' && body.system.trim()) {
        initial.push({ role: 'system', content: body.system });
      }
      if (rawMessages) {
        for (const m of rawMessages) {
          const role = m?.role;
          if (typeof m?.content === 'string' && ALLOWED_ROLES.has(role)) {
            initial.push({ role, content: m.content });
          }
        }
      }
      if (prompt) initial.push({ role: 'user', content: prompt });
      if (!initial.length) {
        return res.status(400).json({ success: false, error: 'no valid messages were provided' });
      }

      const requestedTurns = Number.isFinite(body.maxTurns) && body.maxTurns > 0 ? Math.min(Number(body.maxTurns), 8) : deps.maxTurns;
      const maxTurns = Number.isFinite(requestedTurns) && (requestedTurns as number) > 0 ? (requestedTurns as number) : undefined;
      // Low temperature markedly improves tool adherence on small local models.
      const temperature = typeof body.temperature === 'number' ? body.temperature : 0.2;
      const toolChoice = body.toolChoice === 'required' || body.toolChoice === 'none' ? body.toolChoice : 'auto';
      const authorized = deps.isAuthorized ? deps.isAuthorized(req) : true;

      const recordCall = (record: ToolInvocationRecord) => {
        deps.appendProvenanceEvent?.('agent_tool_called', {
          tool: record.name,
          source: record.source,
          ok: record.ok,
          error: record.ok ? undefined : record.error,
        });
      };

      const result = await runToolCallingAgent(initial, {
        chat: deps.chat,
        registry: deps.registry,
        maxTurns,
        temperature,
        toolChoice,
        authorized,
        onToolCall: recordCall,
      });

      deps.appendProvenanceEvent?.('agent_tools_run', {
        status: result.status,
        turns: result.turns,
        model: result.model,
        authorized,
        malformed: result.malformed ?? 0,
        toolCalls: result.toolInvocations.map((t) => ({ name: t.name, ok: t.ok, source: t.source })),
      });

      // success mirrors the run outcome: offline/error/max_turns are not a success.
      res.json({ success: result.ok, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  return router;
}

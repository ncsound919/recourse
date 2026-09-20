# Contributing to Recourse

Thanks for helping. Recourse has one non-negotiable rule that shapes everything:

> **Nothing is believed unless it can be verified.** No fabricated AI output, no
> invented test results, no silent fallbacks that pretend to be real. If a
> capability is unavailable, say so (`ok:false` / `offline` / `unsupported`) —
> never invent a pass.

## Run locally

1. `npm install`
2. `cp .env.example .env` and set `MODEL_BASE_URL` / `MODEL_NAME` (any
   OpenAI-compatible server), plus `LOCAL_MODEL_BASE_URL` / `LOCAL_MODEL_NAME`
   for the local MiniCPM5 model.
3. `npm run dev` → `http://localhost:3050`

Optional sidecars (Python, stateless) live under `python/*`; each has its own
`requirements.txt` and README section.

## Checks (all must pass)

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # oxlint
npm test            # vitest run
npm run build       # vite build + node esbuild.config.mjs
```

CI runs the same on Node 20 and 22, plus a gated coverage run
(`npm run test:coverage`, thresholds in `vitest.config.ts`).

## Where things live

- `src/lib/**` — engines and clients (one responsibility per module).
- `src/routes/**` — extracted, stateless Express routers (`create*Router()`).
- `server.ts` — the monolith; **prefer adding a router under `src/routes/`** and
  mounting it instead of growing `server.ts`.
- `src/dream/**` — the self-improvement loop (dream/mutator/learner).
- `api/recourse/**` — Vercel serverless functions (fail-closed guard).
- `mcp-server.ts` — stdio MCP tools; `src/lib/mcpHttp.ts` — remote MCP.

## Extension points

- **Template plugin** — see `docs/plugin-template-registry.md` and
  `src/lib/templatePlugins/bloomFilter.ts`.
- **Connector** — register a `ConnectorManifest` in `src/lib/connectors/`.
- **Plugin (signed)** — `src/lib/pluginSdk.ts` (manifest + capabilities + HMAC).
- **Skill** — publish through `src/lib/skillRegistry.ts`.
- **MCP tool** — add to `mcp-server.ts` and, if agent-facing, to `A2A_SKILLS` +
  the operations table in `server.ts`.

## Honesty contract (required for every external call)

- Return `{ ok:false, error }` when a service is down; never fabricate a result.
- Never `eval` untrusted code outside the sandbox; no `dangerouslySetInnerHTML`.
- New mutating routes must sit behind `requireMutationAuth` (fail-closed).
- New autonomous capabilities must be default-deny and, where they spend, gated
  by the wallet + policy engine.

## Pull requests

- Keep commits scoped and messages descriptive.
- Add or update tests for behavior changes; tests must assert real behavior, not
  constants injected by the test.
- Update `README.md` / `.env.example` when you add a route, env var, or limit.
- By contributing you agree your work is licensed under Apache-2.0 (see `LICENSE`).

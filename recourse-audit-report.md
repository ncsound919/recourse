# Recourse Repository Audit

**Repo:** [ncsound919/recourse](https://github.com/ncsound919/recourse) · branch `master` @ `739e308` (Sep 4, 2026)
**Scope:** bugs, leaks, error handling, code smells, race conditions, repo hygiene
**Method:** full read of API routes, Python sidecars, `vectorMemory.ts`, `mcp-server.ts`, configs, README; targeted pattern scans (`child_process`, `eval`, `Math.random`, `JSON.parse`, `writeFileSync`, `RECOURSE_REPO`) across `server.ts` and `src/lib`.

---

## Snapshot

| Area | Detail |
|---|---|
| Frontend | React 19 + Vite 6 + TS 5.8, 31 components, Tailwind 4 |
| Server | `server.ts` — Express monolith, **6,125 lines / 256 KB** |
| Serverless | 4 Vercel routes: `api/recourse/{dream,learn,math,mutate}/[action].ts` |
| Sidecars | 3 FastAPI services (kg/pdf/fuzz) on ports 8500/8600/8700 |
| Sandbox | `isolated-vm`, oxlint gate, LanceDB vector memory, MCP server |
| Tests | 39 vitest files (incl. honesty-contract tests) — but **no CI** |
| History | 8 commits; latest is a single 50,756-line "publish everything" commit |

---

## Critical (P0)

### 1. Unauthenticated mutating serverless routes
`api/recourse/*` has **zero auth middleware**. Anyone who finds the deployment can:
- `POST /api/recourse/learn/run` — run up to 50 learning episodes per call
- `POST /api/recourse/mutate/evolve` — trigger model generation calls (cost/spend abuse)
- `POST /api/recourse/mutate/approve` — **promote genes** (state mutation)
- `POST /api/recourse/dream/tick` — drive the dream engine

`dream/cron` is the only route with a secret check, and it **fails open**: if `DREAM_CRON_SECRET` is unset, the endpoint is fully public and runs up to 60 catch-up ticks per hit.

**Fix:** require a shared secret (or Vercel function auth) on every non-GET route; make the cron secret *required*, not optional.

### 2. SSRF in the PDF sidecar
`python/pdf_service/main.py` → `POST /pdf/url` fetches **any** http(s) URL with no host allowlist. On any shared/hosted network this is a classic SSRF vector (cloud metadata at `169.254.169.254`, internal services, `localhost` port scans). The 50 MB download cap bounds size, not destination.

**Fix:** resolve and reject private/loopback/link-local IP ranges, or allowlist domains (arxiv.org, etc.).

### 3. Raw error messages leaked to clients
All four API routes return `err.message` directly in 500 responses (`error: message`). This leaks internal paths, upstream service details, and stack-adjacent info. 

**Fix:** log full error server-side, return a generic message + correlation id.

---

## Race Conditions & Concurrency

### 4. Module-level mutable state in serverless functions (High)
`api/recourse/math/[action].ts` keeps `let globalMathState` at module scope:
- **Lost on cold start** — every serverless spin-up resets the loop state silently.
- **Shared across concurrent invocations** — two simultaneous `step` calls race on the same object; `configure` mutates `config` mid-step.
- `configure` merges an **unvalidated arbitrary object** (`{...state.config, ...config}`) — no zod schema despite zod being a dependency. Type confusion / junk config goes straight into the engine.

`api/recourse/dream/[action].ts` has the same problem: `const engine = new DreamingEngine(createDreamStore())` at module scope — shared singleton in a serverless environment.

**Fix:** persist state in the durable store the main server already uses; treat serverless instances as stateless; validate `configure` with zod.

### 5. Learner ledger write races
The learn route constructs a fresh `createLearnerStore()` per request. Concurrent `run` + `episode` + `replay` requests can interleave ledger writes and break the "replays bit-for-bit" determinism guarantee. The main server guards singleton state with `LOCK_FILE` (pid), but nothing serializes these route-level instances.

### 6. Vector memory: backend-inconsistent semantics
In `src/lib/vectorMemory.ts`:
- `InMemoryStore.remember` **dedupes** by `(id, kind)`; the LanceDB path does a bare `table.add(...)` — **no dedupe**. Same call sequence produces different store state per backend.
- Recall scores are semantically different: cosine (in-memory) vs `1/(1+_distance)` (LanceDB) — not comparable across backends.
- `openVectorMemory` has no guard against two concurrent opens on the same directory (a `.recourse.lock` exists for the server, not here).

### 7. Probe rows pollute LanceDB
The live probe in `openVectorMemory` writes `__probe__${Date.now()}` rows and **never deletes them**. They inflate `count()`, can surface in recall results, and accumulate on every boot.

### 8. Minor ID collisions
`subagentSwarm.ts` builds IDs as `collab_${Date.now()}_..._${Math.floor(Math.random()*1000)}` — collision-prone under burst generation. Use `crypto.randomUUID()` (already imported elsewhere).

---

## Bugs

### 9. `status()` violates its own honesty contract
`vectorMemory.ts` `status()` reports `embedder: 'lexical'` when the true state is `'unknown'` (nothing embedded yet). The file's header promises the backend is "reported, never implied" — this is exactly an implied value.

### 10. Offline embed penalty on every call
With Ollama down, every `remember`/`recall` pays the 500 ms probe timeout before falling back to the lexical embedder. Batch operations (learner episodes, dream ticks) degrade by N × 500 ms. The recent commit reduced this from a larger timeout — good — but the right fix is a cached probe (try once per process/TTL, not per call).

### 11. README / config drift
- README recommends `Qwen/Qwen3.5-4B`; `.env.example` defaults to `qwen3.8-4b-distill:q4_k_m`. One of these model names is wrong (or the model was renamed) — a fresh clone following the README may pull a nonexistent model.
- README has **two identical `## Run locally` headings**.
- `package.json` name is `react-example`, version `0.0.0` — template leftover.

### 12. `npm run lint` is not a linter
`"lint": "tsc --noEmit"` is a typecheck. Real linting (oxlint) exists only inside the promotion gate (`lintGate.ts`). Rename to `typecheck` and add a real `lint` script so CI/contributors aren't misled.

### 13. Duplicate dependency entries
`vite` appears in **both** `dependencies` and `devDependencies`. Build-time tools (`vite`, `@tailwindcss/vite`, `oxlint`, `esbuild`) sit in runtime `dependencies` — bloats production installs.

---

## Leaks (Secrets)

**Good news: no committed secrets found.** `.env.example` uses placeholders/empty values only; `GITHUB_TOKEN=""`, Supabase keys commented out. `.gitignore` correctly excludes `.env*` with a `!.env.example` exception, plus runtime state (`recourse_*.json`, `data/`, `.recourse.lock`).

Two minor info leaks:
- `.env.example` embeds a real local Windows path (`C:\Users\User\Downloads\recourse`) — harmless but unnecessary; use `./` or `/path/to/recourse`.
- Raw `err.message` responses (finding #3) are an operational info-leak channel, not a committed-secret leak.

---

## Code Smells & Hygiene

| # | Finding | Severity |
|---|---|---|
| 14 | `server.ts` monolith: 6,125 lines, every route + wiring in one file | High |
| 15 | `patch.cjs`, `patch.js`, `patch2.cjs` — three variants of a one-off codemod that rewrites `ArchitectForgeView.tsx` in place, committed at repo root | Medium |
| 16 | **Both** `bun.lock` and `package-lock.json` committed — two package managers, drift risk, non-reproducible installs | Medium |
| 17 | `__pycache__/*.pyc` committed (3 files) — build artifacts in git | Low |
| 18 | **No LICENSE file** — despite open-source framing, the repo is legally all-rights-reserved | Medium |
| 19 | **No CI** (no `.github/` at all) — 39 test files exist but nothing runs them on push; `master` is unprotected (`protected: false`) | High |
| 20 | Big-bang commit: 50,756 lines added in one commit — history/review value lost for the entire core codebase | Medium |
| 21 | `metadata.json` is AI Studio template residue (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`) | Low |
| 22 | ~22 hand-rolled `JSON.parse` sites (README admits this); zod covers only 6 sidecar routes + `/verify` | Medium |
| 23 | `Math.random()` in `quantumEngine.ts` (defensible for measurement sampling, but contradicts blanket determinism claims if it feeds verified flows) | Low |

---

## What's Done Well (credit where due)

- **Atomic persistence:** state writes go to a `.tmp` file then `renameSync` — crash-safe.
- **Single-instance lock:** `LOCK_FILE` with pid guard prevents duplicate servers.
- **Path traversal guard** in fleet patch intake (`fleetDevelopment.ts`): "must resolve under root; refuses traversal."
- **Safe process spawning:** `spawn(bin, ['pull', target])` — args array, no shell, `windowsHide`. No command-injection surface found.
- **No `eval()` or `dangerouslySetInnerHTML`** in application code — both appear only inside the security scanners that detect them.
- **Sidecar discipline:** stateless FastAPI services, pydantic validation, hard caps (50 MB download / 60 MB upload / page limits / 413 on >4,000-node graphs), honest `scanned_only_image_pdf` reporting.
- **Security middleware:** helmet (full CSP in prod), express-rate-limit (configurable), server-authoritative uptime (recent race fix in `App.tsx`).
- **MCP server is read-only** with 8s timeouts and honest "unreachable" errors.
- **Test breadth:** 39 files including honesty-contract tests (`executionSandboxHonesty`, `selfHosting`, `fleetDevelopment`).

---

## Prioritized Fix List

**P0 — before any deployment**
1. Auth on all mutating `api/recourse/*` routes; `DREAM_CRON_SECRET` required (fail-closed).
2. SSRF allowlist/private-IP rejection in `pdf_service` `/pdf/url`.
3. Stop returning `err.message` to clients (all 4 routes).

**P1 — correctness**
4. Replace module-level state in `math`/`dream` routes with the durable store; zod-validate `configure`.
5. Serialize learner ledger writes (lock or single-writer queue).
6. LanceDB path: dedupe on `remember`, delete `__probe__` rows, unify score semantics; cache the Ollama probe.
7. Fix `status()` unknown→lexical reporting; `crypto.randomUUID()` for swarm IDs.

**P2 — hygiene & velocity**
8. Split `server.ts` into route modules (it will keep growing otherwise).
9. Delete `patch.*` scripts, `__pycache__`, one of the two lockfiles; fix `package.json` name/version; dedupe `vite` dep.
10. Add LICENSE, add a CI workflow (vitest + tsc + oxlint), protect `master`, require PR checks.
11. Reconcile README ↔ `.env.example` model names; rename `lint` → `typecheck`.

---

## Readiness Score

| Axis | Score | Notes |
|---|---|---|
| Security | 2/5 | Good middleware + sandbox, but unauthenticated mutating routes, SSRF, error leaks |
| Concurrency | 2/5 | Atomic writes + lock file, but serverless state races and ledger races |
| Correctness | 3/5 | Strong test breadth; backend inconsistencies in vector memory, config drift |
| Hygiene | 2/5 | Monolith, dual lockfiles, committed artifacts, no CI/LICENSE/branch protection |
| Documentation | 3.5/5 | Unusually honest README; minor drift and duplication |

**Overall: 2.5/5 — solid engineering instincts and real hardening in the sandbox/verifier core, but the public HTTP surface (serverless routes + PDF sidecar) is not deployment-safe yet.**

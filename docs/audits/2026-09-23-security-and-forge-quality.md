# Recourse audit — 2026-09-23

Branch: `audit/2026-09-23-fixes-and-forge-quality` (on top of the pending-work
snapshot commit `041ba22`). Scope was risk-prioritized: security, the
tool-generation pipeline, persistence and test health. The UI and the domain
bridges got only a light pass.

Baseline before changes: typecheck clean, 0 lint errors, **7 failing tests on a
fresh clone**. After: typecheck clean, 0 lint errors, **3108 passed / 5
skipped / 0 failed** (286 files), and a live boot smoke test of the guard and
the sandbox.

## Findings fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Critical | ~150 POST/PUT/DELETE routes had no auth. Examples: `/api/recourse/execute` (runs submitted code), `DELETE /selfhosted/:name`, `/settings/provider`, `/forge/run`, `/keywire/call`, `/chaos/inject`. The server listened on `0.0.0.0`. Anyone on the LAN could call them. So could any web page you visited, through a cross-site form POST or DNS rebinding. | `src/lib/apiGuard.ts` puts a default-deny check in front of every mutating `/api` route. A valid `RECOURSE_API_SECRET` always passes. The local UI passes without the secret only when the request is provably local: loopback peer, local `Host` header, and not cross-site. Everything else gets 401 or 403. A GET with a foreign `Host` from a loopback peer is refused, which blocks DNS rebinding. The server now binds to `127.0.0.1` by default; set `RECOURSE_HOST` to expose it. |
| 2 | High | Model-written code ran in-process through `new Function` / `node:vm` with no screening. This covers the dream mutator, the property harness, the math conductor, and the sandbox fallback used when isolated-vm won't load. Intake feeds untrusted web text into those prompts, so prompt injection could lead to running code on the host. | `src/lib/codeSafety.ts` runs a static escape screen before every in-process evaluation. It rejects host globals, `constructor`-chain access, dynamic code, and obfuscation primitives. `RECOURSE_REQUIRE_ISOLATION=1` refuses the fallback entirely. |
| 3 | High | isolated-vm needs `--no-node-snapshot` on Node 20 and later. None of the start paths passed that flag. | Added the flag to `npm run dev`, `npm start`, `start-recourse.ps1` and the Dockerfile `CMD`. |
| 4 | High | The Axiom offline fallback self-hosted tools itself, skipping the forge's substance, lint and quality gates. It also ignored its own verify verdict. | The bridge now returns only the source (`selfHost:false`). That source goes through the same gates as a model candidate. |
| 5 | High (quality) | Corpus refill turned every scanned file into the same FNV-1a hash "tool" under a file-derived name. That accounts for 423 of 460 manifest entries, only 68 distinct sources, plus 4,125 orphan module files. | Corpus artifacts now become groundings for learner-driven minting instead of specs. Legacy `corpus_*` specs are dropped at load. `scripts/quarantine-selfhosted.ts` handles the existing tools (see below). |
| 6 | Medium | Dream weight-mutation variants were stored as separate tools: the same algorithm with different constants (25 of them). | A novelty gate (`findNearDuplicate`) now runs at registry promotion and at forge materialization. |
| 7 | Medium | Fresh clones (CI, Docker) failed 7 tests and had no plan catalogue, because `data/` is gitignored. `.env` was also inside the Docker build context. | `data/plans` is now tracked and shipped in the image, the test creates its own directory, and `.dockerignore` excludes `.env*`. |

## Tool-generation upgrade (capability forge)

Before, the first source that passed a ~4-assert hidden suite was promoted. Now:

- **Quality gate** (`src/lib/forgeQuality.ts`). Every candidate that passes is scored on:
  - Differential tests against a hidden reference. Inputs are the suite's own inputs plus deterministic perturbations (empty, single, reversed, doubled, boundary values).
  - Determinism, and whether the tool mutates its arguments.
  - Special-cased suite literals, which signal overfitting.
  - Nondeterministic APIs.
  - JSDoc.
- **Best-of-N selection.** Sampling stops as soon as a candidate is substantively clean. Otherwise the best candidate that passes the gate is promoted. If only the gate failed, one targeted "quality repair" sample is allowed (`FORGE_QUALITY_RETRIES`).
- **Holdout assertions.** Part of each reference suite is never shown to the model in retry feedback. The model only learns how many hidden assertions failed.
- **Better prompts.** The prompt now asks for documented, pure code that does not mutate its inputs. The quality rules are also appended to every Builder Brain profile.
- **Oracles.**
  - Generated benchmark problems now ship reference implementations and sample inputs.
  - Minted problems keep the reference that was proven in the sandbox.
  - Minting can be grounded in real research excerpts from the corpus.
- **Tool metadata.** The manifest now stores a description, parameter docs, return docs and the quality verdict. Agent tool-calling uses these instead of `[Capability Forge] … (forge_x)`.
- **Tunables:** `FORGE_MIN_QUALITY` (0.6), `FORGE_MIN_AGREEMENT` (0.95), `FORGE_QUALITY_RETRIES` (1).

## Existing tool quarantine

`npx tsx scripts/quarantine-selfhosted.ts` does a dry run. Adding `--apply` **moves** files into
`.selfhosted/quarantine/<stamp>/` and backs up the manifest; nothing is deleted.
The dry run against the live manifest gave:

- keep 12 (6 forge tools and 6 dream-family representatives)
- quarantine 423 corpus clones and 25 near-duplicates
- quarantine 4,125 orphan module files

Stop the server before applying, because it holds the manifest in memory.

## Not fixed (recommended next)

1. **In-process dream evaluation still uses `node:vm` / `new Function`.** The screen reduces the risk but is not a security boundary. Move gene evaluation into isolated-vm.
2. **The no-isolate fallback has no timeout.** When isolated-vm is unavailable, an infinite loop in generated code blocks the event loop. Consider `RECOURSE_REQUIRE_ISOLATION=1`.
3. **Registry entries for the corpus clones remain.** They are still in the SQLite registry (`recourse_storage.json`). `scripts/prune-registry.mts` can remove them.
4. **Builtin `FORGE_AGENDA` specs have no reference implementations.** Differential testing is off for them; only robustness and static checks run. Adding references would strengthen them.
5. **Raw `err.message` reaches clients** in many 500 responses. The risk is lower now that remote callers are gated.
6. **`scripts/kw-import-phoenix.js` (local, gitignored) is noted as holding a hardcoded key.** Rotate that key.
7. **The `issueTracker` test writes into the real `data/` directory.** It should use a temp dir.
8. **The repo root has large runtime clutter.** Examples: `recourse_storage.json.tmp` (164 MB), `ollama-8091.err`, and many boot/test logs. All are gitignored.

## Operational notes

- **Remote callers.** Callers on other machines, such as fleet nodes that are not on this host, must send `Authorization: Bearer $RECOURSE_API_SECRET` for mutating calls. Local UI, MCP stdio and Axiom/OpenHub on the same host are unaffected.
- **Docker.** The image sets `RECOURSE_HOST=0.0.0.0`. Set `RECOURSE_TRUSTED_PEERS` to the bridge gateway if the UI must mutate without the secret.

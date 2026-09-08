# Recourse: Upgrade Strategy — Becoming the Most Powerful Recursive Tool in Open Source

**Repo:** [ncsound919/recourse](https://github.com/ncsound919/recourse) @ `be1e8e0` (post-security-pass)
**Basis:** verified code review of the fix commit + competitive scan of the 2025–2026 self-improving-agent market

---

## Part 1 — Fix Verification (commit `be1e8e0`)

All P0/P1/P2 audit items landed and the implementations are sound:

| Audit item | Status | Implementation quality |
|---|---|---|
| Auth on mutating routes | ✅ Fixed | `api/recourse/_guard.ts` — fail-closed (503 when `RECOURSE_API_SECRET` unset), `timingSafeEqual` constant-time compare, Bearer or header |
| dream/cron fail-open | ✅ Fixed | Secret now required (503 unset, 401 mismatch) |
| SSRF in PDF sidecar | ✅ Fixed | Literal-IP block + DNS re-resolution of every resolved IP + redirect-target re-check via `HTTPRedirectHandler` subclass |
| Error leaks | ✅ Fixed | `serverError()` logs server-side with stack, returns generic message + hex correlation ref |
| vectorMemory races/honesty | ✅ Fixed | Honest `unknown` embedder status, LanceDB upsert by (id,kind), probe rows deleted, 30s probe cooldown, cosine re-scoring |
| math/configure validation | ✅ Fixed | zod strict schema with ranges, unknown-key rejection |
| Hygiene | ✅ Fixed | package renamed `recourse@1.0.0`, real oxlint lint script, `bun.lock`/`patch.*`/`.pyc` removed, CI workflow added |

**Residual items (not in the commit):**
- `math` and `dream` routes still hold module-level state in serverless — cold-start loss and concurrent-invocation races remain (only input validation was added).
- No LICENSE file yet — **blocking for any open-source market play** (see Phase 1).
- `master` branch still unprotected (repo setting, not a commit).
- SSRF guard has a theoretical DNS-rebinding TOCTOU window (check-then-connect); pinning the resolved IP for the actual fetch closes it. IPv4-mapped IPv6 hosts (`::ffff:x.x.x.x`) should be explicitly normalized.

Readiness moves from **2.5/5 → 4/5**. The foundation is now deployment-safe.

---

## Part 2 — The Competitive Landscape

Three rival lineages dominate "recursive/self-improving" open source. Recourse currently overlaps all three but leads none on their home turf.

### Lineage A: Evolutionary program optimizers (AlphaEvolve lineage)

| Project | Positioning | Key innovation | Weakness you can exploit |
|---|---|---|---|
| AlphaEvolve (DeepMind) | Closed but now Cloud-available | Gemini ensemble + evaluator loop | Needs a human to hand it the right problem; sample-hungry |
| OpenEvolve (~6.2K★) | Open AlphaEvolve impl | MAP-Elites archive, islands, cascade evaluation, checkpoint/resume | CLI/library only — no live system, no UI, no memory across runs |
| ShinkaEvolve (Sakana, Apache-2.0) | Sample-efficient evolution | Bandit LLM-ensemble selection, novelty rejection sampling, weighted parent sampling | Focused on single-problem optimization; not a persistent system |
| CodeEvolve | Open, cheap | Island GA + inspiration-based crossover + CVT-MAP-Elites; beats AlphaEvolve on 5/9 benchmarks with Qwen3-Coder-30B at ~10x lower cost | Research artifact, not a product |

### Lineage B: Self-modifying agents (Gödel Machine lineage)

| Project | Key result | Weakness you can exploit |
|---|---|---|
| Darwin-Gödel Machine (DGM) | SWE-bench 20%→50%, Polyglot 14.2%→30.7% over 80 self-modification iterations | Burns a frontier model (Claude) per iteration; archive of whole agents is heavyweight; no local-model path |
| ADAS / Meta Agent Search | Meta-agent programs new agents in code space | One-shot generation, weak verification story |
| Self-Harness / Hyperagents (2026) | Propose-evaluate-accept harness improvement loop | Research-stage |

### Lineage C: Agent skill libraries

| Project | Positioning | Weakness you can exploit |
|---|---|---|
| Anthropic Agent Skills (open standard, Dec 2025) | SKILL.md folders — now an open standard adopted across agent products | Static instructions — no verification, no promotion gate, no evolution |
| Voyager (and clones like code-voyager) | Persistent skill library + curriculum | Minecraft-era architecture; no sandboxed verification |
| NVIDIA skills repo | Official verified skills catalog | Human-authored, hand-verified — no self-improvement |

### Market pain points = your openings

1. **Problem discovery is unsolved.** AlphaEvolve "needs a human to hand it the right problem." ShinkaEvolve is explicitly chasing autonomous problem invention. Your **dream engine** is already architected for this — it just needs to emit problems, not only hypotheses.
2. **Evaluator design is the bottleneck.** Everyone requires a human-written evaluator. Recourse's **verifier + sandbox + lint gate** is a machine-generated, machine-verified evaluator pipeline — turn it into the product.
3. **Cross-run knowledge transfer is open research.** "Capturing knowledge gained in one optimization run to improve future tasks" is listed as an unsolved AlphaEvolve limitation. Your **vectorMemory + learner ledger** is exactly this primitive — nobody in Lineage A has durable semantic memory wired into the evolution loop.
4. **Sample efficiency.** Frontier-model ensembles are expensive; CodeEvolve proved open-weight Qwen backbones win on cost. Recourse is **local-first (Ollama)** by design — that's the right horse.
5. **Trust and supervision.** Research says the bottleneck is shifting from capability to "how users communicate with, supervise, and trust agents." Your **honesty contracts + provenance chain + mission-control UI** are a direct answer — no competitor has a UI at all.
6. **Security.** Autonomous agents are getting called "security nightmares." Your fail-closed guards, sandbox, and traversal-refusing patch intake are a differentiator worth marketing.
7. **Tool surface area beats model quality.** MCP is making integration a config problem. Your MCP server is 5 read-only tools today — it should be the full recursive loop.

### Recourse's unfair advantages (already in the code)

- **The promotion gate**: nothing enters the registry without passing a real sandboxed test suite + oxlint. DGM's agents, OpenEvolve's candidates, and Anthropic skills all lack a hard verification gate this strict.
- **The dogfood loop**: self-hosted tools run the server's own operations. No competitor runs on its own output.
- **Determinism receipts**: bit-for-bit ledger replay + provenance chain. Auditable self-improvement is a category nobody else occupies.
- **Fleet intake**: external deterministic brains (Axiom) can propose patches that land only through your gate. That's a multi-agent safety pattern the research is only now formalizing.

---

## Part 3 — Upgrade Roadmap

### Phase 1 — Credibility infrastructure (1–2 weeks)
*Goal: be installable, licensable, and measurable.*

1. **Add Apache-2.0 LICENSE** — non-negotiable for open-source adoption; every rival (ShinkaEvolve, OpenEvolve) is Apache/MIT.
2. **Benchmark harness.** Wire your existing benchmark engine to a public, comparable target (SWE-bench-Lite or a Terminal-Bench-style task set). DGM's headline is 20%→50% — Recourse needs *a number* to be in the conversation. Track it in the provenance chain so improvements are self-attested.
3. **One-command deploy**: `docker compose up` (server + 3 sidecars + optional Ollama). Free-tier friendly (your audience).
4. **README demo GIF + architecture diagram** — the mission-control UI is the most screenshot-able thing in this entire market.
5. Close residuals: LICENSE, branch protection, math/dream route state → durable store, ledger write serialization, SSRF IP pinning.

### Phase 2 — Search-engine parity (3–4 weeks)
*Goal: match the evolutionary frameworks on search quality while keeping the OS shell.*

6. **MAP-Elites archive over the gene registry.** Add behavior descriptors per domain (e.g. coding: pass-rate × latency × complexity; math: invariant residual × convergence steps). The registry becomes a quality-diversity archive instead of a linear promotion list. This is the single highest-leverage algorithmic upgrade — every serious rival has an archive; you have a ledger.
7. **Islands per domain.** Your 7 tool domains map naturally to islands with migration on promotion — parallel, diversified exploration.
8. **Novelty rejection sampling** via the existing **fuzz sidecar** — reject near-duplicate candidates before paying for sandbox verification. ShinkaEvolve's biggest sample-efficiency win, nearly free for you.
9. **Bandit model-ensemble selection** in `modelProvider.ts`: UCB over (model, profile) pairs — local Ollama models for cheap exploration, API model for exploitation. You already have the local/API profile toggle; add the bandit on top.

### Phase 3 — Open-endedness (4–6 weeks)
*Goal: own the problem-discovery opening no one has closed.*

10. **Dream engine → problem generator.** REM cycles currently emit hypotheses; extend to emit *problems* (task + machine-checkable acceptance test) into a problem archive. Pair with the capability forge as solver. This is the POET/ShinkaEvolve research frontier with a working UI already attached.
11. **Cross-run inspiration crossover.** On every forge iteration, recall top-k prior solutions from vectorMemory (per behavior niche) and inject as "inspiration" context — CodeEvolve's inspiration-based crossover, but backed by *durable memory* instead of a run-local archive. This directly attacks the cross-run transfer opening.
12. **Curriculum scheduler.** Use the learner's gene beliefs (alpha/beta posteriors) to order problem difficulty — the recursive learner becomes the curriculum, not just a spectator.

### Phase 4 — Distribution (2–3 weeks, parallel)
*Goal: ride the two standards that already have distribution.*

13. **Agent Skills export/import.** Emit every registry tool as a SKILL.md folder (open standard, agentskills.io) so Recourse-produced skills run in Claude Code, Codex, and every compliant client. Import external skills as UNVERIFIED candidates through your gate. Instant two-way marketplace position: verified skills out, community skills in.
14. **MCP write tools.** Extend the MCP server from 5 read-only tools to the full loop: `recourse.evolve`, `recourse.propose_problem`, `recourse.inspect_gene`, `recourse.promote` (guarded by the same secret pattern). Every MCP host becomes a Recourse client.
15. **Plugin template registry** — the `templatePlugins/bloomFilter.ts` pattern is your extension point; document it as the contribution path and seed it with 10 verified templates.

### Phase 5 — Verified self-modification (6–8 weeks)
*Goal: do DGM's trick, safely, on local models.*

16. **Harness evolution through the fleet gate.** Let the forge propose patches to Recourse's own source (`server.ts` splits first!) via the existing `fleetDevelopment` intake — sandbox + lint + CI-green required, provenance-tracked, one-click rollback. DGM proves the headline works (20%→50%); your gate makes it *safe enough to actually run overnight*.
17. **Nightly self-improvement cron**: dream → problem → forge → verify → promote → benchmark-delta report, published to the MCP `upgrade_report` tool. The upgrade report becomes your public changelog — self-attested improvement.

---

## Part 4 — Positioning

**One line:** *The self-developing OS that only believes what it can verify — local-first, benchmark-measured, MCP-native.*

| Axis | OpenEvolve/ShinkaEvolve/CodeEvolve | DGM/ADAS | Agent Skills | **Recourse (target)** |
|---|---|---|---|---|
| Verification gate | Fitness function only | Benchmark score | None (hand-written) | Sandbox + tests + lint, always |
| Persistent system | Run-scoped | Episode-scoped | Static files | Always-on OS w/ memory |
| Local models | Optional | Frontier-required | N/A | Default (Ollama-first) |
| Knowledge transfer | Within-run archive | Agent archive | Manual | Durable vector memory + ledger |
| UI | None | None | None | Mission control |
| Extensibility | Config files | Code | SKILL.md | Plugins + MCP + Skills out |
| Trust story | — | — | — | Provenance + honest fallbacks |

The moat isn't any single engine — it's the **gate + memory + honesty stack** with every rival's search algorithm importable as a plugin on top. Phase 2's archive makes the search competitive; Phases 3–5 make it a category of one.

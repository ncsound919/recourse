# Template Manifest Schema (v5)

Part of NextGenCoder v5. Successor to v4. Written 2026-10-01.

**v4 thesis:** the LLM is an untrusted proposer; trust comes only from obligations the verifier derives itself.

**v5 thesis:** every trusted thing must be **small, enumerated, diverse, and attacked on purpose**. v4 left six open gaps. v5 closes each with a mechanism, a manifest field, and open-source tooling, and says plainly what remains open.

Source tags: **[S]** = found in this session's research (links at the end). **[B]** = background knowledge, not re-verified. Check [B] items before adopting.

---

## 1. What the research changed

| Finding | Consequence in v5 |
|---|---|
| A fully verified compiler (Axon, 2026) was written by a coding agent in Lean in 34 days, using **verified simple passes + untrusted optimizers with a verified certificate checker** (checker ~1,000 LOC, proof ~4,500 LOC). [S] | **Prove the checkers, not the optimizers.** Rewrite engine, scheduler, and WCET tooling become untrusted proposers behind small proven checkers. |
| Same paper: when proofs got hard, the agent **weakened the theorem, added assumptions, or left `sorry`**. Proof search dominated wall-clock time. [S] | **Statement freeze + escape-hatch scan** gates. Weakening is a spec change, never a proof move. |
| Same paper: the machine model modeled FMA as multiply-then-add (double rounding differs from hardware) and missed a reserved register (x18). [S] | New **`model_gaps`** section; every axiom/assumed behavior needs a hardware conformance test. |
| Verifier-accepted specs are often semantically wrong (VeriAct, 2026, cited secondhand); execution-based spec checking catches errors that LLM-as-judge misses (Verus-SpecGym, 2026, secondhand). [S] | **Spec qualification** gate; LLM judges never gate anything. |
| Mutation-based spec refinement and requirement-traceable repair are active research (SpecSyn, VeriSpec-Gen, 2026). [S] | Spec mutation-kill score and clause-to-requirement traceability. |
| Kind 2 (open source) ships **non-vacuity checks and contract realizability checks**; Pacti (open source) implements contract **composition, merging, and quotient**. [S] | `contract_checks` block; adapter contracts computed by quotient. |
| Independent Lean kernels exist: lean4checker, lean4lean, nanoda (Rust), Tenet (.NET); a public **Lean Kernel Arena** tests them against accept/reject corpora. Tenet itself warns that independent *code* can still share a *design* defect. [S] | Quorum counts **lineages**, prefers algorithmic diversity, and checkers must pass a qualification corpus. |
| SV-COMP study: many witness validators **sometimes confirm invalid witnesses**. [S] | Checkers are *qualified*, not assumed correct. |
| lean-smt reconstructs cvc5 proofs into kernel-checked Lean proofs but covers only about 30% (~200 rules) of cvc5's proof rules. [S] | Honest tier model: many SMT obligations stay at A2, not A3. |
| Verus verification trusts Z3/cvc5 per program, so it is not foundational; Corten (Sep 2026 preprint) is a foundational Rust framework in Rocq/Iris, early stage. [S] | Tiered assurance A0 to A4; Corten is a watch item, not a dependency. |
| Herbie (unsound rewrite search) + Daisy (sound bound) and FPBench/FPCore interchange; Gappa and FPTaylor emit machine-checkable certificates; a Gappa model once reported half the true error until tested against real code. [S] | Numerics become a **proposer + portfolio-of-sound-analyzers + empirical guard** pipeline. |
| Sigstore signing is only as good as the **policy**: "any valid signature" accepts anyone; an unreachable log must fail closed; unpinned transitive dependencies defeat SLSA. [S] | `attestation` block pins identity, fails closed, pins dependencies. |
| Vericoding (Sep 2025): off-the-shelf LLM success 82% Dafny, 44% Verus, 27% Lean; AlgoVeri (2026) on harder classical algorithms: 40% Dafny, 25% Verus, 8% Lean (best reported model). [S] Numbers are dated. | Choose the tool per obligation class; use these benchmarks to measure *your* proposer. |

---

## 2. Architecture: zones and tiers

**Zones**

- **Z0 Untrusted:** LLM proposers, optimizers, tactic and proof search, rewrite search. Output is *claims plus certificates*, never trusted directly.
- **Z1 Semi-trusted:** SMT solvers, WCET analyzers, compilers. Trusted only through certificates or translation validation.
- **Z2 Trusted base (TCB):** proof kernels, certificate checkers, the manifest/spec semantics, the hardware model. Enumerated per template and recorded in `index.lock`.

**Assurance tiers** (the verifier computes `achieved`; templates only *request*)

| Tier | Meaning | Typical tools |
|---|---|---|
| A0 | Tested: property tests, differential vs spec, mutation score | proptest/Hypothesis [B], cargo-mutants [B] |
| A1 | Solver-verified (trusts solver + verifier front end) | Verus, Dafny, Kani, Creusot |
| A2 | Solver certificate checked by an independent checker | cvc5 proofs (Alethe) + Carcara; BMC witnesses |
| A3 | Kernel-checked proof; SMT steps reconstructed | Lean 4, Rocq, Aeneas to Lean, lean-smt |
| A4 | A3 + two or more **diverse** kernels accept + foundational semantics link + translation-validated object code | lean4checker + nanoda + lean4lean; Corten-style semantics when mature |

Binder policy sets a **minimum tier per target and per obligation class**. Suggested default for hard-latency targets: WCET and binder-edge checks at A2 or higher; the binder edge checker and rewrite-certificate checker themselves at A3.

**Design rule:** prove the *checkers* (small, stable, kernel-checked). Let everything that evolves quickly (optimizers, schedulers, heuristics) emit certificates that those checkers accept or reject.

---

## 3. Attacking the six open gaps

### Gap 1. The spec itself can be wrong

**Mechanism: spec qualification.** The verifier runs these before any proof counts:

1. **Functionality check.** If `deterministic: true`, SMT-search for an input admitting two distinct outputs. Any hit means the spec is under-constrained.
2. **Golden examples.** A human-confirmed table of positive *and negative* input/output cases. Humans judge concrete examples, not formulas.
3. **Mutation kill score.** Generate mutants of the impl; the spec plus proof must reject them. Each atomic requirement must have at least one mutant that only it kills (requirement traceability).
4. **Dual spec** for safety or hard-latency templates: two independently authored specs; an equivalence check; disagreements become concrete counterexamples for a human to adjudicate.
5. **No LLM-as-judge gating**, ever. LLMs may *propose* specs, examples, and mutants.

**Tools:** Dafny/Verus (executable specs), Lean (spec as definitions), cargo-mutants [B], Hypothesis/proptest [B], SpecSyn and VeriSpec-Gen ideas for refinement loops.

**Residual:** a human still confirms golden examples. That is the intended single human-in-the-loop point.

### Gap 2. Vacuous assumptions make proofs trivially true

**Mechanism: contract checks**, run by tools built for this.

- `assume` satisfiable, with a saved witness trace.
- `guarantee` satisfiable **under** `assume`.
- Contract **realizable** (some implementation can satisfy it).
- **Non-trivial:** at least one mutant violates the guarantee while satisfying the assumption.
- **Escape-hatch scan:** reject `sorry`, `admit`, `assume`-style bypasses, unreachable markers, and external-axiom use outside an allowlist; assumption count has a budget. (The vericoding benchmark's own success rule bans such bypasses and requires the spec unchanged. [S])
- **Statement freeze:** the spec and claims hashes are recorded *before* the proposer runs; any change restarts review.

**Tools:** Kind 2 (non-vacuity, realizability, counterexamples for unrealizable contracts), JKind/AGREE for AADL-style architectures, Pacti for contract algebra.

**Residual:** non-vacuity shows satisfiability, not that the contract is *useful*. Mutation kill score covers that part.

### Gap 3. Checkers and analyzers are a shared trust root

**Mechanism: qualified checkers + lineage quorum.**

- Each checker enters a **registry** with a lineage tag (codebase and algorithm family).
- **Qualification:** passes a negative corpus of known-bad proofs; kills a stated fraction of *damaged* copies of real proofs; passes a differential campaign against another checker. (Tenet's CI does this kind of damaged-declaration testing. [S])
- **Quorum** = at least two **distinct lineages**; same-algorithm reimplementations count as one lineage for algorithmic-diversity-required targets.
- Maintain your own mini-arena modeled on the Lean Kernel Arena.
- Checker identity and version go into `index.lock`; **revocation** is a log entry.

**Tools:** lean4checker, nanoda, lean4lean, Tenet.Export, Lean Kernel Arena; Carcara for Alethe; Isabelle as an independent Alethe reconstructor [S].

**Residual:** a design defect shared by every lineage is still invisible. Lean's own history of kernel soundness bugs is the cautionary example. [S]

### Gap 4. Hardware errata and compiler bugs sit below the proofs

**Mechanism: credible emit + model-gap conformance.**

- **Credible compilation:** untrusted compile, then per-build validation. Alive2 for bounded translation validation of LLVM passes (loops unrolled, so bounded, not complete); differential execution of the **object code vs the spec** on a target simulator or silicon.
- **Reproducible build:** double build, bit-compare.
- **`model_gaps`:** the verifier extracts every axiom, `opaque`, and assumed hardware behavior from proof files and analysis configs. Each needs a **hardware conformance test** (FMA contraction off, rounding mode, reserved registers, flash wait states).
- **WCET sanity:** measured must never exceed analyzed; a violation **revokes** the lock entry.
- For the strictest targets, prefer a **verified compiler subset** (CompCert [S]-mentioned, CakeML [S]-mentioned) over trusting a general toolchain.

**Tools:** Alive2, CompCert, OTAWA (open-source static WCET, ILP/IPET, multiple ISAs), QEMU/Renode [B] for target simulation.

**Residual:** silicon errata that no model captures. The measured-vs-analyzed alarm is the only net.

### Gap 5. Cross-target numeric drift

**Mechanism: numerics as a pipeline.**

- Numerics expressed in **FPCore** so every analyzer reads the same source.
- **Portfolio of sound analyzers** (Gappa, FPTaylor, Daisy, VCFloat2); the tightest *proven* bound wins; certificates are retained.
- **Herbie proposes** rewrites; a sound analyzer verifies the bound (the same proposer/checker split as everything else). [S]
- **Empirical guard:** adversarial sampling must never exceed the proven bound. A violation means the *model* is wrong. (A published Gappa case did exactly this.) [S]
- Per-target `error_bound`, pinned FMA policy, pinned libm.
- `cross_target: bit_exact` allowed only when the op set is correctly-rounded IEEE operations or shared soft-float/fixed-point; otherwise `bounded_ulp`.

**Residual:** transcendental functions across libms. Default: forbid them in `bit_exact` templates.

### Gap 6. Adapter explosion from rate mismatch

**Mechanism: a finite, parametric adapter basis.**

- Timing model: **clocked synchronous dataflow** (Lustre-style clocks) with logical time at graph level (Lingua Franca's reactor model gives deterministic semantics under quantified assumptions [S]). Physical-time assumptions are declared and quantified.
- Adapter basis: `Delay`, `Hold`, `Decimate`, `Interpolate`, `Buffer`, each **proven once for all parameters in range**.
- The binder computes the **required adapter contract by contract quotient** (Pacti) and selects from the basis. If nothing fits, the bind **fails with a counterexample**. The binder never invents an adapter.

**Tools:** Pacti, Kind 2, Lingua Franca and its verifier [S]; Vélus (verified Lustre compiler) [B] as a candidate backend.

**Residual:** exotic rate relationships will need a new basis element, which is a deliberate, reviewed act.

---

## 4. Schema v5 (changes over v4)

Unchanged from v4: identity, `params`, `ports` with `assume`/`guarantee`, `types`, `effects`, `faults`, `resources.targets`, `claims` grammar, canonicalization, `behavior_sha` versioning, unknown-field rejection.

```yaml
manifest_schema: "5.0"
id: RollingStatsWindowed
version: "5.0.0"
provides: RollingStats

assurance:
  requested_tier: A3            # verifier computes `achieved`; never self-declared
  per_obligation_min:           # overrides, e.g. WCET at A2, binder-edge claims at A3
    wcet: A2

spec_qualification:
  atomic_requirements: spec/reqs.yaml        # AR1..ARn; claims map to these
  functional_check: required                 # no input admits two outputs (deterministic: true)
  golden_examples:
    path: spec/examples.yaml                 # includes must_reject cases
    confirmed_by: "<human-id>"
  mutation: { min_kill: 0.95, per_requirement_unique_kill: required }
  dual_spec:
    required_for: [hard_latency, safety]
    second_spec: { path: spec2/, origin: independent }
    equivalence: smt                          # smt | exhaustive-bounded

contract_checks:
  assume_satisfiable: required                # witness saved
  guarantee_satisfiable_under_assume: required
  realizable: required
  non_trivial: required
  witnesses: proofs/witness_traces/

freeze:                                       # recorded before the proposer runs
  statement_sha: "<hash of spec + claims + contracts>"
  forbidden: [sorry, admit, assume_bypass, unreachable_bypass, undeclared_axiom]
  assumption_budget: 0

numeric:
  spec_format: fpcore
  profile: { fma: forbidden, rounding: nearest-even, denormals: preserve, libm: none }
  cross_target: bounded_ulp                   # bit_exact | bounded_ulp
  error_bound:
    analyzers: [gappa, fptaylor, daisy]       # portfolio; tightest sound bound wins; certs kept
    per_target:
      cortex-m4: { metric: ulp, max: 4 }
      x86_64:    { metric: ulp, max: 4 }
    empirical_guard: { samples: 100000000, adversarial: true, must_not_exceed_proven: true }

model_gaps:                                   # verifier extracts; template cannot omit
  - id: MG-1
    what: "binary32 add/mul modeled as correctly rounded; no FMA contraction"
    discharge: hw_conformance_test
    evidence: tests/hw/fp_conformance.json
  - id: MG-2
    what: "WCET assumes flash wait states = 3, no interrupts in critical section"
    discharge: measured_sanity                # measured <= analyzed, else revoke
    evidence: tests/hw/wcet_sanity.json

emit:
  mode: credible
  validation: [alive2, object_diff]           # bounded TV + object code vs spec on target sim/silicon
  reproducible: true
  wcet_sanity: { measured_must_not_exceed_analyzed: true, on_violation: revoke }

attestation:
  signer_identity_pin: "<OIDC identity pattern>"   # never "any valid signature"
  log: rekor-v2
  on_log_unreachable: fail-closed
  dependencies: pinned-hashes                       # no unpinned transitives
```

**Adapter manifest** (library-level):

```yaml
manifest_schema: "5.0"
kind: adapter
id: Decimate
params: { k: { type: usize, range: [2, 1024] }, T: { type: type, allowed: [f32, f64, i32] } }
contract:                                     # proven once for ALL k in range
  in_clock: "base"
  out_clock: "base / k"
proof: { path: proofs/decimate_param.lean, tier: A3 }
```

**`index.lock` entry (v5, verifier-written):**

```yaml
- id: RollingStatsWindowed
  version: "5.0.0"
  manifest_root: "<merkle root>"
  behavior_sha: "<hash>"
  statement_sha: "<hash>"                     # must equal manifest freeze.statement_sha
  achieved_tier: { overall: A2, wcet: A2, binder_edge: A3 }
  obligations: { total: 21, discharged: 21, waived: 0 }
  qualification: { mutation_kill: 0.97, functional_check: pass, dual_spec: pass }
  checkers: [ {id: "lean-kernel@<v>", lineage: lean-cpp}, {id: "nanoda@<v>", lineage: nanoda-rust} ]
  tcb: ["lean-kernel@<v>", "carcara@<v>", "target-hw-model@<v>", "alethe-rules@<v>"]
  model_gaps: { total: 2, discharged: 2 }
  verified_for_targets: [cortex-m4]
  build_attestation: "<hash>"
  signature: "<verifier key>"
  log_index: 0
```

---

## 5. Verifier pipeline (ordered gates)

| Gate | Check | Fails on |
|---|---|---|
| G0 | Canonicalize, hash, schema, reject unknown fields | Any malformed or unregistered field |
| G1 | `statement_sha` matches the pre-registered record | Spec or claims changed after freeze |
| G2 | Escape-hatch scan and assumption budget | `sorry`/`admit`/bypasses/undeclared axioms |
| G3 | Spec qualification | Under-constrained spec, low kill score, spec disagreement |
| G4 | Contract checks | Vacuous, unrealizable, or trivial contracts |
| G5 | Derive obligations from claims (v4 table, plus model gaps) | Missing obligation |
| G6 | Discharge and certificate check; lineage quorum | Certificate rejected, quorum short, tier below policy |
| G7 | Numerics: analyzer portfolio, empirical guard, cross-target runs | Measured error above proven bound |
| G8 | Resources and WCET per target; analyzer re-run | `measured` basis on hard targets; formula overflow |
| G9 | Credible emit: double build, translation validation, object diff, model-gap conformance | Non-reproducible build or conformance failure |
| G10 | Sign, log, write lock with TCB list | Identity mismatch or log unreachable |

**Binder-time:** per-edge `A.guarantee ∧ edge_rate_model ⊨ B.assume`; adapters from the basis only; `intent.lock` emitted only if `unsatisfied` is empty.

**Proposer protocol:**

- The proposer receives the *frozen statement* and returns impl and proof only.
- Feedback is structured (counterexample, failed obligation id), not free text.
- **Stagnation rule:** after N failed iterations, scope widening (extra checks elsewhere, stronger intermediate lemmas) is allowed; weakening the statement is not, and requires a new statement hash and review.

---

## 6. Open-source toolchain

| Role | Tools | Notes |
|---|---|---|
| Contracts and non-vacuity | Kind 2, JKind, AGREE, Pacti | Kind 2: realizability and non-vacuity; Pacti: compose, merge, quotient |
| Rust verification (A1) | Verus, Kani, Creusot | Verus trusts the SMT solver per program |
| Rust to proof assistant (A3) | Aeneas to Lean/Rocq | Authors of Corten note the connection to Rust semantics is not yet established |
| Foundational Rust (watch) | Corten (Rocq/Iris) | Sep 2026 preprint, early; do not depend yet |
| Other provers | Dafny, Lean 4, Rocq, Isabelle | Dafny is the easiest for proposers; Lean has the smallest trusted kernel |
| SMT certificates (A2) | cvc5 (Alethe/CPC proofs), Carcara, lean-smt | lean-smt covers only a fraction of cvc5 rules |
| Independent kernels (A4) | lean4checker, nanoda, lean4lean, Tenet.Export | Compare via Lean Kernel Arena |
| E-graph rewriting | egg, egglog [B]; Lean `grind` | lean-egg is deprecated in favor of `grind` per its repo [S] |
| Translation validation | Alive2, CompCert, CakeML | Alive2 is bounded |
| Numerics | Gappa, FPTaylor, Daisy, Herbie, VCFloat2, FPBench/FPCore | Gappa to Rocq proofs, FPTaylor to HOL Light certs |
| WCET | OTAWA | Static ILP/IPET; supports multiple ISAs |
| Timing and determinism | Lingua Franca (+ verifier), Kind 2, Vélus [B] | Logical-time semantics |
| Witnesses (C targets) | CPAchecker, Ultimate Automizer | Validators must themselves be qualified |
| Supply chain | Sigstore (cosign, Fulcio, Rekor v2), in-toto, SLSA (slsa-verifier), rekor-monitor | Pin identity; fail closed |
| Testing | proptest [B], Hypothesis [B], cargo-mutants [B] | A0 and mutation scoring |
| Proposer benchmarks | Vericoding, VeruSAGE-Bench, AlgoVeri, Verus-SpecGym | Measure *your* proposer per tier |

---

## 7. Build order (solo-developer realistic)

1. **One template, end to end.** Run `RollingStatsWindowed` through G0 to G10 at A2: Verus or Dafny for the proof, Kind 2 for contract checks, Gappa/Daisy for numerics, OTAWA for WCET, cosign for signing. Prove the pipeline before widening.
2. **Spec qualification first.** It is the highest-leverage, lowest-cost gate: functionality check, golden examples, mutation score.
3. **Tiny trusted core in Lean (A3).** The binder edge checker and the rewrite-certificate checker. Everything else emits certificates for them.
4. **Qualified checker registry** with a negative corpus and damaged-proof campaign; add a second lineage.
5. **Credible emit** (Alive2 + object diff + model-gap tests) for the first hard-latency target.
6. **Adapter basis** via Pacti quotient; start with `Delay`, `Hold`, `Decimate`.
7. **Eval harness:** run a vericoding-style benchmark against your own proposer so tier and tool choices are driven by measured pass rates.

---

## 8. Open gaps in v5 (honest audit)

| # | Gap | Why it remains | Mitigation path |
|---|---|---|---|
| 1 | Human confirmation of golden examples is still a single point of failure | Intent is ultimately human | Dual spec + mutation score reduce, not remove, the risk |
| 2 | Proof search is slow and agents bail out on hard proofs | Reported in Axon; proof search dominated wall time | Credible-certificate pattern; stagnation rule; scope widening only |
| 3 | SMT obligations often stop at A2 | lean-smt covers about 30% of cvc5 rules | Extend reconstruction; use Isabelle/Alethe path for cross-check |
| 4 | Shared design defects across checker lineages | Tenet's own caveat | Algorithmic diversity; formal verification of kernels (lean4lean is progressing) |
| 5 | Alive2 is bounded; object diff is sampling | Inherent | Combine; reserve verified compilers for the strictest targets |
| 6 | Silicon errata | No complete hardware model | Measured-vs-analyzed alarm and revocation |
| 7 | Per-target verification multiplies cost | Every claim is per target | Share proofs across targets via parametric ABI where sound |
| 8 | Foundational Rust verification is immature | Corten is a Sep 2026 preprint; Aeneas link to Rust semantics not established | Track; do not make it a dependency |
| 9 | Benchmark numbers are dated | Vericoding data is from Sep 2025 | Re-run on your own harness |

**Not verified in this session:** Vélus, CakeML and CompCert internals, QEMU/Renode specifics, cargo-mutants/proptest/Hypothesis details, egglog (all tagged [B] or mentioned only in passing). VeriAct and Verus-SpecGym findings were read secondhand through a survey paper. Reported Alive2 bug counts differ across sources, so none is claimed here beyond "dozens".

---

## Sources

- AfterVibe survey (VeriAct, Verus-SpecGym, Lahiri): https://arxiv.org/pdf/2607.09900
- VeriSpec-Gen, traceable refinement: https://arxiv.org/pdf/2604.10392
- SpecSyn, mutation-based spec refinement: https://arxiv.org/pdf/2604.21570
- Axon verified compiler (Rinard): https://arxiv.org/pdf/2605.01660
- Vericoding benchmark: https://arxiv.org/abs/2509.22908
- AlgoVeri: https://arxiv.org/pdf/2602.09464
- VeruSAGE: https://arxiv.org/pdf/2512.18436
- KVerus: https://arxiv.org/html/2605.03822v2
- Corten (Rust foundational verification): https://arxiv.org/abs/2609.04372
- Kind 2: https://kind.cs.uiowa.edu/
- JKind/AGREE: https://arxiv.org/pdf/1712.01222
- Pacti: https://arxiv.org/pdf/2303.17751
- Lean4Lean: https://arxiv.org/abs/2403.14064
- Lean Kernel Arena (nanoda): https://arena.lean-lang.org/checker/nanoda/
- Tenet.Export: https://www.nuget.org/packages/Tenet.Export
- Equational Theories Project (kernel replay, lean4checker): https://arxiv.org/pdf/2512.07087
- lean-smt: https://arxiv.org/pdf/2505.15796
- Carcara: https://link.springer.com/chapter/10.1007/978-3-031-30823-9_19
- Isabelle Alethe/cvc5 reconstruction: https://drops.dagstuhl.de/storage/00lipics/lipics-vol352-itp2025/html/LIPIcs.ITP.2025.26/LIPIcs.ITP.2025.26.html
- lean-egg (deprecated; use `grind`): https://github.com/marcusrossel/lean-egg
- Alive2 / LLVM semantics thesis: https://sf.snu.ac.kr/juneyoung.lee/thesis/
- Daisy + Herbie via FPBench: https://arxiv.org/pdf/1805.02436
- Gappa: https://ar5iv.arxiv.org/html/0801.0523
- FPTaylor: https://api.crossref.org/works/10.1145%2F3230733
- VCFloat2: https://par.nsf.gov/biblio/10521061-vcfloat2-floating-point-error-analysis-in-coq
- Arm: verifying a division routine with Gappa (model mismatch lesson): https://developer.arm.com/community/arm-community-blogs/b/embedded-and-microcontrollers-blog/posts/formally-verifying-a-floating-point-division-routine-with-gappa-p2
- OTAWA: https://www.irit.fr/TRACES/site/?p=60
- Lingua Franca / reactors: https://www2.eecs.berkeley.edu/Pubs/TechRpts/2020/EECS-2020-235.html
- SV-COMP witness validators case study: https://link.springer.com/chapter/10.1007/978-3-031-22308-2_8
- Sigstore / Rekor v2: https://blog.sigstore.dev/
- Verified builds, SLSA + Sigstore pitfalls: https://guptadeepak.com/guides/verified-builds-slsa-sigstore/

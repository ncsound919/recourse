# Cross-Domain Synergy Engine — Design Spec

**Date:** 2026-09-12
**Status:** Draft for review
**Scope:** A deterministic, execution-resolved, cross-domain method→problem transfer engine ("polymath mode") that extends Recourse's existing trend/insight/discovery stack.
**Baseline principle:** everything works deterministically with no model and no network. AI is an optional candidate generator and adapter author behind a hard verification gate.

---

## 1. Problem statement

Recourse already detects trends and links time series, but its "cross-domain" capability is narrow and partly theatrical:

- `src/lib/trendEngine.ts` computes pairwise lagged Pearson correlation and labels significance as `Math.abs(corr) >= 0.5` (line 391) — **no sample size, no stationarity check, no multiple-testing correction**.
- `src/lib/decisionEngine.ts` sets `crossDomainSynergy` to hardcoded literals (`0.4`, `0.95`, etc.) and prints a rationale claiming "maximum cross-domain synergy potential" (lines 105, 244). This is the anti-pattern the operator's honesty rule forbids.
- The only real cross-domain mechanism is `src/lib/translationBridge.ts`, which runs two hand-curated Python engines (basketball→biotech, golf→surgery). It is specific, not general.

We want a general engine that maps transferable structure **across every sector the operator works in**, where every edge is backed by a computed, reproducible signal, and every claimed "discovery" is resolved by execution — never asserted.

## 2. Goals

1. A deterministic **closed-discovery bridge search** over a weighted concept/method/problem graph (LION-style), producing ranked cross-domain transfer candidates.
2. A deterministic **structural alignment** layer (SME-style) that justifies *why* a method maps to a problem, and scores far vs near transfer.
3. Correct **statistical evidence** for series-bearing sectors (stationarity → Granger/Transfer Entropy → Fisher-z + BH-FDR → surprise/KL).
4. An **admission gate** that promotes `hypothesis → reproduced` only on an admissible proof (executable test / oracle / formal proof / human sign-off).
5. A **sector registry** covering the operator's domains, each bound to real evidence sources; unsupported sectors are honest empty/unverified nodes.
6. Rewire `decisionEngine.crossDomainSynergy` to a value computed from the real map.
7. Everything append-only and hash-chained into the existing discovery ledger.

## 3. Non-goals

- No claim that far cross-domain analogy is reliably solvable. The literature does not establish this.
- No learned black-box ranker as a source of truth. Embeddings/vector memory may *propose* candidates only.
- No new sandbox. Reuse the existing isolated-vm / wasm sandbox.
- No UI in Milestone 1 (a view may follow).

## 4. Honest scope and limits (research-grounded)

- **Representation bottleneck** (Chalmers/French/Hofstadter): engine quality cannot exceed the controlled relational vocabulary it is fed. The vocabulary is an explicit, versioned, operator-editable artifact, not hidden in code.
- **ABC finds low-hanging fruit** (Smalheiser): lexical/simple structural inference captures only the simplest transfers.
- **Real false-positive rates**: LION's top-k audit judged only **44% (closed) / 34% (open)** of above-gold candidates plausible. We display this class of rate, not hide it.
- **Best autonomous discovery systems score ~21–25%** on hard benchmarks (CORE-Bench, DiscoveryBench). We promise no more.
- **Calibrated vs measured**: SME constants, FDR `q`, k-hop cap, min-support, surprise thresholds are calibration choices and are tagged `calibration:true` in output.

## 5. Sector registry (v1)

Operator-selected sectors, each bound to real evidence:

| Sector | Evidence source | Verified? |
|---|---|---|
| Health / oncology / biotech | oncology engines, KG, verified tools, corpus roots | yes |
| Mathematics | `recursiveMathEngine`, `hardMathProblems`, ODE synthesizer, verified tools | yes |
| Cybersecurity | `cyberDefenseEngine`, verified tools | yes |
| Neuroscience / music therapy / auditory | music-therapy research modules, corpus | yes |
| Aging / geroscience / longevity | `trendSources` terms, corpus | yes |
| Sports (basketball, golf) | `bb_tech_core`, `golf_surgery_core`, `sports_science` corpus roots | yes |
| Logistics | Truck Buddy (`C:\Users\User\Downloads\Truck Buddy\web`): `src/lib/{boards,compliance,contracts,domain,geo,perspective,predict,vetting}.ts`, `src/lib/mechanic/{engine,budget,search}.ts`, with matching `tests/*.test.ts` suites | yes (pure/tested functions only; see §8.1 determinism admission) |

`DomainSpec` shape:

```ts
interface DomainSpec {
  id: string;                 // stable slug
  label: string;
  toolDomains: ToolDomain[];  // maps to registry entries
  corpusProjects: string[];   // CorpusRoot.project ids
  translationEngines: TranslationEngineId[];
  seriesTerms?: string[];     // optional time-series terms
  verified: boolean;          // false => empty/unverified node, shown honestly
}
```

## 6. Architecture

New directory `src/lib/synergy/` (mirrors `src/lib/composer/`, `src/lib/memory/`):

| Module | Responsibility |
|---|---|
| `types.ts` | All shared types |
| `domainRegistry.ts` | `DomainSpec` registry, operator-editable |
| `vocabulary.ts` | Versioned controlled relational vocabulary (functors, types, arities, causal roles) + `vocabularyHash` |
| `methodIndex.ts` | Extract `MethodSignature` from verified tools, lego bricks, translation-engine mappings |
| `problemIndex.ts` | Extract `ProblemSignature` from `RecourseProblem` (acceptance test + required primitives; extraction labeled heuristic) |
| `graph.ts` | Build weighted concept/method/problem graph; LION edge weights |
| `closedDiscovery.ts` | Bridge search `score(b)=f_g(min)(w(A,b),w(b,C))`, k-hop optional |
| `sme.ts` | Structure-mapping alignment (match hypotheses, consistency, systematicity, gmap merge, candidate inferences) |
| `macFac.ts` | Cheap content-vector prefilter before SME |
| `filters.ts` | Disjointness / generalness / semantic-type / direction / evidence / novelty gates |
| `stats.ts` | Stationarity, Granger, transfer entropy, Fisher-z, BH-FDR, surprise/KL |
| `adapters.ts` | CBR operator ladder producing candidate adaptations |
| `resolver.ts` | Sandbox execution + admission gate |
| `synergyMap.ts` | Graph of resolved vs candidate edges; `crossDomainSynergyFor(domain)` |
| `store.ts` | JSON persistence (existing `stateStore` pattern) |
| `manifest.ts` | Content hashing / determinism receipts |

## 7. Data model

```ts
type EvidenceStatus = 'hypothesis' | 'tested' | 'reproduced' | 'refuted' | 'stale';

interface MethodSignature {
  id: string;
  domain: string;
  source: 'tool' | 'brick' | 'translation';
  primitives: string[];
  inputContract?: StudContract;
  outputContract?: StudContract;
  complexity?: string;
  deterministic: boolean;
  /** structured relational form used by SME */
  relations: Rel[];
  suiteHash?: string;
}

interface ProblemSignature {
  id: string;
  domain: string;
  requiredPrimitives: string[];
  requiredContract?: StudContract;
  acceptanceTest: string;
  testHash: string;
  extraction: 'heuristic' | 'declared';
  relations: Rel[];
}

interface Rel { functor: string; type: 'rel' | 'attr' | 'fn'; args: string[]; order: number; }

interface TransferCandidate {
  id: string;                       // sha256(methodId|problemId|engineVersion)
  methodId: string;
  problemId: string;
  fromDomain: string;
  toDomain: string;
  bridges: BridgeEvidence[];        // closed-discovery supporting B terms
  alignment: AlignmentResult;       // SME gmap + candidate inferences
  farTransfer: number;              // high structure, low surface
  statistical?: StatisticalEvidence;
  filters: FilterDecision[];        // every gate, with reason
  score: number;
  support: number;
  prediction: 'pass' | 'fail';
  falsification: string;
  engineVersion: string;
}

interface BridgeEvidence { term: string; weightAB: number; weightBC: number; score: number; docs: number; }

interface AlignmentResult {
  gmapWeight: number;
  mappings: Array<{ base: string; target: string; evidence: number }>;
  inferences: string[];
  consistent: boolean;
}

interface StatisticalEvidence {
  n: number;
  stationarity: 'stationary' | 'differenced' | 'unknown';
  method: 'granger' | 'transfer_entropy' | 'fisher_z';
  statistic: number;
  pValue: number;
  qValue: number;               // BH-FDR
  surpriseBits: number;         // -log2(p)
  klVsNull: number;
}

interface TransferResult {
  candidateId: string;
  outcome: 'passed' | 'failed' | 'error';
  proofType: 'executable_test' | 'oracle_metric' | 'formal_proof' | 'human_signoff';
  sandboxReportHash: string;
  durationMs: number;
  adaptedBy: 'none' | 'operator_ladder' | 'model';
}

interface SynergyEdge {
  from: string; to: string;
  kind: 'resolved' | 'candidate';
  score: number; passes: number; attempts: number;
  backingIds: string[];
}
```

## 8. Algorithms

### 8.1 Canonicalize + freeze
Map every surface term to a canonical ID from the versioned `vocabulary.ts` + corpus topics. Record `vocabularyHash`, corpus snapshot id, and code commit in the manifest. Never match on raw strings.

**Determinism admission for methods:** only pure functions are indexed as `MethodSignature`s. A candidate that calls wall clock (`Date.now`, `new Date`) or an RNG is either excluded or indexed with `deterministic:false` and is **never** admitted to the resolved graph. Worked example (Truck Buddy logistics): index `deriveStatus` / `dossierVerdict` (pure, tested), but not `buildDossier` (calls `new Date()`). The extractor records a rejection reason per excluded candidate.

### 8.2 Weighted graph (LION-style)
Nodes = canonical ids (methods, problems, concepts). Edges weighted by a fixed, selectable statistic:
- **Jaccard** on co-occurrence sets (default, robust)
- **t-test** on mention distributions (best measured closed-discovery rank in LION)
- **NPMI / SCP / LLR** available, all closed-form.

### 8.3 Closed-discovery bridge search
```
B(A,C) = { b : (A,b) ∈ E and (b,C) ∈ E }
bridgeScore(b) = f_g( w(A,b), w(b,C) ),  f_g = min   // conservative: penalizes weak leg
rank by (bridgeScore, canonicalId)                    // stable, byte-reproducible tie-break
```
Optional k-hop (`A–b1…bn–C`) gated by a config cap; default 1 bridge (2 hops).

### 8.4 Structural alignment (SME-style)
- Generate match hypotheses via same-functor filter rules; forbid solitary attribute matches.
- Enforce **one-to-one** + **parallel connectivity**.
- **Systematicity**: evidence propagates up through higher-order relation matches.
- Greedy merge into maximal consistent gmaps; **exact/ILP when tractable**, greedy otherwise.
- Emit candidate inferences + a structural weight.
- **Constants** (`+0.3`, `+0.5`, `+0.4`, `+0.8 trickle-down`) are `calibration:true`.
- **Far-transfer** = normalized structural weight × (1 − surface similarity). High structure + low surface = true analogy.

### 8.5 MAC/FAC scale
Content-vector (relation-functor histogram) dot-product prefilter → SME only on top-M candidates. Inverted index on functors; no k-d trees (they degrade in high dimensions).

### 8.6 Deterministic filters (ordered, each logged)
1. **Swanson disjointness** — reject A–C already linked above a threshold.
2. **Generalness** — reject stoplist / over-frequent B terms.
3. **Semantic type** — require B's type in an allowed set.
4. **Direction** — reject ambiguous undirected causality where direction matters.
5. **Evidence** — require ≥ N independent docs per leg.
6. **Cross-cluster** — require legs in different literature/project clusters.
7. **Novelty** — require A–C absent/rare in the frozen snapshot.

### 8.7 Statistical layer (series-bearing sectors only)
```
1. Stationarity: ADF/PP (+KPSS cross-check); difference if I(1); record transformation.
2. Lead-lag: Granger/VAR on differenced series (lags by AIC/SIC), or Transfer Entropy
   for suspected nonlinearity (only when series length is adequate).
3. Correlation: Fisher z, SE = 1/sqrt(N-3), t-test df = N-2, require N > 3.
4. Multiple testing: m = pairs x lags x directions; Benjamini-Hochberg q = 0.05,
   report q-values; Benjamini-Yekutieli if dependence is not defensible.
5. Surprise: self-information -log2(p) and KL(P_obs || Q_null) vs a
   seasonality/autocorrelation-preserving surrogate null.
```

### 8.8 Novelty / surprise
`surpriseBits = -log2(p_corrected)`; `klVsNull` from a surrogate null. Thresholds are calibration.

### 8.9 Adapt + resolve (admission gate)
```
deterministic ladder: null -> reinstantiate -> parameter-adjust
                      -> abstract/respecialize -> derivational replay
if fails and model online: model drafts adapter + test (advisory)
run in existing sandbox -> capture report + content hash
promote hypothesis -> reproduced ONLY via:
  executable_test | oracle_metric | formal_proof | human_signoff
```
The model never writes status, the map, or an edge.

## 9. Integration

- **Ledger**: `trendLedger.appendInsight` unchanged. Template ids: `crossdomain_bridge`, `crossdomain_transfer_passed`, `crossdomain_transfer_refuted`. Payload carries candidate id, evidence, sandbox report hash.
- **decisionEngine**: replace literal `crossDomainSynergy` values with `crossDomainSynergyFor(domain)`; regression test asserts literals gone. Definition:

```ts
// deterministic; no wall clock
resolvedDegree(d)  = count of resolved edges touching d        // earned evidence
openPotential(d)   = mean over d's unresolved candidates with
                     score >= calibration.openScoreFloor
                     of (score * surpriseBits_norm)             // opportunity
crossDomainSynergyFor(d) = clamp01(
  0.5 * norm(resolvedDegree(d)) + 0.5 * openPotential(d)
)
```
Weights `0.5/0.5` and `openScoreFloor` are `calibration:true`. A domain with no resolved edges and no candidates returns `0` (honest empty), never a default constant.
- **Routes** (zod-contracted, fail-soft): `/synergy/map`, `/synergy/candidates`, `/synergy/resolve`, `/synergy/status`, `/synergy/ledger`.
- **Reuse**: `translationBridge` mappings become `MethodSignature`s; `problemArchive`/`problemGenerator` feed problems; lego `StudContract` feeds contracts; kg sidecar (NetworkX) computes betweenness when online.

## 10. AI role and contract

Permitted: (a) normalize free text → typed schema through a validator that rejects off-schema (no silent coercion); (b) propose candidate bridges; (c) draft adapter code + tests. Forbidden: writing status, the map, edges, or any "verified" claim. Offline → all deterministic stages run; AI stages report `offline`/`unconfigured`.

## 11. Determinism guarantees

- Fixed weights; fixed thresholds; stable sorted iteration; fixed tie-break by canonical id.
- No wall clock in scoring; logical timestamps only.
- `manifestHash` over all candidates/edges; same inputs → byte-identical map.
- Reproducibility mode: re-run and compare digests; mismatch fails loudly.
- Every output tagged `measured` vs `calibration`.

## 12. Testing

Unit (vitest):
- determinism: same inputs → identical map + manifest hash
- closed discovery: known bridge ranks top; disjointness gate rejects linked A–C
- SME: same-functor match; one-to-one violation rejected; systematicity ordering
- filters: each gate rejects **and logs a reason**
- stats: I(1) series differenced; Fisher-z known case; BH-FDR known set; two random walks not significant after correction
- admission: stubbed "model says pass" never flips status; only sandbox pass does
- ledger: chain valid after appends; tamper breaks it
- decisionEngine: computed value; no literals
- offline: deterministic map still produced

Evaluation harness:
- curated held-out transfer set (5–10), report Precision@k, MRR, Hits@k
- time-slicing where dated artifacts exist
- reproducibility digest comparison

## 13. Milestones

1. **M1 (deterministic, no AI):** registry, vocabulary, method/problem indexes, graph, closed-discovery, SME, filters, synergy map, ledger, routes.
2. **M2 (statistics):** stationarity + Granger/TE + Fisher-z + BH-FDR + surprise/KL, wired as the series-only evidence channel; fix `trendEngine` significance.
3. **M3 (resolver):** sandbox resolver + admission gate + status lifecycle.
4. **M4 (AI, gated):** model adapter drafting; decisionEngine rewire; optional UI map.

## 14. Calibration registry (tagged `calibration:true`)

| Constant | Default | Note |
|---|---|---|
| SME match weights | +0.3 / +0.5 / +0.4 / +0.8 | from published SME rule set |
| `f_g` aggregation | `min` | LION conservative default |
| k-hop cap | 2 | LION avoids >2 hops |
| min docs per leg | 2 | filter, tune per corpus |
| disjointness threshold | corpus-derived | Swanson precondition |
| FDR `q` | 0.05 | BH |
| far-transfer surface cutoff | tunable | Gick & Holyoak synthesis |
| surprise/KL novelty threshold | tunable | information-theoretic |

## 15. Open questions / risks

- Relational vocabulary coverage is the dominant risk; needs operator review and iteration.
- Logistics has no in-repo source; stays `verified:false` until supplied.
- k-hop combinatorial growth; cap and prefilter required.
- Human sign-off evidence must be stored with identity + timestamp to remain auditable.
- Cointegration (out of scope v1) can invalidate the "difference if I(1)" rule; noted.

## 16. References

- Literature-based discovery (Swanson ABC; open vs closed) — https://en.wikipedia.org/wiki/Literature-based_discovery
- Smalheiser 2017, Rediscovering Don Swanson — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5771422/
- LION LBD — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6499247/
- Crichton et al. 2020, neural open/closed LBD — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7228051/
- SemRep 2020 — https://bmcbioinformatics.biomedcentral.com/articles/10.1186/s12859-020-3517-7
- Structure-mapping engine — https://en.wikipedia.org/wiki/Structure_mapping_engine
- Structure-mapping theory — https://en.wikipedia.org/wiki/Structure-mapping_theory
- Case-based reasoning (Watson & Marir) — https://www.cs.auckland.ac.nz/research/groups/ai-cbr/classroom/cbr-review.html
- Gick & Holyoak 1983, schema induction & analogical transfer — https://www.causeweb.org/cause/research/literature/schema-induction-and-analogical-transfer
- Stanford Encyclopedia of Philosophy, Analogy — https://plato.stanford.edu/entries/reasoning-analogy/
- Granger causality — https://en.wikipedia.org/wiki/Granger_causality
- Transfer entropy — https://en.wikipedia.org/wiki/Transfer_entropy
- Fisher transformation — https://en.wikipedia.org/wiki/Fisher_transformation
- False discovery rate — https://en.wikipedia.org/wiki/False_discovery_rate
- Unit root — https://en.wikipedia.org/wiki/Unit_root
- Spurious relationship — https://en.wikipedia.org/wiki/Spurious_relationship
- Information content (surprisal) — https://en.wikipedia.org/wiki/Information_content
- Kullback–Leibler divergence — https://en.wikipedia.org/wiki/Kullback%E2%80%93Leibler_divergence
- Reproducible builds — https://en.wikipedia.org/wiki/Reproducible_builds
- FunSearch — https://www.nature.com/articles/s41586-023-06924-6
- AlphaEvolve — https://deepmind.google/discover/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/
- AI Scientist v1 (failure analysis) — https://arxiv.org/html/2408.06292v3
- DreamCoder — https://arxiv.org/abs/2006.08381
- CORE-Bench — https://arxiv.org/abs/2409.11363
- DiscoveryBench — https://arxiv.org/abs/2407.01725
- Knowledge graph embedding (MRR/Hits@k) — https://en.wikipedia.org/wiki/Knowledge_graph_embedding

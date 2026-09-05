# Capability Expansion Roadmap

- **Date:** 2026-09-04
- **Status:** Proposed
- **Purpose:** Catalog of candidate capabilities that expand what Recourse can perceive, reason about, and do. Framed as organism layers: senses (input), cognition (understanding), actuators (action), worlds (domains to master).

## Guiding principle

Every new capability must be evolved, tested, and proven rather than prompted. The deterministic core (verifiers, property harness, pre-merge gate, provenance) is the differentiator; new capabilities plug into that machinery, they do not bypass it.

## Layers and candidates

### Senses (what it perceives)
| Capability | Anchor module | Spec |
|---|---|---|
| Computer-use browser driver (sessions, forms, screenshots, DOM diffing) | `src/intake/agentbrowser.ts` | [expanded-senses](./2026-09-04-expanded-senses-intake.md) |
| Standing observation grid over watched sources | `src/intake/poll.ts` | [expanded-senses](./2026-09-04-expanded-senses-intake.md) |
| Audio/video ingestion (podcast + video transcription) | `src/intake/corpus`, `grounding.ts` | [expanded-senses](./2026-09-04-expanded-senses-intake.md) |
| Local environment telemetry (fs, git activity, calendar, machine load) | `src/autopilot/*` | [expanded-senses](./2026-09-04-expanded-senses-intake.md) |

### Cognition (what it understands)
| Capability | Anchor module | Spec |
|---|---|---|
| Tiered long-term memory (episodic / semantic / skill) | `src/lib/vectorMemory.ts` | [tiered-memory](./2026-09-04-tiered-memory-and-experience-learning.md) |
| Experience-driven skill abstraction (auto-promote winning genes) | `src/dream/mutator.ts`, `src/skills/` | [tiered-memory](./2026-09-04-tiered-memory-and-experience-learning.md) |
| Failure memory (bias mutations away from known-bad regions) | `src/lib/problemArchive.ts` | [tiered-memory](./2026-09-04-tiered-memory-and-experience-learning.md) |
| Symbolic verification sidecar (SymPy-style proof of generated claims) | `python/kg_service`, `src/lib/recursiveMathEngine.ts` | none yet |
| Counterfactual replay (what-if on past decisions) | `src/lib/systemDiff.ts`, `executionSandbox.ts` | none yet |

### Actuators (what it does in the world)
| Capability | Anchor module | Spec |
|---|---|---|
| **WASM capability sandbox (keystone)** — least-privilege, memory-isolated execution of self-generated tools, with snapshot pause/resume and in-sandbox Python | `src/lib/executionSandbox.ts`, `isolatedSandbox.ts`, `selfHosting.ts` | [wasm-sandbox](./2026-09-04-wasm-capability-sandbox.md) |
| Interactive veto with durable pause (human checkpoint mid-loop) | `src/autopilot/vetoScheduler.ts` | [interactive-veto](./2026-09-04-interactive-veto-durable-pause.md) |
| Generative output: Web MIDI + audio render, daily report writer | `src/lib/composer/*`, `narration.ts` | [generative-actuators](./2026-09-04-generative-actuators.md) |
| Budgeted wallet (capped spending on compute/data, all in provenance) | `src/autopilot/policy` chain | [generative-actuators](./2026-09-04-generative-actuators.md) |

### Worlds (domains it can master)
| World | Anchor module | Spec |
|---|---|---|
| Bioinformatics / biomarker discovery | `src/lib/biotechKnowledgeGraph.ts` | [bioinformatics-world](./2026-09-04-bioinformatics-world.md) |
| Boxing simulation | `src/benchmark/benchmark.ts`, `src/dream/*` | [boxing-world](./2026-09-04-boxing-simulation-world.md) |
| Music quality-diversity archive (evolved patches/patterns) | `src/lib/composer/soundlab.ts`, `qualityDiversity.ts` | [generative-actuators](./2026-09-04-generative-actuators.md) |

## Recommended sequence

1. **WASM capability sandbox** — the keystone. Hard isolation guarantees make every riskier capability after it safe to enable.
2. **Tiered memory + experience learning** — the system stops repeating known-bad paths and compounds its wins.
3. **Interactive veto + durable pause** — autonomy with human checkpoints, without losing loop state.
4. **Expanded senses** — computer-use and AV ingestion widen the intake firehose.
5. **Domain worlds** — bioinformatics and boxing give the dream engine hard, cheap-to-score fitness functions.

## Endgame shape

A system that perceives the internet and its machines continuously, remembers every failure forever, dreams up candidate improvements in a provably isolated sandbox, promotes only what survives verification, acts on code, audio, documents, and money — and can pause for human judgment without losing its place.

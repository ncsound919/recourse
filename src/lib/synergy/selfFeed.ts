// src/lib/synergy/selfFeed.ts
/**
 * Self-feeding synergy scan. Derives the discovery corpus IN-PROCESS from live
 * system state — the tool registry (methods) and the open-ended problem archive
 * (problems) — then runs the deterministic closed-discovery core and persists
 * the resulting map + ledger insight. No HTTP, no caller-supplied payloads: the
 * corpus is exactly what the system holds, so the growth decision engine's
 * synergy input stops being source:'none'.
 *
 * Honesty contract:
 *  - Only tools with a current, promoted source enter the method index;
 *    extractMethods rejects wall-clock/RNG sources with a recorded reason.
 *  - Only problems with a real acceptance test enter the problem index.
 *  - Domains stay in the native ToolDomain vocabulary; the decision bridge maps
 *    them straight through (it does not need a sector round-trip).
 *  - The scan never fabricates a candidate: discover() emits only content-grounded
 *    bridges, and an empty corpus yields an empty map (persisted honestly).
 */
import type { ToolEntry } from '../../types.js';
import type { RecourseProblem } from '../problemArchive.js';
import type { MethodSignature, ProblemSignature, SynergyMap, TransferCandidate } from './types.js';
import { extractMethods, type RawMethod } from './methodIndex.js';
import { extractProblems, detectPrimitives } from './problemIndex.js';
import { discover } from './closedDiscovery.js';
import { buildSynergyMap } from './synergyMap.js';
import { writeSynergyMap } from './store.js';
import { recordSynergyScan } from './ledger.js';

/** Current promoted version of a tool (mirrors the server's currentSourceOf). */
function currentVersion(tool: ToolEntry): ToolEntry['versions'][number] | undefined {
  return tool.versions?.find((v) => v.version === tool.currentVersion)
    ?? tool.versions?.[tool.versions.length - 1];
}

/** Registry -> MethodSignature[]. Deterministic; rejects non-deterministic sources. */
export function registryMethodSignatures(registry: ToolEntry[]): {
  methods: MethodSignature[];
  rejected: Array<{ id: string; reason: string }>;
} {
  const raws: RawMethod[] = [];
  for (const tool of registry) {
    const version = currentVersion(tool);
    const source = version?.source_code;
    if (!source) continue;
    raws.push({
      id: tool.name,
      name: tool.name,
      domain: tool.domain,
      source: 'tool',
      primitives: detectPrimitives(source),
      sourceCode: source,
      suite: version?.test_suite_code,
      deterministic: true,
    });
  }
  return extractMethods(raws);
}

/** Problem archive -> ProblemSignature[]. Only problems with a real acceptance test. */
export function archiveProblemSignatures(problems: RecourseProblem[]): ProblemSignature[] {
  const eligible = problems.filter((p) => Boolean(p.id && p.title && p.statement && p.acceptanceTest));
  return extractProblems(eligible);
}

export interface SelfFeedScan {
  methods: MethodSignature[];
  problems: ProblemSignature[];
  candidates: TransferCandidate[];
  manifest: string;
  map: SynergyMap;
  rejectedMethods: Array<{ id: string; reason: string }>;
}

/** Build the discovery corpus from live state and run the closed-discovery core. */
export function selfFeedSynergyScan(registry: ToolEntry[], problems: RecourseProblem[]): SelfFeedScan {
  const { methods, rejected } = registryMethodSignatures(registry);
  const problemSignatures = archiveProblemSignatures(problems);
  const { candidates, manifest } = discover(methods, problemSignatures, {});
  const map = buildSynergyMap(candidates, { generatedAtRun: 'job:synergy' });
  return { methods, problems: problemSignatures, candidates, manifest, map, rejectedMethods: rejected };
}

/** Persist the map + ledger insight. Side-effecting; separated for testability. */
export function persistSelfFeedScan(scan: SelfFeedScan): void {
  writeSynergyMap(scan.map);
  recordSynergyScan(scan.map);
}

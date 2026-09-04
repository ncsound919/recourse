/**
 * Inspect AI exporter — makes Recourse's self-improvement externally judgable.
 *
 * Recourse self-scores its own upgrades. To let an independent judge measure it,
 * we export every current gene as an Inspect-style "task sample": a prompt to
 * implement the capability plus the gene's own reference source + test suite.
 * An Inspect scorer (Python sidecar, out of process) can run the model's output
 * against the real suite and grade it — turning Recourse's self-referential
 * claims into an external measurement.
 *
 * Pure module (no fs/server) so the export shape is unit-testable.
 */

import type { ToolEntry } from '../types';

export interface InspectSample {
  id: string;
  domain: string;
  input: string;
  ideal: string;
  metadata: { test_suite_code: string; hash: string; score: number };
}

export function toInspectSamples(registry: ToolEntry[]): InspectSample[] {
  const out: InspectSample[] = [];
  for (const t of registry) {
    const cur = t.versions.find((v) => v.version === t.currentVersion);
    if (!cur?.source_code) continue;
    out.push({
      id: `recourse-${t.name}`,
      domain: t.domain,
      input: `Implement the Recourse micro-tool "${t.name}" (${t.domain}). ${t.description}\nReturn only JavaScript source code that defines the entrypoint.`,
      ideal: cur.source_code,
      metadata: { test_suite_code: cur.test_suite_code || '', hash: cur.hash || '', score: cur.score ?? 0 },
    });
  }
  return out;
}

/** Render as newline-delimited JSON for Inspect to ingest. */
export function renderInspectJsonl(samples: InspectSample[]): string {
  return samples.map((s) => JSON.stringify(s)).join('\n') + (samples.length ? '\n' : '');
}

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openVectorMemory } from '../src/lib/vectorMemory';
import { buildFleetMemoryEntry } from '../src/lib/fleetMemory';
import { deriveOpenHubAuditSignals, deriveOpenHubBelief, latestReportFromDocs } from '../src/lib/fleetSignal';

/**
 * Loop-close integration: an OpenHub self-report goes through the real fleet
 * intake shaper and the real vector-memory store, is recalled, and yields a
 * learner signal — everything except the HTTP hop.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-fleet-'));
  dirs.push(dir);
  return dir;
}

describe('loop close — OpenHub self-report through real vector memory', () => {
  it('ingests, recalls, and derives a learner signal end to end', async () => {
    const mem = await openVectorMemory({ dir: tmp() });

    const report = {
      at: '2026-09-20T12:00:00Z',
      activity: { total: 4, passRate: 0.25 },
      incidents: { recent: [{}] },
      runs: { active: 1 },
      bridges: { axiom: { ok: true, online: false }, recourse: { ok: true, available: false } },
    };
    const entry = buildFleetMemoryEntry(
      { source: 'openhub', kind: 'openhub-self-report', text: 'OpenHub self-report 2026-09-20T12:00:00Z', data: report },
      1,
    );
    expect(entry.ok).toBe(true);
    // The intake shaped it onto a snapshot while preserving topic + data.
    await mem.remember(entry.kind!, entry.id!, entry.text!, entry.meta);

    const hits = await mem.recall('openhub self report openhub-self-report', 'snapshot', 50);
    const recovered = latestReportFromDocs(hits);
    expect(recovered).not.toBeNull();
    expect(recovered?.at).toBe(report.at);

    const belief = deriveOpenHubBelief(recovered!);
    expect(belief).not.toBeNull();
    expect(belief?.domain).toBe('systemic');
    expect(belief!.beta).toBeGreaterThan(belief!.alpha); // degraded -> evidence is mostly negative
    expect(deriveOpenHubAuditSignals(recovered!)!.uncertainty).toBeGreaterThan(0.5);
  });

  it('yields no signal when nothing was ingested (never fabricates)', async () => {
    const mem = await openVectorMemory({ dir: tmp() });
    const hits = await mem.recall('openhub self report', 'snapshot', 50);
    expect(latestReportFromDocs(hits)).toBeNull();
  });
});

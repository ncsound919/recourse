/**
 * Fleet voice router — read-only spoken summaries for the Axiom and OpenHub
 * integration surfaces.
 *
 * Every probe is injected so this module is testable without a live Axiom or an
 * audit snapshot on disk, and so the monolith stays the single owner of the
 * real probes (`axiomBridgeStatus`, `axiomProjectLatest`, `loadAuditSnapshot`).
 *
 * Honesty contract: an unreachable Axiom, an unreadable loop, or a missing audit
 * snapshot is reported as such. This route never invents a grade or a loop
 * result — `src/lib/fleetVoice.ts` does the deterministic phrasing.
 */

import { Router } from 'express';
import type { ReporterAuditFact } from '../lib/selfReporter.js';
import {
  buildFleetBriefs,
  type FleetAxiomLoop,
  type FleetAxiomState,
  type FleetOpenHubState,
} from '../lib/fleetVoice.js';

export interface FleetVoiceRouterDeps {
  /** Reachability + auth posture of the Axiom bridge (never throws). */
  axiomStatus: () => Promise<{ online: boolean; url: string; auth: 'token' | 'keywire' | 'none' }>;
  /** Axiom's most recent project loop, when the bridge is reachable. */
  axiomLatest: () => Promise<{ ok: boolean; state?: Record<string, unknown>; error?: string }>;
  /** Latest audit snapshot written by OpenHub; null when none is recorded. */
  audit: () => ReporterAuditFact | null;
}

/** Shape Axiom's untyped loop state into the fields we are willing to speak. */
export function asAxiomLoop(state: Record<string, unknown> | undefined): FleetAxiomLoop | null {
  if (!state) return null;
  const id = typeof state.id === 'string' ? state.id : '';
  if (!id) return null;
  return {
    id,
    status: typeof state.status === 'string' ? state.status : null,
    iteration: typeof state.iteration === 'number' ? state.iteration : null,
    goal: typeof state.goal === 'string' ? state.goal : null,
  };
}

export function createFleetVoiceRouter(deps: FleetVoiceRouterDeps): Router {
  const router = Router();

  router.get('/fleet/voice', async (_req, res) => {
    let axiom: FleetAxiomState = { online: false, url: '', auth: 'none', loop: null, noLoopYet: false, loopError: null };
    try {
      const status = await deps.axiomStatus();
      axiom = {
        online: Boolean(status.online),
        url: status.url,
        auth: status.auth,
        loop: null,
        noLoopYet: false,
        loopError: status.online ? null : 'bridge offline',
      };
      if (status.online) {
        const latest = await deps.axiomLatest();
        if (!latest.ok) {
          axiom.loopError = latest.error ?? 'latest loop unavailable';
        } else {
          const loop = asAxiomLoop(latest.state);
          if (loop) axiom.loop = loop;
          else axiom.noLoopYet = true;
        }
      }
    } catch (e) {
      axiom = {
        ...axiom,
        online: false,
        loop: null,
        noLoopYet: false,
        loopError: e instanceof Error ? e.message : 'axiom probe failed',
      };
    }

    let openhub: FleetOpenHubState = { recorded: false, audit: null };
    try {
      const audit = deps.audit();
      openhub = { recorded: Boolean(audit), audit: audit ?? null };
    } catch {
      openhub = { recorded: false, audit: null };
    }

    res.json({
      success: true,
      axiom,
      openhub,
      briefs: buildFleetBriefs({ axiom, openhub }),
    });
  });

  return router;
}

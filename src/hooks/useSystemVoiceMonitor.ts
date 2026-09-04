/**
 * System voice monitor — polls the live status endpoint, keeps the UI's status
 * state fresh (so metric cards tick without a manual refresh), and speaks real
 * state transitions as they are observed.
 *
 * Nothing here invents events: every announcement is a diff between two real
 * server snapshots (promotion registered, self-repair healed, anomaly
 * detected/resolved, dream gene crystallized, model online/offline, evolution
 * paused/resumed, generation milestone). Speech itself is governed by
 * `narration.ts` (verbosity + throttle + master mute).
 */

import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SystemStatus } from '../types';
import { announce } from '../lib/narration';

const POLL_MS = 15000;
const MILESTONE_STEP = 25;

interface Snapshot {
  generation: number;
  totalUpgrades: number;
  healed: number;
  activeAnomalies: number;
  pendingApprovals: number;
  crystallized: number;
  modelOnline: boolean;
  autoEvolving: boolean;
}

function takeSnapshot(s: SystemStatus): Snapshot {
  return {
    generation: s.generation ?? 0,
    totalUpgrades: s.totalUpgrades ?? 0,
    healed: s.selfRepair?.totalHealedCount ?? 0,
    activeAnomalies: s.selfRepair?.activeAnomaliesCount ?? 0,
    pendingApprovals: s.pendingApprovalsCount ?? 0,
    crystallized: s.dreamState?.totalCrystallizedGenes ?? 0,
    modelOnline: Boolean(s.providerStatus?.online),
    autoEvolving: Boolean(s.isAutoEvolving)
  };
}

export function useSystemVoiceMonitor(setStatus: Dispatch<SetStateAction<SystemStatus>>): void {
  const prevRef = useRef<Snapshot | null>(null);

  useEffect(() => {
    let alive = true;
    let busy = false;

    const poll = async () => {
      if (busy) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const res = await fetch('/api/recourse/status').then((r) => r.json());
        if (!alive || !res?.status) return;
        const next = res.status as SystemStatus;
        const snap = takeSnapshot(next);

        // Keep metrics live without fighting the client-side uptime counter.
        setStatus((prev) => ({
          ...next,
          uptimeSeconds: prev.uptimeSeconds ?? next.uptimeSeconds ?? 0
        }));

        const prevSnap = prevRef.current;
        prevRef.current = snap;
        if (!prevSnap) return; // first poll seeds the baseline silently

        const p = prevSnap;
        const c = snap;

        const prevStep = Math.floor(p.generation / MILESTONE_STEP);
        const nextStep = Math.floor(c.generation / MILESTONE_STEP);
        if (nextStep > prevStep && nextStep > 0) {
          announce('milestone', `Generation ${nextStep * MILESTONE_STEP} reached. System continues evolving.`);
        }

        if (c.totalUpgrades > p.totalUpgrades) {
          announce('major', `Promotion registered. ${c.totalUpgrades} upgrades now live.`);
        }

        if (c.healed > p.healed) {
          const last = next.selfRepair?.lastHealedTool;
          announce('major', `Self repair healed ${c.healed - p.healed} tool${c.healed - p.healed === 1 ? '' : 's'}${last ? `: ${last}` : ''}.`);
        }

        if (c.activeAnomalies > p.activeAnomalies) {
          announce('critical', `Critical anomaly detected. ${c.activeAnomalies} active defect${c.activeAnomalies === 1 ? '' : 's'}.`);
        } else if (c.activeAnomalies < p.activeAnomalies) {
          announce('major', `Anomaly resolved. ${c.activeAnomalies} active defect${c.activeAnomalies === 1 ? '' : 's'} remain.`);
        }

        if (c.pendingApprovals > p.pendingApprovals) {
          announce('minor', `${c.pendingApprovals} gene${c.pendingApprovals === 1 ? '' : 's'} pending human approval.`);
        }

        if (c.crystallized > p.crystallized) {
          announce('major', `Dream engine crystallized a new gene. ${c.crystallized} crystallized total.`);
        }

        if (c.modelOnline && !p.modelOnline) {
          announce('major', 'Local model is now online.');
        } else if (!c.modelOnline && p.modelOnline) {
          announce('minor', 'Local model is offline.');
        }

        if (!c.autoEvolving && p.autoEvolving) {
          announce('minor', 'Autonomous evolution paused.');
        } else if (c.autoEvolving && !p.autoEvolving) {
          announce('major', 'Autonomous evolution resumed.');
        }
      } catch {
        /* poll loop retries on the next interval */
      } finally {
        busy = false;
      }
    };

    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [setStatus]);
}

/**
 * Fleet voice monitor — polls the Axiom/OpenHub voice state and speaks real
 * transitions (bridge reachability, project-loop lifecycle, audit grade and
 * findings movement).
 *
 * Nothing here invents an event: every announcement is a diff between two real
 * server snapshots (`diffFleetVoice`). Speech is governed by `narration.ts`
 * (verbosity + throttle + master mute), and the first poll seeds the baseline
 * silently so a page load never announces a backlog.
 */

import { useEffect, useRef } from 'react';
import {
  diffFleetVoice,
  takeFleetSnapshot,
  type FleetVoiceSnapshot,
  type FleetVoiceState,
} from '../lib/fleetVoice';
import { announce } from '../lib/narration';

const POLL_MS = 30000;

export function useFleetVoiceMonitor(): void {
  const prevRef = useRef<FleetVoiceSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    let busy = false;

    const poll = async () => {
      if (busy) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const res = await fetch('/api/recourse/fleet/voice').then((r) => r.json());
        if (!alive || !res?.success) return;

        const snap = takeFleetSnapshot({ axiom: res.axiom, openhub: res.openhub } as FleetVoiceState);
        const prev = prevRef.current;
        prevRef.current = snap;
        if (!prev) return; // first poll seeds the baseline silently

        for (const event of diffFleetVoice(prev, snap)) {
          announce(event.kind, event.text);
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
  }, []);
}

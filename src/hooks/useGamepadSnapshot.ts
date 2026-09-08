import { useEffect, useRef, useState } from 'react';

export interface GamepadSnapshot {
  connected: boolean;
  name: string | null;
  buttons: boolean[];
  axes: number[];
  timestamp: number;
}

const EMPTY: GamepadSnapshot = {
  connected: false,
  name: null,
  buttons: [],
  axes: [],
  timestamp: 0,
};

/**
 * Returns a live snapshot of the first connected gamepad, refreshed on every
 * animation frame. Only triggers a re-render when something actually changed
 * (a button toggled or an axis moved past a small epsilon), so the dashboard
 * stays cheap while the sticks remain smooth.
 */
export function useGamepadSnapshot(): GamepadSnapshot {
  const [snap, setSnap] = useState<GamepadSnapshot>(EMPTY);
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('getGamepads' in navigator)) {
      return;
    }

    let raf = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const pads = navigator.getGamepads();
      const gp = Array.from(pads).find(Boolean) as Gamepad | undefined;

      const next: GamepadSnapshot = gp
        ? {
            connected: true,
            name: gp.id || 'Gamepad',
            buttons: gp.buttons.map((b) => b.pressed),
            axes: Array.from(gp.axes),
            timestamp: performance.now(),
          }
        : EMPTY;

      const key =
        (next.connected ? '1' : '0') +
        next.buttons.map((b) => (b ? '1' : '0')).join('') +
        next.axes.map((a) => a.toFixed(3)).join(',');

      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key;
        setSnap(next);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return snap;
}

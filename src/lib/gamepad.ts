export type GamepadAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'confirm'
  | 'cancel'
  | 'action1'
  | 'action2';

export const GAMEPAD_DEADZONE = 0.35;

export const BUTTON_ACTIONS: Record<number, GamepadAction> = {
  0: 'confirm',
  1: 'cancel',
  2: 'action1',
  3: 'action2',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

export function buttonToAction(index: number): GamepadAction | null {
  return BUTTON_ACTIONS[index] ?? null;
}

export function axisToAction(
  x: number,
  y: number,
  deadzone: number = GAMEPAD_DEADZONE
): GamepadAction | null {
  if (Math.abs(x) > deadzone && Math.abs(x) >= Math.abs(y)) {
    return x < 0 ? 'left' : 'right';
  }
  if (Math.abs(y) > deadzone) {
    return y < 0 ? 'up' : 'down';
  }
  return null;
}

/**
 * Some generic USB controllers expose the D-pad as a hat switch on axes 6/7
 * instead of buttons 12-15. Values are -1/0/1 per axis.
 */
export function hatToAction(
  axes: readonly number[],
  deadzone: number = 0.5
): GamepadAction | null {
  const x = axes[6] ?? 0;
  const y = axes[7] ?? 0;
  if (Math.abs(x) > deadzone && Math.abs(x) >= Math.abs(y)) {
    return x < 0 ? 'left' : 'right';
  }
  if (Math.abs(y) > deadzone) {
    return y < 0 ? 'up' : 'down';
  }
  return null;
}

export function gamepadToActions(gp: Gamepad): GamepadAction[] {
  const actions = new Set<GamepadAction>();
  if (gp.buttons) {
    for (let i = 0; i < gp.buttons.length; i += 1) {
      if (gp.buttons[i]?.pressed) {
        const action = buttonToAction(i);
        if (action) actions.add(action);
      }
    }
  }
  if (gp.axes && gp.axes.length >= 2) {
    const stick = axisToAction(gp.axes[0], gp.axes[1]);
    if (stick) actions.add(stick);
    const hat = hatToAction(gp.axes);
    if (hat) actions.add(hat);
  }
  return Array.from(actions);
}

export function cycleIndex(
  current: number,
  length: number,
  dir: 'left' | 'right'
): number {
  if (length <= 0) return 0;
  const delta = dir === 'right' ? 1 : -1;
  return (current + delta + length) % length;
}

/**
 * Returns actions present in `current` but absent in `prev` (rising edges).
 * When `prev` is null (first observation) no edges are reported, so a button
 * held at connect time never fires a spurious action.
 */
export function diffActions(
  prev: Set<GamepadAction> | null,
  current: Set<GamepadAction>
): GamepadAction[] {
  if (!prev) return [];
  const newlyPressed: GamepadAction[] = [];
  for (const action of current) {
    if (!prev.has(action)) newlyPressed.push(action);
  }
  return newlyPressed;
}

export interface GamepadState {
  connected: boolean;
  name: string | null;
  index: number | null;
}

export interface GamepadPollerOptions {
  getGamepads: () => Array<Gamepad | null>;
  onAction?: (action: GamepadAction) => void;
  onStateChange?: (state: GamepadState) => void;
  enabled?: () => boolean;
}

export interface GamepadPoller {
  start: () => void;
  stop: () => void;
}

/**
 * Framework-agnostic polling engine. Reads the connected gamepads each
 * animation frame, reports connection state transitions, and fires `onAction`
 * only on rising edges. Tracks its own previous frame so a button held across
 * frames or already down at connect time never re-fires.
 */
export function createGamepadPoller(opts: GamepadPollerOptions): GamepadPoller {
  let prev: Set<GamepadAction> | null = null;
  let raf = 0;
  let stopped = true;

  const scan = () => {
    if (stopped) return;
    const pads = opts.getGamepads();
    for (let i = 0; i < pads.length; i += 1) {
      const gp = pads[i];
      if (!gp) continue;
      if (!prev) {
        opts.onStateChange?.({
          connected: true,
          name: gp.id || 'Gamepad',
          index: gp.index,
        });
      }
      const current = new Set(gamepadToActions(gp));
      if (opts.enabled?.() !== false) {
        for (const action of diffActions(prev, current)) {
          opts.onAction?.(action);
        }
      }
      prev = current;
    }
    raf = requestAnimationFrame(scan);
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      raf = requestAnimationFrame(scan);
    },
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      prev = null;
    },
  };
}

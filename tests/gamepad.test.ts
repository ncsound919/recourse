import { describe, it, expect } from 'vitest';
import {
  buttonToAction,
  axisToAction,
  hatToAction,
  gamepadToActions,
  cycleIndex,
  diffActions,
  GAMEPAD_DEADZONE,
  GamepadAction,
} from '../src/lib/gamepad';

function fakeGamepad(
  buttons: Array<{ pressed: boolean }>,
  axes: number[]
): Gamepad {
  return {
    buttons: buttons as unknown as GamepadButton[],
    axes,
    id: 'test',
    index: 0,
    connected: true,
    timestamp: 0,
    mapping: 'standard' as GamepadMappingType,
  } as unknown as Gamepad;
}

describe('buttonToAction', () => {
  it('maps standard action buttons', () => {
    expect(buttonToAction(0)).toBe('confirm');
    expect(buttonToAction(1)).toBe('cancel');
    expect(buttonToAction(2)).toBe('action1');
    expect(buttonToAction(3)).toBe('action2');
  });

  it('maps d-pad buttons', () => {
    expect(buttonToAction(12)).toBe('up');
    expect(buttonToAction(13)).toBe('down');
    expect(buttonToAction(14)).toBe('left');
    expect(buttonToAction(15)).toBe('right');
  });

  it('returns null for unmapped buttons', () => {
    expect(buttonToAction(5)).toBeNull();
    expect(buttonToAction(99)).toBeNull();
  });
});

describe('axisToAction', () => {
  it('detects horizontal stick direction', () => {
    expect(axisToAction(-1, 0)).toBe('left');
    expect(axisToAction(1, 0)).toBe('right');
  });

  it('detects vertical stick direction', () => {
    expect(axisToAction(0, -1)).toBe('up');
    expect(axisToAction(0, 1)).toBe('down');
  });

  it('respects deadzone', () => {
    expect(axisToAction(0.1, 0)).toBeNull();
    expect(axisToAction(0.2, 0.2)).toBeNull();
  });

  it('prefers the dominant axis', () => {
    expect(axisToAction(-0.9, 0.3)).toBe('left');
    expect(axisToAction(0.3, -0.9)).toBe('up');
  });

  it('defaults to GAMEPAD_DEADZONE', () => {
    expect(GAMEPAD_DEADZONE).toBe(0.35);
  });
});

describe('gamepadToActions', () => {
  it('collects pressed buttons and stick direction', () => {
    const gp = fakeGamepad(
      [
        { pressed: true },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: true },
        { pressed: false },
      ],
      [0, 0]
    );
    const actions = gamepadToActions(gp);
    expect(actions).toContain('confirm');
    expect(actions).toContain('left');
  });

  it('returns empty when nothing is pressed', () => {
    const gp = fakeGamepad(Array(16).fill({ pressed: false }), [0, 0]);
    expect(gamepadToActions(gp)).toEqual([]);
  });

  it('deduplicates when button and stick both report the same direction', () => {
    const gp = fakeGamepad(
      [
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: true },
        { pressed: false },
      ],
      [-1, 0]
    );
    const actions = gamepadToActions(gp);
    expect(actions.filter((a) => a === 'left')).toHaveLength(1);
  });

  it('detects D-pad up from a hat switch on axes 6/7', () => {
    const gp = fakeGamepad(Array(16).fill({ pressed: false }), [0, 0, 0, 0, 0, 0, 0, -1]);
    const actions = gamepadToActions(gp);
    expect(actions).toContain('up');
  });
});

describe('hatToAction', () => {
  it('reads D-pad directions from axes 6/7 (hat switch)', () => {
    const up = Array(8).fill(0); up[7] = -1;
    const down = Array(8).fill(0); down[7] = 1;
    const left = Array(8).fill(0); left[6] = -1;
    const right = Array(8).fill(0); right[6] = 1;
    expect(hatToAction(up)).toBe('up');
    expect(hatToAction(down)).toBe('down');
    expect(hatToAction(left)).toBe('left');
    expect(hatToAction(right)).toBe('right');
  });

  it('returns null at neutral or below deadzone', () => {
    expect(hatToAction(Array(8).fill(0))).toBeNull();
    const small = Array(8).fill(0); small[7] = 0.2;
    expect(hatToAction(small)).toBeNull();
  });

  it('prefers the dominant hat axis', () => {
    const diag = Array(8).fill(0); diag[6] = -0.9; diag[7] = 0.3;
    expect(hatToAction(diag)).toBe('left');
  });
});

describe('diffActions', () => {
  it('reports nothing on the first observation', () => {
    const current = new Set<GamepadAction>(['confirm']);
    expect(diffActions(null, current)).toEqual([]);
  });

  it('reports newly pressed actions only', () => {
    const prev = new Set<GamepadAction>(['confirm']);
    const current = new Set<GamepadAction>(['confirm', 'action1']);
    expect(diffActions(prev, current)).toEqual(['action1']);
  });

  it('does not re-report actions still held from the previous frame', () => {
    const prev = new Set<GamepadAction>(['left']);
    const current = new Set<GamepadAction>(['left']);
    expect(diffActions(prev, current)).toEqual([]);
  });

  it('reports nothing when going from pressed to released', () => {
    const prev = new Set<GamepadAction>(['confirm']);
    const current = new Set<GamepadAction>();
    expect(diffActions(prev, current)).toEqual([]);
  });

  it('reports multiple new presses in a single frame', () => {
    const prev = new Set<GamepadAction>();
    const current = new Set<GamepadAction>(['confirm', 'action2']);
    const result = diffActions(prev, current).sort();
    expect(result).toEqual(['action2', 'confirm']);
  });
});

describe('cycleIndex', () => {
  it('cycles forward and wraps', () => {
    expect(cycleIndex(0, 4, 'right')).toBe(1);
    expect(cycleIndex(3, 4, 'right')).toBe(0);
  });

  it('cycles backward and wraps', () => {
    expect(cycleIndex(2, 4, 'left')).toBe(1);
    expect(cycleIndex(0, 4, 'left')).toBe(3);
  });

  it('guards against empty lists', () => {
    expect(cycleIndex(0, 0, 'right')).toBe(0);
  });
});

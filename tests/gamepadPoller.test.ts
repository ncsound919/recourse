import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createGamepadPoller,
  GamepadState,
  GamepadAction,
} from '../src/lib/gamepad';

function fakeGamepad(
  buttons: Array<{ pressed: boolean }>,
  axes: number[],
  index = 0
): Gamepad {
  return {
    buttons: buttons as unknown as GamepadButton[],
    axes,
    id: `test-${index}`,
    index,
    connected: true,
    timestamp: 0,
    mapping: 'standard' as GamepadMappingType,
  } as unknown as Gamepad;
}

const emptyPads = (): Array<Gamepad | null> => [];

type MutableGamepad = {
  buttons: GamepadButton[];
  axes: number[];
};

function press(gp: Gamepad, index: number, pressed: boolean) {
  (gp as unknown as MutableGamepad).buttons[index] = {
    pressed,
  } as unknown as GamepadButton;
}

function setAxes(gp: Gamepad, x: number, y: number) {
  (gp as unknown as MutableGamepad).axes = [x, y];
}

let rafCallbacks: Array<FrameRequestCallback> = [];
let rafId = 0;

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return ++rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function runOneFrame() {
  const cb = rafCallbacks.shift();
  if (cb) cb(performance.now());
}

describe('createGamepadPoller', () => {
  it('reports connected and name on the first frame with a gamepad', () => {
    const states: GamepadState[] = [];
    const actions: GamepadAction[] = [];
    const poller = createGamepadPoller({
      getGamepads: () => [fakeGamepad(Array(16).fill({ pressed: false }), [0, 0])],
      onStateChange: (s) => states.push(s),
      onAction: (a) => actions.push(a),
    });
    poller.start();
    runOneFrame();

    expect(states).toEqual([
      { connected: true, name: 'test-0', index: 0 },
    ]);
    expect(actions).toEqual([]);
    poller.stop();
  });

  it('does not fire an action for a button held at connect time', () => {
    const actions: GamepadAction[] = [];
    const gp = fakeGamepad(Array(16).fill({ pressed: false }), [0, 0]);
    press(gp, 0, true);
    const poller = createGamepadPoller({
      getGamepads: () => [gp],
      onAction: (a) => actions.push(a),
    });
    poller.start();
    runOneFrame();
    expect(actions).toEqual([]);
    poller.stop();
  });

  it('fires an action only on the rising edge of a new press', () => {
    const actions: GamepadAction[] = [];
    const gp = fakeGamepad(Array(16).fill({ pressed: false }), [0, 0]);
    const poller = createGamepadPoller({
      getGamepads: () => [gp],
      onAction: (a) => actions.push(a),
    });
    poller.start();
    runOneFrame();
    expect(actions).toEqual([]);

    press(gp, 2, true);
    runOneFrame();
    expect(actions).toEqual(['action1']);

    runOneFrame();
    expect(actions).toEqual(['action1']);

    press(gp, 2, false);
    press(gp, 0, true);
    runOneFrame();
    expect(actions).toEqual(['action1', 'confirm']);
    poller.stop();
  });

  it('detects left-stick movement as an edge', () => {
    const actions: GamepadAction[] = [];
    const gp = fakeGamepad(Array(16).fill({ pressed: false }), [0, 0]);
    const poller = createGamepadPoller({
      getGamepads: () => [gp],
      onAction: (a) => actions.push(a),
    });
    poller.start();
    runOneFrame();

    setAxes(gp, -0.9, 0);
    runOneFrame();
    expect(actions).toEqual(['left']);

    // Returning to center is a release, not a new press.
    setAxes(gp, 0, 0);
    runOneFrame();
    expect(actions).toEqual(['left']);
    poller.stop();
  });

  it('keeps reporting connection while disabled but suppresses actions', () => {
    const actions: GamepadAction[] = [];
    const states: GamepadState[] = [];
    const gp = fakeGamepad(Array(16).fill({ pressed: false }), [0, 0]);
    const poller = createGamepadPoller({
      getGamepads: () => [gp],
      enabled: () => false,
      onAction: (a) => actions.push(a),
      onStateChange: (s) => states.push(s),
    });
    poller.start();
    runOneFrame();
    expect(states.at(-1)?.connected).toBe(true);

    press(gp, 0, true);
    runOneFrame();
    expect(actions).toEqual([]);
    poller.stop();
  });

  it('does not emit edges after stop()', () => {
    const actions: GamepadAction[] = [];
    const gp = fakeGamepad(Array(16).fill({ pressed: false }), [0, 0]);
    const poller = createGamepadPoller({
      getGamepads: () => [gp],
      onAction: (a) => actions.push(a),
    });
    poller.start();
    runOneFrame();
    poller.stop();

    press(gp, 0, true);
    for (let i = 0; i < 5; i += 1) runOneFrame();
    expect(actions).toEqual([]);
  });

  it('survives a gamepad absent from the list without crashing', () => {
    const actions: GamepadAction[] = [];
    const poller = createGamepadPoller({
      getGamepads: emptyPads,
      onAction: (a) => actions.push(a),
    });
    poller.start();
    for (let i = 0; i < 5; i += 1) runOneFrame();
    expect(actions).toEqual([]);
    poller.stop();
  });
});

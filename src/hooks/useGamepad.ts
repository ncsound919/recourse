import { useEffect, useRef, useState } from 'react';
import {
  GamepadAction,
  GamepadState,
  createGamepadPoller,
} from '../lib/gamepad';

interface UseGamepadOptions {
  onAction?: (action: GamepadAction) => void;
  enabled?: boolean;
}

export function useGamepad({
  onAction,
  enabled = true,
}: UseGamepadOptions = {}): GamepadState {
  const [state, setState] = useState<GamepadState>({
    connected: false,
    name: null,
    index: null,
  });

  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('getGamepads' in navigator)) {
      return;
    }
    const poller = createGamepadPoller({
      getGamepads: () => Array.from(navigator.getGamepads()),
      onAction: (action) => onActionRef.current?.(action),
      onStateChange: setState,
      enabled: () => enabledRef.current,
    });
    poller.start();
    return () => poller.stop();
  }, []);

  return state;
}

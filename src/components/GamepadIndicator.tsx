import React, { useEffect, useRef, useState } from 'react';
import { Gamepad2 } from 'lucide-react';

interface GamepadIndicatorProps {
  connected: boolean;
  name: string | null;
  lastAction: string | null;
  pulse: number;
}

export const GamepadIndicator: React.FC<GamepadIndicatorProps> = ({
  connected,
  name,
  lastAction,
  pulse,
}) => {
  const [flash, setFlash] = useState(false);
  const prevPulseRef = useRef(pulse);

  useEffect(() => {
    if (pulse !== prevPulseRef.current) {
      prevPulseRef.current = pulse;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 350);
      return () => clearTimeout(t);
    }
  }, [pulse]);

  return (
    <span
      className={`flex items-center gap-1.5 bg-slate-900 border px-3 py-1.5 rounded-lg font-mono text-xs transition-all ${
        connected
          ? 'border-emerald-600/60 text-emerald-300'
          : 'border-slate-800 text-slate-600'
      } ${flash ? 'scale-110 border-amber-400 text-amber-300 shadow-lg shadow-amber-500/30' : ''}`}
      title={
        connected
          ? `Controller: ${name || 'Gamepad'} — D-pad/stick cycles tabs, A confirms, X toggles auto, Y steps`
          : 'Connect a USB gamepad to control the dashboard'
      }
    >
      <Gamepad2 className="w-3.5 h-3.5" />
      <span>{connected ? (name || 'Gamepad').slice(0, 24) : 'Controller'}</span>
      {connected && lastAction && (
        <span className="text-amber-400 uppercase">{lastAction}</span>
      )}
    </span>
  );
};
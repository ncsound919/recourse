import React from 'react';
import { GamepadSnapshot } from '../hooks/useGamepadSnapshot';

interface GamepadVisualizerProps {
  snapshot: GamepadSnapshot;
  lastAction: string | null;
  className?: string;
}

const ACTIVE_COLORS: Record<string, string> = {
  confirm: '#34d399',
  cancel: '#f87171',
  action1: '#38bdf8',
  action2: '#fbbf24',
  up: '#a78bfa',
  down: '#a78bfa',
  left: '#a78bfa',
  right: '#a78bfa',
};

const BASE_BTN = '#334155';
const BASE_BTN_STROKE = '#64748b';

function pressed(s: GamepadSnapshot, i: number): boolean {
  return s.buttons[i] === true;
}

function ButtonLight({
  cx,
  cy,
  r,
  active,
  color,
  label,
}: {
  cx: number;
  cy: number;
  r: number;
  active: boolean;
  color: string;
  label: string;
}) {
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={active ? color : BASE_BTN}
        stroke={active ? color : BASE_BTN_STROKE}
        strokeWidth={2}
        style={{
          transition: 'fill 80ms linear, filter 80ms linear',
          filter: active ? `drop-shadow(0 0 6px ${color})` : 'none',
        }}
      />
      <text
        x={cx}
        y={cy + 3.5}
        textAnchor="middle"
        fontSize={9}
        fontWeight="bold"
        fill={active ? '#0f172a' : '#94a3b8'}
        style={{ pointerEvents: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}

function Stick({
  cx,
  cy,
  x,
  y,
  socketColor,
}: {
  cx: number;
  cy: number;
  x: number;
  y: number;
  socketColor: string;
}) {
  const dx = Math.max(-10, Math.min(10, x * 10));
  const dy = Math.max(-10, Math.min(10, y * 10));
  const active = Math.abs(x) > 0.05 || Math.abs(y) > 0.05;
  return (
    <g>
      <circle cx={cx} cy={cy} r={24} fill="#0f172a" stroke="#475569" strokeWidth={2} />
      <circle
        cx={cx + dx}
        cy={cy + dy}
        r={12}
        fill={active ? socketColor : '#64748b'}
        style={{
          transition: 'fill 60ms linear',
          filter: active ? `drop-shadow(0 0 5px ${socketColor})` : 'none',
        }}
      />
    </g>
  );
}

function DPad({
  s,
  color,
  center = { x: 96, y: 150 },
}: {
  s: GamepadSnapshot;
  color: string;
  center: { x: number; y: number };
}) {
  const { x, y } = center;
  const arm = 16;
  const thick = 26;
  const stroke = color;
  const arms = [
    { d: 'up', pressed: pressed(s, 12), rect: { x: x - thick / 2, y: y - arm, w: thick, h: arm } },
    { d: 'down', pressed: pressed(s, 13), rect: { x: x - thick / 2, y: y, w: thick, h: arm } },
    { d: 'left', pressed: pressed(s, 14), rect: { x: x - arm, y: y - thick / 2, w: arm, h: thick } },
    { d: 'right', pressed: pressed(s, 15), rect: { x: x, y: y - thick / 2, w: arm, h: thick } },
  ];
  return (
    <g>
      {arms.map((a) => (
        <rect
          key={a.d}
          x={a.rect.x}
          y={a.rect.y}
          width={a.rect.w}
          height={a.rect.h}
          rx={4}
          fill={a.pressed ? stroke : BASE_BTN}
          stroke={a.pressed ? stroke : BASE_BTN_STROKE}
          strokeWidth={2}
          style={{
            transition: 'fill 80ms linear',
            filter: a.pressed ? `drop-shadow(0 0 5px ${stroke})` : 'none',
          }}
        />
      ))}
      <rect
        x={x - thick / 2}
        y={y - thick / 2}
        width={thick}
        height={thick}
        rx={4}
        fill={BASE_BTN}
        stroke={BASE_BTN_STROKE}
        strokeWidth={2}
      />
    </g>
  );
}

function Trigger({
  x,
  y,
  w,
  h,
  active,
  color,
  label,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  active: boolean;
  color: string;
  label: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={h / 2}
        fill={active ? color : '#1e293b'}
        stroke={active ? color : '#334155'}
        strokeWidth={2}
        style={{
          transition: 'fill 80ms linear',
          filter: active ? `drop-shadow(0 0 6px ${color})` : 'none',
        }}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 + 3}
        textAnchor="middle"
        fontSize={8}
        fontWeight="bold"
        fill={active ? '#0f172a' : '#64748b'}
        style={{ pointerEvents: 'none' }}
      >
        {label}
      </text>
    </g>
  );
}

const SOCKET_LEFT = '#38bdf8';
const SOCKET_RIGHT = '#f472b6';

export const GamepadVisualizer: React.FC<GamepadVisualizerProps> = ({
  snapshot,
  lastAction,
  className,
}) => {
  const activeColor = ACTIVE_COLORS[lastAction ?? ''] ?? '#38bdf8';

  return (
    <div className={className}>
      <svg
        viewBox="0 0 360 230"
        className="w-full max-w-[420px] mx-auto"
        role="img"
        aria-label="Game controller visualization"
      >
        <defs>
          <radialGradient id="gp-body" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </radialGradient>
        </defs>

        {/* Triggers / bumpers along the top edge */}
        <Trigger x={70} y={22} w={46} h={14} active={pressed(snapshot, 6)} color="#94a3b8" label="LT" />
        <Trigger x={122} y={22} w={46} h={14} active={pressed(snapshot, 4)} color="#94a3b8" label="LB" />
        <Trigger x={192} y={22} w={46} h={14} active={pressed(snapshot, 5)} color="#94a3b8" label="RB" />
        <Trigger x={244} y={22} w={46} h={14} active={pressed(snapshot, 7)} color="#94a3b8" label="RT" />

        {/* Body */}
        <path
          d="M 78 38
             Q 180 20 282 38
             C 320 40 322 78 300 96
             L 300 128
             C 300 150 290 168 262 180
             C 234 192 196 190 180 176
             C 164 190 126 192 98 180
             C 70 168 60 150 60 128
             L 60 96
             C 38 78 40 40 78 38 Z"
          fill="url(#gp-body)"
          stroke="#475569"
          strokeWidth={2}
        />

        {/* Grip shading */}
        <ellipse cx={110} cy={196} rx={40} ry={16} fill="#0f172a" opacity={0.6} />
        <ellipse cx={250} cy={196} rx={40} ry={16} fill="#0f172a" opacity={0.6} />

        {/* Left stick */}
        <Stick cx={100} cy={80} x={snapshot.axes[0] ?? 0} y={snapshot.axes[1] ?? 0} socketColor={SOCKET_LEFT} />
        {/* Right stick */}
        <Stick cx={260} cy={80} x={snapshot.axes[2] ?? 0} y={snapshot.axes[3] ?? 0} socketColor={SOCKET_RIGHT} />

        {/* D-pad */}
        <DPad s={snapshot} color="#a78bfa" center={{ x: 98, y: 160 }} />

        {/* Face buttons */}
        <ButtonLight cx={260} cy={136} r={14} active={pressed(snapshot, 3)} color="#fbbf24" label="Y" />
        <ButtonLight cx={260} cy={186} r={14} active={pressed(snapshot, 0)} color="#34d399" label="A" />
        <ButtonLight cx={238} cy={161} r={14} active={pressed(snapshot, 2)} color="#38bdf8" label="X" />
        <ButtonLight cx={282} cy={161} r={14} active={pressed(snapshot, 1)} color="#f87171" label="B" />

        {/* Center buttons: back / start / home */}
        <ButtonLight cx={172} cy={150} r={8} active={pressed(snapshot, 8)} color="#94a3b8" label="BK" />
        <ButtonLight cx={188} cy={150} r={8} active={pressed(snapshot, 9)} color="#94a3b8" label="ST" />
      </svg>

      {/* Status + last action readout */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-4 font-mono text-xs">
        <span
          className={`px-3 py-1 rounded-full border ${
            snapshot.connected
              ? 'border-emerald-600/60 text-emerald-300 bg-emerald-950/40'
              : 'border-slate-700 text-slate-500 bg-slate-900'
          }`}
        >
          {snapshot.connected ? '● CONNECTED' : '○ NO CONTROLLER'}
        </span>
        <span
          className="px-3 py-1 rounded-full border border-slate-700 text-slate-300 bg-slate-900"
          style={{
            transition: 'color 120ms linear, border-color 120ms linear',
            color: lastAction ? activeColor : undefined,
            borderColor: lastAction ? activeColor : undefined,
          }}
        >
          {lastAction ? `ACTION: ${lastAction.toUpperCase()}` : 'ACTION: —'}
        </span>
      </div>
      {snapshot.connected && snapshot.name && (
        <p className="mt-2 text-center font-mono text-[11px] text-slate-500 truncate max-w-[420px] mx-auto">
          {snapshot.name}
        </p>
      )}

      {/* Raw input readout: shows exactly which indices this controller reports */}
      <div className="mt-4 mx-auto max-w-[420px] rounded-lg border border-slate-800 bg-slate-900/70 p-3 font-mono text-[11px]">
        <p className="text-slate-500 mb-1">
          RAW INPUT{snapshot.connected ? '' : ' (no controller)'}
        </p>
        <p className="text-slate-400 leading-relaxed">
          buttons pressed:{' '}
          <span className="text-emerald-400">
            {snapshot.connected && snapshot.buttons.length
              ? snapshot.buttons
                  .map((p, i) => (p ? i : null))
                  .filter((i) => i !== null)
                  .join(', ') || 'none'
              : 'none'}
          </span>
        </p>
        <p className="text-slate-400 leading-relaxed">
          axes:
          <span className="text-sky-400">
            {' '}
            {snapshot.connected && snapshot.axes.length
              ? snapshot.axes.map((a, i) => `${i}:${a.toFixed(2)}`).join('  ')
              : 'none'}
          </span>
        </p>
      </div>
    </div>
  );
};
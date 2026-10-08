/**
 * Shared visual language for the Recourse panel.
 *
 * Inline style objects rather than CSS modules on purpose. A CSS module pipeline
 * would mean either a bundler or a hand-written `.css` import that `tsc` cannot
 * resolve; both add a build step to a plugin whose whole design goal is that its
 * published `lib/` has no runtime dependencies and no tooling. A dense telemetry
 * panel is a good fit for style objects anyway -- the styles are constant and
 * local, so there is nothing a stylesheet would buy.
 *
 * The palette follows the 2026-09-03 mission-control spec so the in-harness panel
 * and Recourse's own dashboard read as the same product.
 */

import type { CSSProperties } from 'react';

/** Panel background and border, from the spec's token table. */
export const TOKENS = {
  panelBg: '#020617',
  border: '#0f172a',
  cyanGlow: '0 0 8px rgba(34, 211, 238, 0.4)',
  amberGlow: '0 0 8px rgba(251, 191, 36, 0.4)',
  criticalRed: '#ef4444',
  nominal: '#5dba8f',
  caution: '#c99d4e',
  text: '#e2e8f0',
  dim: '#64748b',
  cyan: '#22d3ee',
  violet: '#af95df',
} as const;

/** Overall posture, derived from real thresholds rather than decoration. */
export type Posture = 'nominal' | 'caution' | 'critical';

export const POSTURE_COLOR: Record<Posture, string> = {
  nominal: TOKENS.nominal,
  caution: TOKENS.caution,
  critical: TOKENS.criticalRed,
};

export const panel: CSSProperties = {
  background: TOKENS.panelBg,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 6,
  padding: 12,
};

export const panelTitle: CSSProperties = {
  font: '600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: '0.08em',
  color: TOKENS.dim,
  textTransform: 'uppercase',
  margin: '0 0 8px',
};

export const mono: CSSProperties = {
  font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  color: TOKENS.text,
};

export const dimText: CSSProperties = {
  ...mono,
  color: TOKENS.dim,
};

export const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 10,
};

export const metric: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

export const metricValue: CSSProperties = {
  font: '600 15px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace',
  color: TOKENS.text,
};

export const metricLabel: CSSProperties = {
  font: '10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: '0.06em',
  color: TOKENS.dim,
  textTransform: 'uppercase',
};

/** A labelled read-only metric. */
export function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={metric}>
      <span style={metricLabel}>{label}</span>
      <span style={{ ...metricValue, ...(color === undefined ? {} : { color }) }}>{value}</span>
    </div>
  );
}

/** Horizontal bar with a threshold marker, used for rates. */
export function Bar({
  value,
  threshold,
  color,
}: {
  value: number;
  threshold?: number;
  color: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div
      style={{
        position: 'relative',
        height: 5,
        borderRadius: 3,
        background: '#0b1220',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${clamped * 100}%`, height: '100%', background: color }} />
      {threshold !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(1, threshold)) * 100}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: TOKENS.dim,
          }}
        />
      )}
    </div>
  );
}

/** Small button used by the loop controls. */
export function Button({
  children,
  onClick,
  disabled,
  tone = 'default',
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary';
  title?: string;
}) {
  const primary = tone === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        font: '11px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
        letterSpacing: '0.04em',
        padding: '6px 10px',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${primary ? TOKENS.cyan : TOKENS.border}`,
        background: primary ? 'rgba(34, 211, 238, 0.10)' : 'transparent',
        color: disabled ? TOKENS.dim : primary ? TOKENS.cyan : TOKENS.text,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** Format a ratio for display; `undefined` reads as a dash, never as zero. */
export function ratio(value: number | undefined): string {
  return value === undefined ? '--' : `${Math.round(value * 100)}%`;
}

/** Format an uptime in seconds compactly. */
export function uptime(seconds: number | undefined): string {
  if (seconds === undefined) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
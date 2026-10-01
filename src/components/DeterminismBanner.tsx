import React from 'react';
import { SystemStatus } from '../types';

interface DeterminismBannerProps {
  status: SystemStatus;
}

/** Determinism depth, entropy reduction and the most recent axiom hashes. */
export const DeterminismBanner: React.FC<DeterminismBannerProps> = ({ status }) => {
  const depth = status.determinismDepth || 0;
  const entropy = status.entropyReduction || 0.0;
  const ledger = status.axiomLedger || [];

  if (depth === 0) return null;

  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900/60 px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="shrink-0">
          <h2 className="text-sm font-semibold text-ink-50">Determinism</h2>
          <p className="mt-0.5 text-sm text-ink-400">
            Depth {depth}, entropy reduced {entropy.toFixed(2)}%
          </p>
          <div className="mt-2 h-1 w-48 overflow-hidden rounded-full bg-ink-800" aria-hidden="true">
            <div className="h-full bg-accent-500" style={{ width: `${Math.min(100, entropy)}%` }} />
          </div>
        </div>

        <div className="min-w-0 flex-1 lg:border-l lg:border-ink-800 lg:pl-5">
          <div className="mb-1.5 text-xs text-ink-500">Latest axioms</div>
          {ledger.length === 0 ? (
            <span className="text-sm text-ink-500">No axioms crystallized yet.</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ledger.slice(-8).map((hash, i) => (
                <span key={`${hash}-${i}`} className="rounded border border-ink-800 bg-ink-950 px-1.5 py-0.5 font-mono text-[11px] text-ink-300">
                  {hash}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

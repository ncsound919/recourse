'use client';
import React, { useState, useEffect, useRef } from 'react';

interface LedgerEntry {
  gen: number;
  ts: number;
  readinessScore: number;
  energyBudget: number | null;
  energyConsumed: number;
  learnerEpisode: number;
  learnerAvgReward: number;
  learnerCalibration: number;
  dream: boolean;
  axiomAdded: boolean;
  axiom?: string;
  legoTick: boolean;
  permitNextIteration: boolean;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

interface GenerationTickerProps {
  onOpenGen?: () => void;
}

export const GenerationTicker: React.FC<GenerationTickerProps> = ({ onOpenGen }) => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [visible, setVisible] = useState(false);
  const prevCountRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    const poll = () => {
      fetch('/api/recourse/generations')
        .then((r) => r.json())
        .then((data) => {
          if (!mounted) return;
          const e = data?.entries || [];
          if (e.length > 0) setVisible(true);
          prevCountRef.current = e.length;
          setEntries([...e].reverse().slice(0, 8));
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (!visible || entries.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto mb-3 pb-1 scrollbar-hide">
      <button
        type="button"
        onClick={onOpenGen}
        className="flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-indigo-400 uppercase tracking-widest shrink-0 transition-colors cursor-pointer"
        title="Open Generation Ledger"
      >
        <span>Live Gens</span>
        <span className="text-[9px] text-indigo-400/80 font-semibold">({entries.length})</span>
      </button>
      <div className="flex items-center gap-2 overflow-x-auto flex-1">
        {entries.map((e) => (
          <button
            type="button"
            key={e.gen}
            onClick={onOpenGen}
            title={`Generation #${e.gen}: ${Math.round(e.readinessScore * 100)}% readiness, ${e.energyConsumed}J used. Click to view full ledger.`}
            className="flex items-center gap-1.5 border border-slate-800/80 hover:border-indigo-500/50 rounded-lg px-2 py-1 shrink-0 bg-slate-950/80 hover:bg-slate-900 text-left transition-all cursor-pointer group"
          >
            <span className="text-indigo-300 group-hover:text-indigo-200 font-mono font-bold text-[11px]">#{e.gen}</span>
            <span className="text-[10px] font-mono text-slate-500">{timeAgo(e.ts)}</span>
            <span className="text-[10px] font-mono text-emerald-400 font-medium">{Math.round(e.readinessScore * 100)}%</span>
            {e.dream && <span className="text-[8px] font-mono font-bold px-1 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60" title="Dream Cycle fired">DRM</span>}
            {e.axiomAdded && <span className="text-[8px] font-mono font-bold px-1 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60" title={`Axiom added: ${e.axiom || ''}`}>AX</span>}
            {e.legoTick && <span className="text-[8px] font-mono font-bold px-1 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60" title="Lego NAS candidate assembled">LG</span>}
            {e.permitNextIteration === false && <span className="text-[8px] font-mono font-bold px-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60" title="Safety halt">HALT</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

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
    <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
      <button
        type="button"
        onClick={onOpenGen}
        className="shrink-0 text-xs text-ink-500 transition-colors hover:text-ink-200"
        title="Open the generation ledger"
      >
        Recent generations
      </button>
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {entries.map((e) => (
          <button
            type="button"
            key={e.gen}
            onClick={onOpenGen}
            title={`Generation ${e.gen}: ${Math.round(e.readinessScore * 100)}% readiness, ${e.energyConsumed} J used${e.dream ? ', dream cycle' : ''}${e.axiomAdded ? `, axiom ${e.axiom || ''}` : ''}${e.legoTick ? ', lego assembly' : ''}${e.permitNextIteration === false ? ', halted' : ''}`}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink-800 px-2 py-1 text-xs transition-colors hover:border-ink-700 hover:bg-ink-900"
          >
            <span className="text-ink-200">{e.gen}</span>
            <span className="text-ink-500">{timeAgo(e.ts)}</span>
            <span className="text-ink-400">{Math.round(e.readinessScore * 100)}%</span>
            {e.permitNextIteration === false && <span className="text-bad-300">halt</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

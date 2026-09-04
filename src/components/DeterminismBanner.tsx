import React from 'react';
import { SystemStatus } from '../types';
import { Shield, Fingerprint, Database, Cpu } from 'lucide-react';

interface DeterminismBannerProps {
  status: SystemStatus;
}

export const DeterminismBanner: React.FC<DeterminismBannerProps> = ({ status }) => {
  const depth = status.determinismDepth || 0;
  const entropy = status.entropyReduction || 0.0;
  const ledger = status.axiomLedger || [];
  
  if (depth === 0) return null;

  return (
    <div className="mb-6 bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 overflow-hidden relative shadow-[0_0_20px_rgba(99,102,241,0.1)]">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
        
        {/* Left Stats */}
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-950/80 border border-indigo-700/50 rounded-xl">
            <Cpu className="w-6 h-6 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm tracking-widest flex items-center gap-2">
              DETERMINISM HORIZON
              <span className="px-2 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 text-[9px] rounded-full font-mono uppercase">
                Expanding
              </span>
            </h3>
            <div className="flex items-center gap-4 mt-1 font-mono">
              <div className="text-[10px] text-slate-400">
                Depth: <span className="text-indigo-300">Level {depth}</span>
              </div>
              <div className="text-[10px] text-slate-400">
                Entropy Reduced: <span className="text-indigo-300">{entropy.toFixed(4)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Ledger */}
        <div className="flex-1 max-w-2xl bg-slate-950 border border-slate-800 rounded-xl p-2 flex gap-2 overflow-hidden relative">
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-950 to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-950 to-transparent z-10" />
          
          <div className="flex gap-2 items-center w-full px-4 overflow-x-hidden">
            {ledger.map((hash, i) => (
              <div 
                key={`${hash}-${i}`}
                className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 bg-slate-900 border border-indigo-500/20 rounded font-mono text-[10px] text-slate-300 shadow-[inset_0_0_8px_rgba(99,102,241,0.1)] transition-all animate-fade-in"
              >
                <Fingerprint className="w-3 h-3 text-indigo-500/70" />
                <span>0x{hash}</span>
              </div>
            ))}
            {ledger.length === 0 && (
              <span className="text-[10px] text-slate-500 font-mono italic">Awaiting structural crystallization...</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800">
        <div 
          className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] transition-all duration-1000"
          style={{ width: `${Math.min(100, entropy)}%` }}
        />
      </div>
    </div>
  );
};

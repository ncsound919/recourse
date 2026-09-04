import React, { useState, useEffect } from 'react';
import { Cpu, ShieldCheck, Activity, Zap, Play, Pause, RefreshCw, FileText, Sparkles, Volume2, VolumeX, Volume1, Globe } from 'lucide-react';
import { SystemStatus, PromotionPolicy } from '../types';
import { isVoiceEnabled, setVoiceEnabled, speak, playChirp } from '../lib/voice';
import { getNarrationLevel, setNarrationLevel, NarrationLevel } from '../lib/narration';

interface HeaderProps {
  status: SystemStatus;
  onToggleAuto: (enabled: boolean) => void;
  onPolicyChange: (policy: PromotionPolicy) => void;
  onOpenAiMutator: () => void;
  onGenerateReport: () => void;
  isGeneratingReport: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onToggleAuto,
  onPolicyChange,
  onOpenAiMutator,
  onGenerateReport,
  isGeneratingReport
}) => {
  const [voiceOn, setVoiceOn] = useState(isVoiceEnabled());
  const [narrationLevel, setNarrationLevelState] = useState<NarrationLevel>(getNarrationLevel());
  const [intakeBadge, setIntakeBadge] = useState<{ total: number; unconsumed: number; autopilot: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/recourse/intake/status').then(x => x.json());
        if (alive && r?.intake) {
          setIntakeBadge({ total: r.intake.total, unconsumed: r.intake.unconsumed, autopilot: !!r.autopilot });
        }
      } catch {}
    };
    tick();
    const int = setInterval(tick, 10000);
    return () => { alive = false; clearInterval(int); };
  }, []);

  const handleToggleVoice = () => {
    const nextVal = !voiceOn;
    setVoiceOn(nextVal);
    setVoiceEnabled(nextVal);
    if (nextVal) {
      speak('Acoustic Sonification System Active.', true);
      playChirp('success');
    } else {
      speak('Acoustic system deactivated.', true);
    }
  };

  const handleNarrationLevel = (next: NarrationLevel) => {
    setNarrationLevelState(next);
    setNarrationLevel(next);
  };

  const formatUptime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${hours}h ${mins}m ${s}s`;
  };

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-cyan-500 p-[1px] shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <Cpu className="w-5 h-5 text-indigo-400 animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-black tracking-wider uppercase text-white font-mono">Recourse</h1>
                <span className="px-2 py-0.5 text-[10px] font-bold font-mono uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                  Autonomous OS v2.4
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
                <span>24/7 Self-Developing Architecture</span>
                <span className="text-slate-600">•</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Gen {status.generation}
                </span>
              </p>
            </div>
          </div>

          {/* System Status Indicators */}
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <ShieldCheck className={`w-4 h-4 ${status.hashChainIntegrity ? 'text-emerald-400' : 'text-rose-400'}`} />
              <span className="text-slate-300">
                Provenance: <strong className={status.hashChainIntegrity ? 'text-emerald-400' : 'text-rose-400'}>
                  {status.hashChainIntegrity ? 'CHAIN VERIFIED' : 'TAMPER DETECTED'}
                </strong>
              </span>
            </div>

            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300">Uptime: <strong className="text-amber-400">{formatUptime(status.uptimeSeconds)}</strong></span>
            </div>

            {/* External Learning Indicator */}
            {intakeBadge && (
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
                <Globe className={`w-4 h-4 ${intakeBadge.unconsumed > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="text-slate-300">
                  External: <strong className={intakeBadge.unconsumed > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                    {intakeBadge.total} signals
                  </strong>
                  {intakeBadge.unconsumed > 0 && (
                    <span className="text-emerald-300 ml-1">· {intakeBadge.unconsumed} to ground</span>
                  )}
                  {intakeBadge.autopilot && (
                    <span className="ml-1.5 text-[10px] font-bold text-indigo-300 bg-indigo-950 border border-indigo-800 px-1.5 py-0.5 rounded animate-pulse">
                      AUTO
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Voice Narrator Control */}
            <button
              id="voice-telemetry-toggle-btn"
              onClick={handleToggleVoice}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border font-mono transition-all duration-200 cursor-pointer ${
                voiceOn
                  ? 'bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border-indigo-500/30 shadow-sm shadow-indigo-500/10'
                  : 'bg-slate-900 hover:bg-slate-800/80 text-slate-400 border-slate-800'
              }`}
              title="Toggle System Voice Narration & Sonification"
            >
              {voiceOn ? <Volume2 className="w-4 h-4 animate-bounce" /> : <VolumeX className="w-4 h-4" />}
              <span>VOICE: <strong className={voiceOn ? 'text-indigo-400' : 'text-slate-500'}>{voiceOn ? 'ACTIVE' : 'MUTED'}</strong></span>
            </button>

            {/* Narration verbosity selector */}
            {voiceOn && (
              <label className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg cursor-pointer" title="How much the narrator speaks. Quiet = major/critical only, Normal = + minor events, Verbose = + generation milestones.">
                <Volume1 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-slate-400 text-[10px] uppercase tracking-wider">Talk</span>
                <select
                  value={narrationLevel}
                  onChange={(e) => handleNarrationLevel(e.target.value as NarrationLevel)}
                  className="bg-slate-950 text-indigo-300 font-mono text-xs border border-indigo-500/30 rounded px-1.5 py-0.5 focus:outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="quiet">QUIET</option>
                  <option value="normal">NORMAL</option>
                  <option value="verbose">VERBOSE</option>
                </select>
              </label>
            )}

            {/* Policy Selector */}
            <div className="flex items-center space-x-1.5 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="text-slate-400 text-[11px]">Gate Policy:</span>
              <select
                value={status.activePolicy}
                onChange={(e) => onPolicyChange(e.target.value as PromotionPolicy)}
                className="bg-slate-950 text-indigo-300 font-mono text-xs border border-indigo-500/30 rounded px-2 py-0.5 focus:outline-none focus:border-indigo-400"
              >
                <option value="non_regressing">Non-Regressing (&ge; score)</option>
                <option value="strict_improve">Strict Improve (&gt; score)</option>
                <option value="human_approval">Human Approval Queue</option>
                <option value="any_pass">Any Pass (Auto-Promote)</option>
              </select>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center space-x-2">
            {/* Auto-Evolver Toggle */}
            <button
              onClick={() => onToggleAuto(!status.isAutoEvolving)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg font-mono text-xs font-semibold transition-all ${
                status.isAutoEvolving
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              {status.isAutoEvolving ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-emerald-400" />
                  <span>24/7 AUTO RUNNING</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-slate-300" />
                  <span>RESUME 24/7</span>
                </>
              )}
            </button>

            {/* AI Mutator Button */}
            <button
              onClick={onOpenAiMutator}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-mono text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>AI MUTATE GENOME</span>
            </button>

            {/* Generate Hourly Report Button */}
            <button
              onClick={onGenerateReport}
              disabled={isGeneratingReport}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-xs font-medium transition-all disabled:opacity-50 cursor-pointer"
              title="Generate Hourly Digest Report"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isGeneratingReport ? 'REPORTING...' : 'HOURLY REPORT'}</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};

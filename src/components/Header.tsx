import React, { useState } from 'react';
import { FileText, Menu, Pause, Play, ShieldAlert, ShieldCheck, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { SystemStatus } from '../types';
import { isVoiceEnabled, setVoiceEnabled, speak, playChirp } from '../lib/voice';
import { getNarrationLevel, setNarrationLevel, NarrationLevel } from '../lib/narration';

interface HeaderProps {
  status: SystemStatus;
  /** Current view title and its nav group (breadcrumb). */
  title: string;
  group: string;
  onToggleAuto: (enabled: boolean) => void;
  onOpenAiMutator: () => void;
  onGenerateReport: () => void;
  isGeneratingReport: boolean;
  onOpenNav: () => void;
  /** Right-aligned extras (e.g. connected controller). */
  extra?: React.ReactNode;
}

function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${secs % 60}s`;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  title,
  group,
  onToggleAuto,
  onOpenAiMutator,
  onGenerateReport,
  isGeneratingReport,
  onOpenNav,
  extra,
}) => {
  const [voiceOn, setVoiceOn] = useState(isVoiceEnabled());
  const [narrationLevel, setNarrationLevelState] = useState<NarrationLevel>(getNarrationLevel());

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    setVoiceEnabled(next);
    if (next) {
      speak('Voice narration on.', true);
      playChirp('success');
    } else {
      speak('Voice narration off.', true);
    }
  };

  const chainOk = status.hashChainIntegrity;
  const running = status.isAutoEvolving;

  return (
    <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenNav}
          className="-ml-1 rounded-md p-1.5 text-ink-400 hover:bg-ink-900 hover:text-ink-100 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            {group && group !== title && <span className="hidden text-sm text-ink-500 sm:inline">{group} /</span>}
            <h1 className="truncate text-[15px] font-semibold text-ink-50">{title}</h1>
          </div>
        </div>

        <dl className="ml-4 hidden items-center gap-5 text-xs md:flex">
          <div className="flex items-center gap-1.5">
            <dt className="text-ink-500">Uptime</dt>
            <dd className="text-ink-200">{formatUptime(status.uptimeSeconds ?? 0)}</dd>
          </div>
          <div className="flex items-center gap-1.5" title={chainOk ? 'Provenance hash chain verified' : 'Provenance hash chain failed verification'}>
            {chainOk ? <ShieldCheck className="h-3.5 w-3.5 text-ok-400" /> : <ShieldAlert className="h-3.5 w-3.5 text-bad-400" />}
            <dd className={chainOk ? 'text-ink-200' : 'text-bad-300'}>{chainOk ? 'Chain verified' : 'Chain broken'}</dd>
          </div>
        </dl>

        <div className="ml-auto flex items-center gap-2">
          {extra}

          <div className="flex items-center rounded-md border border-ink-800">
            <button
              type="button"
              onClick={toggleVoice}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${voiceOn ? 'text-accent-300' : 'text-ink-500 hover:text-ink-200'}`}
              title={voiceOn ? 'Mute voice narration' : 'Enable voice narration'}
              aria-pressed={voiceOn}
            >
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {voiceOn && (
              <select
                value={narrationLevel}
                onChange={(e) => {
                  const v = e.target.value as NarrationLevel;
                  setNarrationLevelState(v);
                  setNarrationLevel(v);
                }}
                className="h-8 border-l border-ink-800 bg-transparent px-2 text-xs text-ink-300 focus:outline-none"
                title="How much the narrator speaks"
              >
                <option value="quiet">Quiet</option>
                <option value="normal">Normal</option>
                <option value="verbose">Verbose</option>
              </select>
            )}
          </div>

          <button
            type="button"
            onClick={onGenerateReport}
            disabled={isGeneratingReport}
            className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-ink-300 transition-colors hover:bg-ink-900 hover:text-ink-100 disabled:opacity-50 sm:flex"
          >
            <FileText className="h-4 w-4" />
            <span>{isGeneratingReport ? 'Reporting' : 'Report'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenAiMutator}
            className="hidden h-8 items-center gap-1.5 rounded-md border border-ink-700 px-2.5 text-sm text-ink-200 transition-colors hover:border-ink-600 hover:bg-ink-900 sm:flex"
          >
            <Sparkles className="h-4 w-4 text-accent-400" />
            <span>Mutate</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleAuto(!running)}
            className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors active:translate-y-px ${
              running ? 'bg-ok-500/15 text-ok-300 hover:bg-ok-500/25' : 'bg-accent-600 text-white hover:bg-accent-500'
            }`}
            title={running ? 'Pause the autonomous loop' : 'Start the autonomous loop'}
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span>{running ? 'Running' : 'Start'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

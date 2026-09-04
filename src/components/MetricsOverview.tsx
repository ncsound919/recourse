import React, { useState } from 'react';
import { SystemStatus } from '../types';
import {
  Activity,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Layers,
  TrendingUp,
  Wrench,
  ChevronRight
} from 'lucide-react';
import { SystemInsightModal, InsightKind } from './SystemInsightModal';
import { GenerationTicker } from './GenerationTicker';

interface MetricsOverviewProps {
  status: SystemStatus;
}

interface CardDef {
  kind: InsightKind;
  label: string;
  icon: React.ElementType;
  iconClass: string;
  value: (s: SystemStatus) => React.ReactNode;
  foot: (s: SystemStatus) => React.ReactNode;
}

const CARDS: CardDef[] = [
  {
    kind: 'gen',
    label: 'Autonomous Gen',
    icon: Activity,
    iconClass: 'text-indigo-400',
    value: (s) => (
      <>
        <span className="text-2xl font-mono font-black text-white">#{s.generation}</span>
        <span className="ml-2 text-xs font-mono text-emerald-400 flex items-center gap-0.5">
          <TrendingUp className="w-3 h-3 inline" /> +1 cycle
        </span>
      </>
    ),
    foot: () => <span>Continuous 24/7 Tick</span>
  },
  {
    kind: 'upgrades',
    label: 'Promoted Upgrades',
    icon: CheckCircle2,
    iconClass: 'text-emerald-400',
    value: (s) => (
      <>
        <span className="text-2xl font-mono font-black text-emerald-400">{s.totalUpgrades}</span>
        <span className="ml-2 text-xs font-mono text-slate-400">promoted</span>
      </>
    ),
    foot: () => <span>Across 7 frontier domains</span>
  },
  {
    kind: 'repair',
    label: 'Self-Healed',
    icon: Wrench,
    iconClass: 'text-emerald-400',
    value: (s) => (
      <>
        <span className="text-2xl font-mono font-black text-emerald-400">
          {s.selfRepair?.totalHealedCount || 0}
        </span>
        <span className="ml-2 text-xs font-mono text-cyan-400">
          {s.selfRepair?.meanTimeToRepairMs ? `${s.selfRepair.meanTimeToRepairMs}ms MTTR` : 'Instant'}
        </span>
      </>
    ),
    foot: () => <span>Autonomous AST Diagnostics</span>
  },
  {
    kind: 'chain',
    label: 'Chain Integrity',
    icon: ShieldCheck,
    iconClass: 'text-emerald-400',
    value: (s) => (
      <span className={`text-xl font-mono font-black ${s.hashChainIntegrity ? 'text-emerald-400' : 'text-rose-400'}`}>
        {s.hashChainIntegrity ? '100% VALID' : 'TAMPERED'}
      </span>
    ),
    foot: () => <span>SHA-256 Provenance Log</span>
  },
  {
    kind: 'genes',
    label: 'Tool Genes',
    icon: Layers,
    iconClass: 'text-purple-400',
    value: (s) => (
      <>
        <span className="text-2xl font-mono font-black text-purple-300">{s.registeredToolsCount}</span>
        <span className="ml-2 text-xs font-mono text-slate-400">active</span>
      </>
    ),
    foot: () => <span>Across 7 domain suites</span>
  },
  {
    kind: 'safety',
    label: 'Safety & Defects',
    icon: AlertTriangle,
    iconClass: 'text-amber-400',
    value: (s) => (
      <>
        <span className="text-2xl font-mono font-black text-amber-400">{s.pendingApprovalsCount}</span>
        <span className="ml-2 text-xs font-mono text-slate-400">
          {(s.selfRepair?.activeAnomaliesCount || 0) > 0 ? `(${s.selfRepair?.activeAnomaliesCount} defects)` : 'queued'}
        </span>
      </>
    ),
    foot: () => <span>Safety review & radar</span>
  }
];

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({ status }) => {
  const [openKind, setOpenKind] = useState<InsightKind | null>(null);

  return (
    <>
      <GenerationTicker onOpenGen={() => setOpenKind('gen')} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {CARDS.map((def) => {
          const Icon = def.icon;
          const iconPulse = def.kind === 'safety' && (status.selfRepair?.activeAnomaliesCount || 0) > 0;
          const iconColor =
            def.kind === 'chain'
              ? status.hashChainIntegrity
                ? 'text-emerald-400'
                : 'text-rose-400'
              : def.iconClass;
          return (
            <button
              key={def.kind}
              type="button"
              onClick={() => setOpenKind(def.kind)}
              className="group text-left bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-indigo-500/60 hover:bg-slate-900 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60"
              title={`Open ${def.label} insight panel`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">{def.label}</span>
                <div className="flex items-center gap-1">
                  <Icon className={`w-4 h-4 ${iconColor} ${iconPulse ? 'animate-pulse' : ''}`} />
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                </div>
              </div>
              <div className="mt-2">{def.value(status)}</div>
              <p className="text-[10px] font-mono text-slate-500 mt-1">{def.foot(status)}</p>
            </button>
          );
        })}
      </div>

      <SystemInsightModal kind={openKind} status={status} onClose={() => setOpenKind(null)} />
    </>
  );
};

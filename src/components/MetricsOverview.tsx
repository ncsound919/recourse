import React, { useState } from 'react';
import { SystemStatus } from '../types';
import { SystemInsightModal, InsightKind } from './SystemInsightModal';
import { GenerationTicker } from './GenerationTicker';

interface MetricsOverviewProps {
  status: SystemStatus;
}

interface StatDef {
  kind: InsightKind;
  label: string;
  value: (s: SystemStatus) => React.ReactNode;
  foot: (s: SystemStatus) => React.ReactNode;
}

// Every figure below comes straight from /api/recourse/status. No trend
// arrows or captions that are not backed by data.
const STATS: StatDef[] = [
  {
    kind: 'gen',
    label: 'Generation',
    value: (s) => s.generation ?? 0,
    foot: (s) => `readiness ${((s.readinessScore ?? 0) * 100).toFixed(1)}%`,
  },
  {
    kind: 'upgrades',
    label: 'Promoted upgrades',
    value: (s) => s.totalUpgrades ?? 0,
    foot: (s) => `verifier pass rate ${Math.round((s.verifierPassRate ?? 0) * 100)}%`,
  },
  {
    kind: 'repair',
    label: 'Self-healed',
    value: (s) => s.selfRepair?.totalHealedCount ?? 0,
    foot: (s) => (s.selfRepair?.meanTimeToRepairMs ? `mean repair ${s.selfRepair.meanTimeToRepairMs} ms` : 'no repairs yet'),
  },
  {
    kind: 'chain',
    label: 'Provenance chain',
    value: (s) => (
      <span className={s.hashChainIntegrity ? 'text-ink-50' : 'text-bad-300'}>{s.hashChainIntegrity ? 'Verified' : 'Broken'}</span>
    ),
    foot: () => 'SHA-256 linked events',
  },
  {
    kind: 'genes',
    label: 'Tool genes',
    value: (s) => s.registeredToolsCount ?? 0,
    foot: () => 'registered in the registry',
  },
  {
    kind: 'safety',
    label: 'Needs attention',
    value: (s) => {
      const n = (s.pendingApprovalsCount ?? 0) + (s.selfRepair?.activeAnomaliesCount ?? 0);
      return <span className={n > 0 ? 'text-warn-300' : 'text-ink-50'}>{n}</span>;
    },
    foot: (s) => `${s.pendingApprovalsCount ?? 0} approvals, ${s.selfRepair?.activeAnomaliesCount ?? 0} defects`,
  },
];

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({ status }) => {
  const [openKind, setOpenKind] = useState<InsightKind | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-800 bg-ink-800 md:grid-cols-3 xl:grid-cols-6">
        {STATS.map((def) => (
          <button
            key={def.kind}
            type="button"
            onClick={() => setOpenKind(def.kind)}
            className="group bg-ink-900 px-5 py-4 text-left transition-colors hover:bg-ink-800/70"
            title={`Open ${def.label.toLowerCase()} details`}
          >
            <div className="text-xs text-ink-400 group-hover:text-ink-300">{def.label}</div>
            <div className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-50">{def.value(status)}</div>
            <div className="mt-1 truncate text-xs text-ink-500">{def.foot(status)}</div>
          </button>
        ))}
      </div>

      <GenerationTicker onOpenGen={() => setOpenKind('gen')} />

      <SystemInsightModal kind={openKind} status={status} onClose={() => setOpenKind(null)} />
    </>
  );
};

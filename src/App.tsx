import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
} from 'react';
import {
  Header,
  MetricsOverview,
  MissionStatusStrip,
  DeterminismBanner,
  LiveEvolutionControl,
  ProvenanceTimeline,
  ToolRegistryView,
  VerifierMatrixView,
  HourlyReportView,
  SelfReporterView,
  AiMutatorModal,
  SelfRepairView,
  ExternalBenchmarkView,
  DecisionEngineView,
  DreamingEngineView,
  GitHubResearchView,
  SubagentSwarmView,
  RecursiveLoopView,
  RecursiveLearnerView,
  ArchitectForgeView,
  SelfAssemblingLegoView,
  ProviderView,
  MusicTherapyView,
  MusicView,
  RatingPairPlayer,
  IntakeAndGrowthView,
  CorpusView,
  SkillsView,
  WebDownloadView,
  SettingsView,
  DataVizView,
  GhidraView,
  GamepadVisualizer,
  VoiceCloneView,
  FleetVoiceView
} from './components';
import {
  SystemStatus,
  ToolEntry,
  ProvenanceEvent,
  HourlyReport,
  PromotionPolicy,
  ToolDomain,
  ChainVerificationResult,
  HyperParameters,
  SubAgentType,
} from './types';
import {
  INITIAL_STATUS,
  INITIAL_REGISTRY,
  INITIAL_PROVENANCE_EVENTS,
  INITIAL_HOURLY_REPORTS,
} from './lib/mockData';
import { useSystemVoiceMonitor } from './hooks/useSystemVoiceMonitor';
import { useFleetVoiceMonitor } from './hooks/useFleetVoiceMonitor';
import { useGamepad } from './hooks/useGamepad';
import { useGamepadSnapshot } from './hooks/useGamepadSnapshot';
import { GamepadIndicator } from './components/GamepadIndicator';
import { cycleIndex } from './lib/gamepad';
import { verifyProvenanceChainSync } from './lib/provenance';
import { recourseJson } from './lib/recourseClient';

// The 3D visualizer pulls in three.js (~1MB). Lazy-load it so the heavy
// dependency is only fetched when the tab is actually opened, keeping the
// initial dashboard bundle small.
const RecourseVisualizer3D = React.lazy(() =>
  import('./components/RecourseVisualizer3D').then((m) => ({ default: m.RecourseVisualizer3D }))
);
import { RefreshCw } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { NAV_ITEMS, navGroupOf, navItem, type TabKey } from './components/nav';

// ================================================================
//  Custom Hooks
// ================================================================

/**
 * Manages all system state and API synchronization.
 */
function useRecourseState() {
  const [status, setStatus] = useState<SystemStatus>(INITIAL_STATUS);
  const [registry, setRegistry] = useState<ToolEntry[]>(INITIAL_REGISTRY);
  const [provenanceEvents, setProvenanceEvents] = useState<ProvenanceEvent[]>(
    INITIAL_PROVENANCE_EVENTS
  );
  const [reports, setReports] = useState<HourlyReport[]>(INITIAL_HOURLY_REPORTS);
  const [chainIntegrity, setChainIntegrity] =
    useState<ChainVerificationResult>(
      verifyProvenanceChainSync(INITIAL_PROVENANCE_EVENTS)
    );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAllState = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const [resStatus, resRegistry, resProv, resRep] = await Promise.all([
        fetch('/api/recourse/status').then((r) => r.json()),
        fetch('/api/recourse/registry').then((r) => r.json()),
        fetch('/api/recourse/provenance').then((r) => r.json()),
        fetch('/api/recourse/reports/hourly').then((r) => r.json()),
      ]);

      if (resStatus?.status) setStatus(resStatus.status);
      if (resRegistry?.registry) setRegistry(resRegistry.registry);
      if (resProv?.events) {
        setProvenanceEvents(resProv.events);
        setChainIntegrity(verifyProvenanceChainSync(resProv.events));
      }
      if (resRep?.reports) setReports(resRep.reports);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch system state');
      console.error('State fetch error:', err);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
            fetchAllState(true);
  }, [fetchAllState]);

  // Expose a re-fetch function and all state
  return {
    status,
    setStatus,
    registry,
    setRegistry,
    provenanceEvents,
    setProvenanceEvents,
    reports,
    setReports,
    chainIntegrity,
    setChainIntegrity,
    loading,
    error,
    fetchAllState,
  };
}

/**
 * Manages the 24/7 autonomous evolution ticker.
 */
function useAutoEvolution(
  isAutoEvolving: boolean,
  onTick: () => Promise<void>,
  tickIntervalMs: number = 3000
) {
  const isBusyRef = useRef(false);

  useEffect(() => {
    if (!isAutoEvolving) return;

    // The busy flag belongs to the in-flight tick, not to this effect instance:
    // the effect re-runs whenever `onTick` changes identity, and the old cleanup
    // cleared the flag while a tick was still running - so the new interval
    // started a second, overlapping tick.
    const interval = setInterval(async () => {
      if (isBusyRef.current) return;
      isBusyRef.current = true;
      try {
        await onTick();
      } catch (err) {
        console.warn('AutoEvolution tick failed:', err);
      } finally {
        isBusyRef.current = false;
      }
    }, tickIntervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [isAutoEvolving, onTick, tickIntervalMs]);
}

/**
 * Manages toast notifications with auto‑dismiss.
 */
function useToast(durationMs: number = 4000) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback(
    (msg: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setMessage(msg);
      timeoutRef.current = setTimeout(() => {
        setMessage(null);
        timeoutRef.current = null;
      }, durationMs);
    },
    [durationMs]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { toastMessage: message, showToast };
}

// ================================================================
//  Main App Component
// ================================================================

export default function App() {
  // -------------------- State Management --------------------
  const {
    status,
    setStatus,
    registry,
    setRegistry: _setRegistry,
    provenanceEvents,
    reports,
    chainIntegrity,
    loading,
    error,
    fetchAllState,
  } = useRecourseState();

  // Live status polling + event-driven voice narration monitor.
  useSystemVoiceMonitor(setStatus);
  // Speak real Axiom/OpenHub transitions (bridge reachability, loop lifecycle,
  // audit grade/findings) - see src/hooks/useFleetVoiceMonitor.ts.
  useFleetVoiceMonitor();

  const { toastMessage, showToast } = useToast(4000);

  // -------------------- UI State --------------------
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const activeTabRef = useRef<TabKey>(activeTab);
  activeTabRef.current = activeTab;
  const prevTabRef = useRef<TabKey>('overview');
  const lastTabRef = useRef<TabKey>('overview');
  useEffect(() => {
    if (lastTabRef.current !== activeTab) {
      prevTabRef.current = lastTabRef.current;
      lastTabRef.current = activeTab;
    }
  }, [activeTab]);

  // -------------------- Gamepad-as-UI-input --------------------
  const [lastGamepadAction, setLastGamepadAction] = useState<string | null>(null);
  const [gamepadPulse, setGamepadPulse] = useState(0);
  const { connected: gamepadConnected, name: gamepadName } = useGamepad({
    onAction: (action) => {
      setLastGamepadAction(action);
      setGamepadPulse((p) => p + 1);
      const tabs = NAV_ITEMS.map((t) => t.key);
      const idx = tabs.indexOf(activeTabRef.current);
      switch (action) {
        case 'left':
        case 'right': {
          const next = cycleIndex(idx < 0 ? 0 : idx, tabs.length, action);
          setActiveTab(tabs[next]);
          break;
        }
        case 'up':
          window.scrollBy({ top: -480, behavior: 'smooth' });
          break;
        case 'down':
          window.scrollBy({ top: 480, behavior: 'smooth' });
          break;
        case 'confirm':
          handleStepEvolution('coding');
          break;
        case 'action1':
          handleToggleAuto(!status.isAutoEvolving);
          break;
        case 'action2':
          setActiveTab('overview');
          break;
        case 'cancel':
          setActiveTab(prevTabRef.current);
          break;
        default:
          break;
      }
    },
  });
  const gamepadSnapshot = useGamepadSnapshot();
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // Ctrl/Cmd+K opens the jump list from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Each view starts at the top; switching used to keep the previous scroll offset.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeTab]);
  const [isStepping, setIsStepping] = useState<boolean>(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  // -------------------- Handlers (memoized) --------------------
  const handleToggleAuto = useCallback(
    async (enabled: boolean) => {
      try {
        const res = await fetch('/api/recourse/toggle-auto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        }).then((r) => r.json());

        if (res.success) {
          setStatus((prev) => ({ ...prev, isAutoEvolving: enabled }));
          showToast(
            enabled
              ? '▶ 24/7 Deterministic Growth Loop Resumed'
              : '⏸ 24/7 Growth Loop Paused'
          );
        }
      } catch (err: any) {
        // Fallback optimistic update
        setStatus((prev) => ({ ...prev, isAutoEvolving: enabled }));
        showToast(`Toggle failed: ${err.message}`);
      }
    },
    [setStatus, showToast]
  );

  const handlePolicyChange = useCallback(
    async (policy: PromotionPolicy) => {
      try {
        const res = await fetch('/api/recourse/policy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ policy }),
        }).then((r) => r.json());

        if (res.success) {
          setStatus((prev) => ({ ...prev, activePolicy: policy }));
          showToast(` Gate Policy updated to: ${policy}`);
          fetchAllState(true);
        }
      } catch (err: any) {
        // Optimistic
        setStatus((prev) => ({ ...prev, activePolicy: policy }));
        showToast(`Policy update failed: ${err.message}`);
      }
    },
    [setStatus, showToast, fetchAllState]
  );

  const handleStepEvolution = useCallback(
    async (domain: ToolDomain = 'coding') => {
      setIsStepping(true);
      try {
        const res = await fetch('/api/recourse/decision/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).then((r) => r.json());

        if (res.success && res.executedAction) {
          fetchAllState(true);
          showToast(
            ` Deterministic Step: [${res.executedAction.actionType}] ${res.executedAction.title}`
          );
        } else {
          // Fallback to domain evolve
          const fallback = await fetch('/api/recourse/evolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              domain,
              promptInstructions: `Manual evolution tick on ${domain}`,
            }),
          }).then((r) => r.json());
          if (fallback.success) {
            fetchAllState(true);
            showToast(`Step: [${domain}] ${fallback.toolName} v${fallback.version}`);
          }
        }
      } catch (err: any) {
        showToast(`Evolution step failed: ${err.message}`);
      } finally {
        setIsStepping(false);
      }
    },
    [fetchAllState, showToast]
  );

  const handleExecuteDeterministicAction = useCallback(
    async (actionId?: string) => {
      setIsStepping(true);
      try {
        const res = await fetch('/api/recourse/decision/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionId }),
        }).then((r) => r.json());

        if (res.success) {
          fetchAllState(true);
          showToast(` Executed Deterministic Action: ${res.executedAction.title}`);
        }
        return res;
      } catch (err: any) {
        showToast(`Execution failed: ${err.message}`);
        return { success: false, error: err.message };
      } finally {
        setIsStepping(false);
      }
    },
    [fetchAllState, showToast]
  );

  const handleApprovePending = useCallback(
    async (toolName: string, version: string) => {
      setIsApproving(true);
      try {
        const res = await fetch('/api/recourse/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolName, version }),
        }).then((r) => r.json());

        if (res.success) {
          fetchAllState(true);
          showToast(` Approved & Promoted ${toolName} v${version}!`);
        }
      } catch (err: any) {
        showToast(`Approval failed: ${err.message}`);
      } finally {
        setIsApproving(false);
      }
    },
    [fetchAllState, showToast]
  );

  const handleGenerateReport = useCallback(async () => {
    setIsGeneratingReport(true);
    try {
      const res = await fetch('/api/recourse/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json());

      if (res.success) {
                fetchAllState(true);
        showToast(` Hourly Report Digest ${res.report.id} generated!`);
        setActiveTab('reports');
      }
    } catch (err: any) {
      showToast(`Report generation failed: ${err.message}`);
    } finally {
      setIsGeneratingReport(false);
    }
  }, [fetchAllState, showToast]);

  const handleRunVerifier = useCallback(
    async (domain: ToolDomain, sourceCode: string, testSuiteCode: string, extra?: any) => {
      try {
        const res = await fetch('/api/recourse/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain, sourceCode, testSuiteCode, extra }),
        }).then((r) => r.json());
        return res.result;
      } catch (err: any) {
        showToast(`Verifier error: ${err.message}`);
        return null;
      }
    },
    [showToast]
  );

  const handleAiEvolve = useCallback(
    async (domain: ToolDomain, instructions: string, targetToolName?: string) => {
      try {
        const res = await recourseJson('/api/recourse/mutate/evolve', {
          method: 'POST',
          body: JSON.stringify({ domain, instructions, targetToolName }),
        });

        if (res.success) {
          fetchAllState(true);
          showToast(
            ` AI Mutation ${res.toolName} v${res.version} [${res.outcome.toUpperCase()}]`
          );
        }
        return res;
      } catch (err: any) {
        showToast(`AI evolve failed: ${err.message}`);
        return { success: false, error: err.message };
      }
    },
    [fetchAllState, showToast]
  );

  const handleTriggerChaos = useCallback(
    async (chaosType: string, targetToolName?: string) => {
      try {
        const res = await fetch('/api/recourse/chaos/inject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chaosType, targetToolName }),
        }).then((r) => r.json());

        if (res.success) {
          fetchAllState(true);
          showToast(
            ` Defect Injected: ${chaosType} on ${targetToolName}. Autonomous healing radar engaged.`
          );
        }
      } catch (err: any) {
        showToast(`Chaos injection error: ${err.message}`);
      }
    },
    [fetchAllState, showToast]
  );

  const handleScanAndHeal = useCallback(async () => {
    try {
      const res = await fetch('/api/recourse/repair/scan-heal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json());

      if (res.success) {
                fetchAllState(true);
        showToast(` Autonomous Scan Complete: Healed ${res.healedCount} compromised genes!`);
      }
    } catch (err: any) {
      showToast(`Scan & Heal failed: ${err.message}`);
    }
  }, [fetchAllState, showToast]);

  const handleSingleRepair = useCallback(
    async (toolName: string, brokenCode?: string, faultHint?: string) => {
      try {
        const res = await fetch('/api/recourse/repair/single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolName, brokenCode, faultHint }),
        }).then((r) => r.json());

        if (res.success) {
          fetchAllState(true);
          showToast(` Gene ${toolName} hot-patched to v${res.healResult.version}!`);
        }
      } catch (err: any) {
        showToast(`Repair failed: ${err.message}`);
      }
    },
    [fetchAllState, showToast]
  );

  const handleCrossover = useCallback(
    async (parentA: string, parentB: string, domain: ToolDomain) => {
      try {
        const res = await fetch('/api/recourse/crossover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentGeneA: parentA, parentGeneB: parentB, targetDomain: domain }),
        }).then((r) => r.json());

        if (res.success) {
          fetchAllState(true);
          showToast(` Genetic Crossover Successful: Created ${res.hybridTool.name}!`);
          setActiveTab('registry');
        }
      } catch (err: any) {
        showToast(`Crossover failed: ${err.message}`);
      }
    },
    [fetchAllState, showToast]
  );

  const handleUpdateHyperParams = useCallback(
    async (params: Partial<HyperParameters>) => {
      try {
        const res = await fetch('/api/recourse/hyperparameters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hyperParams: params }),
        }).then((r) => r.json());

        if (res.success) {
          setStatus((prev) => ({ ...prev, hyperParams: res.hyperParams }));
          showToast(' Hyperparameters synchronized to Recourse core engine.');
        }
      } catch (err: any) {
        showToast(`Hyperparameter update error: ${err.message}`);
      }
    },
    [setStatus, showToast]
  );

  const handleDreamCrystallize = useCallback(
    async (thoughtId: string) => {
      try {
        const res = await fetch('/api/recourse/dream/crystallize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thoughtId }),
        }).then((r) => r.json());

        if (res.success) {
          fetchAllState(true);
          showToast(` Lucid Crystallization: Gene ${res.crystallizedTool?.name} Promoted!`);
        }
        return res;
      } catch (err: any) {
        showToast(`Crystallize error: ${err.message}`);
        return { success: false, error: err.message };
      }
    },
    [fetchAllState, showToast]
  );

  const handleIngestGitHub = useCallback(
    async (blueprintId: string) => {
      try {
        const res = await fetch('/api/recourse/github/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blueprintId }),
        }).then((r) => r.json());

        if (res.success) {
          fetchAllState(true);
          showToast(` Ingested ${res.ingestionResult?.toolName} from GitHub!`);
        }
        return res;
      } catch (err: any) {
        showToast(`Ingest error: ${err.message}`);
        return { success: false, error: err.message };
      }
    },
    [fetchAllState, showToast]
  );

  const handleDispatchSwarm = useCallback(
    async (agentType: SubAgentType, title: string, domain: ToolDomain) => {
      try {
        const res = await fetch('/api/recourse/subagents/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentType, title, domain }),
        }).then((r) => r.json());

        if (res.success) {
          fetchAllState(true);
          showToast(` Dispatched task to ${agentType}!`);
        }
        return res;
      } catch (err: any) {
        showToast(`Dispatch error: ${err.message}`);
        return { success: false, error: err.message };
      }
    },
    [fetchAllState, showToast]
  );

  // -------------------- Auto-Evolution Ticker --------------------
  const autoTick = useCallback(async () => {
    try {
      const res = await fetch('/api/recourse/tick', {
        method: 'POST'
      }).then(r => r.json());
      
      if (res.success) {
        // Uptime is server-authoritative (wall-clock since server boot);
        // never guess it client-side or a reload/double-tick skews it.
        setStatus(prev => ({
          ...prev,
          ...res.systemStatus,
          uptimeSeconds: typeof res.systemStatus?.uptimeSeconds === 'number'
            ? res.systemStatus.uptimeSeconds
            : prev.uptimeSeconds,
        }));
        
        if (res.mathResult?.loopStatus === 'optimal' || Math.random() < 0.1) {
          fetchAllState(true);
        }
      }
    } catch (err) {
      console.error('Auto deterministic tick error:', err);
    }
  }, [setStatus, fetchAllState]);

  useAutoEvolution(status.isAutoEvolving, autoTick, 3000);

  // -------------------- Render --------------------
  
  const current = navItem(activeTab);

  return (
    <div className="min-h-dvh bg-ink-950 text-ink-200 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ink-800 focus:px-3 focus:py-1.5 focus:text-sm">
        Skip to content
      </a>
      <Sidebar
        active={activeTab}
        status={status}
        onSelect={setActiveTab}
        onOpenPalette={() => setPaletteOpen(true)}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="min-w-0">
        <Header
          status={status}
          title={current.label}
          group={navGroupOf(activeTab)}
          onToggleAuto={handleToggleAuto}
          onOpenAiMutator={() => setIsAiModalOpen(true)}
          onGenerateReport={handleGenerateReport}
          isGeneratingReport={isGeneratingReport}
          onOpenNav={() => setNavOpen(true)}
          extra={
            gamepadConnected ? (
              <GamepadIndicator
                connected={gamepadConnected}
                name={gamepadName}
                lastAction={lastGamepadAction}
                pulse={gamepadPulse}
              />
            ) : null
          }
        />

        <main id="main" className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        {error && !loading && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-bad-800/60 bg-bad-950/40 px-4 py-3 text-sm text-bad-200" role="alert">
            <span>Could not load system state: {error}</span>
            <button
              onClick={() => fetchAllState(true)}
              className="ml-auto rounded-md border border-bad-800 px-2.5 py-1 text-xs text-bad-100 transition-colors hover:bg-bad-900/60"
            >
              Retry
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-16 text-sm text-ink-400">
            <RefreshCw className="h-4 w-4 animate-spin text-ink-500" />
            Loading system state
          </div>
        )}

        {!loading && (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-5">
                <MissionStatusStrip />
                <MetricsOverview status={status} />
                <LiveEvolutionControl
                  status={status}
                  onToggleAuto={handleToggleAuto}
                  onStepEvolution={handleStepEvolution}
                  onPolicyChange={handlePolicyChange}
                  isStepping={isStepping}
                />
                <DeterminismBanner status={status} />
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                  <ProvenanceTimeline
                    events={provenanceEvents.slice(0, 10)}
                    integrity={chainIntegrity}
                    compact
                    onViewAll={() => setActiveTab('provenance')}
                  />
                  <ToolRegistryView
                    registry={registry}
                    onApprovePending={handleApprovePending}
                    isApproving={isApproving}
                    limit={10}
                    onViewAll={() => setActiveTab('registry')}
                  />
                </div>
              </div>
            )}

            {activeTab === 'lego' && (
              <SelfAssemblingLegoView onNotify={showToast} />
            )}

            {activeTab === 'provider' && (
              <ProviderView />
            )}

            {activeTab === 'music-therapy' && (
              <MusicTherapyView />
            )}

            {activeTab === 'music' && (
              <MusicView />
            )}

            {activeTab === 'rating' && (
              <RatingPairPlayer onNotify={showToast} />
            )}

            {activeTab === 'recursive-math' && (
              <RecursiveLoopView onNotify={showToast} />
            )}

            {activeTab === 'recursive-learner' && (
              <RecursiveLearnerView onNotify={showToast} />
            )}

            {activeTab === 'decision' && (
              <DecisionEngineView
                onExecuteAction={handleExecuteDeterministicAction}
                isExecuting={isStepping}
              />
            )}

            {activeTab === 'dreaming' && (
              <DreamingEngineView onDreamCrystallize={handleDreamCrystallize} />
            )}

            {activeTab === 'forge' && (
              <ArchitectForgeView
                artifacts={status.artifacts}
                onNotify={showToast}
                onToolCreated={fetchAllState}
              />
            )}

            {activeTab === 'github' && (
              <GitHubResearchView onIngestBlueprint={handleIngestGitHub} />
            )}

            {activeTab === 'subagents' && (
              <SubagentSwarmView onDispatchTask={handleDispatchSwarm} />
            )}

            {activeTab === 'self-repair' && (
              <SelfRepairView
                selfRepair={status.selfRepair || {
                  totalHealedCount: 0,
                  meanTimeToRepairMs: 250,
                  repairSuccessRate: 1.0,
                  activeAnomaliesCount: 0,
                  isAutoHealingEnabled: true,
                }}
                hyperParams={status.hyperParams || {
                  repairAggressiveness: 0.85,
                  mutationTemperature: 0.2,
                  explorationRate: 0.15,
                  crossoverFrequency: 0.25,
                  maxRepairTries: 3,
                }}
                registry={registry}
                onTriggerChaos={handleTriggerChaos}
                onScanAndHeal={handleScanAndHeal}
                onSingleRepair={handleSingleRepair}
                onCrossover={handleCrossover}
                onUpdateHyperParams={handleUpdateHyperParams}
              />
            )}

            {activeTab === 'benchmark' && <ExternalBenchmarkView />}

            {activeTab === 'provenance' && (
              <ProvenanceTimeline events={provenanceEvents} integrity={chainIntegrity} />
            )}

            {activeTab === 'registry' && (
              <ToolRegistryView
                registry={registry}
                onApprovePending={handleApprovePending}
                isApproving={isApproving}
              />
            )}

            {activeTab === 'verifier' && (
              <VerifierMatrixView onRunVerifier={handleRunVerifier} />
            )}

            {activeTab === 'reports' && (
              <HourlyReportView
                reports={reports}
                onGenerateReport={handleGenerateReport}
                isGenerating={isGeneratingReport}
              />
            )}

            {activeTab === 'reporter' && (
              <SelfReporterView />
            )}

            {activeTab === 'voice-clone' && (
              <VoiceCloneView />
            )}

            {activeTab === 'fleet-voice' && (
              <FleetVoiceView />
            )}

            {activeTab === 'intake-growth' && (
              <IntakeAndGrowthView />
            )}
            {activeTab === 'corpus' && (
              <CorpusView />
            )}
            {activeTab === 'skills' && (
              <SkillsView />
            )}
            {activeTab === 'web' && (
              <WebDownloadView />
            )}
            {activeTab === 'visualizer' && (
              <Suspense
                fallback={
                  <div className="h-[560px] rounded-xl border border-ink-800 bg-ink-950/60 flex items-center justify-center">
                    <div className="flex items-center gap-3 text-ink-400 text-sm">
                      <RefreshCw className="w-5 h-5 text-accent-400 animate-spin" />
                      Bootstrapping 3D viewport…
                    </div>
                  </div>
                }
              >
                <RecourseVisualizer3D status={status} />
              </Suspense>
            )}
            {activeTab === 'dataviz' && (
              <DataVizView />
            )}
            {activeTab === 'ghidra' && (
              <GhidraView />
            )}
            {activeTab === 'settings' && (
              <SettingsView />
            )}
            {activeTab === 'gamepad' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm text-ink-300">
                      Live controller input
                    </h2>
                    <span className="text-[11px] text-ink-500">
                      60fps • browser Gamepad API
                    </span>
                  </div>
                  <GamepadVisualizer
                    snapshot={gamepadSnapshot}
                    lastAction={lastGamepadAction}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-5">
                    <h3 className="text-xs text-ink-400 mb-3 ">
                      Control map
                    </h3>
                    <ul className="text-xs space-y-2 text-ink-300">
                      <li><span className="text-accent-400">Left/Right</span> - cycle dashboard tabs</li>
                      <li><span className="text-accent-400">Up / Down</span> - scroll the view</li>
                      <li><span className="text-ok-400">X (cross)</span> - run a deterministic step</li>
                      <li><span className="text-bad-400">O (circle)</span> - back to previous tab</li>
                      <li><span className="text-accent-400">Square</span> - toggle 24/7 auto-growth loop</li>
                      <li><span className="text-warn-400">Triangle</span> - jump to Overview</li>
                    </ul>
                  </div>
                  <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-5">
                    <h3 className="text-xs text-ink-400 mb-3 ">
                      Live readout
                    </h3>
                    <ul className="text-xs space-y-2 text-ink-300">
                      <li>Buttons polled: <span className="text-ink-500">{gamepadSnapshot.buttons.length}</span></li>
                      <li>Axes polled: <span className="text-ink-500">{gamepadSnapshot.axes.length}</span></li>
                      <li>Last action: <span className="text-ok-400">{lastGamepadAction?.toUpperCase() ?? '-'}</span></li>
                      <li>Connection: <span className={gamepadConnected ? 'text-ok-400' : 'text-ink-500'}>{gamepadConnected ? 'Connected' : 'Disconnected'}</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </main>
      </div>

      <AiMutatorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onEvolve={handleAiEvolve}
        activePolicy={status.activePolicy}
      />

      {toastMessage && (
        <div
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-ink-100 shadow-2xl"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSelect={setActiveTab} />
    </div>
  );
}

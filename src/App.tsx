import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useReducer,
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
  OllamaView,
  IntakeAndGrowthView,
  CorpusView,
  SkillsView,
  WebDownloadView,
  SettingsView
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
import { verifyProvenanceChainSync } from './lib/provenance';
import { recourseJson } from './lib/recourseClient';

// The 3D visualizer pulls in three.js (~1MB). Lazy-load it so the heavy
// dependency is only fetched when the tab is actually opened, keeping the
// initial dashboard bundle small.
const RecourseVisualizer3D = React.lazy(() =>
  import('./components/RecourseVisualizer3D').then((m) => ({ default: m.RecourseVisualizer3D }))
);
import {
  Activity,
  GitCommit,
  Layers,
  Terminal,
  FileText,
  Sparkles,
  RefreshCw,
  Wrench,
  Target,
  Brain,
  Moon,
  GitBranch,
  Users,
  Atom,
  Cpu,
   Puzzle,
   Server,
   Globe,
   Download,
   FolderSearch,
   Library,
   Box,
   Settings
} from 'lucide-react';

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
        fetch('/api/recourse/reports').then((r) => r.json()),
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

    let mounted = true;
    const interval = setInterval(async () => {
      if (isBusyRef.current) return;
      isBusyRef.current = true;
      try {
        await onTick();
      } catch (err) {
        console.warn('AutoEvolution tick failed:', err);
      } finally {
        if (mounted) {
          isBusyRef.current = false;
        }
      }
    }, tickIntervalMs);

    return () => {
      mounted = false;
      isBusyRef.current = false;
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

type TabKey =
  | 'overview'
  | 'lego'
  | 'ollama'
  | 'recursive-math'
  | 'recursive-learner'
  | 'decision'
  | 'dreaming'
  | 'forge'
  | 'github'
  | 'subagents'
  | 'self-repair'
  | 'benchmark'
  | 'provenance'
  | 'registry'
  | 'verifier'
   | 'reports'
  | 'intake-growth'
  | 'corpus'
  | 'skills'
  | 'web'
  | 'visualizer'
  | 'settings';

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  badge?: (status: SystemStatus, count?: number) => React.ReactNode;
}> = [
  {
    key: 'overview',
    label: 'OVERVIEW',
    icon: <Activity className="w-4 h-4" />,
  },
  {
    key: 'lego',
    label: 'LEGO COMPOSABLE ML',
    icon: <Puzzle className="w-4 h-4 text-amber-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-amber-950 text-amber-300 text-[10px] rounded border border-amber-800 font-bold">
        7-LAYER
      </span>
    ),
  },
  {
    key: 'ollama',
    label: 'LOCAL OLLAMA MODELS',
    icon: <Server className="w-4 h-4 text-indigo-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-indigo-950 text-indigo-300 text-[10px] rounded border border-indigo-800 font-bold">
        LLM HUB
      </span>
    ),
  },
  {
    key: 'forge',
    label: 'STRUCTURAL FORGE',
    icon: <Cpu className="w-4 h-4 text-emerald-400" />,
    badge: (status) => (
      <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 text-[10px] rounded border border-emerald-800 font-bold">
        {status.artifacts?.length || 0}
      </span>
    ),
  },
  {
    key: 'recursive-learner',
    label: 'BETA-POSTERIOR LEARNING',
    icon: <Brain className="w-4 h-4 text-emerald-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 text-[10px] rounded border border-emerald-800 font-bold">
        META
      </span>
    ),
  },
  {
    key: 'recursive-math',
    label: '5-FORMULA LOOP',
    icon: <Atom className="w-4 h-4 text-indigo-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-indigo-950 text-indigo-300 text-[10px] rounded border border-indigo-800 font-bold">
        e^ix
      </span>
    ),
  },
  {
    key: 'decision',
    label: 'DETERMINISTIC GROWTH',
    icon: <Brain className="w-4 h-4 text-indigo-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-indigo-950 text-indigo-300 text-[10px] rounded border border-indigo-800 font-bold">
        U(a)
      </span>
    ),
  },
  {
    key: 'dreaming',
    label: 'ALWAYS-ON DREAMING',
    icon: <Moon className="w-4 h-4 text-purple-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-purple-950 text-purple-300 text-[10px] rounded border border-purple-800 font-bold">
        24/7
      </span>
    ),
  },
  {
    key: 'github',
    label: 'GITHUB RESEARCH',
    icon: <GitBranch className="w-4 h-4 text-blue-400" />,
  },
  {
    key: 'subagents',
    label: 'SUBAGENTS',
    icon: <Users className="w-4 h-4 text-cyan-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-cyan-950 text-cyan-300 text-[10px] rounded border border-cyan-800 font-bold">
        6 swarm
      </span>
    ),
  },
  {
    key: 'self-repair',
    label: 'SELF-REPAIR',
    icon: <Wrench className="w-4 h-4 text-emerald-400" />,
    badge: (status) => (
      <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-400 text-[10px] rounded border border-emerald-800 font-bold">
        {status.selfRepair?.totalHealedCount || 0}
      </span>
    ),
  },
  {
    key: 'benchmark',
    label: 'BENCHMARK',
    icon: <Target className="w-4 h-4 text-indigo-400" />,
    badge: (status) => {
      const rp = status.realProgress;
      if (!rp || rp.benchmarkTotal === 0) return null;
      return (
        <span className="px-1.5 py-0.2 bg-indigo-950 text-indigo-300 text-[10px] rounded border border-indigo-800 font-bold">
          {rp.benchmarkSolved}/{rp.benchmarkTotal}
        </span>
      );
    },
  },
  {
    key: 'intake-growth',
    label: 'INTAKE & GROWTH',
    icon: <Globe className="w-4 h-4 text-emerald-400" />,
  },
  {
    key: 'corpus',
    label: 'CORPUS',
    icon: <FolderSearch className="w-4 h-4 text-cyan-400" />,
  },
  {
    key: 'skills',
    label: 'SKILLS',
    icon: <Library className="w-4 h-4 text-purple-400" />,
  },
  {
    key: 'web',
    label: 'WEB DOWNLOAD',
    icon: <Download className="w-4 h-4 text-sky-400" />,
  },
  {
    key: 'visualizer',
    label: '3D VISUALIZER',
    icon: <Box className="w-4 h-4 text-indigo-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-indigo-950 text-indigo-300 text-[10px] rounded border border-indigo-800 font-bold">
        LIVE
      </span>
    ),
  },
  {
    key: 'settings',
    label: 'SETTINGS',
    icon: <Settings className="w-4 h-4 text-slate-300" />,
  },
  {
    key: 'registry',
    label: 'GENES',
    icon: <Layers className="w-4 h-4" />,
    badge: (status) =>
      status.pendingApprovalsCount > 0 ? (
        <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] rounded font-bold">
          {status.pendingApprovalsCount}
        </span>
      ) : null,
  },
  {
    key: 'provenance',
    label: 'PROVENANCE',
    icon: <GitCommit className="w-4 h-4" />,
    badge: (_, count) => (
      <span className="px-1.5 py-0.2 bg-slate-950 text-[10px] rounded border border-slate-800">
        {count || 0}
      </span>
    ),
  },
  {
    key: 'verifier',
    label: 'VERIFIER',
    icon: <Terminal className="w-4 h-4" />,
  },
  {
    key: 'reports',
    label: 'REPORTS',
    icon: <FileText className="w-4 h-4" />,
    badge: (_, count) => (
      <span className="px-1.5 py-0.2 bg-slate-950 text-[10px] rounded border border-slate-800">
        {count || 0}
      </span>
    ),
  },
];

export default function App() {
  // -------------------- State Management --------------------
  const {
    status,
    setStatus,
    registry,
    setRegistry,
    provenanceEvents,
    reports,
    chainIntegrity,
    loading,
    error,
    fetchAllState,
  } = useRecourseState();

  // Live status polling + event-driven voice narration monitor.
  useSystemVoiceMonitor(setStatus);

  const { toastMessage, showToast } = useToast(4000);

  // -------------------- UI State --------------------
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [isStepping, setIsStepping] = useState<boolean>(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);

  // -------------------- Memoized derived values --------------------
  const pendingCount = useMemo(
    () => status.pendingApprovalsCount,
    [status.pendingApprovalsCount]
  );
  const registryCount = useMemo(() => registry.length, [registry]);
  const reportCount = useMemo(() => reports.length, [reports]);

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
          showToast(`🛡 Gate Policy updated to: ${policy}`);
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
            `⚡ Deterministic Step: [${res.executedAction.actionType}] ${res.executedAction.title}`
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
          showToast(`✅ Executed Deterministic Action: ${res.executedAction.title}`);
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
          showToast(`✅ Approved & Promoted ${toolName} v${version}!`);
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
        showToast(`📄 Hourly Report Digest ${res.report.id} generated!`);
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
            `✨ AI Mutation ${res.toolName} v${res.version} [${res.outcome.toUpperCase()}]`
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
            `🔥 Defect Injected: ${chaosType} on ${targetToolName}. Autonomous healing radar engaged.`
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
        showToast(`✨ Autonomous Scan Complete: Healed ${res.healedCount} compromised genes!`);
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
          showToast(`🛡 Gene ${toolName} hot-patched to v${res.healResult.version}!`);
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
          showToast(`🧬 Genetic Crossover Successful: Created ${res.hybridTool.name}!`);
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
          showToast('⚙ Hyperparameters synchronized to Recourse core engine.');
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
          showToast(`✨ Lucid Crystallization: Gene ${res.crystallizedTool?.name} Promoted!`);
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
          showToast(`✨ Ingested ${res.ingestionResult?.toolName} from GitHub!`);
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
          showToast(`🚀 Dispatched task to ${agentType}!`);
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
  
  // Calculate recursive UI intensity based on deterministic growth metrics
  const score = status.readinessScore || 0;
  const gen = status.generation || 1;
  
  let intensityClass = 'bg-slate-950 border-slate-900';
  let glowEffect = '';
  
  if (score > 0.95 && gen > 20) {
    intensityClass = 'bg-slate-950 border-indigo-500/50';
    glowEffect = 'shadow-[inset_0_0_150px_rgba(99,102,241,0.15)]';
  } else if (score > 0.8 && gen > 10) {
    intensityClass = 'bg-slate-950 border-indigo-700/30';
    glowEffect = 'shadow-[inset_0_0_100px_rgba(99,102,241,0.08)]';
  } else if (score > 0.5 && gen > 5) {
    intensityClass = 'bg-slate-950 border-indigo-900/20';
    glowEffect = 'shadow-[inset_0_0_50px_rgba(99,102,241,0.03)]';
  }

  return (
    <div className={`min-h-screen ${intensityClass} ${glowEffect} text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white transition-all duration-1000`}>
      <Header
        status={status}
        onToggleAuto={handleToggleAuto}
        onPolicyChange={handlePolicyChange}
        onOpenAiMutator={() => setIsAiModalOpen(true)}
        onGenerateReport={handleGenerateReport}
        isGeneratingReport={isGeneratingReport}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 mb-6 gap-3">
          <div className="flex flex-wrap items-center space-x-1 bg-slate-900 p-1.5 rounded-xl border border-slate-800 font-mono text-xs">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const badge = tab.badge
                ? tab.badge(status, tab.key === 'registry' ? registryCount : reportCount)
                : null;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {badge && <span className="ml-1">{badge}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center space-x-2 font-mono text-xs text-slate-400">
            <span className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
              <span>Deterministic OS Core Active</span>
            </span>
          </div>
        </div>

        {/* Loading/Error States */}
        {loading && (
          <div className="flex justify-center items-center p-8">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <span className="ml-3 text-slate-400 font-mono">Synchronizing state...</span>
          </div>
        )}
        {error && !loading && (
          <div className="p-4 mb-6 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-sm flex items-center gap-2">
            <span>⚠️ {error}</span>
            <button
              onClick={fetchAllState}
              className="ml-auto px-3 py-1 bg-red-900/40 hover:bg-red-800/60 rounded-lg text-xs font-mono transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Determinism Banner */}
        <MissionStatusStrip />
        <DeterminismBanner status={status} />

        {/* Metrics Overview (always visible) */}
        <MetricsOverview status={status} />

        {/* Tab Views */}
        {!loading && (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <LiveEvolutionControl
                  status={status}
                  onToggleAuto={handleToggleAuto}
                  onStepEvolution={handleStepEvolution}
                  onPolicyChange={handlePolicyChange}
                  isStepping={isStepping}
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ProvenanceTimeline
                    events={provenanceEvents.slice(0, 10)}
                    integrity={chainIntegrity}
                  />
                  <ToolRegistryView
                    registry={registry}
                    onApprovePending={handleApprovePending}
                    isApproving={isApproving}
                  />
                </div>
              </div>
            )}

            {activeTab === 'lego' && (
              <SelfAssemblingLegoView onNotify={showToast} />
            )}

            {activeTab === 'ollama' && (
              <OllamaView />
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
                  <div className="h-[560px] rounded-2xl border border-slate-800 bg-slate-950/60 flex items-center justify-center">
                    <div className="flex items-center gap-3 text-slate-400 font-mono text-sm">
                      <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                      Bootstrapping 3D viewport…
                    </div>
                  </div>
                }
              >
                <RecourseVisualizer3D status={status} />
              </Suspense>
            )}
            {activeTab === 'settings' && (
              <SettingsView />
            )}
          </>
        )}
      </main>

      <AiMutatorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onEvolve={handleAiEvolve}
        activePolicy={status.activePolicy}
      />

      {toastMessage && (
        <div
          className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-indigo-500/50 text-white font-mono text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce"
          role="alert"
          aria-live="polite"
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      <footer className="mt-12 border-t border-slate-900 py-6 text-center font-mono text-xs text-slate-600">
        Recourse Autonomous Architectural OS • Deterministic Multi-Objective Growth Matrix • Always-On
        24/7 Dreaming Engine • GitHub Open-Source Research • Autonomous Subagent Builders Swarm Active
      </footer>
    </div>
  );
}

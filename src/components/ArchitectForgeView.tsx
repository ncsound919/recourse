import React, { useState, useEffect } from 'react';
import {
  Network,
  Cpu,
  Terminal,
  Bot,
  Workflow,
  Activity,
  CheckCircle,
  Clock,
  Layers,
  Sparkles,
  Sliders,
  Play,
  Zap,
  Code2,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Box,
  Binary,
  BrainCircuit,
  Lock,
  Atom,
  Flame,
  CheckCircle2,
  AlertCircle,
  Server,
  Trash2,
  RotateCcw,
  Lightbulb
} from 'lucide-react';
import type {
  StructuralArtifact,
  ArtifactType,
  ComponentTemplate,
  ComponentTemplateParam,
  ToolDomain
} from '../types';
import { IntelInboxView } from './IntelInboxView';

interface ArchitectForgeViewProps {
  artifacts?: StructuralArtifact[];
  onNotify?: (msg: string) => void;
  onToolCreated?: () => void;
}

const DOMAIN_ICONS: Record<string, React.ElementType> = {
  coding: Code2,
  math: Binary,
  systemic: Layers,
  cyber_defense: Lock,
  biotech: Flame,
  neuro_symbolic: BrainCircuit,
  quantum_sim: Atom,
  lego: Box
};

const DOMAIN_COLORS: Record<string, string> = {
  coding: 'text-cyan-400 bg-cyan-950/60 border-cyan-800',
  math: 'text-amber-400 bg-amber-950/60 border-amber-800',
  systemic: 'text-emerald-400 bg-emerald-950/60 border-emerald-800',
  cyber_defense: 'text-rose-400 bg-rose-950/60 border-rose-800',
  biotech: 'text-purple-400 bg-purple-950/60 border-purple-800',
  neuro_symbolic: 'text-indigo-400 bg-indigo-950/60 border-indigo-800',
  quantum_sim: 'text-fuchsia-400 bg-fuchsia-950/60 border-fuchsia-800'
};

// Runtime transport of a self-hostable template output (artifact kind).
const ARTIFACT_KIND_META: Record<string, { label: string; color: string }> = {
  function: { label: 'FUNCTION', color: 'text-slate-300 bg-slate-800/70 border-slate-600' },
  cli: { label: 'CLI', color: 'text-emerald-300 bg-emerald-950/70 border-emerald-800' },
  api: { label: 'API', color: 'text-sky-300 bg-sky-950/70 border-sky-800' },
  mcp: { label: 'MCP', color: 'text-fuchsia-300 bg-fuchsia-950/70 border-fuchsia-800' },
  a2a: { label: 'A2A', color: 'text-amber-300 bg-amber-950/70 border-amber-800' },
  loop: { label: 'LOOP', color: 'text-rose-300 bg-rose-950/70 border-rose-800' },
};
function kindMeta(tpl: any): { label: string; color: string } | null {
  if (!tpl || tpl.selfHostable !== true) return null;
  return ARTIFACT_KIND_META[tpl.artifactKind || 'function'] || ARTIFACT_KIND_META.function;
}

const TYPE_ICONS: Record<ArtifactType, React.ElementType> = {  acp: Network,
  mpc: Cpu,
  cli: Terminal,
  agent: Bot,
  pipeline: Workflow,
};

const TYPE_LABELS: Record<ArtifactType, string> = {
  acp: 'Autonomous Context Protocol (ACP)',
  mpc: 'Model Predictive Controller (MPC)',
  cli: 'Command Line Interface (CLI)',
  agent: 'Autonomous Agent',
  pipeline: 'Inference Pipeline',
};

export const ArchitectForgeView: React.FC<ArchitectForgeViewProps> = ({
  artifacts = [],
  onNotify,
  onToolCreated
}) => {
  const [activeSection, setActiveSection] = useState<'templates' | 'learner' | 'artifacts' | 'selfhosted' | 'intel'>('templates');
  const [templates, setTemplates] = useState<ComponentTemplate[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ComponentTemplate | null>(null);
  const [customParams, setCustomParams] = useState<Record<string, any>>({});
  const [withSelfHealing, setWithSelfHealing] = useState(true);
  const [selfHostToRuntime, setSelfHostToRuntime] = useState(true);
  const [customName, setCustomName] = useState('');
  const [codePreview, setCodePreview] = useState<string>('');
  const [testPreview, setTestPreview] = useState<string>('');
  const [previewTab, setPreviewTab] = useState<'code' | 'test'>('code');
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [benchmarking, setBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);
  const [learnerDirectives, setLearnerDirectives] = useState<any[]>([]);

  // Self-hosted runtime tools (real modules imported by the server)
  const [selfHostedTools, setSelfHostedTools] = useState<any[]>([]);
  const [shVerifyBusy, setShVerifyBusy] = useState(false);
  const [shRemoving, setShRemoving] = useState<string | null>(null);
  const [callToolName, setCallToolName] = useState<string | null>(null);
  const [callMethod, setCallMethod] = useState('');
  const [callArgs, setCallArgs] = useState('[]');
  const [callRunning, setCallRunning] = useState(false);
  const [callResult, setCallResult] = useState<{ success: boolean; result?: any; error?: string; executionTimeMs?: number } | null>(null);

  // Fetch self-hosted tools from API
  const fetchSelfHosted = async () => {
    try {
      const res = await fetch('/api/recourse/selfhosted').then(r => r.json());
      if (res?.success && res.tools) {
        setSelfHostedTools(res.tools);
        if (!callToolName && res.tools.length > 0) {
          setCallToolName(res.tools[0].name);
          setCallMethod(res.tools[0].methods?.[0]?.method || '');
        }
      }
    } catch (err) {
      console.error('Failed to fetch self-hosted tools', err);
    }
  };

  // Fetch templates from API
  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/recourse/templates').then(r => r.json());
      if (res?.success && res.templates) {
        setTemplates(res.templates);
        if (!selectedTemplate && res.templates.length > 0) {
          selectTemplate(res.templates[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch templates', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch learner directives
  const fetchDirectives = async () => {
    try {
      const res = await fetch('/api/recourse/learn/directives').then(r => r.json());
      if (res?.success && res.directives) {
        setLearnerDirectives(res.directives);
      }
    } catch (err) {
      console.warn('Failed to fetch directives', err);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchDirectives();
    fetchSelfHosted();
  }, []);

  const selectTemplate = async (tpl: ComponentTemplate) => {
    setSelectedTemplate(tpl);
    setBenchmarkResult(null);
    setCustomName(`${tpl.id.replace('tpl_', '')}_${Math.floor(Math.random() * 900 + 100)}`);
    
    // Initialize default params
    const initialParams: Record<string, any> = {};
    tpl.params.forEach(p => {
      initialParams[p.id] = p.default;
    });
    setCustomParams(initialParams);

    // Fetch code preview
    try {
      const res = await fetch(`/api/recourse/templates/${tpl.id}`).then(r => r.json());
      if (res?.success) {
        setCodePreview(res.codePreview);
        setTestPreview(res.testPreview);
      }
    } catch (err) {
      console.error('Failed to fetch template details', err);
    }
  };

  const handleParamChange = (paramId: string, value: any) => {
    setCustomParams(prev => ({
      ...prev,
      [paramId]: value
    }));
  };

  const handleBuildComponent = async () => {
    if (!selectedTemplate) return;
    setBuilding(true);
    try {
      const res = await fetch('/api/recourse/templates/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          componentName: customName || undefined,
          domain: selectedTemplate.domain,
          params: customParams,
          withSelfHealing,
          selfHost: selfHostToRuntime
        })
      }).then(r => r.json());

      if (res?.success) {
        const sh = res.selfHost || {};
        if (sh.selfHosted) {
          if (onNotify) onNotify(`SELF-HOSTED to runtime: ${sh.selfHosted.name} -> ${sh.selfHosted.file} (${sh.selfHosted.hash.slice(0, 8)})`);
        } else if (sh.skippedReason) {
          if (onNotify) onNotify(`Built & registered ${res.toolEntry?.name}. ${sh.skippedReason}`);
        } else {
          if (onNotify) onNotify(`Successfully built & registered: ${res.toolEntry?.name}`);
        }
        if (onToolCreated) onToolCreated();
        fetchSelfHosted();
      } else {
        if (onNotify) onNotify(`Build failed: ${res?.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      if (onNotify) onNotify(`Build exception: ${err.message}`);
    } finally {
      setBuilding(false);
    }
  };

  const handleVerifySelfHosted = async () => {
    setShVerifyBusy(true);
    try {
      const res = await fetch('/api/recourse/selfhosted/verify', { method: 'POST' }).then(r => r.json());
      if (res?.success) {
        setSelfHostedTools(res.tools || []);
        if (onNotify) onNotify(`Self-hosted re-verification complete: ${res.healthy}/${res.count} modules green`);
      } else {
        if (onNotify) onNotify(`Re-verification failed: ${res?.error || 'unknown'}`);
      }
    } catch (err: any) {
      if (onNotify) onNotify(`Re-verification error: ${err.message}`);
    } finally {
      setShVerifyBusy(false);
    }
  };

  const handleCallTool = async () => {
    if (!callToolName || !callMethod) return;
    setCallRunning(true);
    setCallResult(null);
    try {
      let parsedArgs: any[];
      if (callArgs.trim()) {
        try {
          parsedArgs = JSON.parse(callArgs);
        } catch {
          setCallResult({ success: false, error: 'Args must be a valid JSON array — e.g. ["alpha", 42]' });
          if (onNotify) onNotify('Args must be a valid JSON array — e.g. ["alpha", 42]');
          return;
        }
      } else {
        parsedArgs = [];
      }
      if (!Array.isArray(parsedArgs)) {
        setCallResult({ success: false, error: 'Args must be a JSON array — e.g. ["alpha", 42]' });
        return;
      }
      const res = await fetch(`/api/recourse/selfhosted/${encodeURIComponent(callToolName)}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: callMethod, args: parsedArgs })
      }).then(r => r.json());
      setCallResult({ success: res.success, result: res.result, error: res.error, executionTimeMs: res.executionTimeMs });
      if (!res.success && onNotify) onNotify(`Call failed: ${res.error || 'unknown error'}`);
    } catch (err: any) {
      setCallResult({ success: false, error: err.message });
    } finally {
      setCallRunning(false);
    }
  };

  const handleSelectCallTool = (name: string, methods: any[]) => {
    setCallToolName(name);
    setCallResult(null);
    setCallMethod(methods?.[0]?.method || '');
    setCallArgs('[]');
  };

  const handleRemoveSelfHosted = async (name: string) => {
    setShRemoving(name);
    try {
      const res = await fetch(`/api/recourse/selfhosted/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(r => r.json());
      if (res?.success) {
        if (onNotify) onNotify(`Removed self-hosted tool: ${name}`);
        if (onToolCreated) onToolCreated();
        if (callToolName === name) setCallToolName(null);
        fetchSelfHosted();
      } else {
        if (onNotify) onNotify(`Remove failed: ${res?.error || 'unknown'}`);
      }
    } catch (err: any) {
      if (onNotify) onNotify(`Remove error: ${err.message}`);
    } finally {
      setShRemoving(null);
    }
  };

  const handleBenchmark = async () => {
    if (!selectedTemplate) return;
    setBenchmarking(true);
    try {
      const res = await fetch('/api/recourse/templates/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          params: customParams,
          iterations: 100
        })
      }).then(r => r.json());

      if (res?.success) {
        setBenchmarkResult(res);
        if (onNotify) onNotify(`Benchmark complete: ${res.meanLatencyPerRunMs}ms / run (${res.estimatedFlops} FLOPs)`);
      }
    } catch (err) {
      console.error('Benchmark failed', err);
    } finally {
      setBenchmarking(false);
    }
  };

  const handleExecuteLearnerDirective = async (directiveId?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/recourse/learn/synthesize-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directiveId })
      }).then(r => r.json());

      if (res?.success) {
        if (onNotify) onNotify(`Synthesized component: ${res.synthesizedTool?.name}`);
        if (onToolCreated) onToolCreated();
        fetchDirectives();
      } else {
        if (onNotify) onNotify(res?.message || 'Directive execution failed');
      }
    } catch (err: any) {
      if (onNotify) onNotify(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesDomain = selectedDomain === 'all' || t.domain === selectedDomain;
    const matchesSearch = searchQuery === '' || 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesDomain && matchesSearch;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-3 bg-indigo-950 border border-indigo-800 rounded-xl text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.25)]">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
              ARCHITECT FORGE & TEMPLATE ENGINE
              <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs rounded-full font-mono">
                v2.0 Autonomous
              </span>
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Parametric component building, self-healing synthesis, and recursive learner integration.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative z-10 font-mono text-xs">
          <button
            onClick={() => setActiveSection('templates')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition cursor-pointer ${
              activeSection === 'templates'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>COMPONENT TEMPLATES</span>
          </button>

          <button
            onClick={() => setActiveSection('learner')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition cursor-pointer ${
              activeSection === 'learner'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5 text-emerald-400" />
            <span>LEARNER DIRECTIVES</span>
            {learnerDirectives.length > 0 && (
              <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 rounded border border-emerald-800 text-[10px]">
                {learnerDirectives.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSection('artifacts')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition cursor-pointer ${
              activeSection === 'artifacts'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Network className="w-3.5 h-3.5 text-cyan-400" />
            <span>STRUCTURAL PROTOCOLS</span>
          </button>

          <button
            onClick={() => setActiveSection('selfhosted')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition cursor-pointer ${
              activeSection === 'selfhosted'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>SELF-HOSTED TOOLS</span>
            {selfHostedTools.length > 0 && (
              <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 rounded border border-emerald-800 text-[10px]">
                {selfHostedTools.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSection('intel')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition cursor-pointer ${
              activeSection === 'intel'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
            <span>INTEL INBOX</span>
          </button>
        </div>
      </div>

      {/* Section 1: Template Builder */}
      {activeSection === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Template Catalog & Filter */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              {/* Search & Filter */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search templates, algorithms, tags..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <button
                  onClick={fetchTemplates}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
                  title="Refresh catalog"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Domain Filter Pills */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['all', 'coding', 'math', 'systemic', 'cyber_defense', 'biotech', 'neuro_symbolic', 'quantum_sim'].map(dom => (
                  <button
                    key={dom}
                    onClick={() => setSelectedDomain(dom)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer uppercase ${
                      selectedDomain === dom
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {dom.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Template List */}
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {filteredTemplates.map(tpl => {
                const isSelected = selectedTemplate?.id === tpl.id;
                const DomainIcon = DOMAIN_ICONS[tpl.domain] || Code2;
                const domainColor = DOMAIN_COLORS[tpl.domain] || 'text-slate-400 bg-slate-950 border-slate-800';
                const kind = kindMeta(tpl);

                return (
                  <div
                    key={tpl.id}
                    onClick={() => selectTemplate(tpl)}
                    className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-950/50'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-lg border ${domainColor}`}>
                          <DomainIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white tracking-tight">{tpl.name}</h4>
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                            {tpl.category} • {tpl.complexity}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-950 text-emerald-400 border border-emerald-900">
                        {(tpl.defaultScore * 100).toFixed(0)}% Robust
                      </span>
                    </div>
                    {kind && (
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${kind.color}`}>
                          SELF-HOST · {kind.label}
                        </span>
                      </div>
                    )}

                    <p className="text-xs text-slate-400 line-clamp-2">
                      {tpl.description}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
                      <span>{tpl.benchmarkFlops.toLocaleString()} FLOPs</span>
                      <span>{tpl.params.length} Tunable Params</span>
                    </div>
                  </div>
                );
              })}

              {filteredTemplates.length === 0 && (
                <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500 text-xs font-mono">
                  No component templates match criteria.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Interactive Parametric Customizer & Code Preview */}
          <div className="lg:col-span-7 space-y-4">
            {selectedTemplate ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white">{selectedTemplate.name}</h3>
                      <span className="px-2 py-0.5 bg-slate-950 text-indigo-300 border border-indigo-900 text-xs rounded font-mono">
                        {selectedTemplate.id}
                      </span>
                      {kindMeta(selectedTemplate) && (
                        <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${kindMeta(selectedTemplate)!.color}`}>
                          {kindMeta(selectedTemplate)!.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{selectedTemplate.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBenchmark}
                      disabled={benchmarking}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-mono text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      <Zap className={`w-3.5 h-3.5 text-amber-400 ${benchmarking ? 'animate-bounce' : ''}`} />
                      <span>{benchmarking ? 'BENCHMARKING...' : 'BENCHMARK'}</span>
                    </button>

                    <button
                      onClick={handleBuildComponent}
                      disabled={building}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-mono text-xs font-bold shadow-lg shadow-indigo-600/20 transition cursor-pointer disabled:opacity-50"
                    >
                      <Play className={`w-3.5 h-3.5 ${building ? 'animate-spin' : ''}`} />
                      <span>{building ? 'SYNTHESIZING...' : 'BUILD COMPONENT'}</span>
                    </button>
                  </div>
                </div>

                {/* Benchmark HUD if available */}
                {benchmarkResult && (
                  <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2 text-amber-300">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Sandbox Benchmark Verified ({benchmarkResult.iterations} cycles)</span>
                    </div>
                    <div className="flex items-center gap-4 text-slate-300">
                      <span>Latency: <strong className="text-white">{benchmarkResult.meanLatencyPerRunMs}ms</strong></span>
                      <span>Compute: <strong className="text-white">{benchmarkResult.estimatedFlops} FLOPs</strong></span>
                      <span>Scale: <strong className="text-white">{benchmarkResult.complexity}</strong></span>
                    </div>
                  </div>
                )}

                {/* Parametric Customizer Grid */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase tracking-wider">
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Parametric Architecture Configuration</span>
                    </div>
                    {/* Self-Healing Toggle */}
                    <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-slate-300">
                        <input
                          type="checkbox"
                          checked={withSelfHealing}
                          onChange={e => setWithSelfHealing(e.target.checked)}
                          className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        />
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Self-Healing Invariant Guards</span>
                      </label>
                      <label className={`flex items-center gap-2 cursor-pointer text-xs font-mono ${selectedTemplate?.selfHostable ? 'text-slate-300' : 'text-slate-500'}`} title={selectedTemplate?.selfHostable ? 'Write a real module into .selfhosted/ that the running server imports and calls' : 'This template declares no selfHost descriptor — it can only be registered as a sandbox gene'}>
                        <input
                          type="checkbox"
                          checked={selfHostToRuntime && !!selectedTemplate?.selfHostable}
                          disabled={!selectedTemplate?.selfHostable}
                          onChange={e => setSelfHostToRuntime(e.target.checked)}
                          className="rounded bg-slate-900 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <Server className="w-4 h-4 text-emerald-400" />
                        <span>Self-host to runtime</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">Target Component Name</label>
                      <input
                        type="text"
                        value={customName}
                        onChange={e => setCustomName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {selectedTemplate.params.map((p: ComponentTemplateParam) => (
                      <div key={p.id}>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[11px] font-mono text-slate-400">{p.label}</label>
                          <span className="text-[10px] font-mono text-slate-500">{p.description}</span>
                        </div>

                        {p.type === 'number' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={p.min}
                              max={p.max}
                              step={p.step || 1}
                              value={customParams[p.id] !== undefined ? customParams[p.id] : p.default}
                              onChange={e => handleParamChange(p.id, Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        ) : p.type === 'boolean' ? (
                          <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs font-mono text-slate-300">
                            <input
                              type="checkbox"
                              checked={customParams[p.id] !== undefined ? !!customParams[p.id] : !!p.default}
                              onChange={e => handleParamChange(p.id, e.target.checked)}
                              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Enable {p.label}</span>
                          </label>
                        ) : p.type === 'select' ? (
                          <select
                            value={customParams[p.id] || p.default}
                            onChange={e => handleParamChange(p.id, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                          >
                            {(p.options || []).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={customParams[p.id] || p.default}
                            onChange={e => handleParamChange(p.id, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Code & Test Preview Tabs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <button
                        onClick={() => setPreviewTab('code')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                          previewTab === 'code'
                            ? 'bg-slate-800 text-indigo-400 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        <span>TypeScript Kernel</span>
                      </button>

                      <button
                        onClick={() => setPreviewTab('test')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                          previewTab === 'test'
                            ? 'bg-slate-800 text-emerald-400 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Executable Test Suite</span>
                      </button>
                    </div>

                    <span className="text-[10px] font-mono text-slate-500">
                      {previewTab === 'code' ? 'AST Sanitized' : 'Sandbox Asserts'}
                    </span>
                  </div>

                  <pre className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto max-h-[320px] leading-relaxed select-text">
                    <code>{previewTab === 'code' ? codePreview : testPreview}</code>
                  </pre>
                </div>
              </div>
            ) : (
              <div className="p-16 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 font-mono text-xs">
                Select a template from the catalog to configure its parametric architecture.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 2: Recursive Learner Directives */}
      {activeSection === 'learner' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-emerald-400" />
                <span>Self-Learning Architectural Recommendations</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                The Recursive Learner analyses gene fitness and automatically recommends internal component templates for synthesis.
              </p>
            </div>

            <button
              onClick={() => handleExecuteLearnerDirective()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>SYNTHESIZE FROM TOP DIRECTIVE</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {learnerDirectives.map((dir, idx) => (
              <div
                key={dir.id || idx}
                className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      dir.kind === 'amplify'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : dir.kind === 'synthesize_template'
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                        : dir.kind === 'refine'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}>
                      {dir.kind.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">Ep #{dir.episode}</span>
                  </div>

                  <h4 className="text-sm font-bold text-white mb-1">{dir.geneName}</h4>
                  <p className="text-xs text-slate-400">{dir.reason}</p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-indigo-400">
                    {dir.templateId ? `Template: ${dir.templateId}` : 'Ecosystem Directive'}
                  </span>

                  <button
                    onClick={() => handleExecuteLearnerDirective(dir.id)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-mono transition cursor-pointer"
                  >
                    Synthesize
                  </button>
                </div>
              </div>
            ))}

            {learnerDirectives.length === 0 && (
              <div className="col-span-full p-12 text-center text-slate-500 font-mono text-xs italic">
                No active directives generated yet. Run learning episodes in the RECURSIVE LEARNER tab.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 3: Structural Protocols (ACP / MPC / CLI) */}
      {activeSection === 'artifacts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-white">Structural Deployment Artifacts</h3>
              <p className="text-xs text-slate-400">High-assurance protocols and control systems compiled into the runtime.</p>
            </div>
          </div>

          {artifacts.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-800 rounded-xl">
              <Terminal className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-mono text-sm">Awaiting structural initiation...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {artifacts.map(artifact => (
                <ArtifactCard key={artifact.id} artifact={artifact} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 4: Self-Hosted Runtime Tools (the dogfood loop) */}
      {activeSection === 'selfhosted' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-emerald-800/60 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-emerald-400" />
                  <span>Self-Hosted Runtime Tools</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Components that passed their real sandbox suite + lint gate were written to{' '}
                  <code className="text-emerald-300 font-mono">.selfhosted/tools/*.mjs</code>, imported by the live server,
                  and re-verified at boot. This is the dogfood loop: Recourse now runs code it built.
                </p>
              </div>
              <button
                onClick={handleVerifySelfHosted}
                disabled={shVerifyBusy}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-4 h-4 ${shVerifyBusy ? 'animate-spin' : ''}`} />
                <span>{shVerifyBusy ? 'RE-VERIFYING...' : 'RE-VERIFY ALL (REAL MODULES)'}</span>
              </button>
            </div>
            <p className="text-[11px] font-mono text-slate-500 mt-3 relative z-10">
              Honesty: a green verdict means the module file exists, dynamically imported OK, and the stored test suite still
              passed against its source. Stateful tools hold a singleton instance until the server restarts. Only
              plugin-declared methods are callable.
            </p>
          </div>

          {selfHostedTools.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-emerald-900/60 rounded-2xl bg-slate-900/50">
              <Server className="w-8 h-8 text-emerald-700 mx-auto mb-3" />
              <p className="text-slate-400 font-mono text-sm">No self-hosted tools yet.</p>
              <p className="text-xs text-slate-500 font-mono mt-2">
                Build a component with "Self-host to runtime" enabled and it will appear here as a live module.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Tools list */}
              <div className="lg:col-span-5 space-y-3">
                {selfHostedTools.map((tool) => {
                  const healthy = tool.lastVerified?.passed === true;
                  const selected = callToolName === tool.name;
                  return (
                    <div
                      key={tool.name}
                      onClick={() => handleSelectCallTool(tool.name, tool.methods)}
                      className={`p-4 rounded-xl border transition cursor-pointer ${
                        selected
                          ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/50'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg border ${healthy ? 'bg-emerald-950/60 border-emerald-800' : 'bg-rose-950/60 border-rose-800'}`}>
                            {healthy
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              : <AlertCircle className="w-4 h-4 text-rose-400" />}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white font-mono">{tool.name}</h4>
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                              {tool.templateId} • {tool.domain.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveSelfHosted(tool.name); }}
                          disabled={shRemoving === tool.name}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition cursor-pointer disabled:opacity-50"
                          title="Remove self-hosted tool"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <p className="text-[11px] font-mono text-slate-500 mt-2 truncate" title={tool.file}>
                        {tool.file} • #{tool.hash.slice(0, 10)}
                      </p>

                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(tool.methods || []).map((m: any) => (
                          <span key={m.method} className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-300">
                            {m.method}()
                          </span>
                        ))}
                      </div>

                      {tool.lastVerified && (
                        <p className={`text-[10px] font-mono mt-2 ${healthy ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {healthy ? '✓ BOOT-VERIFIED' : '✗ FAILED'} {tool.lastVerified.detail}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Call panel */}
              <div className="lg:col-span-7">
                {callToolName ? (
                  (() => {
                    const tool = selfHostedTools.find((t) => t.name === callToolName);
                    if (!tool) return null;
                    return (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-white font-mono">CALL LIVE MODULE</h4>
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                              {tool.name} {tool.stateful ? '(stateful singleton)' : '(stateless static)'}
                            </p>
                          </div>
                          <span className="px-2 py-1 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 text-[10px] font-mono">
                            {tool.entrypointName}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-mono text-slate-400 mb-1">Method (whitelisted)</label>
                            <select
                              value={callMethod}
                              onChange={e => { setCallMethod(e.target.value); setCallResult(null); }}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                            >
                              {(tool.methods || []).map((m: any) => (
                                <option key={m.method} value={m.method}>{m.method}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-mono text-slate-400 mb-1">Args (JSON array)</label>
                            <input
                              type="text"
                              value={callArgs}
                              onChange={e => setCallArgs(e.target.value)}
                              placeholder='["key", 42]'
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>

                        <button
                          onClick={handleCallTool}
                          disabled={callRunning || !callMethod}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
                        >
                          <Play className={`w-4 h-4 ${callRunning ? 'animate-spin' : ''}`} />
                          <span>{callRunning ? 'CALLING...' : 'EXECUTE ON LIVE MODULE'}</span>
                        </button>

                        {callResult && (
                          <div className={`p-4 rounded-xl border font-mono text-xs overflow-x-auto ${callResult.success ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-rose-950/40 border-rose-800/60'}`}>
                            {callResult.success ? (
                              <>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-emerald-300 font-bold">RESULT</span>
                                  <span className="text-slate-500">{callResult.executionTimeMs}ms</span>
                                </div>
                                <pre className="text-slate-200 whitespace-pre-wrap select-text">{JSON.stringify(callResult.result, null, 2)}</pre>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 mb-2">
                                  <AlertCircle className="w-4 h-4 text-rose-400" />
                                  <span className="text-rose-300 font-bold">CALL ERROR</span>
                                </div>
                                <pre className="text-rose-200 whitespace-pre-wrap select-text">{callResult.error}</pre>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="h-full py-14 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
                    <Terminal className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-400 font-mono text-xs">Select a self-hosted tool to call it.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 5: Intel Inbox */}
      {activeSection === 'intel' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-amber-800/40 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-amber-600/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                <Lightbulb className="w-5 h-5 text-amber-400" />
                Intel Inbox
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Research ideas from ecosystem intelligence (bbtech, strategy teams, deep research). Adopt requires a real testable contract — invented ideas become buildable tools only with a reference suite.
              </p>
              <IntelInboxView />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ArtifactCard: React.FC<{ artifact: StructuralArtifact }> = ({ artifact }) => {
  const Icon = TYPE_ICONS[artifact.type] || Box;
  
  const statusColors = {
    designing: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    compiling: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    verifying: 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20',
    deployed: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  };
  
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col hover:border-slate-700 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        <span className={`text-[10px] font-mono px-2 py-1 rounded-full border flex items-center gap-1.5 ${statusColors[artifact.status]}`}>
          {artifact.status !== 'deployed' && <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
          {artifact.status.toUpperCase()}
        </span>
      </div>
      
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white truncate" title={artifact.name}>
          {artifact.name}
        </h3>
        <p className="text-xs text-slate-400 font-mono mt-1">
          {TYPE_LABELS[artifact.type]}
        </p>
      </div>
      
      <p className="text-xs text-slate-500 line-clamp-2 mb-4 flex-grow">
        {artifact.description}
      </p>
      
      <div className="space-y-3 mt-auto">
        {artifact.status !== 'deployed' && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>{artifact.status === 'designing' ? 'Architecture' : artifact.status === 'compiling' ? 'Synthesis' : 'Validation'}</span>
              <span>{Math.round(artifact.progress)}%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${artifact.progress}%` }}
              />
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/50">
          <div>
            <span className="block text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Scale</span>
            <span className="text-xs font-mono text-slate-300">{artifact.loc.toLocaleString()} LOC</span>
          </div>
          <div>
            <span className="block text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Complexity</span>
            <span className="text-xs font-mono text-slate-300">Ω({artifact.complexity.toFixed(1)})</span>
          </div>
        </div>
      </div>
    </div>
  );
};

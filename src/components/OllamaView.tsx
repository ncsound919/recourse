// src/components/OllamaView.tsx — Local LLM Orchestrator & Telemetry Benchmarker
import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, 
  Cpu, 
  Zap, 
  Play, 
  CheckCircle, 
  MessageSquare, 
  Terminal, 
  Sliders, 
  Database, 
  TrendingUp,
  Volume2,
  Sparkles,
  RefreshCw,
  Layers,
  Activity,
  AlertTriangle
} from 'lucide-react';
import { speak, playChirp } from '../lib/voice';

interface OllamaModel {
  name: string;
  size: string;
  family: string;
  parameter_size: string;
  quantization_level: string;
}

interface OllamaMetrics {
  totalDurationMs: number;
  loadDurationMs: number;
  promptEvalCount: number;
  evalCount: number;
  tokensPerSec: number;
}

export const OllamaView: React.FC = () => {
  const [endpoint, setEndpoint] = useState('http://localhost:11434');
  const [status, setStatus] = useState<'offline' | 'online'>('offline');
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [hardware, setHardware] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState('qwen3.8-4b-distill:q4_k_m');
  const [prompt, setPrompt] = useState('');
  const [systemMessage, setSystemMessage] = useState('You are a helpful local coder.');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string; metrics?: OllamaMetrics }>>([]);
  const [loading, setLoading] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState<OllamaMetrics | null>(null);
  
  // Local Lego orchestrator simulation states
  const [orchestrating, setOrchestrating] = useState(false);
  const [activeLegoDirective, setActiveLegoDirective] = useState<string>('Awaiting model trigger');
  const [legoLog, setLegoLog] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const checkConnection = async (isInitial = false) => {
    try {
      const res = await fetch('/api/ollama/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint })
      }).then(r => r.json());

      if (res?.success) {
        setStatus(res.status);
        setModels(res.models);
        setHardware(res.hardware);
        if (res.models.length > 0 && !res.models.some((m: any) => m.name === selectedModel)) {
          setSelectedModel(res.models[0].name);
        }
        if (!isInitial) {
          speak(`Ollama system status: ${res.status === 'online' ? 'Connected live' : 'Offline - no local model server reachable'}.`);
          playChirp('success');
        }
      } else {
        setStatus('offline');
      }
    } catch (e) {
      setStatus('offline');
    }
  };

  useEffect(() => {
    checkConnection(true);
  }, []);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, legoLog]);

  const handleSendPrompt = async () => {
    if (!prompt.trim() || loading) return;

    setLoading(true);
    const userPrompt = prompt;
    setPrompt('');
    
    // Add user message immediately
    setChatHistory(prev => [...prev, { role: 'user', content: userPrompt }]);
    speak(`Analyzing prompt with ${selectedModel}.`);
    playChirp('loop_tick');

    try {
      const res = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          model: selectedModel,
          prompt: userPrompt,
          system: systemMessage
        })
      }).then(r => r.json());

      if (res?.success) {
        setChatHistory(prev => [...prev, { 
          role: 'assistant', 
          content: res.response,
          metrics: res.metrics 
        }]);
        setCurrentMetrics(res.metrics);
        speak(`Local model completed response. Benchmark score: ${res.metrics.tokensPerSec} tokens per second.`);
        playChirp('success');
      } else {
        setChatHistory(prev => [...prev, { role: 'assistant', content: 'Error: Failed to fetch local model response.' }]);
        playChirp('failure');
      }
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
      playChirp('failure');
    } finally {
      setLoading(false);
    }
  };

  const [manageModelName, setManageModelName] = useState<string>('qwen3.5-4b');
  const [pullLog2, setPullLog2] = useState<string[]>([]);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageMsg, setManageMsg] = useState<string | null>(null);

  const loadManage = async () => {
    try {
      const r = await fetch('/api/ollama/manage').then((x) => x.json());
      if (r.status) {
        setPullLog2(r.status.pullLogTail || []);
        setManageBusy(Boolean(r.status.pulling));
      }
    } catch { /* keep current */ }
  };
  useEffect(() => {
    loadManage();
    const t = setInterval(loadManage, 4000);
    return () => clearInterval(t);
  }, []);

  const mgPull = async () => {
    if (!manageModelName.trim()) return;
    setManageBusy(true);
    setManageMsg(null);
    try {
      const r = await fetch('/api/ollama/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull', model: manageModelName.trim() }),
      }).then((x) => x.json());
      setManageMsg(r.note || r.error || (r.success ? 'Started pull.' : 'Pull failed.'));
      loadManage();
    } catch (e: any) {
      setManageMsg(e.message || 'Pull request failed.');
    } finally {
      setManageBusy(false);
    }
  };

  const startOrchestrationSimulation = () => {
    if (orchestrating) return;
    if (status !== 'online') {
      setActiveLegoDirective('Local model offline - this UI simulation is disabled (it would only invent results).');
      setOrchestrating(false);
      return;
    }
    setOrchestrating(true);
    setLegoLog([]);
    setActiveLegoDirective('[UI DEMO] Simulated orchestration - no real model work is performed by this panel.');
    playChirp('synthesize');
    speak('Running simulated orchestration demo.');

    const logs = [
      `[UI DEMO SIMULATION] This log stream is illustrative only - it does not run real model calls.`,
      `[UI DEMO SIMULATION] Hypothetical step: model inspects the brick registry.`,
      `[UI DEMO SIMULATION] Hypothetical step: a candidate brick is evaluated in the sandbox.`,
      `[UI DEMO SIMULATION] Hypothetical step: a component template is synthesized.`,
      `[UI DEMO SIMULATION] Hypothetical step: a candidate would be promoted ONLY if its real test suite passed.`
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < logs.length) {
        const nextLog = logs[currentStep];
        setLegoLog(prev => [...prev, nextLog]);
        setActiveLegoDirective(nextLog);
        playChirp('loop_tick');
        currentStep++;
      } else {
        clearInterval(interval);
        setOrchestrating(false);
        setActiveLegoDirective('Demo cycle finished. No real work was executed.');
        playChirp('success');
      }
    }, 1200);
  };

  const presets = [
    { label: "Analyze Self-Assembly", prompt: "Identify security vulnerabilities or memory leak risks in a self-assembling Lego DAG composer pipeline that executes mathematical matrices in real-time." },
    { label: "Optimized Calculus Filter", prompt: "Write a high-performance, TypeScript Newton-Raphson approximation filter that safely ignores boundary divisions by zero using conditional contracts." },
    { label: "Cryptographic Stud Contract", prompt: "Generate an immutable SHA-256 state-verification block contract to prevent tampering of autonomous software releases." }
  ];

  return (
    <div className="space-y-6">

      {/* Model Manager (real ollama CLI) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white font-mono">LOCAL MODEL MANAGER</h3>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              Runs the real <span className="text-slate-300">ollama pull</span> CLI. Requires the ollama binary; progress is streamed below.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={manageModelName}
              onChange={(e) => setManageModelName(e.target.value)}
              placeholder="e.g. hf.co/Qwen/Qwen3.5-4B"
              className="flex-1 sm:w-56 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={mgPull}
              disabled={manageBusy}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-lg"
            >
              {manageBusy ? 'PULLING...' : 'PULL MODEL'}
            </button>
          </div>
        </div>
        {manageMsg && <p className="mt-2 text-[11px] font-mono text-indigo-300">{manageMsg}</p>}
        {pullLog2.length > 0 && (
          <pre className="mt-2 max-h-36 overflow-auto bg-slate-950 border border-slate-800 rounded-xl p-2 text-[10px] text-emerald-300 font-mono">
            {pullLog2.join('')}
          </pre>
        )}
      </div>
      
      {/* Banner / Title */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Server className="w-40 h-40 text-indigo-400" />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-950 text-indigo-400 text-[10px] rounded border border-indigo-800 font-bold font-mono">LOCAL ORCHESTRATION</span>
              <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 text-[10px] rounded border border-emerald-800 font-bold font-mono">SPEECH ENABLED</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1.5 font-mono tracking-tight">Ollama Local Model & Sonification Hub</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Bridge the Recourse OS to your machine's local LLMs. Run offline inference benchmarks, configure GPU-offloaded weight acceleration, and sonify system events dynamically.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Endpoint:</span>
            <input 
              value={endpoint}
              onChange={e => setEndpoint(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 w-44"
            />
            <button 
              onClick={() => checkConnection(false)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>TEST</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Server Status & Model Catalog */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Connection and Hardware Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 lg:col-span-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-800">
            <Server className="w-4 h-4 text-indigo-400" />
            <span>Connection & Hardware telemetry</span>
          </h3>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Bridge Status:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                status === 'online' 
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                  : 'bg-red-950 text-red-400 border border-red-800'
              }`}>
                {status === 'online' ? 'CONNECTED (LIVE)' : 'OFFLINE (NO LOCAL SERVER)'}
              </span>
            </div>

            {hardware ? (
              <>
                <div className="flex justify-between items-center p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">GPU Offload Level:</span>
                  <span className="text-emerald-400 font-bold">{hardware.offloadPercent}% offload</span>
                </div>

                <div className="flex justify-between items-center p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">VRAM Allocation:</span>
                  <span className="text-white font-bold">{hardware.vramUsedGb.toFixed(1)} GB / {hardware.vramTotalGb.toFixed(1)} GB</span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                  <span className="text-slate-400 block">CPU Threads Bound:</span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-900 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full" style={{ width: `${(hardware.cpuThreads / 16) * 100}%` }}></div>
                    </div>
                    <span className="text-indigo-400 font-bold text-[11px]">{hardware.cpuThreads} Threads</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-3 rounded-lg bg-slate-950 border border-dashed border-slate-800 text-slate-500">
                No live hardware telemetry. Hardware metrics are only reported by a real local model server; none are shown or invented when it is offline.
              </div>
            )}
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-2">
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wide block">Local Runtime Notes</span>
            <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
              Responses only ever come from a real model server at the configured endpoint. When it is offline, the UI reports offline - nothing is emulated and no canned text is generated.
            </p>
          </div>
        </div>

        {/* Right: Active Local Models */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-800">
            <Database className="w-4 h-4 text-indigo-400" />
            <span>Active Local Model Library</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {models.map((m, idx) => (
              <div 
                key={idx}
                onClick={() => {
                  setSelectedModel(m.name);
                  speak(`Switched local model to ${m.name}.`);
                  playChirp('loop_tick');
                }}
                className={`p-3.5 rounded-xl border font-mono transition-all duration-200 cursor-pointer ${
                  selectedModel === m.name 
                    ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-md shadow-indigo-950/20' 
                    : 'bg-slate-950 border-slate-800/60 hover:bg-slate-800/30 text-slate-400'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`text-xs font-bold ${selectedModel === m.name ? 'text-indigo-400' : 'text-slate-200'}`}>
                      {m.name}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Family: {m.family} | Quant: {m.quantization_level}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] font-bold text-slate-300">
                    {m.size}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Parameters: <strong className="text-slate-400">{m.parameter_size}</strong></span>
                  {selectedModel === m.name && (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-400" /> ACTIVE
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Grid: Terminal Sandbox vs. Local Lego Orchestration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Middle: Terminal Sandbox */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2 flex flex-col h-[520px] space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span>Interactive Model Terminal Prompt</span>
            </h3>
            {currentMetrics && (
              <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded">
                Speed: {currentMetrics.tokensPerSec} tok/sec
              </span>
            )}
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2">
            {presets.map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  setPrompt(p.prompt);
                  playChirp('loop_tick');
                }}
                className="px-2.5 py-1 bg-slate-950 hover:bg-slate-850 text-slate-300 border border-slate-800 rounded-lg text-[10px] font-mono transition cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Terminal Output */}
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-y-auto space-y-4 font-mono text-xs leading-relaxed max-h-[300px]">
            {chatHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-2 py-10">
                <MessageSquare className="w-8 h-8 text-slate-600 animate-pulse" />
                <p>Terminal empty. Select an active local model and enter a prompt above.</p>
              </div>
            ) : (
              chatHistory.map((msg, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${
                  msg.role === 'user' 
                    ? 'bg-indigo-950/20 border-indigo-900/50 text-indigo-200' 
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}>
                  <div className="flex justify-between items-center mb-1 text-[10px] text-slate-500">
                    <span className="font-bold uppercase tracking-wider">
                      {msg.role === 'user' ? 'USER HOST' : selectedModel}
                    </span>
                    {msg.metrics && (
                      <span>{msg.metrics.tokensPerSec} tok/s | {msg.metrics.totalDurationMs}ms</span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>

          {/* Input Box */}
          <div className="flex gap-2">
            <input 
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendPrompt()}
              placeholder={`Send instructions to local ${selectedModel}...`}
              disabled={loading}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
            <button
              onClick={handleSendPrompt}
              disabled={loading || !prompt.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-mono text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{loading ? 'SOLVING...' : 'EXECUTE'}</span>
            </button>
          </div>
        </div>

        {/* Right: Dynamic Model Growth Orchestration */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col h-[520px] space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-800">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Deterministic Growth Orchestrator (UI DEMO)</span>
          </h3>

          <p className="text-xs text-slate-400">
            UI demo only. This panel does NOT execute real model calls or promote anything. Real promotion happens on the Evolution views, gated by the sandbox verifier.
          </p>

          {/* Status Panel */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 font-mono text-xs">
            <div className="flex justify-between items-center text-[10px] text-slate-500">
              <span>CONTROLLING MODEL:</span>
              <span className="text-indigo-400 font-bold">{selectedModel}</span>
            </div>
            <div className="text-white text-[11px] bg-slate-900 border border-slate-800/80 rounded p-2 text-center font-bold">
              {activeLegoDirective}
            </div>
          </div>

          {/* Simulation Output Terminal */}
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto space-y-1.5 font-mono text-[10px] text-emerald-400 max-h-[190px]">
            {legoLog.length === 0 ? (
              <span className="text-slate-600 italic block text-center py-10">Orchestration logs empty. Trigger "Initiate Composable Loop" below.</span>
            ) : (
              legoLog.map((log, idx) => (
                <div key={idx} className="border-b border-slate-900/40 pb-1">
                  {log}
                </div>
              ))
            )}
          </div>

          <button
            onClick={startOrchestrationSimulation}
            disabled={orchestrating}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>{orchestrating ? 'RUNNING DEMO...' : 'RUN UI DEMO SIMULATION'}</span>
          </button>
        </div>

      </div>

    </div>
  );
};

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RefreshCw, AlertTriangle, Zap, BrainCircuit, FlaskConical, Layers, Trophy, Cpu, Activity } from 'lucide-react';
import type { ReactNode } from 'react';

interface SystemState {
  name: string;
  label: string;
  color: number;
  hex: string;
  activeClass: string;
  slot: number;
  icon: ReactNode;
  value: string;
  sub: string;
  activity: number;
  activityLabel: string;
}

const ORBIT_RADIUS = 5.2;

function systemPosition(slot: number): THREE.Vector3 {
  const angle = (slot / 6) * Math.PI * 2;
  const y = Math.sin(angle) * ORBIT_RADIUS * 0.42;
  const r = Math.sqrt(Math.max(ORBIT_RADIUS * ORBIT_RADIUS - y * y, 0.001));
  return new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
}

function makeLabelSprite(text: string, colorHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 52px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = colorHex; ctx.shadowBlur = 20;
  ctx.fillStyle = colorHex;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
}

function makeStarField(): THREE.Points {
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = 2 * Math.PI * Math.random();
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 20 + Math.random() * 24;
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9aa8c9, size: 0.06, transparent: true, opacity: 0.8, sizeAttenuation: true }));
}

function makeCore(): { inner: THREE.Mesh; outer: THREE.Mesh } {
  const inner = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.15, 0),
    new THREE.MeshStandardMaterial({ color: 0x7c8cff, emissive: 0x3c5cff, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.8, flatShading: true })
  );
  const outer = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.65, 1),
    new THREE.MeshBasicMaterial({ color: 0x6d7bff, wireframe: true, transparent: true, opacity: 0.22 })
  );
  return { inner, outer };
}

function makeStream(color: number, dir: THREE.Vector3): { points: THREE.Points; ts: Float32Array } {
  const count = 30;
  const ts = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    ts[i] = Math.random() * ORBIT_RADIUS * 0.9;
    positions[i * 3] = dir.x * ts[i]; positions[i * 3 + 1] = dir.y * ts[i]; positions[i * 3 + 2] = dir.z * ts[i];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return { points: new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })), ts };
}

interface LiveData {
  gen: number;
  uptime: number;
  ready: number;
  realProgress: { registeredTools: number; liveSelfHostedTools: number; forgeMaterialized: number; healedTools: number; benchmarkSolved: number; benchmarkTotal: number; openAnomalies: number };
  dreamState: { isDreamingActive: boolean; totalCrystallizedGenes: number; currentPhase: string; dreamCyclesCompleted: number };
  learner: { episode: number; calibrationError: number; selfScore: number };
  lastDecision: { selectedAction?: { title?: string; computedUtilityScore?: number }; decisionEntropy?: number; entropyReduction?: number };
  failures: { total: number; lastHour: number; bySource: Record<string, number> };
  forge: { agendaCount: number; ledgerCount: number; materializedCount: number; failedCount: number };
  selfRepair: { isAutoHealingEnabled: boolean; totalHealedCount: number; activeAnomaliesCount: number; meanTimeToRepairMs: number; repairSuccessRate: number };
  swarm: { isSwarmAutopilotActive: boolean; totalAgents: number; activeAgentsCount: number; totalSwarmTasksCompleted: number };
}

export function RecourseVisualizer3D() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [genDelta, setGenDelta] = useState(0);
  const [prevGen, setPrevGen] = useState(0);
  const streamRefs = useRef<Array<{ points: THREE.Points; ts: Float32Array; dir: THREE.Vector3; activity: number }>>([]);
  const satelliteRefs = useRef<{ mesh: THREE.Mesh; light: THREE.PointLight; ring: THREE.Mesh; mat: THREE.MeshStandardMaterial }[]>([]);
  const coreInnerRef = useRef<THREE.Mesh | null>(null);
  const coreOuterRef = useRef<THREE.Mesh | null>(null);

  const buildSystemDefs = useCallback((d: LiveData | null): SystemState[] => {
    const act = (v: number) => Math.min(1, Math.max(0, v));
    const benchPct = d ? d.realProgress.benchmarkSolved / Math.max(1, d.realProgress.benchmarkTotal) : 0;
    const forgeRate = d ? Math.min(1, d.forge.materializedCount / 30) : 0;
    const dreamRate = d ? (d.dreamState.isDreamingActive ? 1 : 0.3) : 0.5;
    const learnerRate = d ? Math.min(1, d.learner.episode / 5000) : 0.5;
    const repairActive = d ? (d.selfRepair.isAutoHealingEnabled ? 1 : 0) : 0;
    const growthRate = d ? (d.lastDecision?.selectedAction?.title ? 0.8 : 0.2) : 0.3;
    return [
      {
        name: 'intake', label: 'INTAKE', color: 0xef4444, hex: '#ef4444',
        activeClass: 'bg-red-500/20 text-red-300 border-red-500/40', slot: 0,
        icon: <FlaskConical className="w-3.5 h-3.5 text-red-400" />,
        value: d ? `${d.realProgress.registeredTools}` : '—',
        sub: d ? `${d.learner.episode.toLocaleString()} learn ep` : 'loading',
        activity: act(learnerRate), activityLabel: d ? `ep ${d.learner.episode.toLocaleString()} · cal ${d.learner.calibrationError.toFixed(4)}` : '—',
      },
      {
        name: 'growth', label: 'GROWTH', color: 0x22c55e, hex: '#22c55e',
        activeClass: 'bg-green-500/20 text-green-300 border-green-500/40', slot: 1,
        icon: <Cpu className="w-3.5 h-3.5 text-green-400" />,
        value: d ? `${((d.lastDecision?.selectedAction?.computedUtilityScore ?? 0) * 100).toFixed(0)}%` : '—',
        sub: d?.lastDecision?.selectedAction?.title ?? 'idle',
        activity: act(growthRate), activityLabel: d?.lastDecision?.selectedAction?.title ? `→ ${d.lastDecision.selectedAction.title}` : 'no decision',
      },
      {
        name: 'repair', label: 'REPAIR', color: 0x06b6d4, hex: '#06b6d4',
        activeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', slot: 2,
        icon: <AlertTriangle className="w-3.5 h-3.5 text-cyan-400" />,
        value: d ? `${d.selfRepair.totalHealedCount}` : '—',
        sub: d ? (d.selfRepair.isAutoHealingEnabled ? `ON · ${d.selfRepair.activeAnomaliesCount} open` : 'DISABLED') : 'loading',
        activity: act(repairActive), activityLabel: d ? (d.selfRepair.isAutoHealingEnabled ? `healed ${d.selfRepair.totalHealedCount} · ${d.selfRepair.activeAnomaliesCount} open` : 'auto-healing OFF') : '—',
      },
      {
        name: 'benchmark', label: 'BENCHMARK', color: 0xf59e0b, hex: '#f59e0b',
        activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40', slot: 3,
        icon: <Trophy className="w-3.5 h-3.5 text-amber-400" />,
        value: d ? `${d.realProgress.benchmarkSolved}/${d.realProgress.benchmarkTotal}` : '—',
        sub: d ? `${(benchPct * 100).toFixed(0)}% solved` : 'loading',
        activity: act(benchPct), activityLabel: d ? `${d.realProgress.benchmarkSolved}/${d.realProgress.benchmarkTotal} solved` : '—',
      },
      {
        name: 'dreaming', label: 'DREAMING', color: 0xa855f7, hex: '#a855f7',
        activeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40', slot: 4,
        icon: <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />,
        value: d ? `${d.dreamState.totalCrystallizedGenes}` : '—',
        sub: d ? `${d.dreamState.currentPhase}` : 'loading',
        activity: act(dreamRate), activityLabel: d ? `${d.dreamState.isDreamingActive ? 'ACTIVE' : 'paused'} · ${d.dreamState.dreamCyclesCompleted} cycles` : '—',
      },
      {
        name: 'genome', label: 'GENOME', color: 0x3b82f6, hex: '#3b82f6',
        activeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40', slot: 5,
        icon: <Layers className="w-3.5 h-3.5 text-blue-400" />,
        value: d ? `${d.forge.materializedCount}` : '—',
        sub: d ? `${d.realProgress.liveSelfHostedTools} live · ${d.forge.agendaCount} agenda` : 'loading',
        activity: act(forgeRate), activityLabel: d ? `${d.forge.materializedCount} materialized · ${d.forge.failedCount} failed` : '—',
      },
    ];
  }, []);

  const [systemDefs, setSystemDefs] = useState<SystemState[]>(buildSystemDefs(null));

  // Also keep a raw ref for the swarm status
  const [swarmData, setSwarmData] = useState<{ isActive: boolean; total: number; active: number; tasksDone: number }>({ isActive: false, total: 0, active: 0, tasksDone: 0 });
  const [repairEnabled, setRepairEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const [statusRes, forgeRes, failuresRes] = await Promise.all([
          fetch('/api/recourse/status').then(r => r.json()).catch(() => null),
          fetch('/api/recourse/forge').then(r => r.json()).catch(() => null),
          fetch('/api/recourse/failures').then(r => r.json()).catch(() => null),
        ]);
        if (!mounted) return;

        const st = statusRes?.status;
        const fr = forgeRes?.forge ?? {};
        const fl = failuresRes ?? {};

        const newLive: LiveData = {
          gen: st?.generation ?? 0,
          uptime: st?.uptimeSeconds ?? 0,
          ready: st?.readinessScore ?? 0,
          realProgress: st?.realProgress ?? { registeredTools: 0, liveSelfHostedTools: 0, forgeMaterialized: 0, healedTools: 0, benchmarkSolved: 0, benchmarkTotal: 0, openAnomalies: 0 },
          dreamState: st?.dreamState ?? { isDreamingActive: false, totalCrystallizedGenes: 0, currentPhase: 'idle', dreamCyclesCompleted: 0 },
          learner: (st as any)?.learner ?? { episode: 0, calibrationError: 0, selfScore: 0 },
          lastDecision: st?.lastDecision ?? {},
          failures: { total: fl.total ?? 0, lastHour: fl.lastHour ?? 0, bySource: fl.bySource ?? {} },
          forge: {
            agendaCount: fr.agenda?.length ?? 0,
            ledgerCount: fr.ledger?.length ?? 0,
            materializedCount: fr.summary?.materialized ?? 0,
            failedCount: (fr.summary?.failed ?? 0) + (fr.summary?.materialize_failed ?? 0),
          },
          selfRepair: (st as any)?.selfRepair ?? { isAutoHealingEnabled: false, totalHealedCount: 0, activeAnomaliesCount: 0, meanTimeToRepairMs: 0, repairSuccessRate: 0 },
          swarm: (st as any)?.swarmStatus ?? { isSwarmAutopilotActive: false, totalAgents: 0, activeAgentsCount: 0, totalSwarmTasksCompleted: 0 },
        };

        setLive(newLive);
        setSystemDefs(buildSystemDefs(newLive));
        setSwarmData({
          isActive: newLive.swarm.isSwarmAutopilotActive,
          total: newLive.swarm.totalAgents,
          active: newLive.swarm.activeAgentsCount,
          tasksDone: newLive.swarm.totalSwarmTasksCompleted,
        });
        setRepairEnabled(newLive.selfRepair.isAutoHealingEnabled);

        if (newLive.gen !== prevGen) {
          setGenDelta(newLive.gen - prevGen);
          setPrevGen(newLive.gen);
          setTimeout(() => setGenDelta(0), 1200);
        }
      } catch { if (mounted) setLive(null); }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, [buildSystemDefs, prevGen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030512);
    scene.fog = new THREE.FogExp2(0x030512, 0.028);

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 120);
    camera.position.set(7.5, 6.5, 11.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.06;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.4;
    controls.minDistance = 4; controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.72;

    scene.add(new THREE.AmbientLight(0x445066, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(6, 10, 8); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6d7bff, 1.4);
    rim.position.set(-8, -4, -8); scene.add(rim);

    const { inner, outer } = makeCore();
    coreInnerRef.current = inner; coreOuterRef.current = outer;
    scene.add(inner); scene.add(outer);

    const grid = new THREE.GridHelper(40, 40, 0x1b2448, 0x11192f);
    grid.position.y = -5.2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);
    scene.add(makeStarField());

    const meshRefs: typeof satelliteRefs.current = [];
    const streamRefList: typeof streamRefs.current = [];

    for (let i = 0; i < 6; i++) {
      const def = systemDefs[i] ?? systemDefs[0];
      const pos = systemPosition(i);
      const mat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0.6, flatShading: true });
      const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), mat);
      sphere.position.copy(pos);
      sphere.userData = { system: def.name, idx: i };
      scene.add(sphere);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.025, 8, 40), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.55 }));
      ring.position.copy(pos); ring.rotation.x = Math.PI / 2;
      scene.add(ring);

      const light = new THREE.PointLight(def.color, 7, 5);
      light.position.copy(pos); scene.add(light);

      const label = makeLabelSprite(def.label, def.hex);
      label.position.copy(pos).add(new THREE.Vector3(0, 1.15, 0));
      scene.add(label);

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), pos]),
        new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.28 })
      );
      scene.add(line);

      const stream = makeStream(def.color, pos.clone().normalize());
      scene.add(stream.points);
      streamRefList.push({ ...stream, dir: pos.clone().normalize(), activity: 0.5 });

      meshRefs.push({ mesh: sphere, light, ring, mat });
    }
    satelliteRefs.current = meshRefs;
    streamRefs.current = streamRefList;

    let raf = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();

      if (coreInnerRef.current) {
        coreInnerRef.current.rotation.y += dt * 0.35;
        coreInnerRef.current.rotation.x += dt * 0.12;
      }
      if (coreOuterRef.current) {
        coreOuterRef.current.rotation.y -= dt * 0.22;
        const pulse = 1.3 * (1 + Math.sin(t * 1.4 + (genDelta > 0 ? t * 8 : 0)) * 0.06);
        coreOuterRef.current.scale.setScalar(pulse);
      }

      for (let i = 0; i < meshRefs.length; i++) {
        const { mesh, light, mat } = meshRefs[i];
        mesh.rotation.y += dt * 0.5;
        mesh.position.y += Math.sin(t * 1.8 + mesh.position.x) * 0.0012;
        const sysDef = systemDefs[i];
        const activity = sysDef?.activity ?? 0.5;
        light.intensity = 4 + activity * 8;
        mat.emissiveIntensity = 0.8 + activity * 1.2;
        mesh.scale.setScalar(1.0 + activity * 0.3 * Math.sin(t * 3 + i));
      }

      for (let i = 0; i < streamRefList.length; i++) {
        const s = streamRefList[i];
        const activity = systemDefs[i]?.activity ?? 0.5;
        const speed = 0.3 + activity * 1.8;
        const attr = s.points.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const count = arr.length / 3;
        for (let j = 0; j < count; j++) {
          let nt = s.ts[j] + speed * dt;
          if (nt >= ORBIT_RADIUS * 0.92) nt = Math.random() * 0.4;
          s.ts[j] = nt;
          arr[j * 3] = s.dir.x * nt + (Math.random() - 0.5) * 0.04;
          arr[j * 3 + 1] = s.dir.y * nt + (Math.random() - 0.5) * 0.04;
          arr[j * 3 + 2] = s.dir.z * nt + (Math.random() - 0.5) * 0.04;
        }
        attr.needsUpdate = true;
        (s.points.material as THREE.PointsMaterial).opacity = 0.4 + activity * 0.6;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth; const h = container.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(meshRefs.map(m => m.mesh), false);
      const hit = hits[0]?.object as THREE.Mesh | undefined;
      setActiveSystem(hit?.userData?.system ?? null);
    };
    renderer.domElement.addEventListener('pointermove', onMove);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      controls.dispose();
      scene.traverse((obj) => {
        const o = obj as any;
        if (o.geometry?.dispose) o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((mm: THREE.Material) => mm.dispose());
        else if (m?.dispose) m.dispose();
      });
      scene.clear(); renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, [live, genDelta, systemDefs]);

  const activeDef = systemDefs.find(s => s.name === activeSystem) ?? null;
  const fmt = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  const hasFailures = (live?.failures.total ?? 0) > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
      <div
        ref={containerRef}
        className="relative h-[560px] rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden shadow-[0_0_60px_rgba(99,102,241,0.12)]"
      >
        <div className="absolute top-4 left-4 pointer-events-none select-none z-10">
          <div className="font-mono text-[11px] text-indigo-300 tracking-widest px-3 py-2 rounded-lg bg-slate-950/80 border border-indigo-800/50 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${genDelta > 0 ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="font-bold text-white">RECOURSE · LIVE</span>
              {genDelta > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                  +{genDelta}
                </span>
              )}
            </div>
            <div className="mt-1 text-slate-400">{live ? `GEN ${live.gen.toLocaleString()}` : 'connecting…'}</div>
          </div>
        </div>

        <div className="absolute top-4 right-4 pointer-events-none select-none z-10 space-y-2">
          <div className="font-mono text-[11px] px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 backdrop-blur-sm text-slate-300">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-3 h-3 text-slate-400" />
              <span className="text-slate-400 uppercase tracking-wider">Tick</span>
            </div>
            <div className="text-slate-400">UPTIME</div>
            <div className="text-indigo-300 font-bold">{live ? fmt(live.uptime) : '—'}</div>
            <div className="text-slate-400 mt-1">READINESS</div>
            <div className="text-emerald-300 font-bold">{live ? `${(live.ready * 100).toFixed(1)}%` : '—'}</div>
            <div className="text-slate-400 mt-1">LEARNER</div>
            <div className="text-purple-300 font-bold">{live ? `ep ${live.learner.episode.toLocaleString()}` : '—'}</div>
            <div className="text-slate-500 text-[10px]">cal {live ? live.learner.calibrationError.toFixed(4) : '—'}</div>
          </div>

          {hasFailures && (
            <div className="font-mono text-[11px] px-3 py-2 rounded-lg bg-red-950/80 border border-red-800/60 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-red-400 uppercase tracking-wider">Failures</span>
              </div>
              <div className="text-red-300 font-bold">{live?.failures.total} total</div>
              <div className="text-red-400/70 text-[10px]">{live?.failures.lastHour} last hour</div>
              {live && Object.keys(live.failures.bySource).slice(0, 3).map(src => (
                <div key={src} className="text-red-400/60 text-[10px] mt-0.5">
                  {src}: {live.failures.bySource[src]}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-4 pointer-events-none z-10">
          <div className="text-[11px] font-mono text-slate-500">drag to orbit · scroll to zoom</div>
        </div>

        <div className="absolute bottom-4 right-4 pointer-events-none z-10">
          {activeDef && (
            <div className={`font-mono text-[11px] px-3 py-2 rounded-lg border backdrop-blur-sm transition-colors ${activeDef.activeClass}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {activeDef.icon}
                <span className="font-bold text-white">{activeDef.label}</span>
              </div>
              <div className="text-white font-black text-lg">{activeDef.value}</div>
              <div className="text-[10px] opacity-80">{activeDef.sub}</div>
              <div className="mt-1 pt-1 border-t border-white/10 text-[10px] opacity-60">
                {activeDef.activityLabel}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="font-mono text-[11px] text-slate-500 tracking-widest px-1">ACTIVE LOOPS</div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-800">
            <div className="font-mono text-[11px] text-slate-400">AUTONOMOUS SYSTEMS</div>
          </div>
          <div className="divide-y divide-slate-800/60">
            {[
              { label: 'FORGE AUTOPILOT', active: live !== null, desc: `${live?.forge.materializedCount ?? 0} materialized · ${live?.forge.agendaCount ?? 0} agenda · ${live?.forge.failedCount ?? 0} failed`, color: 'emerald', dotColor: '#22c55e' },
              { label: 'DREAM ENGINE', active: live?.dreamState.isDreamingActive ?? false, desc: `${live?.dreamState.dreamCyclesCompleted ?? 0} cycles · ${live?.dreamState.totalCrystallizedGenes ?? 0} genes crystallized`, color: 'purple', dotColor: '#a855f7' },
              { label: 'REPAIR LOOP', active: repairEnabled, desc: repairEnabled ? `${live?.selfRepair.totalHealedCount ?? 0} healed · ${live?.selfRepair.activeAnomaliesCount ?? 0} open` : 'DISABLED — isAutoHealingEnabled: false', color: 'cyan', dotColor: '#06b6d4' },
              { label: 'SWARM AUTOPILOT', active: swarmData.isActive, desc: swarmData.isActive ? `${swarmData.active}/${swarmData.total} agents · ${swarmData.tasksDone} tasks` : `DISABLED — all ${swarmData.total} agents idle`, color: 'amber', dotColor: '#f59e0b' },
            ].map(({ label, active, desc, dotColor }) => (
              <div key={label} className="px-4 py-2.5 flex items-start gap-3">
                <span
                  className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                  style={{ backgroundColor: active ? dotColor : '#334155', boxShadow: active ? `0 0 8px ${dotColor}` : 'none' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[11px] font-bold ${active ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                    {!active && <span className="font-mono text-[9px] text-red-400/70 bg-red-950/40 px-1 rounded">OFF</span>}
                  </div>
                  <div className={`font-mono text-[10px] mt-0.5 ${active ? 'text-slate-400' : 'text-slate-600'}`}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="font-mono text-[11px] text-slate-500 tracking-widest px-1 pt-1">SUBSYSTEMS</div>

        {systemDefs.map((s) => (
          <div
            key={s.name}
            onMouseEnter={() => setActiveSystem(s.name)}
            onMouseLeave={() => setActiveSystem(null)}
            className={`flex items-start justify-between px-4 py-3 rounded-xl border transition-all cursor-default ${
              activeDef?.name === s.name ? s.activeClass : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5">
                <span
                  className="w-3 h-3 rounded-full block mt-1"
                  style={{
                    backgroundColor: s.hex,
                    boxShadow: `0 0 ${6 + s.activity * 14}px ${s.hex}`,
                    opacity: 0.4 + s.activity * 0.6,
                  }}
                />
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  {s.icon}
                  <span className="font-mono text-sm font-bold text-white">{s.label}</span>
                </div>
                <div className={`font-mono text-lg font-black mt-0.5 ${activeDef?.name === s.name ? 'text-white' : 'text-slate-200'}`}>
                  {s.value}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{s.sub}</div>
                <div className="text-[10px] font-mono mt-1 opacity-60">{s.activityLabel}</div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 pt-1">
              <div
                className="w-14 h-1.5 rounded-full bg-slate-800 overflow-hidden"
                title={`Activity: ${(s.activity * 100).toFixed(0)}%`}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${s.activity * 100}%`, backgroundColor: s.hex }}
                />
              </div>
              <div className="text-[10px] font-mono text-slate-500">{(s.activity * 100).toFixed(0)}%</div>
            </div>
          </div>
        ))}

        <div className="pt-1 px-1 space-y-2">
          <div className="flex items-start gap-2 py-3 px-4 rounded-xl border border-slate-800 bg-slate-950/60">
            <Zap className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="font-mono text-[11px] text-slate-400 leading-relaxed">
              {live?.forge.materializedCount !== undefined && live.forge.materializedCount > 0 ? (
                <>
                  <span className="text-emerald-300 font-bold">{live.forge.materializedCount}</span>
                  {' tools materialized from '}
                  <span className="text-blue-300">{live.forge.agendaCount}</span>
                  {' in forge agenda'}
                  {live.forge.failedCount > 0 && (
                    <span className="ml-2 text-red-400">· {live.forge.failedCount} failed</span>
                  )}
                </>
              ) : 'Forge loop warming up — generation will materialize tools as agenda fills.'}
            </div>
          </div>

          <div className="flex items-start gap-2 py-3 px-4 rounded-xl border border-slate-800 bg-slate-950/60">
            <Cpu className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
            <div className="font-mono text-[11px] text-slate-400 leading-relaxed">
              <div className="text-slate-300 mb-1">GROWTH DECISION</div>
              {live?.lastDecision?.decisionEntropy !== undefined ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-slate-400">entropy</span>
                    <span className="text-amber-300 font-bold">{live.lastDecision.decisionEntropy.toFixed(3)}</span>
                    {live.lastDecision.decisionEntropy > 3 && (
                      <span className="text-[10px] text-red-400">(high — uncertain)</span>
                    )}
                    {live.lastDecision.decisionEntropy <= 1 && (
                      <span className="text-[10px] text-emerald-400">(converged)</span>
                    )}
                  </div>
                  {live.lastDecision.selectedAction?.title ? (
                    <div>
                      <span className="text-slate-400">action </span>
                      <span className="text-emerald-300">{live.lastDecision.selectedAction.title}</span>
                      {live.lastDecision.selectedAction.computedUtilityScore !== undefined && (
                        <span className="ml-2 text-blue-300">
                          {(live.lastDecision.selectedAction.computedUtilityScore * 100).toFixed(1)}% utility
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-slate-500">no action selected yet</div>
                  )}
                </>
              ) : (
                <div className="text-slate-500">no decision data</div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 py-3 px-4 rounded-xl border border-slate-800 bg-slate-950/60">
            <Layers className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="font-mono text-[11px] text-slate-400 leading-relaxed">
              <div className="text-slate-300 mb-1">FORGE PIPELINE</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 text-slate-500">plan</div>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
                  </div>
                  <div className="w-16 text-right text-blue-300">{live?.forge.agendaCount ?? 0} specs</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 text-slate-500">forge</div>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: live ? `${Math.min(100, (live.forge.materializedCount / 30) * 100)}%` : '0%' }}
                    />
                  </div>
                  <div className="w-16 text-right text-emerald-300">{live?.forge.materializedCount ?? 0} done</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 text-slate-500">fail</div>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-700"
                      style={{ width: live && live.forge.ledgerCount > 0 ? `${Math.min(100, (live.forge.failedCount / live.forge.ledgerCount) * 100)}%` : '0%' }}
                    />
                  </div>
                  <div className="w-16 text-right text-red-400">{live?.forge.failedCount ?? 0} failed</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

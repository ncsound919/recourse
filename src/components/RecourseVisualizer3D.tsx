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
    new THREE.MeshStandardMaterial({ color: 0x70a9e8, emissive: 0x2f6bb0, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.8, flatShading: true })
  );
  const outer = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.65, 1),
    new THREE.MeshBasicMaterial({ color: 0x63a7f2, wireframe: true, transparent: true, opacity: 0.22 })
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
        name: 'intake', label: 'Intake', color: 0xe1878e, hex: '#e1878e',
        activeClass: 'bg-bad-500/20 text-bad-300 border-bad-500/40', slot: 0,
        icon: <FlaskConical className="w-3.5 h-3.5 text-bad-400" />,
        value: d ? `${d.realProgress.registeredTools}` : '-',
        sub: d ? `${d.learner.episode.toLocaleString()} learn ep` : 'loading',
        activity: act(learnerRate), activityLabel: d ? `ep ${d.learner.episode.toLocaleString()} · cal ${d.learner.calibrationError.toFixed(4)}` : '-',
      },
      {
        name: 'growth', label: 'Growth', color: 0x5dba8f, hex: '#5dba8f',
        activeClass: 'bg-ok-500/20 text-ok-300 border-ok-500/40', slot: 1,
        icon: <Cpu className="w-3.5 h-3.5 text-ok-400" />,
        value: d ? `${((d.lastDecision?.selectedAction?.computedUtilityScore ?? 0) * 100).toFixed(0)}%` : '-',
        sub: d?.lastDecision?.selectedAction?.title ?? 'idle',
        activity: act(growthRate), activityLabel: d?.lastDecision?.selectedAction?.title ? `→ ${d.lastDecision.selectedAction.title}` : 'no decision',
      },
      {
        name: 'repair', label: 'Repair', color: 0x36b8c5, hex: '#36b8c5',
        activeClass: 'bg-accent-500/20 text-accent-300 border-accent-500/40', slot: 2,
        icon: <AlertTriangle className="w-3.5 h-3.5 text-accent-400" />,
        value: d ? `${d.selfRepair.totalHealedCount}` : '-',
        sub: d ? (d.selfRepair.isAutoHealingEnabled ? `ON · ${d.selfRepair.activeAnomaliesCount} open` : 'DISABLED') : 'loading',
        activity: act(repairActive), activityLabel: d ? (d.selfRepair.isAutoHealingEnabled ? `healed ${d.selfRepair.totalHealedCount} · ${d.selfRepair.activeAnomaliesCount} open` : 'auto-healing OFF') : '-',
      },
      {
        name: 'benchmark', label: 'Benchmark', color: 0xc99d4e, hex: '#c99d4e',
        activeClass: 'bg-warn-500/20 text-warn-300 border-warn-500/40', slot: 3,
        icon: <Trophy className="w-3.5 h-3.5 text-warn-400" />,
        value: d ? `${d.realProgress.benchmarkSolved}/${d.realProgress.benchmarkTotal}` : '-',
        sub: d ? `${(benchPct * 100).toFixed(0)}% solved` : 'loading',
        activity: act(benchPct), activityLabel: d ? `${d.realProgress.benchmarkSolved}/${d.realProgress.benchmarkTotal} solved` : '-',
      },
      {
        name: 'dreaming', label: 'Dreaming', color: 0xaf95df, hex: '#af95df',
        activeClass: 'bg-accent-500/20 text-accent-300 border-accent-500/40', slot: 4,
        icon: <BrainCircuit className="w-3.5 h-3.5 text-accent-400" />,
        value: d ? `${d.dreamState.totalCrystallizedGenes}` : '-',
        sub: d ? `${d.dreamState.currentPhase}` : 'loading',
        activity: act(dreamRate), activityLabel: d ? `${d.dreamState.isDreamingActive ? 'ACTIVE' : 'paused'} · ${d.dreamState.dreamCyclesCompleted} cycles` : '-',
      },
      {
        name: 'genome', label: 'Genome', color: 0x70a9e8, hex: '#70a9e8',
        activeClass: 'bg-accent-500/20 text-accent-300 border-accent-500/40', slot: 5,
        icon: <Layers className="w-3.5 h-3.5 text-accent-400" />,
        value: d ? `${d.forge.materializedCount}` : '-',
        sub: d ? `${d.realProgress.liveSelfHostedTools} live · ${d.forge.agendaCount} agenda` : 'loading',
        activity: act(forgeRate), activityLabel: d ? `${d.forge.materializedCount} materialized · ${d.forge.failedCount} failed` : '-',
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
    scene.background = new THREE.Color(0x0a0c10);
    scene.fog = new THREE.FogExp2(0x0a0c10, 0.028);

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
    const rim = new THREE.DirectionalLight(0x63a7f2, 1.4);
    rim.position.set(-8, -4, -8); scene.add(rim);

    const { inner, outer } = makeCore();
    coreInnerRef.current = inner; coreOuterRef.current = outer;
    scene.add(inner); scene.add(outer);

    const grid = new THREE.GridHelper(40, 40, 0x23272c, 0x15191d);
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
        className="relative h-[560px] rounded-xl border border-ink-800 bg-ink-950/60 overflow-hidden"
      >
        <div className="absolute top-4 left-4 pointer-events-none select-none z-10">
          <div className="text-[11px] text-accent-300 px-3 py-2 rounded-lg bg-ink-950/80 border border-accent-800/50 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <RefreshCw className={`w-3.5 h-3.5 text-accent-400 ${genDelta > 0 ? 'animate-spin text-ok-400' : ''}`} />
              <span className="font-semibold text-white">Recourse · live</span>
              {genDelta > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-ok-500/20 text-ok-300 text-[10px]">
                  +{genDelta}
                </span>
              )}
            </div>
            <div className="mt-1 text-ink-400">{live ? `GEN ${live.gen.toLocaleString()}` : 'connecting…'}</div>
          </div>
        </div>

        <div className="absolute top-4 right-4 pointer-events-none select-none z-10 space-y-2">
          <div className="text-[11px] px-3 py-2 rounded-lg bg-ink-950/80 border border-ink-700 backdrop-blur-sm text-ink-300">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-3 h-3 text-ink-400" />
              <span className="text-ink-400 ">Tick</span>
            </div>
            <div className="text-ink-400">Uptime</div>
            <div className="text-accent-300 font-semibold">{live ? fmt(live.uptime) : '-'}</div>
            <div className="text-ink-400 mt-1">Readiness</div>
            <div className="text-ok-300 font-semibold">{live ? `${(live.ready * 100).toFixed(1)}%` : '-'}</div>
            <div className="text-ink-400 mt-1">Learner</div>
            <div className="text-accent-300 font-semibold">{live ? `ep ${live.learner.episode.toLocaleString()}` : '-'}</div>
            <div className="text-ink-500 text-[10px]">cal {live ? live.learner.calibrationError.toFixed(4) : '-'}</div>
          </div>

          {hasFailures && (
            <div className="text-[11px] px-3 py-2 rounded-lg bg-bad-950/80 border border-bad-800/60 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3 h-3 text-bad-400" />
                <span className="text-bad-400 ">Failures</span>
              </div>
              <div className="text-bad-300 font-semibold">{live?.failures.total} total</div>
              <div className="text-bad-400/70 text-[10px]">{live?.failures.lastHour} last hour</div>
              {live && Object.keys(live.failures.bySource).slice(0, 3).map(src => (
                <div key={src} className="text-bad-400/60 text-[10px] mt-0.5">
                  {src}: {live.failures.bySource[src]}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-4 pointer-events-none z-10">
          <div className="text-[11px] text-ink-500">drag to orbit · scroll to zoom</div>
        </div>

        <div className="absolute bottom-4 right-4 pointer-events-none z-10">
          {activeDef && (
            <div className={`text-[11px] px-3 py-2 rounded-lg border backdrop-blur-sm transition-colors ${activeDef.activeClass}`}>
              <div className="flex items-center gap-1.5 mb-1">
                {activeDef.icon}
                <span className="font-semibold text-white">{activeDef.label}</span>
              </div>
              <div className="text-white font-semibold text-lg">{activeDef.value}</div>
              <div className="text-[10px] opacity-80">{activeDef.sub}</div>
              <div className="mt-1 pt-1 border-t border-white/10 text-[10px] opacity-60">
                {activeDef.activityLabel}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="text-[11px] text-ink-500 px-1">Active loops</div>

        <div className="rounded-xl border border-ink-800 bg-ink-950/60 overflow-hidden">
          <div className="px-4 py-2 border-b border-ink-800">
            <div className="text-[11px] text-ink-400">Autonomous systems</div>
          </div>
          <div className="divide-y divide-ink-800/60">
            {[
              { label: 'Forge autopilot', active: live !== null, desc: `${live?.forge.materializedCount ?? 0} materialized · ${live?.forge.agendaCount ?? 0} agenda · ${live?.forge.failedCount ?? 0} failed`, color: 'emerald', dotColor: '#5dba8f' },
              { label: 'Dream engine', active: live?.dreamState.isDreamingActive ?? false, desc: `${live?.dreamState.dreamCyclesCompleted ?? 0} cycles · ${live?.dreamState.totalCrystallizedGenes ?? 0} genes crystallized`, color: 'purple', dotColor: '#5dba8f' },
              { label: 'Repair loop', active: repairEnabled, desc: repairEnabled ? `${live?.selfRepair.totalHealedCount ?? 0} healed · ${live?.selfRepair.activeAnomaliesCount ?? 0} open` : 'DISABLED - isAutoHealingEnabled: false', color: 'cyan', dotColor: '#5dba8f' },
              { label: 'Swarm autopilot', active: swarmData.isActive, desc: swarmData.isActive ? `${swarmData.active}/${swarmData.total} agents · ${swarmData.tasksDone} tasks` : `DISABLED - all ${swarmData.total} agents idle`, color: 'amber', dotColor: '#5dba8f' },
            ].map(({ label, active, desc, dotColor }) => (
              <div key={label} className="px-4 py-2.5 flex items-start gap-3">
                <span
                  className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                  style={{ backgroundColor: active ? dotColor : '#373c44', boxShadow: 'none' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}>{label}</span>
                    {!active && <span className="text-[9px] text-bad-400/70 bg-bad-950/40 px-1 rounded">OFF</span>}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${active ? 'text-ink-400' : 'text-ink-600'}`}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-ink-500 px-1 pt-1">Subsystems</div>

        {systemDefs.map((s) => (
          <div
            key={s.name}
            onMouseEnter={() => setActiveSystem(s.name)}
            onMouseLeave={() => setActiveSystem(null)}
            className={`flex items-start justify-between px-4 py-3 rounded-xl border transition-all cursor-default ${
              activeDef?.name === s.name ? s.activeClass : 'bg-ink-900/50 border-ink-800 hover:border-ink-700'
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
                  <span className="text-sm font-semibold text-white">{s.label}</span>
                </div>
                <div className={`text-lg font-semibold mt-0.5 ${activeDef?.name === s.name ? 'text-white' : 'text-ink-200'}`}>
                  {s.value}
                </div>
                <div className="text-[10px] text-ink-400 mt-0.5">{s.sub}</div>
                <div className="text-[10px] mt-1 opacity-60">{s.activityLabel}</div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 pt-1">
              <div
                className="w-14 h-1.5 rounded-full bg-ink-800 overflow-hidden"
                title={`Activity: ${(s.activity * 100).toFixed(0)}%`}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${s.activity * 100}%`, backgroundColor: s.hex }}
                />
              </div>
              <div className="text-[10px] text-ink-500">{(s.activity * 100).toFixed(0)}%</div>
            </div>
          </div>
        ))}

        <div className="pt-1 px-1 space-y-2">
          <div className="flex items-start gap-2 py-3 px-4 rounded-xl border border-ink-800 bg-ink-950/60">
            <Zap className="w-4 h-4 text-warn-400 mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-ink-400 leading-relaxed">
              {live?.forge.materializedCount !== undefined && live.forge.materializedCount > 0 ? (
                <>
                  <span className="text-ok-300 font-semibold">{live.forge.materializedCount}</span>
                  {' tools materialized from '}
                  <span className="text-accent-300">{live.forge.agendaCount}</span>
                  {' in forge agenda'}
                  {live.forge.failedCount > 0 && (
                    <span className="ml-2 text-bad-400">· {live.forge.failedCount} failed</span>
                  )}
                </>
              ) : 'Forge loop warming up - generation will materialize tools as agenda fills.'}
            </div>
          </div>

          <div className="flex items-start gap-2 py-3 px-4 rounded-xl border border-ink-800 bg-ink-950/60">
            <Cpu className="w-4 h-4 text-ok-400 mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-ink-400 leading-relaxed">
              <div className="text-ink-300 mb-1">Growth decision</div>
              {live?.lastDecision?.decisionEntropy !== undefined ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-ink-400">entropy</span>
                    <span className="text-warn-300 font-semibold">{live.lastDecision.decisionEntropy.toFixed(3)}</span>
                    {live.lastDecision.decisionEntropy > 3 && (
                      <span className="text-[10px] text-bad-400">(high - uncertain)</span>
                    )}
                    {live.lastDecision.decisionEntropy <= 1 && (
                      <span className="text-[10px] text-ok-400">(converged)</span>
                    )}
                  </div>
                  {live.lastDecision.selectedAction?.title ? (
                    <div>
                      <span className="text-ink-400">action </span>
                      <span className="text-ok-300">{live.lastDecision.selectedAction.title}</span>
                      {live.lastDecision.selectedAction.computedUtilityScore !== undefined && (
                        <span className="ml-2 text-accent-300">
                          {(live.lastDecision.selectedAction.computedUtilityScore * 100).toFixed(1)}% utility
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-ink-500">no action selected yet</div>
                  )}
                </>
              ) : (
                <div className="text-ink-500">no decision data</div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 py-3 px-4 rounded-xl border border-ink-800 bg-ink-950/60">
            <Layers className="w-4 h-4 text-accent-400 mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-ink-400 leading-relaxed">
              <div className="text-ink-300 mb-1">Forge pipeline</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 text-ink-500">plan</div>
                  <div className="flex-1 h-1.5 bg-ink-800 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-500 rounded-full" style={{ width: '100%' }} />
                  </div>
                  <div className="w-16 text-right text-accent-300">{live?.forge.agendaCount ?? 0} specs</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 text-ink-500">forge</div>
                  <div className="flex-1 h-1.5 bg-ink-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ok-500 rounded-full transition-all duration-700"
                      style={{ width: live ? `${Math.min(100, (live.forge.materializedCount / 30) * 100)}%` : '0%' }}
                    />
                  </div>
                  <div className="w-16 text-right text-ok-300">{live?.forge.materializedCount ?? 0} done</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 text-ink-500">fail</div>
                  <div className="flex-1 h-1.5 bg-ink-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-bad-500 rounded-full transition-all duration-700"
                      style={{ width: live && live.forge.ledgerCount > 0 ? `${Math.min(100, (live.forge.failedCount / live.forge.ledgerCount) * 100)}%` : '0%' }}
                    />
                  </div>
                  <div className="w-16 text-right text-bad-400">{live?.forge.failedCount ?? 0} failed</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

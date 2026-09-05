import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RefreshCw, Box, GitBranch } from 'lucide-react';

// ---------------------------------------------------------------
//  Data model — the "systems" Recourse talks to. Each system is a
//  colored satellite orbiting the Core, wired by a data stream.
// ---------------------------------------------------------------
interface SystemDef {
  name: string;
  label: string;
  color: number;
  hex: string;
  activeClass: string;
  slot: number;
}

const SYSTEMS: SystemDef[] = [
  { name: 'intake',    label: 'INTAKE',    color: 0xef4444, hex: '#ef4444', activeClass: 'bg-red-500/20 text-red-300 border-red-500/40',    slot: 0 },
  { name: 'growth',    label: 'GROWTH',    color: 0x22c55e, hex: '#22c55e', activeClass: 'bg-green-500/20 text-green-300 border-green-500/40', slot: 1 },
  { name: 'repair',    label: 'REPAIR',    color: 0x06b6d4, hex: '#06b6d4', activeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',     slot: 2 },
  { name: 'benchmark', label: 'BENCHMARK', color: 0xf59e0b, hex: '#f59e0b', activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',     slot: 3 },
  { name: 'dreaming',  label: 'DREAMING',  color: 0xa855f7, hex: '#a855f7', activeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',  slot: 4 },
  { name: 'genome',    label: 'GENOME',    color: 0x3b82f6, hex: '#3b82f6', activeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',    slot: 5 },
];

// Sphere radius the satellites orbit on.
const ORBIT_RADIUS = 5.2;

// Place satellites evenly on a ring with a slight vertical tilt.
function systemPosition(slot: number): THREE.Vector3 {
  const angle = (slot / SYSTEMS.length) * Math.PI * 2;
  const y = Math.sin(angle) * ORBIT_RADIUS * 0.42;
  const r = Math.sqrt(Math.max(ORBIT_RADIUS * ORBIT_RADIUS - y * y, 0.001));
  return new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
}

// A label sprite built from a canvas so it never depends on an asset.
function makeLabelSprite(text: string, colorHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 52px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colorHex;
  ctx.shadowBlur = 18;
  ctx.fillStyle = colorHex;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 1.1, 1);
  return sprite;
}

// A faint starfield on a shell.
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
  const mat = new THREE.PointsMaterial({
    color: 0x9aa8c9,
    size: 0.06,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

// Layered core: solid dodecahedron + wireframe shell that breathes.
function makeCore(): { inner: THREE.Mesh; outer: THREE.Mesh } {
  const inner = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.15, 0),
    new THREE.MeshStandardMaterial({
      color: 0x7c8cff,
      emissive: 0x3c5cff,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.8,
      flatShading: true,
    })
  );
  const outer = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.65, 1),
    new THREE.MeshBasicMaterial({ color: 0x6d7bff, wireframe: true, transparent: true, opacity: 0.22 })
  );
  return { inner, outer };
}

// A particle trail that carries "data packets" from the core out to a
// satellite. Particles ride the core->satellite axis and reset once they
// arrive, giving a continuous one-way flow per system.
function makeStream(color: number, dir: THREE.Vector3): { points: THREE.Points; ts: Float32Array } {
  const count = 26;
  const ts = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.random() * ORBIT_RADIUS * 0.9;
    ts[i] = t;
    positions[i * 3] = dir.x * t;
    positions[i * 3 + 1] = dir.y * t;
    positions[i * 3 + 2] = dir.z * t;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size: 0.09,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return { points: new THREE.Points(geo, mat), ts };
}

export function RecourseVisualizer3D(_props: { status?: unknown }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const [live, setLive] = useState<{ uptime: number; gen: number; ready: number; pending: number } | null>(null);

  // ---- Live state polling (drives the HUD readouts) ----
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/recourse/status').then((r) => r.json());
        if (!mounted) return;
        const st = res?.status;
        setLive({
          uptime: st?.uptimeSeconds ?? 0,
          gen: st?.generation ?? 1,
          ready: st?.readinessScore ?? 0,
          pending: st?.pendingApprovalsCount ?? 0,
        });
      } catch {
        if (mounted) setLive(null);
      }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // ---- 3D scene ----
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
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;
    controls.minDistance = 4;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.72;

    // Lights
    scene.add(new THREE.AmbientLight(0x445066, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(6, 10, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6d7bff, 1.4);
    rim.position.set(-8, -4, -8);
    scene.add(rim);

    // Core
    const { inner, outer } = makeCore();
    scene.add(inner);
    scene.add(outer);

    // Grid floor
    const grid = new THREE.GridHelper(40, 40, 0x1b2448, 0x11192f);
    grid.position.y = -5.2;
    const gridMat = grid.material;
    gridMat.transparent = true;
    gridMat.opacity = 0.35;
    scene.add(grid);

    // Stars
    scene.add(makeStarField());

    // Systems + labels + lines + data streams
    const satelliteMeshes: THREE.Mesh[] = [];
    const streams: { points: THREE.Points; ts: Float32Array; dir: THREE.Vector3 }[] = [];

    for (const def of SYSTEMS) {
      const pos = systemPosition(def.slot);

      const sphere = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.42, 1),
        new THREE.MeshStandardMaterial({
          color: def.color,
          emissive: def.color,
          emissiveIntensity: 1.15,
          roughness: 0.3,
          metalness: 0.6,
          flatShading: true,
        })
      );
      sphere.position.copy(pos);
      sphere.userData = { system: def.name };
      satelliteMeshes.push(sphere);
      scene.add(sphere);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.025, 8, 40),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.55 })
      );
      ring.position.copy(pos);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);

      const light = new THREE.PointLight(def.color, 7, 5);
      light.position.copy(pos);
      scene.add(light);

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
      streams.push({ ...stream, dir: pos.clone().normalize() });
    }

    // ---- Animation loop ----
    let raf = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();

      inner.rotation.y += dt * 0.35;
      inner.rotation.x += dt * 0.12;
      outer.rotation.y -= dt * 0.22;
      outer.scale.setScalar(1.3 * (1 + Math.sin(t * 1.4) * 0.06));

      for (const m of satelliteMeshes) {
        m.rotation.y += dt * 0.5;
        m.position.y += Math.sin(t * 1.8 + m.position.x) * 0.0012;
      }

      for (const s of streams) {
        const attr = s.points.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const count = arr.length / 3;
        for (let i = 0; i < count; i++) {
          let t = s.ts[i] + 0.6 * dt;
          if (t >= ORBIT_RADIUS * 0.92) {
            t = Math.random() * 0.4;
          }
          s.ts[i] = t;
          // jitter so the stream isn't a perfectly rigid line
          arr[i * 3] = s.dir.x * t + (Math.random() - 0.5) * 0.04;
          arr[i * 3 + 1] = s.dir.y * t + (Math.random() - 0.5) * 0.04;
          arr[i * 3 + 2] = s.dir.z * t + (Math.random() - 0.5) * 0.04;
        }
        attr.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    // Mouse-hover highlight
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(satelliteMeshes, false);
      const hit = hits[0]?.object as THREE.Mesh | undefined;
      setActiveSystem(hit?.userData?.system ?? null);
    };
    renderer.domElement.addEventListener('pointermove', onMove);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      controls.dispose();
      scene.traverse((obj) => {
        const anyObj = obj as any;
        if (anyObj.geometry?.dispose) anyObj.geometry.dispose();
        const m = anyObj.material;
        if (Array.isArray(m)) m.forEach((mm: THREE.Material) => mm.dispose());
        else if (m?.dispose) m.dispose();
      });
      scene.clear();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, []);

  const activeDef = SYSTEMS.find((s) => s.name === activeSystem) ?? null;
  const fmt = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      {/* 3D canvas */}
      <div
        ref={containerRef}
        className="relative h-[560px] rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden shadow-[0_0_60px_rgba(99,102,241,0.12)]"
      >
        <div className="absolute top-4 left-4 pointer-events-none select-none">
          <div className="font-mono text-[11px] text-indigo-300 tracking-widest px-3 py-2 rounded-lg bg-slate-950/70 border border-indigo-800/40 backdrop-blur">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
              <span className="font-bold text-white">RECOURSE · LIVE</span>
            </div>
            <div className="mt-1 text-slate-400">{live ? `GEN ${live.gen}` : '—'}</div>
          </div>
        </div>

        <div className="absolute top-4 right-4 pointer-events-none select-none">
          <div className="font-mono text-[11px] px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 backdrop-blur text-slate-300">
            <div className="text-slate-400">UPTIME</div>
            <div className="text-indigo-300 font-bold">{live ? fmt(live.uptime) : '—'}</div>
            <div className="mt-1 text-slate-400">READINESS</div>
            <div className="text-emerald-300 font-bold">{live ? `${(live.ready * 100).toFixed(0)}%` : '—'}</div>
            <div className="mt-1 text-slate-400">PENDING GENES</div>
            <div className="text-amber-300 font-bold">{live ? live.pending : '—'}</div>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 pointer-events-none">
          <div className="text-[11px] font-mono text-slate-500">drag to orbit · scroll to zoom</div>
        </div>

        <div className="absolute bottom-4 right-4 pointer-events-none">
          <div
            className={`font-mono text-[11px] px-3 py-2 rounded-lg border backdrop-blur transition-colors ${
              activeDef ? activeDef.activeClass : 'bg-slate-950/70 border-slate-800 text-slate-400'
            }`}
          >
            {activeDef ? (
              <>
                <div className="font-bold text-white">{activeDef.label}</div>
                <div className="text-[10px] opacity-80">hovering</div>
              </>
            ) : (
              <div className="text-slate-500">HOVER A SYSTEM</div>
            )}
          </div>
        </div>
      </div>

      {/* Right: system index */}
      <div className="space-y-3">
        <div className="font-mono text-xs text-slate-400 tracking-widest">SYSTEMS ONLINE</div>
        {SYSTEMS.map((s) => (
          <div
            key={s.name}
            className={`flex items-center justify-between px-4 py-3 rounded-xl border transition cursor-default ${
              activeDef?.name === s.name ? s.activeClass : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full shadow-[0_0_10px_currentColor]"
                style={{ backgroundColor: s.hex, color: s.hex }}
              />
              <span className="font-mono text-sm font-bold text-white">{s.label}</span>
            </div>
            <GitBranch className="w-4 h-4 opacity-40" />
          </div>
        ))}
        <div className="pt-2 px-1">
          <div className="flex items-center gap-2 py-3 px-4 rounded-xl border border-slate-800 bg-slate-950/60">
            <Box className="w-4 h-4 text-indigo-400" />
            <span className="font-mono text-[11px] text-slate-400">
              Core synthesizes data streams into autonomous growth decisions.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

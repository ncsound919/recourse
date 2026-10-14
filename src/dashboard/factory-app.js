import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';

const API = '';

/* ================================================================== *
 * Machinery assembly line.
 *
 * The scene represents the TOOL BEING BUILT. A conveyor feeds five
 * stations (TELEMETRY → IDEAS → FACTORY → FORGE → ARTIFACTS); each is a
 * machine with spinning gears and a pumping piston. The current build
 * assembles part-by-part on the jig at ARTIFACTS, then rolls onto a
 * shelf as a finished unit.
 *
 * COLOUR CODES (also in the HUD legend):
 *   part colour = artifact KIND
 *     feature  #6366f1   component #587de3   service  #22d3ee
 *     hook     #a78bfa   page      #f0ee97   doc      #e1df8d
 *     project  #22c55e   batch     #f472b6   other    #94a3b8
 *   part glow   = build STATE
 *     building #f0ee97 (hot)   verified #22c55e (green)   failed #e879f9 (magenta)
 * ================================================================== */
const KIND_COLOR = {
  feature: 0x6366f1, component: 0x587de3, service: 0x22d3ee, hook: 0xa78bfa,
  page: 0xf0ee97, doc: 0xe1df8d, project: 0x22c55e, batch: 0xf472b6,
};
const STATE = { building: 0xf0ee97, verified: 0x22c55e, failed: 0xe879f9 };
const STEEL = 0x9aa4bb, RAIL = 0x39435c;

const STATIONS = [
  { id: 'telemetry', label: 'TELEMETRY', color: 0x587de3 },
  { id: 'ideas',     label: 'IDEAS',     color: 0xf0ee97 },
  { id: 'factory',   label: 'FACTORY',   color: 0x6366f1 },
  { id: 'forge',     label: 'FORGE',     color: 0xe1df8d },
  { id: 'artifacts', label: 'ARTIFACTS', color: 0x22c55e },
];
const SX = [-16, -8, 0, 8, 16];
const JIG = new THREE.Vector3(16, -0.3, 2.2);
const FEEDER = new THREE.Vector3(-21, 1.6, 2.6);
const SHAPE_CYCLE = ['plate', 'drum', 'ring', 'nozzle', 'core', 'bolt'];

/* ---------- builders ---------- */
function partMesh(shape, color, emissive, glow) {
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.62, roughness: 0.34, emissive, emissiveIntensity: glow });
  let m;
  switch (shape) {
    case 'drum':   m = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.5, 18), mat); break;
    case 'ring':   m = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 12, 26), mat); m.rotation.x = Math.PI / 2; break;
    case 'nozzle': m = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.56, 18), mat); break;
    case 'core':   m = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), mat); break;
    case 'bolt':   m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.72, 12), mat); break;
    default:       m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.62), mat);
  }
  m.userData.mat = mat;
  m.scale.setScalar(1.25);
  return m;
}

function makeGear(radius, thickness, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.78, roughness: 0.3, emissive: color, emissiveIntensity: 0.22 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, 24), mat);
  disc.rotation.x = Math.PI / 2; g.add(disc);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.32, radius * 0.32, thickness * 1.3, 14),
    new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.85, roughness: 0.28 }));
  hub.rotation.x = Math.PI / 2; g.add(hub);
  for (let i = 0; i < 10; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.26, thickness * 1.02, radius * 0.22), mat);
    const a = (i / 10) * Math.PI * 2;
    tooth.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    tooth.rotation.z = a; g.add(tooth);
  }
  return g;
}

function makeLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 256;
  const tex = new THREE.CanvasTexture(canvas);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(9, 2.25, 1);
  const draw = (title, sub) => {
    const x = canvas.getContext('2d');
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.textAlign = 'center';
    x.fillStyle = 'rgba(255,255,255,.95)'; x.font = '600 74px JetBrains Mono, monospace';
    x.fillText(title, 512, 120);
    x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '400 44px DM Sans, sans-serif';
    x.fillText(sub, 512, 190);
    tex.needsUpdate = true;
  };
  return { spr, draw };
}

/* ---------- scene ---------- */
function Scene({ busRef }) {
  const host = useRef(null);
  useEffect(() => {
    const el = host.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (e) {
      el.innerHTML = '<div class="offline">3D pipeline disabled — WebGL unavailable in this browser</div>';
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0d14, 0.010);
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
    camera.position.set(0, 7.0, 25);
    camera.lookAt(0, 0.8, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    scene.add(new THREE.HemisphereLight(0x8ea2ff, 0x0a0d14, 0.65));
    const key = new THREE.DirectionalLight(0xaab4ff, 1.6); key.position.set(12, 20, 14); scene.add(key);
    const rim = new THREE.PointLight(0xe1df8d, 1.0, 100); rim.position.set(-20, -4, 14); scene.add(rim);
    const work = new THREE.PointLight(0xf0ee97, 1.2, 50); work.position.set(16, 4, 4); scene.add(work);

    const floor = new THREE.GridHelper(160, 80, 0x2a3550, 0x1a2130);
    floor.position.y = -2.4; scene.add(floor);

// THREE.Timer replaces the deprecated THREE.Clock (three r186). update() must be
// called once per frame; getDelta() and getElapsed() are then read from it.
const timer = new THREE.Timer();
const timers = [];
const at = (delay, fn) => timers.push({ t: timer.getElapsed() + delay, fn });

    // base rail + moving conveyor treads
    const rail = new THREE.Mesh(new THREE.BoxGeometry(44, 0.7, 4.4),
      new THREE.MeshStandardMaterial({ color: RAIL, metalness: 0.7, roughness: 0.4 }));
    rail.position.set(0, -1.9, 0); scene.add(rail);
    const treadMat = new THREE.MeshStandardMaterial({ color: 0x39435a, metalness: 0.6, roughness: 0.5 });
    const treadGeo = new THREE.BoxGeometry(1.4, 0.22, 4.0);
    const treads = [];
    for (let i = 0; i < 30; i++) {
      const t = new THREE.Mesh(treadGeo, treadMat);
      t.position.set(-22 + i * 1.5, -1.5, 0); scene.add(t); treads.push(t);
    }

    // stations: housing + gears + coloured ring + status lamp + piston
    const stations = {};
    STATIONS.forEach((s, i) => {
      const g = new THREE.Group(); g.position.set(SX[i], -0.55, 0);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.9, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x3d4863, metalness: 0.7, roughness: 0.4 })));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.09, 14, 60),
        new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.95 }));
      ring.position.z = 1.25; g.add(ring);
      const gearBig = makeGear(0.85, 0.32, s.color); gearBig.position.set(-0.55, 0.05, 1.35); g.add(gearBig);
      const gearSmall = makeGear(0.5, 0.28, STEEL); gearSmall.position.set(0.7, -0.35, 1.4); g.add(gearSmall);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16),
        new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 1.0 }));
      lamp.position.set(0, 1.25, 0.4); g.add(lamp);
      const piston = new THREE.Group();
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 12),
        new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.9, roughness: 0.25 }));
      rod.position.y = 0.55; piston.add(rod);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.22, 16),
        new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.35, metalness: 0.6 }));
      cap.position.y = 1.12; piston.add(cap);
      piston.position.set(0, 1.0, -0.4); g.add(piston);
      scene.add(g);
      stations[s.id] = { group: g, gearBig, gearSmall, ring, lamp, piston, pulse: 0 };
    });

    // robotic arm at FACTORY
    const armMat = new THREE.MeshStandardMaterial({ color: 0x59637d, metalness: 0.8, roughness: 0.3 });
    const arm = new THREE.Group(); arm.position.set(0, -0.2, 2.6); scene.add(arm);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.4, 16), armMat); mast.position.y = 0.7; arm.add(mast);
    const shoulder = new THREE.Group(); shoulder.position.y = 1.4; arm.add(shoulder);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.0, 0.34), armMat); upper.position.y = 1.5; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = 3.0; shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.2, 0.26), armMat); fore.position.y = 1.1; elbow.add(fore);
    const gripper = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 12),
      new THREE.MeshStandardMaterial({ color: 0xf0ee97, emissive: 0xf0ee97, emissiveIntensity: 0.4, metalness: 0.6 }));
    gripper.position.y = 2.3; gripper.rotation.x = Math.PI; elbow.add(gripper);

    // feeder chute
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x2f3646, metalness: 0.6, roughness: 0.5 }));
    chute.position.set(-21.5, 2.4, 2.6); chute.rotation.z = 0.5; scene.add(chute);

    // shelf for finished units
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 4),
      new THREE.MeshStandardMaterial({ color: RAIL, metalness: 0.6, roughness: 0.5 }));
    shelf.position.set(27, -1.6, 0); scene.add(shelf);

    // ---- live process indicators ----
    const activity = {};          // stationId -> 0..1 decaying activity
    const meters = {};
    STATIONS.forEach((s, i) => {
      activity[s.id] = 0;
      const track = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x232c3e, transparent: true, opacity: 0.55 }));
      track.position.set(SX[i], 3.1, -0.05); scene.add(track);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1, 0.2),
        new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 1.2 }));
      bar.scale.y = 0.05; bar.position.set(SX[i], 2.2, 0.05); scene.add(bar);
      meters[s.id] = bar;
    });
    // continuous conveyor packets — the line always runs
    const packets = [];
    const packetMat = new THREE.MeshStandardMaterial({ color: 0x9ec2ff, emissive: 0x6f8fff, emissiveIntensity: 1.2 });
    for (let i = 0; i < 28; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), packetMat);
      p.position.set(-22 + i * 1.6, -1.1, 0); scene.add(p); packets.push(p);
    }
    // global-load flywheel — spins with real throughput
    const flywheel = makeGear(1.7, 0.45, 0x6f8fff);
    flywheel.position.set(-25, 2.6, -3); scene.add(flywheel);
    let load = 0;

    // product jig + label
    const jig = new THREE.Group(); jig.position.copy(JIG); scene.add(jig);
    const jigBase = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.4, 28),
      new THREE.MeshStandardMaterial({ color: 0x2b3346, metalness: 0.7, roughness: 0.4 }));
    jigBase.position.y = -0.5; jig.add(jigBase);
    const jigRing = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.06, 12, 60),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.5 }));
    jigRing.rotation.x = Math.PI / 2; jigRing.position.y = -0.28; jig.add(jigRing);
    const label = makeLabel(); label.spr.position.set(JIG.x, 3.9, JIG.z); scene.add(label.spr);
    label.draw('line idle', 'awaiting the next build');

    const parts = [];
    const billets = [];
    const finished = [];
    let shelfSlot = 0;
    const slotOf = (i) => ({
      x: JIG.x + ((i % 3) - 1) * 0.72,
      y: JIG.y - 0.2 + Math.floor(i / 3) * 0.6,
      z: JIG.z + (i % 2 ? 0.4 : -0.4),
    });
    const shelfPos = () => {
      const col = shelfSlot % 5, row = Math.floor(shelfSlot / 5);
      return new THREE.Vector3(24 + col * 1.4 - 2.8, -1.2 + row * 1.1, 0);
    };

    // A finished machine: a compact cluster of parts on the shelf.
    const placeFinished = (kind, ok, count) => {
      const color = KIND_COLOR[kind] ?? 0x94a3b8;
      const unit = new THREE.Group();
      const n = Math.max(1, Math.min(6, count || 3));
      for (let i = 0; i < n; i++) {
        const m = partMesh(SHAPE_CYCLE[i % SHAPE_CYCLE.length], color, ok ? STATE.verified : STATE.failed, 0.4);
        m.position.set(((i % 3) - 1) * 0.5, Math.floor(i / 3) * 0.5, (i % 2 ? 0.3 : -0.3));
        unit.add(m);
      }
      unit.position.copy(shelfPos()); unit.scale.setScalar(0.9);
      scene.add(unit); finished.push(unit); shelfSlot++;
      return unit;
    };

    // ---- event bus ----
    const pulse = (id) => { const s = stations[id]; if (s) s.pulse = 1; if (id in activity) activity[id] = Math.min(1, activity[id] + 0.6); };
    const feed = () => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xf0ee97, emissive: 0xf0ee97, emissiveIntensity: 1 }));
      b.position.copy(FEEDER); scene.add(b); billets.push({ mesh: b, t: 0 });
    };
    const assemble = (kind, ok, count, title, quiet) => {
      if (quiet) { placeFinished(kind, ok, count); return; }
      const color = KIND_COLOR[kind] ?? 0x94a3b8;
      label.draw(String(title || kind).slice(0, 44), ok ? 'assembling · verified' : 'assembling · failed');
      const n = Math.max(1, Math.min(12, count || 3));
      for (let i = 0; i < n; i++) {
        at(i * 0.16, () => {
          const mesh = partMesh(SHAPE_CYCLE[i % SHAPE_CYCLE.length], color, STATE.building, 0.9);
          mesh.position.copy(FEEDER); scene.add(mesh);
          const slot = slotOf(i);
          parts.push({ mesh, from: FEEDER.clone(), to: new THREE.Vector3(slot.x, slot.y, slot.z), t: 0, done: false });
        });
      }
      at(n * 0.16 + 0.9, () => {
        const stateColor = ok ? STATE.verified : STATE.failed;
        for (const p of parts) { const mt = p.mesh.userData.mat; if (mt) { mt.emissive.setHex(stateColor); mt.emissiveIntensity = 0.55; } }
        pulse('artifacts');
      });
      at(n * 0.16 + 1.9, () => {
        const unit = new THREE.Group();
        for (const p of parts) { p.mesh.position.set(p.to.x - JIG.x, p.to.y - JIG.y, p.to.z - JIG.z); unit.add(p.mesh); }
        unit.position.copy(shelfPos()); unit.scale.setScalar(0.9);
        scene.add(unit); finished.push(unit); shelfSlot++;
        parts.length = 0;
        label.draw('line idle', 'awaiting the next build');
      });
    };
    const stamp = () => {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 24),
        new THREE.MeshStandardMaterial({ color: 0xe1df8d, emissive: 0xe1df8d, emissiveIntensity: 0.6, metalness: 0.6 }));
      disc.position.set(JIG.x, 6.5, JIG.z); scene.add(disc);
      at(0.35, () => { disc.position.y = 1.2; });
      at(0.9, () => { disc.position.y = 6.5; });
      at(1.5, () => { scene.remove(disc); disc.geometry.dispose(); disc.material.dispose(); });
    };
    const setLoad = (n) => { load = Math.max(0, Math.min(1, Number(n) || 0)); };
    busRef.current = { pulse, feed, assemble, stamp, setLoad };

    // ---- animation ----
    const parallax = { x: 0, y: 0 };
    const onMove = (e) => { parallax.x = e.clientX / innerWidth - 0.5; parallax.y = e.clientY / innerHeight - 0.5; };
    addEventListener('pointermove', onMove);

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    let raf;
    const render = () => {
      // THREE.Timer has no built-in max-delta in r186, so clamp here: a backgrounded
      // tab must not resume with one huge step that teleports every animation.
      timer.update();
      const dt = Math.min(0.05, timer.getDelta());
      const t = timer.getElapsed();

      for (const id in stations) {
        const s = stations[id];
        s.gearBig.rotation.z += dt * 1.3;
        s.gearSmall.rotation.z -= dt * 1.9;
        s.piston.position.y = 1.0 + Math.sin(t * 3 + s.group.position.x) * 0.22;
        if (s.pulse > 0) {
          s.pulse = Math.max(0, s.pulse - dt * 1.6);
          s.ring.material.emissiveIntensity = 0.7 + s.pulse * 2.2;
          s.lamp.material.emissiveIntensity = 1.0 + s.pulse * 2.5;
          s.group.scale.setScalar(1 + s.pulse * 0.16);
        } else { s.group.scale.setScalar(1); }
      }
      const pspeed = 2.5 + load * 9.0;
      for (const tr of treads) { tr.position.x += dt * (1.5 + load * 3.0); if (tr.position.x > 22) tr.position.x -= 45; }
      for (const p of packets) { p.position.x += dt * pspeed; if (p.position.x > 22) p.position.x -= 44; p.rotation.y += dt * 3; }
      flywheel.rotation.z += dt * (0.6 + load * 7.0);
      for (const id in activity) {
        activity[id] = Math.max(0, activity[id] - dt * 0.35);
        const bar = meters[id];
        const hgt = 0.05 + activity[id] * 2.4;
        bar.scale.y = hgt; bar.position.y = 2.2 + hgt / 2;
        bar.material.emissiveIntensity = 0.5 + activity[id] * 1.6;
      }
      arm.rotation.y = Math.sin(t * 0.8) * 0.6;
      shoulder.rotation.x = -0.5 + Math.sin(t * 1.1) * 0.35;
      elbow.rotation.x = 0.7 + Math.sin(t * 1.1 + 0.6) * 0.5;

      for (const p of parts) {
        if (p.done) continue;
        p.t = Math.min(1, p.t + dt / 0.75);
        const e = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2;
        p.mesh.position.set(
          p.from.x + (p.to.x - p.from.x) * e,
          p.from.y + (p.to.y - p.from.y) * e + Math.sin(e * Math.PI) * 2.2,
          p.from.z + (p.to.z - p.from.z) * e,
        );
        p.mesh.rotation.x += dt * 4; p.mesh.rotation.y += dt * 3;
        if (p.t >= 1) { p.done = true; p.mesh.rotation.set(0, 0, 0); }
      }
      for (let i = billets.length - 1; i >= 0; i--) {
        const b = billets[i];
        b.t = Math.min(1, b.t + dt / 1.6);
        b.mesh.position.set(FEEDER.x + (SX[2] - FEEDER.x) * b.t, FEEDER.y - b.t * 3.0, FEEDER.z - b.t * 2.6);
        b.mesh.material.emissiveIntensity = 1 - b.t * 0.5;
        if (b.t >= 1) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); billets.splice(i, 1); }
      }
      for (let i = timers.length - 1; i >= 0; i--) {
        if (t >= timers[i].t) { const fn = timers[i].fn; timers.splice(i, 1); try { fn(); } catch (e) {} }
      }

      camera.position.x += (parallax.x * 3.0 - camera.position.x) * 0.03;
      camera.position.y += (7.0 - parallax.y * 2.0 - camera.position.y) * 0.03;
      camera.lookAt(0, 0.8, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      removeEventListener('resize', onResize); removeEventListener('pointermove', onMove);
      renderer.dispose(); el.innerHTML = '';
    };
  }, [busRef]);

  const h = React.createElement;
  const legend = [
    ['feature', '#6366f1'], ['component', '#587de3'], ['service', '#22d3ee'],
    ['doc', '#e1df8d'], ['project', '#22c55e'],
  ];
  return h('div', { className: 'canvas-wrap' },
    h('div', { id: 'scene', ref: host }),
    h('div', { className: 'hud' },
      h('div', { className: 'hud-title' }, 'assembly line · the tool under construction'),
      h('div', { className: 'legend' },
        legend.map(([k, c]) => h('span', { key: k, className: 'lg' }, h('i', { style: { background: c } }), k)),
        h('span', { className: 'lg sep' }, h('i', { style: { background: '#f0ee97' } }), 'building'),
        h('span', { className: 'lg' }, h('i', { style: { background: '#22c55e' } }), 'verified'),
        h('span', { className: 'lg' }, h('i', { style: { background: '#e879f9' } }), 'failed')
      )
    )
  );
}

/* ---------- app ---------- */
function App() {
  const busRef = useRef(null);
  const [state, setState] = useState(null);
  const [events, setEvents] = useState([]);
  const [live, setLive] = useState(false);
  const [lastEventAt, setLastEventAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const seen = useRef(new Set());

  const pushEvent = (e) => {
    if (!e || seen.current.has(e.seq)) return;
    seen.current.add(e.seq);
    setEvents((prev) => [e, ...prev].slice(0, 200));
    setLastEventAt((t) => Math.max(t, e.at || 0));
  };

  const loadState = () => fetch(API + '/api/recourse/factory/state').then((r) => r.json()).then((s) => {
    setState(s);
    (s.events ?? []).forEach(pushEvent);
    (s.artifacts ?? []).forEach((a) => busRef.current?.assemble(a.kind, a.verification?.ok !== false, (a.files || []).length, a.id, true));
  }).catch(() => {});

  useEffect(() => {
    loadState();
    const es = new EventSource(API + '/api/recourse/factory/stream');
    es.addEventListener('hello', () => setLive(true));
    es.addEventListener('factory', (m) => {
      const e = JSON.parse(m.data);
      pushEvent(e);
      const bus = busRef.current;
      if (!bus) return;
      if (e.type === 'idea.consumed') {
        bus.pulse('ideas'); bus.feed();
        bus.pulse(e.detail?.lane === 'factory' ? 'factory' : 'forge');
      } else if (e.type === 'artifact.built' || e.type === 'artifact.failed') {
        bus.pulse('factory');
        bus.assemble(e.detail.kind, e.type === 'artifact.built', e.detail.files ?? 4, e.detail.id);
      } else if (e.type === 'science.logged') {
        bus.stamp();
      }
    });
    es.onerror = () => setLive(false);
    const poll = setInterval(loadState, 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { es.close(); clearInterval(poll); clearInterval(tick); };
  }, []);

  const totals = state?.totals ?? {};
  const artifacts = state?.artifacts ?? [];
  const jobs = state?.extra?.jobs ?? [];
  const engine = state?.engine ?? {};

  const since = lastEventAt ? Math.max(0, Math.round((now - lastEventAt) / 1000)) : null;
  const working = since != null && since <= 15;

  const buckets = useMemo(() => {
    const B = 30, W = 4000, t0 = now - B * W;
    const arr = new Array(B).fill(0);
    for (const e of events) { const i = Math.floor(((e.at || 0) - t0) / W); if (i >= 0 && i < B) arr[i]++; }
    return arr;
  }, [events, now]);
  const perMin = useMemo(() => events.filter((e) => (e.at || 0) > now - 60000).length, [events, now]);

  useEffect(() => { busRef.current?.setLoad(Math.min(1, perMin / 12)); }, [perMin]);

  const idleLoop = jobs.find((j) => (j.skipCount || 0) > 0 && j.runCount === j.skipCount);
  const fmt = (t) => new Date(t).toLocaleTimeString([], { hour12: false });
  const h = React.createElement;

  return h('div', { className: 'app' },
    h('header', { className: 'bar' },
      h('div', { className: 'brand' }, h('h1', null, 'Recourse · Software Factory'),
        h('small', null, 'deterministic scaffold + verified generation')),
      h('div', { className: 'spacer' }),
      h('span', { className: 'chip' }, h('span', { className: `dot ${live ? 'on pulse' : 'off'}` }), live ? 'stream live' : 'stream down'),
      h('span', { className: 'chip' }, h('span', { className: `dot ${working ? 'on pulse' : 'off'}` }), working ? 'working' : 'idle'),
      h('span', { className: 'chip' }, 'engine ' + (engine.available ? 'live' : 'offline')),
      h('span', { className: 'chip' }, 'artifacts ' + (totals.artifacts ?? 0)),
      h('span', { className: 'chip' }, 'files ' + (totals.files ?? 0)),
      h('span', { className: 'chip' }, 'verified ' + (totals.verified ?? 0)),
      h('span', { className: 'chip' }, since == null ? 'no events yet' : `last event ${since}s ago`)
    ),
    h('div', { className: `banner ${working ? 'working' : 'idle'}` },
      h('span', { className: 'state' }, h('span', { className: `dot ${working ? 'on pulse' : 'off'}` }), working ? 'WORKING' : 'IDLE'),
      h('span', { className: 'why' }, working
        ? `processing · ${perMin} events/min · ${totals.built ?? 0} built`
        : (idleLoop
            ? `idle — loop "${idleLoop.id}" skipping ${idleLoop.skipCount}×: ${String(idleLoop.detail || idleLoop.lastOutcome || '').slice(0, 64)}`
            : 'idle — awaiting a trigger (POST /factory/scaffold)')),
      h('span', { className: 'spark' }, buckets.map((v, i) => h('i', { key: i, style: { height: Math.min(100, 8 + v * 26) + '%', opacity: v ? 0.95 : 0.16 } })))
    ),
    h('div', { className: 'grid' },
      h('section', { className: 'panel' }, h('h2', null, 'Assembly line · live'), h(Scene, { busRef })),
      h('section', { className: 'panel' }, h('h2', null, `Live event feed · ${events.length}`),
        h('div', { className: 'feed' }, events.length === 0
          ? h('div', { className: 'muted', style: { padding: '10px' } }, 'no events yet — trigger a build to see the line run')
          : events.slice(0, 80).map((e) => h('div', { className: 'ev', key: e.seq },
              h('span', { className: 't' }, fmt(e.at)),
              h('span', { className: `k ${e.type.replace('.', ' ')}` }, e.type),
              h('span', { className: 'd' }, JSON.stringify(e.detail).slice(0, 90))
            ))))
    ),
    h('div', { className: 'cols' },
      h('section', { className: 'panel' }, h('h2', null, 'Artifacts · deterministic builds'),
        h('div', { className: 'scroll' }, h('table', null,
          h('thead', null, h('tr', null, ['id', 'kind', 'files', 'verified', 'at'].map((c) => h('th', { key: c }, c)))),
          h('tbody', null, artifacts.slice().reverse().map((a, idx) => h('tr', { key: a.id + ':' + idx },
            h('td', null, a.id), h('td', null, a.kind), h('td', null, (a.files || []).length),
            h('td', { className: a.verification?.ok === true ? 'ok' : a.verification?.ok === false ? 'bad' : 'warn' }, String(a.verification?.ok ?? '—')),
            h('td', null, fmt(a.at)))))))
      ),
      h('section', { className: 'panel' }, h('h2', null, 'Processes · self-feeding loops'),
        h('div', { className: 'scroll' },
          jobs.map((j) => h('div', { key: j.id, className: 'proc' },
            h('span', { className: 'nm' }, j.id),
            h('span', { className: (j.skipCount > 0 && j.runCount === j.skipCount) ? 'skip' : 'run' }, `runs ${j.runCount} · skips ${j.skipCount}`),
            h('span', { className: 'oc' }, j.lastOutcome ?? '—'),
            h('span', { className: 'det' }, j.detail ? String(j.detail) : '')
          )),
          h('div', { className: 'proc' },
            h('span', { className: 'nm' }, 'ideas'),
            h('span', { className: 'muted' }, `${state?.extra?.ideas?.built ?? 0}/${state?.extra?.ideas?.total ?? 0} built`),
            h('span', { className: 'muted' }, 'registry ' + (state?.extra?.registry?.tools ?? '—')),
            h('span', { className: 'det' }, ''))
        )
      )
    )
  );
}

createRoot(document.getElementById('root')).render(React.createElement(App));

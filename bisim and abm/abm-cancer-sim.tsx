import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

// ============================================================================
// CORE AGENT-BASED MODEL: MECHANISTIC TUMOR EVOLUTION + IMMUNE DYNAMICS
// ============================================================================

// Continuous trait space for tumor cells
class TumorCell {
  constructor(x, y, z) {
    this.pos = new THREE.Vector3(x, y, z);
    // Continuous traits [0,1] — higher = "resistance phenotype"
    this.fitnessTrait = Math.random() * 0.3; // baseline 0-0.3
    this.immunoEvasionTrait = Math.random() * 0.2;
    this.quiescenceTrait = Math.random() * 0.1;
    this.adhesionTrait = Math.random() * 0.3;
    
    // Genotype: bit vector of driver mutations
    this.drivers = new Set(); // e.g., "KRAS", "TP53", "PTEN"
    this.mutationCount = 0;
    
    // State
    this.isQuiescent = false;
    this.quiescenceDuration = 0;
    this.proliferationRate = 0.1 + this.fitnessTrait * 0.3; // 0.1-0.4
    this.deathRate = 0.02;
    
    // Metabolic state
    this.oxygenLevel = 1.0;
    this.nutrientLevel = 1.0;
    this.taxol_susceptibility = 1.0 - this.fitnessTrait; // resistance decreases susceptibility
  }

  mutate() {
    // Small probability of new driver mutation
    if (Math.random() < 0.002) {
      const drivers = ["KRAS", "TP53", "PTEN", "EGFR", "MYC"];
      const newDriver = drivers[Math.floor(Math.random() * drivers.length)];
      this.drivers.add(newDriver);
      this.mutationCount++;
      
      // Fitness gain from new mutation (diminishing returns)
      this.fitnessTrait = Math.min(0.95, this.fitnessTrait + 0.05 / (1 + this.mutationCount));
      this.proliferationRate = 0.1 + this.fitnessTrait * 0.3;
      
      // If TP53 lost, immunoEvasion increases
      if (newDriver === "TP53") {
        this.immunoEvasionTrait = Math.min(0.95, this.immunoEvasionTrait + 0.15);
      }
    }
  }

  update(oxygenField, nutrientField) {
    // Read from diffusion field
    this.oxygenLevel = oxygenField.sampleAt(this.pos) || 0.5;
    this.nutrientLevel = nutrientField.sampleAt(this.pos) || 0.5;
    
    // Metabolic stress suppresses proliferation
    const stressFactor = (this.oxygenLevel * 0.5 + this.nutrientLevel * 0.5);
    const actualProlif = this.proliferationRate * stressFactor;
    
    // Quiescence decision: high stress + hypoxia → enter quiescence
    if (this.oxygenLevel < 0.2 && !this.isQuiescent) {
      if (Math.random() < 0.3 * (1 - this.fitnessTrait)) {
        this.isQuiescent = true;
        this.quiescenceDuration = 0;
      }
    }
    
    // Exit quiescence after extended time in favorable conditions
    if (this.isQuiescent && this.oxygenLevel > 0.6 && this.nutrientLevel > 0.6) {
      this.quiescenceDuration++;
      if (this.quiescenceDuration > 50) {
        this.isQuiescent = false;
        this.quiescenceDuration = 0;
      }
    }
    
    if (this.isQuiescent) {
      this.proliferationRate *= 0.01; // minimal growth while quiescent
    }
    
    this.mutate();
  }
}

// Immune cell dynamics
class ImmuneCell {
  constructor(x, y, z, type = "CD8") {
    this.pos = new THREE.Vector3(x, y, z);
    this.type = type; // "CD8", "CD4", "Treg", "Macrophage"
    this.state = "naive"; // naive, activated, exhausted, dead
    this.activation = 0; // [0,1]
    this.exhaustion = 0; // [0,1]
    this.cytotoxicity = type === "CD8" ? 0.8 : 0.1;
    this.lifespan = type === "CD8" ? 500 : 300;
    this.age = 0;
  }

  update(tumorDensity, cytokineLevel, checkpointFactor) {
    this.age++;
    
    // Activation by tumor antigen + costimulation
    const activationSignal = tumorDensity * (1 - checkpointFactor);
    if (this.state === "naive" && activationSignal > 0.3) {
      this.state = "activated";
    }
    
    // Chronic stimulation → exhaustion (PD-1/LAG-3)
    if (this.state === "activated" && activationSignal > 0.6) {
      this.exhaustion = Math.min(1, this.exhaustion + 0.01 * checkpointFactor);
      if (this.exhaustion > 0.7) {
        this.state = "exhausted";
      }
    }
    
    // Anti-PD-1 therapy reduces exhaustion
    this.exhaustion = Math.max(0, this.exhaustion - 0.005); // slow recovery baseline
    
    // Cytokine-driven proliferation
    if (this.state === "activated" && cytokineLevel > 0.5) {
      if (Math.random() < 0.05) {
        return { type: "spawn", newCell: new ImmuneCell(this.pos.x + (Math.random()-0.5)*10, this.pos.y + (Math.random()-0.5)*10, this.pos.z, this.type) };
      }
    }
    
    // Death
    if (this.age > this.lifespan || this.exhaustion > 0.9) {
      return { type: "death" };
    }
    
    return { type: "survive" };
  }

  kill(tumorCell) {
    // CD8 kills tumor if not exhausted and tumor is not hiding
    if (this.type === "CD8" && this.state === "activated") {
      const killProb = this.cytotoxicity * (1 - this.exhaustion) * (1 - tumorCell.immunoEvasionTrait);
      return Math.random() < killProb;
    }
    return false;
  }
}

// Stromal cell (cancer-associated fibroblast)
class StromalCell {
  constructor(x, y, z) {
    this.pos = new THREE.Vector3(x, y, z);
    this.state = "quiescent"; // quiescent, activated
    this.tgfbProduction = 0.2;
    this.ecmDeposition = 0.5;
    this.immuneSuppression = 0.3; // how much it suppresses T-cell infiltration
  }

  activate(tumorDensity) {
    if (tumorDensity > 0.5) {
      this.state = "activated";
      this.tgfbProduction = 0.8;
      this.immuneSuppression = 0.7;
    }
  }
}

// Diffusion field for oxygen/nutrients
class DiffusionField {
  constructor(gridSize = 50) {
    this.gridSize = gridSize;
    this.data = new Float32Array(gridSize * gridSize * gridSize);
    this.newData = new Float32Array(gridSize * gridSize * gridSize);
    this.scale = 100 / gridSize; // real coords to grid
    this.fill(1.0); // start at max
  }

  fill(value) {
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] = value;
    }
  }

  sampleAt(pos) {
    const x = Math.floor(pos.x / this.scale);
    const y = Math.floor(pos.y / this.scale);
    const z = Math.floor(pos.z / this.scale);
    if (x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize && z >= 0 && z < this.gridSize) {
      return this.data[x + y * this.gridSize + z * this.gridSize * this.gridSize];
    }
    return 0.5;
  }

  diffuse(consumptionRate = 0.01) {
    // Simple diffusion step: each grid point equilibrates with neighbors
    for (let x = 1; x < this.gridSize - 1; x++) {
      for (let y = 1; y < this.gridSize - 1; y++) {
        for (let z = 1; z < this.gridSize - 1; z++) {
          const idx = x + y * this.gridSize + z * this.gridSize * this.gridSize;
          const current = this.data[idx];
          
          // Average with neighbors
          const neighbors = [
            this.data[(x-1) + y * this.gridSize + z * this.gridSize * this.gridSize],
            this.data[(x+1) + y * this.gridSize + z * this.gridSize * this.gridSize],
            this.data[x + (y-1) * this.gridSize + z * this.gridSize * this.gridSize],
            this.data[x + (y+1) * this.gridSize + z * this.gridSize * this.gridSize],
            this.data[x + y * this.gridSize + (z-1) * this.gridSize * this.gridSize],
            this.data[x + y * this.gridSize + (z+1) * this.gridSize * this.gridSize],
          ];
          const avgNeighbor = neighbors.reduce((a, b) => a + b) / 6;
          this.newData[idx] = current * 0.7 + avgNeighbor * 0.3 - consumptionRate;
        }
      }
    }
    [this.data, this.newData] = [this.newData, this.data];
  }
}

// Main ABM engine
class TumorSimulation {
  constructor() {
    this.tumorCells = [];
    this.immuneCells = [];
    this.stromalCells = [];
    this.oxygenField = new DiffusionField();
    this.nutrientField = new DiffusionField();
    this.time = 0;
    
    // Treatment state
    this.treatment = { active: false, drug: null, intensity: 0 };
    this.immunotherapy = { active: false, checkpointInhibition: 0 };
    this.ecosystem = { antiAngiogenic: false, stromalModulation: false };
    
    // Initialize
    this.initPopulation();
  }

  initPopulation() {
    // Seed tumor at center
    for (let i = 0; i < 200; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 15;
      this.tumorCells.push(new TumorCell(
        50 + Math.cos(angle) * radius,
        50 + Math.sin(angle) * radius,
        50 + (Math.random() - 0.5) * 10
      ));
    }
    
    // Seed immune cells at periphery
    for (let i = 0; i < 50; i++) {
      this.immuneCells.push(new ImmuneCell(Math.random() * 100, Math.random() * 100, Math.random() * 100, "CD8"));
    }
    
    // Seed stromal cells
    for (let i = 0; i < 100; i++) {
      this.stromalCells.push(new StromalCell(Math.random() * 100, Math.random() * 100, Math.random() * 100));
    }
  }

  step() {
    this.time++;
    
    // Diffusion: oxygen depletion in tumor core
    const tumorDensity = this.tumorCells.length / 500;
    this.oxygenField.diffuse(tumorDensity * 0.02);
    this.nutrientField.diffuse(tumorDensity * 0.015);
    
    // Anti-angiogenic therapy reduces nutrient diffusion
    if (this.ecosystem.antiAngiogenic) {
      for (let i = 0; i < 5; i++) {
        this.oxygenField.diffuse(0.05);
      }
    }

    // === Tumor cell dynamics ===
    const newTumorCells = [];
    for (const cell of this.tumorCells) {
      cell.update(this.oxygenField, this.nutrientField);
      
      // Proliferation
      if (!cell.isQuiescent && Math.random() < cell.proliferationRate * 0.01) {
        const child = new TumorCell(
          cell.pos.x + (Math.random() - 0.5) * 2,
          cell.pos.y + (Math.random() - 0.5) * 2,
          cell.pos.z + (Math.random() - 0.5) * 2
        );
        // Inherit traits with small variation (continuous evolution)
        child.fitnessTrait = Math.min(0.95, cell.fitnessTrait + (Math.random() - 0.5) * 0.02);
        child.immunoEvasionTrait = Math.min(0.95, cell.immunoEvasionTrait + (Math.random() - 0.5) * 0.02);
        child.drivers = new Set(cell.drivers);
        child.mutationCount = cell.mutationCount;
        child.proliferationRate = cell.proliferationRate;
        newTumorCells.push(child);
      }
      
      // Apoptosis
      let deathProb = cell.deathRate;
      if (this.treatment.active && this.treatment.drug === "chemotherapy") {
        deathProb += this.treatment.intensity * cell.taxol_susceptibility;
      }
      if (cell.oxygenLevel < 0.1) {
        deathProb += 0.05; // hypoxia-driven death
      }
      
      if (Math.random() > deathProb) {
        newTumorCells.push(cell);
      }
    }
    this.tumorCells = newTumorCells;

    // ===  Immune cell dynamics ===
    const tumorCenterDensity = Math.min(1, this.tumorCells.length / 500);
    let cytokineLevel = tumorCenterDensity * 0.8;
    const checkpointFactor = this.immunotherapy.active ? (1 - this.immunotherapy.checkpointInhibition) : 1.0;
    
    const newImmuneCells = [];
    for (const cell of this.immuneCells) {
      const update = cell.update(tumorCenterDensity, cytokineLevel, checkpointFactor);
      if (update.type === "spawn") {
        newImmuneCells.push(cell);
        newImmuneCells.push(update.newCell);
      } else if (update.type === "survive") {
        newImmuneCells.push(cell);
      }
    }
    
    // Immune killing
    for (let i = this.tumorCells.length - 1; i >= 0; i--) {
      for (const immune of newImmuneCells) {
        if (immune.kill(this.tumorCells[i])) {
          this.tumorCells.splice(i, 1);
          break;
        }
      }
    }
    
    this.immuneCells = newImmuneCells;

    // === Stromal activation ===
    for (const stromal of this.stromalCells) {
      stromal.activate(tumorCenterDensity);
      if (this.ecosystem.stromalModulation) {
        stromal.immuneSuppression *= 0.5; // TGF-β inhibitor reduces suppression
      }
    }

    // Carry-forward state for next step
  }

  applyTreatment(drug, intensity) {
    if (drug === "chemotherapy") {
      this.treatment = { active: true, drug: "chemotherapy", intensity };
    } else if (drug === "immunotherapy") {
      this.immunotherapy = { active: true, checkpointInhibition: intensity };
    } else if (drug === "ecosystem") {
      this.ecosystem = { antiAngiogenic: intensity > 0.5, stromalModulation: intensity > 0.3 };
    }
  }

  stopTreatment() {
    this.treatment = { active: false, drug: null, intensity: 0 };
  }

  getMetrics() {
    const drivers = {};
    for (const cell of this.tumorCells) {
      for (const driver of cell.drivers) {
        drivers[driver] = (drivers[driver] || 0) + 1;
      }
    }
    
    const avgFitness = this.tumorCells.reduce((sum, c) => sum + c.fitnessTrait, 0) / Math.max(1, this.tumorCells.length);
    const avgEvasion = this.tumorCells.reduce((sum, c) => sum + c.immunoEvasionTrait, 0) / Math.max(1, this.tumorCells.length);
    const quiescentCount = this.tumorCells.filter(c => c.isQuiescent).length;
    
    return {
      time: this.time,
      tumorSize: this.tumorCells.length,
      immuneCount: this.immuneCells.length,
      avgFitness,
      avgEvasion,
      quiescentCount,
      drivers,
    };
  }
}

// ============================================================================
// REACT COMPONENT: INTERACTIVE VISUALIZATION + CONTROLS
// ============================================================================

export default function CancerABMSim() {
  const mountRef = useRef(null);
  const simRef = useRef(null);
  const sceneRef = useRef(null);
  const [metrics, setMetrics] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [treatmentState, setTreatmentState] = useState("none"); // none, chemo, immune, combo
  const [simSpeed, setSimSpeed] = useState(1);
  const [history, setHistory] = useState({ time: [], size: [], immune: [], fitness: [] });
  const animationRef = useRef(null);

  // Initialize simulation
  useEffect(() => {
    if (!simRef.current) {
      simRef.current = new TumorSimulation();
    }

    // THREE.js scene
    if (sceneRef.current) return; // prevent reinit
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth - 400, window.innerHeight);
    renderer.setClearColor(0x0a0e27);
    mountRef.current.appendChild(renderer.domElement);
    camera.position.z = 100;

    sceneRef.current = { scene, camera, renderer };

    // Lighting
    const light = new THREE.PointLight(0xffffff, 1, 300);
    light.position.set(50, 50, 50);
    scene.add(light);
    const ambientLight = new THREE.AmbientLight(0x444444);
    scene.add(ambientLight);

    return () => {
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Render loop
  useEffect(() => {
    if (!sceneRef.current || !simRef.current) return;

    const { scene, camera, renderer } = sceneRef.current;
    const sim = simRef.current;

    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);

      if (isRunning) {
        for (let i = 0; i < simSpeed; i++) {
          sim.step();
        }

        // Update metrics
        const m = sim.getMetrics();
        setMetrics(m);
        setHistory(h => ({
          time: [...h.time, m.time],
          size: [...h.size, m.tumorSize],
          immune: [...h.immune, m.immuneCount],
          fitness: [...h.fitness, m.avgFitness],
        }));
      }

      // Clear scene
      scene.children = scene.children.filter(child => !(child instanceof THREE.Mesh || child instanceof THREE.Points));

      // Render tumor cells
      if (sim.tumorCells.length > 0) {
        const positions = new Float32Array(sim.tumorCells.length * 3);
        const colors = new Float32Array(sim.tumorCells.length * 3);
        for (let i = 0; i < sim.tumorCells.length; i++) {
          const cell = sim.tumorCells[i];
          positions[i * 3] = cell.pos.x;
          positions[i * 3 + 1] = cell.pos.y;
          positions[i * 3 + 2] = cell.pos.z;
          
          // Color by fitness (green = low, red = high resistance)
          colors[i * 3] = cell.fitnessTrait;
          colors[i * 3 + 1] = 1 - cell.fitnessTrait * 0.5;
          colors[i * 3 + 2] = 0.2;
        }
        const tumorGeometry = new THREE.BufferGeometry();
        tumorGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        tumorGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const tumorMaterial = new THREE.PointsMaterial({ size: 0.5, vertexColors: true });
        const tumorPoints = new THREE.Points(tumorGeometry, tumorMaterial);
        scene.add(tumorPoints);
      }

      // Render immune cells
      if (sim.immuneCells.length > 0) {
        const positions = new Float32Array(sim.immuneCells.length * 3);
        for (let i = 0; i < sim.immuneCells.length; i++) {
          const cell = sim.immuneCells[i];
          positions[i * 3] = cell.pos.x;
          positions[i * 3 + 1] = cell.pos.y;
          positions[i * 3 + 2] = cell.pos.z;
        }
        const immuneGeometry = new THREE.BufferGeometry();
        immuneGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const immuneMaterial = new THREE.PointsMaterial({ size: 0.3, color: 0x00ff00 });
        const immunePoints = new THREE.Points(immuneGeometry, immuneMaterial);
        scene.add(immunePoints);
      }

      renderer.render(scene, camera);
    };

    animate();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isRunning, simSpeed]);

  const handleTreatment = (treatmentType) => {
    if (!simRef.current) return;
    
    if (treatmentType === "none") {
      simRef.current.stopTreatment();
      setTreatmentState("none");
    } else if (treatmentType === "chemo") {
      simRef.current.applyTreatment("chemotherapy", 0.8);
      setTreatmentState("chemo");
    } else if (treatmentType === "immune") {
      simRef.current.applyTreatment("immunotherapy", 0.6);
      setTreatmentState("immune");
    } else if (treatmentType === "combo") {
      simRef.current.applyTreatment("chemotherapy", 0.4);
      simRef.current.applyTreatment("immunotherapy", 0.7);
      setTreatmentState("combo");
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Anthropic Sans, sans-serif', color: '#f0efec' }}>
      {/* 3D Visualization */}
      <div ref={mountRef} style={{ flex: 1, backgroundColor: '#0a0e27' }} />

      {/* Control Panel */}
      <div style={{ width: 380, backgroundColor: '#1a1a19', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 500, margin: 0, marginBottom: '8px' }}>Adaptive Resistance ABM</h2>

        {/* Simulation Controls */}
        <div style={{ backgroundColor: '#2c2c2a', padding: '12px', borderRadius: '8px' }}>
          <p style={{ fontSize: '13px', color: '#c3c2b7', margin: '0 0 8px' }}>Simulation</p>
          <button
            onClick={() => setIsRunning(!isRunning)}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              backgroundColor: isRunning ? '#d55181' : '#3987e5',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            Speed:
            <input
              type="range"
              min="1"
              max="10"
              value={simSpeed}
              onChange={(e) => setSimSpeed(parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <span>{simSpeed}x</span>
          </label>
        </div>

        {/* Treatment Selection */}
        <div style={{ backgroundColor: '#2c2c2a', padding: '12px', borderRadius: '8px' }}>
          <p style={{ fontSize: '13px', color: '#c3c2b7', margin: '0 0 8px' }}>Treatment Strategy</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {['none', 'chemo', 'immune', 'combo'].map(t => (
              <button
                key={t}
                onClick={() => handleTreatment(t)}
                style={{
                  padding: '8px',
                  backgroundColor: treatmentState === t ? '#199e70' : '#383835',
                  color: '#f0efec',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {t === 'none' ? 'No Treatment' : t === 'chemo' ? 'Chemotherapy' : t === 'immune' ? 'Immunotherapy' : 'Combo'}
              </button>
            ))}
          </div>
        </div>

        {/* Metrics Display */}
        {metrics && (
          <div style={{ backgroundColor: '#2c2c2a', padding: '12px', borderRadius: '8px' }}>
            <p style={{ fontSize: '13px', color: '#c3c2b7', margin: '0 0 12px', fontWeight: 500 }}>Current State (t={metrics.time})</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
              <div>
                <span style={{ color: '#c3c2b7' }}>Tumor Size</span>
                <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 500 }}>{metrics.tumorSize}</p>
              </div>
              <div>
                <span style={{ color: '#c3c2b7' }}>Immune Cells</span>
                <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 500 }}>{metrics.immuneCount}</p>
              </div>
              <div>
                <span style={{ color: '#c3c2b7' }}>Avg Fitness</span>
                <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 500 }}>{metrics.avgFitness.toFixed(2)}</p>
              </div>
              <div>
                <span style={{ color: '#c3c2b7' }}>Evasion Trait</span>
                <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 500 }}>{metrics.avgEvasion.toFixed(2)}</p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: '#c3c2b7' }}>Quiescent Cells</span>
                <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 500 }}>{metrics.quiescentCount} (MRD pool)</p>
              </div>
            </div>
          </div>
        )}

        {/* Mini Chart */}
        {history.size.length > 0 && (
          <div style={{ backgroundColor: '#2c2c2a', padding: '12px', borderRadius: '8px' }}>
            <p style={{ fontSize: '12px', color: '#c3c2b7', margin: '0 0 8px' }}>Tumor Growth Trajectory</p>
            <svg width="100%" height="100" viewBox={`0 0 ${Math.max(history.size.length, 10)} 100`} style={{ backgroundColor: '#1a1a19', borderRadius: '4px' }}>
              {history.size.length > 1 && (
                <polyline
                  points={history.size.map((s, i) => `${i},${100 - (s / 1000) * 80}`).join(' ')}
                  fill="none"
                  stroke="#3987e5"
                  strokeWidth="0.5"
                />
              )}
            </svg>
          </div>
        )}

        <div style={{ fontSize: '11px', color: '#898781', lineHeight: '1.6' }}>
          <strong>Legend:</strong><br/>
          🔴 Red = High resistance<br/>
          🟡 Yellow = Intermediate<br/>
          🟢 Green = Immune cells<br/>
          <br/>
          <strong>Key Outputs:</strong> Track clonal evolution, immune infiltration, quiescence dynamics, and resistance emergence under different treatment strategies.
        </div>
      </div>
    </div>
  );
}

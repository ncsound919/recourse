# Agent-Based Mechanistic Cancer Simulation Framework
## ENHANCED ARCHITECTURE v2.0
### Production-Grade Software Engineering + Advanced Mechanistic Layers

---

## I. ENHANCED DESIGN: MULTI-SCALE MECHANISTIC INTEGRATION

### Architecture Layers (Bottom-Up)

```
┌─────────────────────────────────────────────────────┐
│ CLINICAL LAYER                                      │
│ ├─ Treatment outcomes (TTP, BOR, survival)          │
│ ├─ Biomarker predictions (VAF, immune score)        │
│ ├─ Patient stratification & decision rules          │
│ └─ Trial enrollment & adaptive sequencing           │
├─────────────────────────────────────────────────────┤
│ TISSUE LAYER (Emergent Phenotypes)                  │
│ ├─ Tumor microenvironment state                     │
│ ├─ Spatial clonal organization                      │
│ ├─ Immunological niche (hot/cold/excluded)          │
│ ├─ Metabolic heterogeneity (hypoxia zones)          │
│ └─ Treatment response landscapes                    │
├─────────────────────────────────────────────────────┤
│ CELLULAR LAYER (Agent Dynamics)                     │
│ ├─ Tumor cells (continuous traits + genotypes)      │
│ ├─ Immune cells (exhaustion + infiltration kinetics)│
│ ├─ Stromal cells (CAF activation + barrier)         │
│ ├─ Endothelial cells (vascular dynamics)            │
│ ├─ Cell-cell interactions (killing, suppression)    │
│ └─ Phenotypic switching (plasticity mechanics)      │
├─────────────────────────────────────────────────────┤
│ MOLECULAR LAYER (Gene Regulatory Networks)          │
│ ├─ Driver mutation effects (TP53, KRAS, PTEN...)    │
│ ├─ Transcriptional programs (EMT, metabolic switch) │
│ ├─ Signaling cascades (TGF-β, Wnt, Notch)           │
│ ├─ Immunogenicity phenotypes (neoantigen load)      │
│ └─ Drug response (efflux pumps, metabolism)         │
├─────────────────────────────────────────────────────┤
│ FIELD LAYER (Spatial Metabolic Fields)              │
│ ├─ Oxygen diffusion & consumption                   │
│ ├─ Nutrient gradients (glucose, amino acids)        │
│ ├─ Cytokine signaling (IL-2, TNF, IFN-γ)            │
│ ├─ Acidic pH zones (lactate + CO₂)                  │
│ ├─ Chemotactic gradients (CXCL9/10/16)              │
│ └─ Immunosuppressive factors (TGF-β, IL-10)         │
└─────────────────────────────────────────────────────┘
```

---

## II. ENHANCED AGENT CLASSES & TRAIT SPACES

### A. TumorCell (Enhanced)

**Continuous Trait Space** (each ∈ [0,1]):
```python
trait_space = {
    'fitness': float,              # Proliferation capacity
    'immuno_evasion': float,       # Escape from cytotoxic T cells
    'quiescence_propensity': float, # Propensity to enter dormancy
    'adhesion': float,              # ECM binding; affects migration
    'metabolic_flexibility': float, # Switch between glycolysis/OXPHOS
    'emt_state': float,             # Epithelial-mesenchymal plasticity
    'stemness': float,              # Self-renewal capacity
    'neoantigen_load': float,       # Immunogenicity (continuous proxy)
    'drug_resistance': float,       # Generic multi-drug efflux/metabolism
    'plasticity': float,            # Phenotypic switching speed
}
```

**Genotype Representation** (multi-dimensional):
```python
genotype = {
    'drivers': Set[str],           # Acquired driver mutations
    'loss_of_function': Set[str],  # Deleted/silenced genes (TP53, BRCA1, PTEN)
    'amplifications': Dict[str, int], # Copy number gains (MYC, EGFR, HER2)
    'structural_variants': List[Tuple], # Translocations, fusions
    'epigenetic_state': Dict[str, float], # Promoter methylation levels (0-1 per gene)
    'mutational_signature': Dict[str, float], # SBS1, SBS2, etc.; exposure levels
}
```

**Phenotypic State** (dynamic):
```python
state = {
    'cell_cycle_phase': Enum['G0', 'G1', 'S', 'G2/M'],
    'is_quiescent': bool,
    'quiescence_duration': int,
    'is_senescent': bool,           # Permanent cell cycle arrest
    'apoptotic_propensity': float,  # Commitment to death pathway
    'metabolic_state': Enum['glycolysis', 'oxphos', 'hybrid'],
    'emt_phenotype': Enum['epithelial', 'intermediate', 'mesenchymal'],
    'stemness_level': float,
    'activation_time': int,         # Time since last division/switch
}
```

**Spatial & Environmental Context**:
```python
context = {
    'position': Vector3,
    'oxygen_level': float,
    'nutrient_level': float,
    'ph_level': float,              # [6.5, 8.0]; affects metabolism
    'cytokine_exposure': Dict[str, float],  # IL-2, TNF, IFN-γ, TGF-β
    'chemotactic_gradient': Vector3, # Direction to T-cell attractants
    'stromal_contact': bool,         # Physically touching CAF
    'distance_to_vasculature': float, # Pixels to nearest vessel
}
```

**Update Logic** (enhanced):
```python
def update(self, fields, neighbors, treatment):
    # 1. Sample microenvironment
    self.oxygen_level = fields['oxygen'].sampleAt(self.pos)
    self.nutrient_level = fields['nutrient'].sampleAt(self.pos)
    self.ph_level = fields['ph'].sampleAt(self.pos)
    self.cytokine_exposure = {k: fields[k].sampleAt(self.pos) 
                               for k in ['il2', 'tnf', 'ifn_gamma', 'tgf_beta']}
    
    # 2. Metabolic state switching
    if self.oxygen_level < 0.3:
        self.metabolic_state = 'glycolysis'  # Warburg effect
        self.fitness *= 0.95  # Slower growth under glycolysis
    else:
        self.metabolic_state = 'oxphos'
        self.fitness *= 1.02  # Faster under aerobic conditions
    
    # 3. Quiescence decision (multi-factor)
    stress_score = (1 - self.oxygen_level) * 0.4 + (1 - self.nutrient_level) * 0.3 + (self.ph_level < 6.8) * 0.3
    quiescence_prob = stress_score * (1 - self.fitness) * (1 - self.emt_state)
    if stress_score > 0.7 and not self.is_quiescent and random() < quiescence_prob:
        self.is_quiescent = True
        self.quiescence_duration = 0
    
    # 4. Mutation + trait evolution
    if random() < self.mutation_rate:
        new_driver = sample_from_pool(['KRAS', 'TP53', 'PTEN', 'EGFR', 'MYC'])
        self.genotype['drivers'].add(new_driver)
        self.apply_driver_effects(new_driver)
    
    # 5. Phenotypic plasticity (trait drift toward favorable phenotype)
    if self.cytokine_exposure['tnf'] > 0.5:  # Pro-inflammatory
        self.emt_state = min(1, self.emt_state + 0.01)  # Drift toward EMT
    
    # 6. Treatment response
    if treatment.active:
        death_prob = self.compute_death_probability(treatment)
        if random() < death_prob:
            return 'death'
    
    # 7. Proliferation
    if not self.is_quiescent and random() < self.proliferation_rate:
        return self.divide(fields)  # Return new daughter cell
    
    return 'survive'

def apply_driver_effects(self, driver: str):
    """Map driver mutation → continuous trait changes"""
    effects = {
        'TP53': {'fitness': +0.15, 'immuno_evasion': +0.25, 'apoptosis_resist': +0.3},
        'KRAS': {'fitness': +0.20, 'emt_state': +0.15},
        'PTEN': {'fitness': +0.10, 'immuno_evasion': +0.10, 'plasticity': +0.05},
        'EGFR': {'fitness': +0.12, 'drug_resistance': +0.08},
        'MYC': {'fitness': +0.25, 'stemness': +0.20, 'metabolic_flexibility': +0.15},
    }
    
    for trait, delta in effects.get(driver, {}).items():
        setattr(self, trait, min(1.0, getattr(self, trait) + delta))
```

### B. ImmuneCell (Enhanced)

**State Machine** (multi-stage):
```python
class ImmuneCell:
    states = {
        'naive': {'exhaustion': 0, 'activation': 0, 'proliferation': 0},
        'priming': {'exhaustion': 0.1, 'activation': 0.3, 'proliferation': 0.1},
        'activated': {'exhaustion': 0.2, 'activation': 0.8, 'proliferation': 0.7},
        'effector': {'exhaustion': 0.3, 'activation': 1.0, 'proliferation': 0.8},
        'exhausted': {'exhaustion': 0.8, 'activation': 0.2, 'proliferation': 0.05},
        'terminal_exhaustion': {'exhaustion': 1.0, 'activation': 0, 'proliferation': 0},
        'anergic': {'exhaustion': 0.9, 'activation': 0, 'proliferation': 0},
    }

    # Checkpoint receptor dynamics
    checkpoint_receptors = {
        'PD1': float,      # Inhibitory ligand interaction
        'LAG3': float,
        'TIM3': float,
        'CTLA4': float,
        'TIGIT': float,
    }
    
    # Costimulatory receptors
    costim_receptors = {
        'CD28': float,     # Stimulatory
        'ICOS': float,
        'CD40': float,
    }
```

**Enhanced Killing Mechanics**:
```python
def kill_tumor_cell(self, tumor: TumorCell) -> bool:
    """Multi-factor cytotoxicity computation"""
    
    if self.type != 'CD8':
        return False
    
    # Base cytotoxicity from activation state
    base_kill_prob = self.activation_level * self.cytotoxicity
    
    # Exhaustion reduces killing (non-linear)
    exhaustion_penalty = 1 - (self.exhaustion ** 2)  # Higher exhaustion = steeper drop
    
    # Tumor evasion phenotype resistance
    evasion_resistance = 1 - (tumor.immuno_evasion * 0.9)  # Max 90% reduction
    
    # Stromal suppression (CAF-mediated)
    if tumor.stromal_contact:
        stromal_penalty = 0.7  # CAFs block 30% of killing
    else:
        stromal_penalty = 1.0
    
    # Checkpoint blockade benefit (anti-PD-1 therapy)
    checkpoint_boost = 1 + (self.checkpoint_inhibition_level * 0.5)
    
    # Neoantigen-driven TCR engagement (immunogenicity)
    antigen_boost = tumor.neoantigen_load * 0.8
    
    final_kill_prob = (base_kill_prob 
                       * exhaustion_penalty 
                       * evasion_resistance 
                       * stromal_penalty 
                       * checkpoint_boost 
                       * (1 + antigen_boost))
    
    return random() < min(1.0, final_kill_prob)
```

**TCR Clonotype Tracking**:
```python
class TCRClonotype:
    def __init__(self, id: str, specificity: str):  # e.g., "TP53_R175H"
        self.id = id
        self.specificity = specificity  # Tumor neoantigen it recognizes
        self.clone_size = 1
        self.activation_state = 'naive'
        self.exhaustion_level = 0
        self.proliferation_rate = 0
```

### C. StromalCell (Enhanced CAF Dynamics)

**CAF Phenotypes** (heterogeneous):
```python
class CAF:
    phenotypes = {
        'myCAF': {  # Myofibroblastic CAF
            'ecm_production': 0.8,
            'immune_suppression': 0.4,
            'tgf_beta': 0.6,
            'il6': 0.3,
        },
        'iCAF': {  # Inflammatory CAF
            'ecm_production': 0.3,
            'immune_suppression': 0.2,
            'tgf_beta': 0.2,
            'il6': 0.9,
            'cxcl12': 0.7,  # T-cell exclusion ligand
        },
        'apCAF': {  # Antigen-presenting CAF
            'ecm_production': 0.4,
            'immune_suppression': 0.3,
            'mhc2_expression': 0.8,
            'il12': 0.5,
        },
    }
    
    current_phenotype: str
    activation_level: float  # 0 (quiescent) → 1 (maximally activated)
```

**CAF Update Logic** (state-dependent):
```python
def update(self, tumor_density, cytokine_env, treatment):
    # Phenotype switching based on tumor proximity & cytokine exposure
    if tumor_density > 0.6 and cytokine_env['tnf'] < 0.3:
        self.current_phenotype = 'myCAF'  # Fibrotic CAF (TGF-β rich)
    elif cytokine_env['ifn_gamma'] > 0.6:
        self.current_phenotype = 'iCAF'   # Inflammatory CAF
    else:
        self.current_phenotype = 'apCAF'
    
    # Activation dynamics
    if tumor_density > 0.5:
        self.activation_level = min(1, self.activation_level + 0.05)
    else:
        self.activation_level = max(0, self.activation_level - 0.02)
    
    # TGF-β inhibitor effect
    if treatment.drug == 'tgf_beta_inhibitor':
        self.activation_level *= (1 - treatment.intensity * 0.7)
    
    # Produce signaling molecules
    phenotype_traits = self.phenotypes[self.current_phenotype]
    self.tgf_beta_production = phenotype_traits['tgf_beta'] * self.activation_level
    self.il6_production = phenotype_traits.get('il6', 0) * self.activation_level
```

### D. EndothelialCell (Vascular Dynamics)

```python
class EndothelialCell:
    def __init__(self, pos, vessel_id):
        self.pos = pos
        self.vessel_id = vessel_id  # Which vessel segment
        self.activation_level = 0  # Resting vs activated
        self.permeability = 0.3  # Baseline: 30% of max
        self.vegf_exposure = 0
        self.angiopoietin_exposure = 0
        self.normalization_state = 1  # 1=normalized, 0=pruned

    def update(self, cytokine_fields, anti_angiogenic_therapy):
        # VEGF-driven vessel abnormality
        self.vegf_exposure = cytokine_fields['vegf'].sampleAt(self.pos)
        if self.vegf_exposure > 0.7:
            self.permeability = min(1.0, self.permeability + 0.1)  # Leaky
            self.normalization_state = 0  # Abnormal vessel
        
        # Anti-angiogenic therapy (bevacizumab, etc.)
        if anti_angiogenic_therapy.active:
            self.vegf_exposure *= (1 - anti_angiogenic_therapy.intensity)
            self.permeability = max(0.2, self.permeability - 0.15)  # Normalize
            self.normalization_state = min(1, self.normalization_state + 0.2)
        
        # Angiopoietin-1 stabilizes vessels
        self.angiopoietin_exposure = cytokine_fields['angiopoietin'].sampleAt(self.pos)
        self.normalization_state = min(1, self.normalization_state + self.angiopoietin_exposure * 0.1)
```

---

## III. ENHANCED FIELD LAYER: MULTI-MODAL SIGNALING

### A. Extended Diffusion Fields

```python
class SignalingFieldLayer:
    def __init__(self, grid_size=50):
        self.fields = {
            'oxygen': DiffusionField(),
            'nutrient': DiffusionField(),
            'ph': DiffusionField(base_value=7.2),  # Acidic tumor
            
            # Cytokines
            'il2': DiffusionField(),      # T-cell proliferation
            'tnf': DiffusionField(),      # Pro-inflammatory
            'ifn_gamma': DiffusionField(), # Th1 response
            'tgf_beta': DiffusionField(),  # Immunosuppressive
            'il10': DiffusionField(),      # Immunosuppressive
            'il6': DiffusionField(),       # Systemic inflammation
            'cxcl9': DiffusionField(),     # T-cell recruitment
            'cxcl10': DiffusionField(),    # T-cell recruitment
            'cxcl12': DiffusionField(),    # CAF-mediated exclusion
            
            # Metabolic
            'lactate': DiffusionField(),   # Glycolysis product
            'co2': DiffusionField(),       # Respiratory product
            
            # Growth factors
            'vegf': DiffusionField(),      # Angiogenic
            'fgf': DiffusionField(),       # Fibroblast growth
            'angiopoietin': DiffusionField(), # Vessel stabilization
            
            # Damage signals
            'hmgb1': DiffusionField(),     # Danger-associated molecular pattern
            'atp': DiffusionField(),       # Released from dying cells
        }
    
    def step(self, tumor_cells, immune_cells, stromal_cells, treatment):
        """Update all fields each timestep"""
        
        # Oxygen depletion by tumor cells
        tumor_density = len(tumor_cells) / 1000
        oxygen_consumption = tumor_density * 0.05
        self.fields['oxygen'].diffuse(consumption_rate=oxygen_consumption)
        
        # Lactate production (Warburg effect)
        lactate_production = sum(c.metabolic_state == 'glycolysis' for c in tumor_cells) * 0.02
        self.fields['lactate'].diffuse(production_rate=lactate_production)
        self.fields['ph'].diffuse()  # Acidic pH from lactate
        
        # Cytokine production
        il2_from_immune = sum(c.activation_level * (1 - c.exhaustion) for c in immune_cells if c.type == 'CD8') * 0.001
        self.fields['il2'].add_source(il2_from_immune)
        
        tnf_from_immune = sum(c.state == 'activated' for c in immune_cells) * 0.001
        self.fields['tnf'].add_source(tnf_from_immune)
        
        tgf_beta_from_stromal = sum(c.tgf_beta_production for c in stromal_cells) * 0.0005
        self.fields['tgf_beta'].add_source(tgf_beta_from_stromal)
        
        # VEGF from hypoxic tumor cells
        vegf_from_tumor = sum(c.oxygen_level < 0.3 for c in tumor_cells) * 0.001
        self.fields['vegf'].add_source(vegf_from_tumor)
        
        # Therapy-driven field modifications
        if treatment.drug == 'anti_pd1':
            # Anti-PD-1 increases IL-2, IFN-γ
            self.fields['il2'].add_source(treatment.intensity * 0.05)
            self.fields['ifn_gamma'].add_source(treatment.intensity * 0.03)
        
        if treatment.drug == 'anti_angiogenic':
            # Reduce VEGF signaling
            self.fields['vegf'].multiply_by(1 - treatment.intensity * 0.5)
```

### B. Chemotactic Gradients

```python
def compute_chemotactic_gradient(self, cell_pos, field_name):
    """Compute gradient direction for cellular migration"""
    
    grid_pos = self.world_to_grid(cell_pos)
    
    # Compute discrete gradient (∇f)
    gradient = np.zeros(3)
    for dim in range(3):
        forward = self.fields[field_name].sample_at_grid(grid_pos + (dim == i for i in range(3)))
        backward = self.fields[field_name].sample_at_grid(grid_pos - (dim == i for i in range(3)))
        gradient[dim] = (forward - backward) / 2
    
    return normalize(gradient)
```

---

## IV. TISSUE-LEVEL EMERGENT PHENOMENA

### A. Clonal Architecture

```python
class ClonalTree:
    """Track evolutionary history + VAF dynamics"""
    
    def __init__(self):
        self.root = ClonalNode(id=0, drivers=set(), vaf=1.0)
        self.nodes = [self.root]
        self.current_vaf = {}  # driver_combo → current VAF
    
    def record_mutation_event(self, parent_clone, new_driver):
        """Create branch when new driver emerges"""
        new_clone = ClonalNode(
            id=len(self.nodes),
            drivers=parent_clone.drivers | {new_driver},
            vaf=0.001,  # Start rare
            parent=parent_clone
        )
        self.nodes.append(new_clone)
        parent_clone.children.append(new_clone)
    
    def update_vaf(self):
        """Recompute VAF of each clone based on population frequency"""
        clone_counts = defaultdict(int)
        for cell in self.tumor_cells:
            clone_key = frozenset(cell.genotype['drivers'])
            clone_counts[clone_key] += 1
        
        total = len(self.tumor_cells)
        for clone_node in self.nodes:
            clone_key = frozenset(clone_node.drivers)
            clone_node.vaf = clone_counts[clone_key] / total if total > 0 else 0
```

### B. Spatial Heterogeneity Metrics

```python
class SpatialAnalyzer:
    """Quantify tumor microenvironment structure"""
    
    def compute_immune_infiltration(self, immune_cells, tumor_cells):
        """CD8+ density in tumor core vs. periphery"""
        # Partition tumor into core (central 50%) vs periphery
        tumor_center = mean([c.pos for c in tumor_cells])
        tumor_radius = compute_radius([c.pos for c in tumor_cells])
        
        core_cells = [c for c in tumor_cells 
                      if distance(c.pos, tumor_center) < tumor_radius * 0.5]
        periphery_cells = [c for c in tumor_cells 
                          if distance(c.pos, tumor_center) >= tumor_radius * 0.5]
        
        cd8_in_core = sum(1 for c in immune_cells if c.type == 'CD8' 
                          and any(distance(c.pos, t.pos) < 2 for t in core_cells))
        cd8_in_periphery = sum(1 for c in immune_cells if c.type == 'CD8'
                               and any(distance(c.pos, t.pos) < 2 for t in periphery_cells))
        
        return {
            'core_density': cd8_in_core / max(1, len(core_cells)),
            'periphery_density': cd8_in_periphery / max(1, len(periphery_cells)),
            'infiltration_ratio': cd8_in_periphery / max(1, cd8_in_core),
        }
    
    def compute_stromal_barrier_strength(self, stromal_cells, tumor_cells, immune_cells):
        """Quantify CAF-mediated immune exclusion"""
        # Find CAF-rich regions
        stromal_density = {}
        for stromal in stromal_cells:
            grid_pos = world_to_grid(stromal.pos)
            stromal_density[grid_pos] = stromal_density.get(grid_pos, 0) + 1
        
        # Measure immune infiltration in high-stromal vs. low-stromal regions
        high_stromal_regions = [pos for pos, count in stromal_density.items() if count > 2]
        low_stromal_regions = [pos for pos, count in stromal_density.items() if count <= 2]
        
        immune_in_high = sum(1 for ic in immune_cells 
                            if world_to_grid(ic.pos) in high_stromal_regions)
        immune_in_low = sum(1 for ic in immune_cells 
                           if world_to_grid(ic.pos) in low_stromal_regions)
        
        barrier_strength = 1 - (immune_in_high / max(1, immune_in_low))
        return max(0, min(1, barrier_strength))
    
    def compute_hypoxia_landscape(self, oxygen_field):
        """Map hypoxic zones; predict quiescence patterns"""
        hypoxic_zones = []
        for x in range(oxygen_field.gridSize):
            for y in range(oxygen_field.gridSize):
                for z in range(oxygen_field.gridSize):
                    o2 = oxygen_field.data[x + y * oxygen_field.gridSize + z * oxygen_field.gridSize**2]
                    if o2 < 0.2:
                        hypoxic_zones.append((x, y, z))
        
        return {
            'hypoxic_fraction': len(hypoxic_zones) / oxygen_field.gridSize**3,
            'zone_count': len(connected_components(hypoxic_zones)),
            'avg_zone_size': len(hypoxic_zones) / max(1, len(connected_components(hypoxic_zones))),
        }
```

### C. Immunological Niche Classification

```python
class ImmuneNicheClassifier:
    """Categorize tumor as 'hot', 'warm', 'cold', or 'excluded'"""
    
    @staticmethod
    def classify(immune_cells, tumor_cells, stromal_cells, fields):
        cd8_count = sum(1 for c in immune_cells if c.type == 'CD8')
        cd8_density = cd8_count / max(1, len(tumor_cells))
        
        exhaustion_mean = np.mean([c.exhaustion for c in immune_cells if c.type == 'CD8'])
        
        stromal_density = len(stromal_cells) / max(1, len(tumor_cells))
        
        tgf_beta_level = fields['tgf_beta'].mean()
        
        # Classification logic
        if cd8_density > 0.15 and exhaustion_mean < 0.5:
            return 'HOT'  # High infiltration, low exhaustion
        elif cd8_density > 0.05 and exhaustion_mean > 0.7:
            return 'EXHAUSTED'  # Infiltrated but exhausted
        elif cd8_density < 0.05 and stromal_density > 0.2 and tgf_beta_level > 0.6:
            return 'EXCLUDED'  # CAF barrier prevents infiltration
        else:
            return 'COLD'  # Low infiltration, no clear reason
```

---

## V. TREATMENT MODULES (ENHANCED)

### A. Chemotherapy (Genotype-Aware)

```python
class ChemotherapyModule:
    def __init__(self, drug='taxol', intensity=0.8):
        self.drug = drug
        self.intensity = intensity
        
        # Drug-specific resistance profiles
        self.resistance_profile = {
            'taxol': {'ABC_transporters': 0.8, 'CYP3A4_metabolism': 0.6, 'TP53_loss': 0.3},
            'platinum': {'BRCA1_loss': 0.2, 'mismatch_repair': 0.7, 'TP53_loss': 0.5},
            '5FU': {'DHFR_amplification': 0.9, 'dTMP_synthase': 0.7},
        }
    
    def compute_cell_death_probability(self, tumor_cell):
        """Multi-factor drug response"""
        
        # Base susceptibility (inverse of fitness trait)
        base_susceptibility = 1 - tumor_cell.fitness
        
        # Genotype-specific resistance
        genotype_resistance = 0
        for driver in tumor_cell.genotype['drivers']:
            if driver in self.resistance_profile[self.drug]:
                genotype_resistance += self.resistance_profile[self.drug][driver]
        genotype_resistance = min(1, genotype_resistance / 3)  # Normalize
        
        # Phenotypic resistance
        metabolic_resistance = (tumor_cell.metabolic_state == 'glycolysis') * 0.2
        emt_resistance = tumor_cell.emt_state * 0.3
        quiescence_resistance = tumor_cell.is_quiescent * 0.8  # G0/G1 cells resist many drugs
        
        # Microenvironmental protection
        stromal_protection = (tumor_cell.stromal_contact) * 0.4
        hypoxia_protection = (tumor_cell.oxygen_level < 0.2) * 0.3
        
        final_susceptibility = (base_susceptibility 
                                * (1 - genotype_resistance)
                                * (1 - metabolic_resistance)
                                * (1 - emt_resistance)
                                * (1 - quiescence_resistance)
                                * (1 - stromal_protection)
                                * (1 - hypoxia_protection))
        
        death_probability = self.intensity * final_susceptibility * 0.5  # Baseline kill prob
        return min(1, death_probability)
```

### B. Immunotherapy (Checkpoint + CAR-T)

```python
class CheckpointInhibitor:
    def __init__(self, drug='anti_pd1', intensity=0.7):
        self.drug = drug
        self.intensity = intensity
        self.receptor_coverage = {
            'anti_pd1': 0.9,
            'anti_ctla4': 0.7,
            'anti_lag3': 0.6,
            'anti_tim3': 0.5,
        }
    
    def apply_effect(self, immune_cell):
        """Reduce exhaustion + boost activation"""
        checkpoint_receptor = self.drug.replace('anti_', '').upper()
        
        # Block checkpoint → reduce exhaustion
        coverage = self.receptor_coverage[self.drug]
        exhaustion_reduction = coverage * self.intensity * 0.05  # Per timestep
        immune_cell.exhaustion = max(0, immune_cell.exhaustion - exhaustion_reduction)
        
        # Boost activation state
        if immune_cell.state != 'terminal_exhaustion':
            immune_cell.activation = min(1, immune_cell.activation + self.intensity * 0.03)

class CARTTherapy:
    def __init__(self, car_construct='cd19', expansion_rate=0.15):
        self.car_construct = car_construct  # e.g., 'cd19', 'mesothelin', 'WT1'
        self.expansion_rate = expansion_rate
        self.infused_count = 0
    
    def infuse(self, number_of_cells=10000):
        """CAR-T cell infusion event"""
        self.infused_count += number_of_cells
        
        # Create CAR-T cells with target specificity
        car_t_cells = [
            CAR_T_Cell(
                specificity=self.car_construct,
                expansion_potential=0.8,
                persistence=1000,  # timesteps before exhaustion
            ) for _ in range(number_of_cells)
        ]
        return car_t_cells
    
    def update(self, tumor_cells, stromal_cells):
        """CAR-T expansion + target recognition"""
        
        for car_t in self.car_t_cells:
            # Target recognition (if tumor expresses CAR-T antigen)
            targets = [t for t in tumor_cells 
                       if self.antigen_expressed(t, car_t.specificity)]
            
            if targets and car_t.persistence > 0:
                # Expand in response to target
                if len(targets) > 10:  # High antigen burden
                    car_t.expansion_count += int(car_t.expansion_potential * 10)
                
                # Kill targets (enhanced by IL-2, reduced by TGF-β)
                for target in targets:
                    if random() < 0.8 * (1 - target.immuno_evasion):
                        target.state = 'apoptotic'
                        car_t.persistence -= 1  # Activation cost
            else:
                # Low antigen → persistence decay
                car_t.persistence = max(0, car_t.persistence - 1)
```

### C. Ecosystem Remodeling

```python
class EcosystemRemodeling:
    def __init__(self, 
                 anti_angiogenic='bevacizumab',
                 tgf_beta_inhibitor='fresolimumab',
                 anti_stromal='imatinib'):
        self.anti_angiogenic = anti_angiogenic
        self.tgf_beta_inhibitor = tgf_beta_inhibitor
        self.anti_stromal = anti_stromal
        self.intensity = 0  # [0, 1]; ramps up over time
    
    def apply_effects(self, tumor_cells, stromal_cells, endothelial_cells, fields, treatment):
        """Multi-pronged ecosystem remodeling"""
        
        # Anti-angiogenic: normalize vessels + reduce hypoxia
        if treatment.anti_angiogenic:
            for ec in endothelial_cells:
                ec.vegf_exposure *= (1 - treatment.intensity * 0.6)
                ec.normalization_state = min(1, ec.normalization_state + treatment.intensity * 0.1)
            
            # Consequence: improved oxygen diffusion
            fields['oxygen'].diffuse(consumption_rate=0.01)  # Reduced consumption
        
        # TGF-β inhibitor: weaken stromal barrier
        if treatment.tgf_beta_inhibitor:
            for stromal in stromal_cells:
                stromal.activation_level *= (1 - treatment.intensity * 0.7)
                stromal.tgf_beta_production *= (1 - treatment.intensity * 0.8)
                stromal.immune_suppression *= (1 - treatment.intensity * 0.6)
            
            # Consequence: reduced CXCL12 (CAF-mediated exclusion ligand)
            fields['cxcl12'].multiply_by(1 - treatment.intensity * 0.5)
        
        # Anti-stromal (kinase inhibitor): deplete CAFs
        if treatment.anti_stromal:
            stromal_cells_to_remove = [s for s in stromal_cells 
                                       if random() < treatment.intensity * 0.1]
            for s in stromal_cells_to_remove:
                stromal_cells.remove(s)

class AdaptiveTherapy:
    """Dosing strategy: maintain tumor burden at equilibrium"""
    
    def __init__(self, target_burden=500):
        self.target_burden = target_burden
        self.last_dose_intensity = 0.5
        self.dose_adjustment_history = []
    
    def compute_next_dose(self, current_tumor_size):
        """Titrate dose based on tumor burden trajectory"""
        
        burden_ratio = current_tumor_size / self.target_burden
        
        if burden_ratio > 1.2:  # Tumor growing
            self.last_dose_intensity = min(1, self.last_dose_intensity + 0.1)
        elif burden_ratio < 0.8:  # Tumor shrinking
            self.last_dose_intensity = max(0.1, self.last_dose_intensity - 0.1)
        # else: maintain current dose
        
        self.dose_adjustment_history.append(self.last_dose_intensity)
        return self.last_dose_intensity
```

---

## VI. ADVANCED CALIBRATION: MULTI-OBJECTIVE BAYESIAN INFERENCE

### A. Extended Likelihood Function

```python
def compute_likelihood(simulated, observed, data_weights=None):
    """Multi-modal likelihood: ctDNA + immune + spatial + clinical"""
    
    if data_weights is None:
        data_weights = {
            'ctdna': 0.35,
            'immune': 0.25,
            'spatial': 0.20,
            'clinical': 0.20,
        }
    
    # 1. ctDNA VAF likelihood
    l_ctdna = 0
    for timepoint in observed['ctdna_timepoints']:
        for driver in observed['drivers']:
            vaf_sim = simulated['vaf'][driver][timepoint]
            vaf_obs = observed['vaf'][driver][timepoint]
            depth = observed['sequencing_depth'][timepoint]
            
            # Binomial likelihood with sequencing noise
            p_vaf = binom.logpmf(
                int(vaf_obs * depth),
                depth,
                vaf_sim
            )
            l_ctdna += p_vaf
    
    # 2. Immune infiltration likelihood
    l_immune = norm.logpdf(
        simulated['cd8_infiltration'],
        observed['cd8_infiltration'],
        observed['cd8_infiltration'] * 0.2  # 20% measurement noise
    )
    l_immune += norm.logpdf(
        simulated['exhaustion_mean'],
        observed['exhaustion_mean'],
        0.1
    )
    
    # 3. Spatial ecosystem likelihood
    l_spatial = norm.logpdf(
        simulated['stromal_barrier_strength'],
        observed['stromal_barrier_strength'],
        0.15
    )
    l_spatial += norm.logpdf(
        simulated['hypoxic_fraction'],
        observed['hypoxic_fraction'],
        0.1
    )
    
    # 4. Clinical outcome likelihood (time-to-progression)
    if observed['ttp_observed']:
        # Weibull distribution for survival/progression time
        ttp_sim = simulated['ttp']
        ttp_obs = observed['ttp_observed']
        l_clinical = weibull.logpdf(
            ttp_obs,
            c=2,  # Shape parameter
            loc=0,
            scale=ttp_sim
        )
    else:
        l_clinical = 0
    
    # Combine with weights
    total_ll = (data_weights['ctdna'] * l_ctdna +
                data_weights['immune'] * l_immune +
                data_weights['spatial'] * l_spatial +
                data_weights['clinical'] * l_clinical)
    
    return total_ll
```

### B. Hierarchical Bayesian Model (Multi-Patient Borrowing)

```python
class HierarchicalBayesianCalibration:
    """
    Population-level + patient-level parameters.
    Borrowing strength across patients improves data-sparse inference.
    """
    
    def __init__(self, patient_cohort):
        self.patients = patient_cohort
        
        # Hyperpriors (population-level)
        self.hyperpriors = {
            'μ_fitness': Prior('Normal', mean=0.3, sd=0.1),
            'σ_fitness': Prior('HalfNormal', sd=0.15),
            'μ_mutation_rate': Prior('LogNormal', m=-6, s=1.5),
            'σ_mutation_rate': Prior('HalfNormal', sd=1.0),
        }
        
        # Patient-level priors (hierarchical)
        self.patient_priors = {}
        for patient_id in self.patients:
            self.patient_priors[patient_id] = {
                'fitness': Prior('Normal', mean='μ_fitness', sd='σ_fitness'),
                'mutation_rate': Prior('LogNormal', m='μ_mutation_rate', s='σ_mutation_rate'),
            }
    
    def fit_mcmc(self, n_iter=2000, n_chains=4):
        """Run hierarchical MCMC"""
        
        # Use PyMC3 or Stan
        import pymc as pm
        
        with pm.Model() as model:
            # Hyperpriors
            mu_fit = pm.Normal('mu_fitness', 0.3, 0.1)
            sigma_fit = pm.HalfNormal('sigma_fitness', 0.15)
            
            mu_mut = pm.LogNormal('mu_mutation_rate', -6, 1.5)
            sigma_mut = pm.HalfNormal('sigma_mutation_rate', 1.0)
            
            # Patient-level priors + likelihoods
            for patient_id in self.patients:
                # Patient-specific parameters
                fitness_i = pm.Normal(f'fitness_{patient_id}', mu_fit, sigma_fit)
                mut_rate_i = pm.LogNormal(f'mutation_rate_{patient_id}', mu_mut, sigma_mut)
                
                # Simulate this patient
                sim_i = self.simulate_patient(patient_id, fitness_i, mut_rate_i)
                
                # Likelihood
                obs_vaf = self.patients[patient_id].observed_vaf
                obs_immune = self.patients[patient_id].observed_immune
                
                pm.Normal(f'obs_vaf_{patient_id}', 
                         mu=sim_i['vaf'], sd=obs_vaf * 0.15,
                         observed=obs_vaf)
                pm.Normal(f'obs_immune_{patient_id}',
                         mu=sim_i['immune'], sd=0.1,
                         observed=obs_immune)
            
            # Sample
            trace = pm.sample(n_iter, tune=1000, chains=n_chains, return_inferencedata=True)
        
        return trace
```

---

## VII. ADVANCED VISUALIZATION & ANALYSIS

### A. Interactive 3D Visualization (Enhanced)

```tsx
interface VisualizationState {
  render_mode: 'cells' | 'clones' | 'fields' | 'spatial_heatmap' | 'clonal_tree';
  colorby: 'fitness' | 'exhaustion' | 'clone_id' | 'oxygen' | 'driver_count';
  cell_type_filter: Set<string>;  // Which cell types to show
  time_slice: number;  // Current timestep
  camera_mode: 'free' | 'tracking' | 'isometric' | 'cross_section';
}

function enhancedVisualization() {
  const [viz_state, set_viz_state] = useState<VisualizationState>({
    render_mode: 'cells',
    colorby: 'fitness',
    cell_type_filter: new Set(['tumor', 'immune', 'stromal']),
    time_slice: sim.time,
    camera_mode: 'free',
  });
  
  // Render mode: Clonal Tree
  if (viz_state.render_mode === 'clonal_tree') {
    return <ClonalTreeVisualization clonal_tree={sim.clonal_tree} />;
  }
  
  // Render mode: Spatial Heatmap (oxygen, immune infiltration, CAF density)
  if (viz_state.render_mode === 'spatial_heatmap') {
    return (
      <SpatialHeatmapPanel>
        <HeatmapLayer field_name="oxygen" colormap="viridis" />
        <HeatmapLayer field_name="cd8_density" colormap="hot" />
        <HeatmapLayer field_name="tgf_beta" colormap="coolwarm" />
      </SpatialHeatmapPanel>
    );
  }
  
  // Render mode: Clonal Heatmap (VAF per region)
  if (viz_state.render_mode === 'clones') {
    return (
      <ClonalHeatmap
        clones={sim.clonal_tree.nodes}
        regions={sim.spatial_regions}
      />
    );
  }
  
  return <ThreeJSCanvas viz_state={viz_state} sim={sim} />;
}
```

### B. Real-Time Biomarker Tracking Dashboard

```tsx
function BiomarkerDashboard() {
  return (
    <div className="biomarker-panel">
      {/* VAF Trajectories */}
      <LineChart
        series={[
          { name: 'TP53', data: sim.metrics.vaf_trajectory['TP53'] },
          { name: 'KRAS', data: sim.metrics.vaf_trajectory['KRAS'] },
          { name: 'PTEN', data: sim.metrics.vaf_trajectory['PTEN'] },
        ]}
        xlabel="Time (weeks)"
        ylabel="VAF"
      />
      
      {/* Immune Dynamics */}
      <LineChart
        series={[
          { name: 'CD8 Infiltration', data: sim.metrics.cd8_infiltration_timeline },
          { name: 'Mean Exhaustion', data: sim.metrics.exhaustion_timeline },
          { name: 'TCR Clonotype Count', data: sim.metrics.tcr_clonotype_count_timeline },
        ]}
      />
      
      {/* Microenvironment State */}
      <div className="ecosystem-cards">
        <MetricCard
          label="Immune Niche"
          value={sim.metrics.immune_niche_class}
          color={niche_to_color[sim.metrics.immune_niche_class]}
        />
        <MetricCard
          label="Stromal Barrier"
          value={sim.metrics.stromal_barrier_strength.toFixed(2)}
        />
        <MetricCard
          label="Hypoxic Fraction"
          value={(sim.metrics.hypoxic_fraction * 100).toFixed(1)}
          unit="%"
        />
        <MetricCard
          label="MRD Pool Size"
          value={sim.metrics.quiescent_count}
        />
      </div>
      
      {/* Treatment Response Heatmap */}
      <TreatmentResponseMatrix
        treatments={['none', 'chemo', 'immune', 'tgf_inhibitor', 'anti_angio', 'combo']}
        metrics={['ttp', 'response_rate', 'resistance_emergence_time']}
      />
    </div>
  );
}
```

---

## VIII. PRODUCTION SOFTWARE ARCHITECTURE

### A. Modular Design Patterns

```typescript
// Core simulation engine
interface IAgent {
  id: string;
  pos: Vector3;
  state: Record<string, any>;
  update(context: SimulationContext): void;
  interact(other: IAgent): void;
}

interface IField {
  gridSize: number;
  data: Float32Array;
  diffuse(consumption_rate: number): void;
  sampleAt(pos: Vector3): number;
  addSource(value: number, pos: Vector3): void;
}

interface ITreatmentModule {
  name: string;
  intensity: number;
  apply(agents: IAgent[], fields: Map<string, IField>): void;
}

// Dependency injection
class SimulationContext {
  constructor(
    public agents: Map<string, IAgent[]>,
    public fields: Map<string, IField>,
    public treatment_modules: ITreatmentModule[],
    public time: number,
  ) {}
}

// Factory pattern for agent creation
class AgentFactory {
  static createTumorCell(pos: Vector3, params: CalibrationParams): TumorCell {
    const cell = new TumorCell(pos);
    cell.fitness = params.fitness_mean + randn() * params.fitness_std;
    // ... initialize traits
    return cell;
  }
}

// Strategy pattern for treatment
interface ITreatmentStrategy {
  compute_dose(current_burden: number, history: number[]): number;
  apply_effects(agents: IAgent[]): void;
}

class AdaptiveTherapyStrategy implements ITreatmentStrategy {
  // ...
}

// Observer pattern for metrics collection
class MetricsCollector implements Observer<SimulationEvent> {
  onUpdate(event: SimulationEvent) {
    this.vaf_history.push(this.compute_vaf());
    this.immune_history.push(this.compute_immune_metrics());
    // ...
  }
}
```

### B. Multithreading & Performance Optimization

```typescript
// Web Worker for simulation loop
// worker.ts
import { TumorSimulation } from './simulation';

let sim: TumorSimulation;

self.onmessage = (event) => {
  const { command, payload } = event.data;
  
  if (command === 'init') {
    sim = new TumorSimulation(payload.params);
  } else if (command === 'step') {
    for (let i = 0; i < payload.num_steps; i++) {
      sim.step();
    }
    self.postMessage({
      type: 'update',
      metrics: sim.getMetrics(),
      time: sim.time,
    });
  }
};

// main.tsx
const worker = new Worker('worker.ts');

function runSimulation() {
  worker.postMessage({ command: 'init', payload: { params: calibrated_params } });
  
  // Run 100 steps per frame
  requestAnimationFrame(() => {
    worker.postMessage({ command: 'step', payload: { num_steps: 100 } });
    worker.onmessage = (event) => {
      if (event.data.type === 'update') {
        updateVisualization(event.data.metrics);
        requestAnimationFrame(runSimulation);
      }
    };
  });
}
```

### C. Data Persistence & Export

```typescript
interface SimulationSnapshot {
  time: number;
  metadata: {
    patient_id: string;
    calibration_version: string;
    treatment_history: Treatment[];
  };
  population_state: {
    tumor_cells: TumorCell[];
    immune_cells: ImmuneCell[];
    stromal_cells: StromalCell[];
  };
  metrics: {
    vaf_per_driver: Record<string, number[]>;
    immune_infiltration: number[];
    stromal_barrier: number[];
    ttp_prediction: number;
  };
  fields: {
    oxygen: Float32Array;
    nutrient: Float32Array;
    cytokines: Record<string, Float32Array>;
  };
}

class SimulationExporter {
  exportToJSON(): string {
    const snapshot: SimulationSnapshot = {
      time: this.sim.time,
      metadata: this.sim.metadata,
      population_state: this.sim.getPopulationState(),
      metrics: this.sim.getMetrics(),
      fields: this.sim.getFieldSnapshots(),
    };
    return JSON.stringify(snapshot);
  }
  
  exportToHDF5(filename: string): void {
    // Use h5wasm for client-side HDF5 export
    // Allows large-scale data storage (multi-GB simulations)
  }
  
  exportToVTK(filename: string): void {
    // VTK format for visualization in ParaView
    // 3D field visualization + cell positions
  }
}
```

---

## IX. VALIDATION & BENCHMARKING FRAMEWORK

### A. Sensitivity Analysis (Morris Method)

```python
from SALib.sample.morris import sample
from SALib.analyze.morris import analyze
from SALib.plotting import morris as morris_plot

problem = {
    'num_vars': 15,
    'names': ['fitness_mean', 'mutation_rate', 'immune_infiltration_rate',
              'exhaustion_rate', 'checkpoint_sensitivity', 'caf_activation_threshold',
              'immune_suppression_strength', 'oxygen_diffusion_rate', 'hypoxia_threshold',
              'quiescence_prob', 'metabolic_flexibility', 'emt_plasticity',
              'tgf_beta_baseline', 'stromal_barrier_strength', 'vessel_normalization'],
    'bounds': [[0.1, 0.5], [0.001, 0.01], [0.1, 0.8],
               [0.01, 0.1], [0.3, 0.9], [0.3, 0.8],
               [0.2, 0.8], [0.01, 0.1], [0.1, 0.4],
               [0.1, 0.5], [0.1, 0.9], [0.1, 0.9],
               [0.2, 0.8], [0.2, 0.9], [0.2, 0.9]],
}

# Generate parameter samples
param_values = sample(problem, N=20, num_levels=4)

# Run simulation for each parameter set
results = []
for params in param_values:
    sim = TumorSimulation(params)
    sim.run(t_max=100)
    output = sim.getMetrics()['ttp']  # Time-to-progression
    results.append(output)

# Analyze sensitivity
Si = analyze(problem, param_values, results)

# Plot Morris indices (μ, σ)
morris_plot.horizontal_bar_plot(Si)
```

### B. Model Validation: Hold-Out Blind Test

```python
class ModelValidator:
    def __init__(self, patient_cohort):
        self.cohort = patient_cohort
    
    def cross_validation(self, n_folds=5):
        """K-fold cross-validation on patient data"""
        
        predictions = {}
        errors = {}
        
        for fold_idx in range(n_folds):
            train_patients = [p for i, p in enumerate(self.cohort) if i % n_folds != fold_idx]
            test_patients = [p for i, p in enumerate(self.cohort) if i % n_folds == fold_idx]
            
            # Calibrate on training set
            posterior_params = self.fit_to_cohort(train_patients)
            
            # Predict on test set
            for patient in test_patients:
                # Initialize sim with posterior median params
                sim = TumorSimulation(posterior_params)
                sim.run(t_max=12)  # 12 weeks
                
                # Predict VAF at week 8
                pred_vaf_week8 = sim.metrics.vaf_at_timepoint(8)
                obs_vaf_week8 = patient.obs_vaf_week8
                
                predictions[patient.id] = pred_vaf_week8
                errors[patient.id] = (pred_vaf_week8 - obs_vaf_week8) / obs_vaf_week8
        
        # Report metrics
        mean_error = np.mean(list(errors.values()))
        rmse = np.sqrt(np.mean([e**2 for e in errors.values()]))
        mae = np.mean([abs(e) for e in errors.values()])
        
        return {
            'mean_relative_error': mean_error,
            'rmse': rmse,
            'mae': mae,
            'predictions': predictions,
            'errors': errors,
        }
```

---

## X. INTEGRATION PATHWAY

### Phase-by-Phase Deployment

```
PHASE 1 (Week 0): Core Engine Enhancement
├─ Implement enhanced TumorCell trait space (continuous traits)
├─ Add EndothelialCell + vascular dynamics
├─ Expand signaling fields (IL-2, TNF, CXCL12, etc.)
├─ Integrate CAF phenotype switching
└─ Validation: Parameter sensitivity (Morris method)

PHASE 2 (Week 1): Data Pipeline + Calibration
├─ Bayesian MCMC implementation (PyMC3)
├─ Hierarchical model for multi-patient borrowing
├─ Likelihood functions (ctDNA, immune, spatial, clinical)
├─ Posterior predictive checks
└─ Validation: K-fold cross-validation on 5-10 retrospective patients

PHASE 3 (Week 2): Advanced Visualization + Analysis
├─ Enhanced 3D interactive viz (clonal tree, spatial heatmaps)
├─ Real-time biomarker dashboard
├─ Clonal architecture tracking
├─ Immune niche classification (hot/cold/excluded)
└─ Validation: Accuracy of spatial ecosystem predictions

PHASE 4 (Week 3): Treatment Modules + Clinical Integration
├─ Chemotherapy (genotype-aware death probabilities)
├─ CAR-T dynamics + ecosystem priming synergy
├─ Adaptive therapy dose titration
├─ Treatment recommendation engine
└─ Validation: Prospective blinded case studies (3-5 patients)

PHASE 5 (Week 4): Production Deployment
├─ Containerization (Docker)
├─ Web API + FastAPI backend
├─ Clinical trial integration (randomization, data capture)
├─ Real-time EHR/LIS connectors
└─ Validation: Multi-site pilot (2-3 cancer centers)
```

---

## XI. RESEARCH APPLICATIONS (ENHANCED)

### Advanced Use Cases Enabled by Enhanced Architecture

1. **Polyclonal Recurrence Forecasting**: Simulate emergence of multiple resistant clones; predict timing of each
2. **CAR-T Ecosystem Priming**: Test optimal sequencing (TGF-β inhibitor → anti-angiogenic → CAR-T infusion)
3. **Biomarker Threshold Optimization**: Use model to compute optimal ctDNA/immune cutoffs for treatment escalation
4. **Patient-Specific Adverse Event Prediction**: Quantify MRD pool size to predict late recurrence risk
5. **Mechanism-Driven Biomarker Discovery**: Identify which molecular features (drivers, TMB, immune state) predict treatment response
6. **Rational Clinical Trial Design**: Power calculations for precision oncology endpoints using simulated data
7. **AI/ML Integration**: Train neural networks on simulated data to predict real patient outcomes; validate prospectively

---

End of enhanced architecture document.

**Ready for Phase 1 implementation.**

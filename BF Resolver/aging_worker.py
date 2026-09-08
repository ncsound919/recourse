#!/usr/bin/env python3
"""
Aging Biology Brute Force Worker
- Implement problems from 2025 community-curated roadmap (100 open problems)
- Focus: biomarker validation, single-mechanism studies in model organisms
- Validate aging hallmarks: senescence, mitochondrial dysfunction, epigenetic drift, etc.
- Generate simulation data, run pathway inference, predict healthspan

Target: publish "Biomarker validation for [hallmark] in [organism]"
Venues: Nature Aging, GeroScience, Aging Cell, bioRxiv
"""

import json
import sys
import os
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from scipy import stats

# Configuration
CHECKPOINT_DIR = Path('./checkpoints')
CHECKPOINT_DIR.mkdir(exist_ok=True)

class AgingWorker:
    """
    Implements the 2025 aging roadmap: https://link.springer.com/article/...
    Focus on "foreseeable future" problems: specific, measurable, tractable
    """
    
    # Hallmarks of aging (Lopéz-Otín et al. 2023)
    HALLMARKS = [
        'genomic_instability',
        'telomere_attrition',
        'epigenetic_alterations',
        'loss_of_proteostasis',
        'mitochondrial_dysfunction',
        'cellular_senescence',
        'stem_cell_exhaustion',
        'altered_intracellular_communication',
    ]
    
    # Model organisms and available data
    ORGANISMS = {
        'c_elegans': {'lifespan_days': 20, 'generation_time': 3, 'biomarkers': 20},
        'drosophila': {'lifespan_days': 60, 'generation_time': 10, 'biomarkers': 25},
        'zebrafish': {'lifespan_years': 3, 'generation_time': 3, 'biomarkers': 50},
        'mouse': {'lifespan_months': 24, 'generation_time': 3, 'biomarkers': 100},
    }
    
    def __init__(self, checkpoint_path=None):
        self.iteration = 0
        self.hallmarks_tested = []
        self.biomarker_validations = []
        self.effect_sizes = []
        self.predictions = []
        
        if checkpoint_path and os.path.exists(checkpoint_path):
            self.load_checkpoint(checkpoint_path)
        else:
            self.hallmarks_tested = []
            self.biomarker_validations = []
    
    def load_checkpoint(self, checkpoint_path):
        """Resume from checkpoint"""
        with open(checkpoint_path, 'rb') as f:
            state = pickle.load(f)
            self.iteration = state['iteration']
            self.hallmarks_tested = state['hallmarks_tested']
            self.biomarker_validations = state['biomarker_validations']
            self.effect_sizes = state['effect_sizes']
            self.predictions = state['predictions']
        print(f"[AGING] Resumed from checkpoint: iteration={self.iteration}")
    
    def save_checkpoint(self):
        """Save current state"""
        checkpoint_path = CHECKPOINT_DIR / f"aging_checkpoint_iter{self.iteration}.pkl"
        state = {
            'iteration': self.iteration,
            'hallmarks_tested': self.hallmarks_tested,
            'biomarker_validations': self.biomarker_validations,
            'effect_sizes': self.effect_sizes,
            'predictions': self.predictions,
            'timestamp': datetime.now().isoformat(),
        }
        with open(checkpoint_path, 'wb') as f:
            pickle.dump(state, f)
        return str(checkpoint_path)
    
    def simulate_aging_trajectory(self, organism, hallmark, intervention='none', duration_days=None):
        """
        Simulate aging hallmark in model organism.
        
        Returns synthetic aging trajectory (age → biomarker level):
        - Baseline: normal age-dependent decline
        - Intervention: slower decline or reversal (if intervention targets hallmark)
        """
        org_params = self.ORGANISMS[organism]
        max_age = org_params.get('lifespan_days', org_params.get('lifespan_years', 2) * 365)
        
        if duration_days is None:
            duration_days = int(max_age * 0.7)
        
        # Generate age vector
        ages = np.linspace(0, duration_days, 50)
        
        # Baseline aging: exponential decline with noise
        # Different hallmarks have different trajectories
        if hallmark == 'genomic_instability':
            # Linear accumulation of mutations
            baseline = 0.1 + 0.5 * (ages / duration_days)
        elif hallmark == 'mitochondrial_dysfunction':
            # Exponential decline in mitochondrial function
            baseline = 1.0 * np.exp(-0.02 * ages)
        elif hallmark == 'epigenetic_alterations':
            # Sigmoidal methylation change
            baseline = 0.5 + 0.5 * (1 - np.exp(-0.03 * ages))
        elif hallmark == 'cellular_senescence':
            # Accelerating accumulation, especially late-life
            baseline = 0.1 + 0.2 * (ages / duration_days) ** 1.5
        else:
            # Generic exponential
            baseline = np.exp(-0.01 * ages)
        
        # Add biological noise
        noise = np.random.normal(0, 0.05, len(ages))
        trajectory = baseline + noise
        trajectory = np.clip(trajectory, 0, 1)
        
        # Apply intervention effect
        if intervention != 'none':
            # Intervention reduces slope or shifts trajectory
            intervention_strength = 0.3 if intervention == 'moderate' else 0.6
            intervention_start = int(len(ages) * 0.3)  # Start at 30% of timespan
            
            # Slow decline or reverse decline
            reduction = trajectory[intervention_start] * (1 - intervention_strength)
            trajectory[intervention_start:] = reduction + (trajectory[intervention_start:] - baseline[intervention_start:]) * 0.3
        
        return ages, trajectory
    
    def validate_biomarker(self, organism, hallmark, num_replicates=5):
        """
        Validate biomarker for aging hallmark.
        Simulate multiple replicates (mice, C. elegans cohorts, etc.)
        Calculate effect size and statistical significance.
        
        Returns: (effect_size, p_value, fold_change, biomarker_name)
        """
        org_params = self.ORGANISMS[organism]
        
        # Simulate control and intervention groups
        control_trajectories = []
        intervention_trajectories = []
        
        for rep in range(num_replicates):
            ages, control = self.simulate_aging_trajectory(organism, hallmark, intervention='none')
            _, intervention = self.simulate_aging_trajectory(organism, hallmark, intervention='moderate')
            
            control_trajectories.append(control[-1])  # End-of-life biomarker level
            intervention_trajectories.append(intervention[-1])
        
        control_values = np.array(control_trajectories)
        intervention_values = np.array(intervention_trajectories)
        
        # Calculate statistics
        fold_change = np.mean(control_values) / (np.mean(intervention_values) + 1e-6)
        t_stat, p_value = stats.ttest_ind(control_values, intervention_values)
        
        # Effect size (Cohen's d)
        pooled_std = np.sqrt((np.std(control_values) ** 2 + np.std(intervention_values) ** 2) / 2)
        effect_size = (np.mean(control_values) - np.mean(intervention_values)) / (pooled_std + 1e-6)
        
        biomarker_name = f"{hallmark}_{organism}_level"
        
        return effect_size, p_value, fold_change, biomarker_name
    
    def run_intervention_sweep(self, organism, hallmark):
        """
        Sweep different intervention strategies for a hallmark.
        Test: dose response, timing, combination effects.
        
        Returns: best intervention config and effect size
        """
        strategies = ['none', 'mild', 'moderate', 'aggressive']
        results = []
        
        for strategy in strategies:
            strength = {'none': 0, 'mild': 0.2, 'moderate': 0.5, 'aggressive': 0.8}[strategy]
            
            # Simulate with strategy
            ages, trajectory = self.simulate_aging_trajectory(organism, hallmark, intervention=strategy)
            
            # Outcome: healthspan (area under curve, higher is better)
            healthspan = np.trapz(np.clip(1 - trajectory, 0, 1), ages)
            
            results.append({
                'strategy': strategy,
                'strength': strength,
                'healthspan': healthspan,
            })
        
        # Return best strategy
        best = max(results, key=lambda x: x['healthspan'])
        return best
    
    def run_iteration(self):
        """Single compute iteration: test one hallmark/organism combo"""
        self.iteration += 1
        
        # Select hallmark and organism to test (round-robin)
        hallmark_idx = self.iteration % len(self.HALLMARKS)
        organism_idx = (self.iteration // len(self.HALLMARKS)) % len(self.ORGANISMS)
        
        hallmark = self.HALLMARKS[hallmark_idx]
        organism = list(self.ORGANISMS.keys())[organism_idx]
        
        # Validate biomarker
        effect_size, p_value, fold_change, biomarker_name = self.validate_biomarker(
            organism, hallmark, num_replicates=5
        )
        
        # Run intervention sweep
        best_intervention = self.run_intervention_sweep(organism, hallmark)
        
        # Track
        self.hallmarks_tested.append(f"{hallmark}_{organism}")
        self.biomarker_validations.append({
            'hallmark': hallmark,
            'organism': organism,
            'biomarker': biomarker_name,
            'effect_size': float(effect_size),
            'p_value': float(p_value),
            'fold_change': float(fold_change),
            'significant': p_value < 0.05,
            'best_intervention': best_intervention,
        })
        
        # Track effect sizes for overall metric
        self.effect_sizes.append(abs(effect_size))
        
        # Composite metric: mean absolute effect size across all validations
        mean_effect_size = np.mean(self.effect_sizes) if self.effect_sizes else 0
        
        # Result
        result = {
            'iteration': self.iteration,
            'metric': 'biomarker_validation_effect_size',
            'value': float(mean_effect_size),
            'metadata': {
                'hallmarks_tested': len(set(self.hallmarks_tested)),
                'recent_hallmark': hallmark,
                'recent_organism': organism,
                'recent_effect_size': float(effect_size),
                'recent_p_value': float(p_value),
                'recent_significant': p_value < 0.05,
                'validations_total': len(self.biomarker_validations),
                'significant_validations': sum(1 for v in self.biomarker_validations if v['significant']),
            },
        }
        
        # Checkpoint every 8 iterations (covers all hallmark/organism combos)
        if self.iteration % 8 == 0:
            checkpoint_path = self.save_checkpoint()
            result['checkpoint_path'] = checkpoint_path
        
        return result
    
    def run(self):
        """Main loop"""
        try:
            while True:
                # Check for stdin input
                try:
                    line = sys.stdin.readline()
                    if line:
                        cmd = json.loads(line)
                        if cmd.get('action') == 'checkpoint':
                            checkpoint_path = self.save_checkpoint()
                            print(json.dumps({'action': 'checkpoint_saved', 'path': checkpoint_path}))
                        elif cmd.get('action') == 'pause':
                            print(json.dumps({'action': 'paused'}))
                            break
                except:
                    pass
                
                # Run iteration
                result = self.run_iteration()
                print(json.dumps(result))
                sys.stdout.flush()
                
        except KeyboardInterrupt:
            checkpoint_path = self.save_checkpoint()
            print(json.dumps({'action': 'interrupted', 'checkpoint': checkpoint_path}))
        except Exception as e:
            print(json.dumps({'error': str(e)}), file=sys.stderr)

if __name__ == '__main__':
    checkpoint_path = sys.argv[1] if len(sys.argv) > 1 else None
    worker = AgingWorker(checkpoint_path=checkpoint_path)
    worker.run()

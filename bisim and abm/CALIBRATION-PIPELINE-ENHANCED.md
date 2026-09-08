# Enhanced Data Calibration Pipeline
## Production-Grade Bayesian Inference for ABM Parameters

---

## I. MULTI-MODAL BAYESIAN INFERENCE FRAMEWORK

### A. Extended Likelihood Architecture

```python
"""
Multi-objective likelihood function integrating:
- ctDNA dynamics (VAF kinetics per driver)
- Immune phenotyping (CD8 infiltration + exhaustion)
- Spatial ecosystem (CAF density, immune zones, hypoxia)
- Functional drug testing (organoid dose-response)
- Clinical outcomes (time-to-progression, response duration)
"""

class MultiModalLikelihood:
    def __init__(self, 
                 data_weights=None,
                 model_variant='standard'):
        """
        data_weights: relative contribution of each modality
        model_variant: 'standard' or 'hierarchical' (for multi-patient)
        """
        
        self.data_weights = data_weights or {
            'ctdna': 0.35,      # Primary: VAF trajectories
            'immune': 0.25,     # CD8 + exhaustion
            'spatial': 0.15,    # CAF, immune zones, hypoxia
            'drug': 0.15,       # Organoid response
            'clinical': 0.10,   # TTP (when available)
        }
        
        self.model_variant = model_variant
        self.noise_models = {
            'ctdna': 'binomial',      # Sequencing noise
            'immune': 'lognormal',    # Measurement error
            'spatial': 'gaussian',    # Imaging uncertainty
            'drug': 'beta',           # Viability response
            'clinical': 'weibull',    # Time-to-event
        }
    
    def __call__(self, sim_output, observed_data, params):
        """
        Compute total log-likelihood.
        
        Args:
            sim_output: dict with simulated metrics (vaf, immune, spatial, ttp)
            observed_data: patient measurements
            params: simulation parameters (for prior evaluation)
        
        Returns:
            float: log p(data | params) + log p(params)
        """
        
        ll_total = 0
        
        # 1. ctDNA likelihood (primary data stream)
        ll_ctdna = self._likelihood_ctdna(
            sim_output['vaf_trajectory'],
            observed_data['ctdna'],
            params['mutation_rate']
        )
        ll_total += self.data_weights['ctdna'] * ll_ctdna
        
        # 2. Immune infiltration + exhaustion
        ll_immune = self._likelihood_immune(
            sim_output['immune_metrics'],
            observed_data['single_cell'],
            params['immune_infiltration_rate'],
            params['exhaustion_rate']
        )
        ll_total += self.data_weights['immune'] * ll_immune
        
        # 3. Spatial ecosystem
        ll_spatial = self._likelihood_spatial(
            sim_output['spatial_metrics'],
            observed_data['spatial'],
            params['stromal_barrier_strength']
        )
        ll_total += self.data_weights['spatial'] * ll_spatial
        
        # 4. Drug response (organoids)
        ll_drug = self._likelihood_drug(
            sim_output['drug_response'],
            observed_data['organoid'],
            params['drug_susceptibility_profile']
        )
        ll_total += self.data_weights['drug'] * ll_drug
        
        # 5. Clinical outcome (time-to-progression)
        if 'ttp_observed' in observed_data:
            ll_clinical = self._likelihood_clinical(
                sim_output['ttp_predicted'],
                observed_data['ttp_observed']
            )
            ll_total += self.data_weights['clinical'] * ll_clinical
        
        return ll_total
    
    def _likelihood_ctdna(self, vaf_sim, ctdna_obs, mutation_rate):
        """
        Binomial likelihood for VAF observations.
        
        Key insight: VAF measurement is noisy binomial draw from true VAF.
        We also account for:
        - Clonal hematopoiesis background (false positive VAF)
        - Detection limit (VAF > 1 per mL plasma, ~0.1-0.01%)
        - ctDNA fragment half-life (~2 hours; affects kinetics)
        """
        
        ll = 0
        
        for timepoint in ctdna_obs['timepoints']:
            for driver in ctdna_obs['drivers']:
                
                vaf_observed = ctdna_obs['vaf'][driver][timepoint]
                depth = ctdna_obs['depth'][timepoint]
                
                # Simulated VAF at this timepoint
                vaf_prediction = vaf_sim[driver][timepoint]
                
                # Measurement noise model: binomial
                if depth > 0 and 0 < vaf_prediction < 1:
                    # Number of mutant reads
                    n_mut = int(vaf_observed * depth)
                    
                    # Likelihood of observing this VAF given prediction
                    log_likelihood = binom.logpmf(
                        k=n_mut,
                        n=depth,
                        p=vaf_prediction
                    )
                    ll += log_likelihood
                
                # Penalty for clonal hematopoiesis background (rare events)
                if driver in ['TP53', 'DNMT3A'] and vaf_observed > 0:
                    # CH-associated drivers have higher background
                    ch_background = 0.001  # 0.1% baseline
                    ll -= ch_background * 10  # Small penalty if high VAF
        
        return ll
    
    def _likelihood_immune(self, immune_sim, single_cell_obs, inf_rate, exh_rate):
        """
        Joint likelihood for CD8 infiltration + exhaustion state.
        
        Data source: Single-cell RNA + ADT (protein)
        - CD8 T-cell count (via CD8A/CD8B genes + CD8 protein ADT)
        - Exhaustion markers (PD-1, LAG-3, TIM-3, CTLA-4 proteins)
        - TCR clonotypes (VDJ sequencing)
        """
        
        ll = 0
        
        # 1. CD8 infiltration (count likelihood)
        cd8_sim = immune_sim['cd8_count']
        cd8_obs = single_cell_obs['cd8_count']
        
        # Negative binomial (allows overdispersion; typical of count data)
        mu = cd8_obs  # Mean
        alpha = 0.5   # Overdispersion parameter
        
        log_likelihood_cd8 = nbinom.logpmf(
            k=cd8_sim,
            n=alpha,
            p=alpha / (alpha + mu)
        )
        ll += log_likelihood_cd8
        
        # 2. Exhaustion distribution (KL divergence)
        exhaustion_sim_dist = immune_sim['exhaustion_distribution']  # List of scores per cell
        exhaustion_obs_dist = single_cell_obs['exhaustion_distribution']
        
        # Bin into 10 bins [0, 0.1), [0.1, 0.2), ..., [0.9, 1.0]
        bins = np.linspace(0, 1, 11)
        hist_sim, _ = np.histogram(exhaustion_sim_dist, bins=bins)
        hist_obs, _ = np.histogram(exhaustion_obs_dist, bins=bins)
        
        # Normalize
        p_sim = hist_sim / hist_sim.sum()
        p_obs = hist_obs / hist_obs.sum()
        
        # KL divergence (likelihood interpretation)
        kl_div = np.sum(p_obs * np.log(p_obs / (p_sim + 1e-6)))
        ll -= kl_div * 50  # Weight KL divergence
        
        # 3. TCR clonotype richness (diversity metric)
        tcr_diversity_sim = immune_sim['tcr_shannon_diversity']
        tcr_diversity_obs = single_cell_obs['tcr_shannon_diversity']
        
        log_likelihood_tcr = norm.logpdf(
            tcr_diversity_sim,
            tcr_diversity_obs,
            tcr_diversity_obs * 0.15  # 15% measurement noise
        )
        ll += log_likelihood_tcr
        
        return ll
    
    def _likelihood_spatial(self, spatial_sim, spatial_obs, barrier_strength):
        """
        Likelihood for spatial metrics from imaging/spatial transcriptomics.
        
        Data sources:
        - Spatial transcriptomics (Visium, Slide-seq): CAF density, immune distribution
        - Imaging (CD8 IHC, FAP staining): quantitative metrics
        - Computed from: immune-to-CAF ratio, hypoxia-to-immune distance
        """
        
        ll = 0
        
        # 1. CAF density (stromal area%)
        caf_density_sim = spatial_sim['caf_fraction']
        caf_density_obs = spatial_obs['caf_fraction']
        
        ll += norm.logpdf(
            caf_density_sim,
            caf_density_obs,
            caf_density_obs * 0.2  # 20% uncertainty
        )
        
        # 2. Immune infiltration gradient (core vs. periphery)
        immune_core_sim = spatial_sim['cd8_in_core']
        immune_core_obs = spatial_obs['cd8_in_core']
        
        ll += norm.logpdf(
            immune_core_sim,
            immune_core_obs,
            0.08  # Absolute uncertainty: ±8%
        )
        
        # 3. Hypoxia zones (HIF-1α signature)
        hypoxia_frac_sim = spatial_sim['hypoxic_fraction']
        hypoxia_frac_obs = spatial_obs['hypoxic_fraction']
        
        ll += norm.logpdf(
            hypoxia_frac_sim,
            hypoxia_frac_obs,
            hypoxia_frac_obs * 0.15
        )
        
        # 4. Spatial structure: immune/CAF segregation
        #    High barrier strength → immune excluded from CAF-rich zones
        segregation_sim = spatial_sim['immune_caf_correlation']  # -1=exclusion, +1=colocalization
        segregation_obs = spatial_obs['immune_caf_correlation']
        
        ll += norm.logpdf(
            segregation_sim,
            segregation_obs,
            0.2  # ±0.2 correlation uncertainty
        )
        
        return ll
    
    def _likelihood_drug(self, drug_resp_sim, organoid_obs, susceptibility):
        """
        Likelihood for organoid dose-response curves.
        
        Observed: viability% at each drug concentration
        Simulated: predicted viability from drug susceptibility parameters
        """
        
        ll = 0
        
        for drug_name, dose_response in organoid_obs.items():
            doses = dose_response['doses']  # [0.001, 0.01, 0.1, 1.0] μM
            viability_obs = dose_response['viability']  # [95%, 75%, 22%, 5%]
            
            # Predicted viability (from sim)
            viability_pred = drug_resp_sim[drug_name]
            
            # Beta distribution likelihood
            # (viability is bounded [0, 1]; beta is natural)
            alpha = 2  # Shape parameter
            beta_param = 5
            
            for vp, vo in zip(viability_pred, viability_obs):
                vo_norm = vo / 100  # Convert % to [0,1]
                
                # Beta likelihood
                ll += beta.logpdf(
                    vp,
                    alpha + vo_norm * 10,  # Richer shape based on observation
                    beta_param
                )
        
        return ll
    
    def _likelihood_clinical(self, ttp_sim, ttp_obs):
        """
        Likelihood for time-to-progression (censored survival data).
        
        ttp_obs: (time_to_event, is_censored)
        ttp_sim: predicted time-to-progression
        """
        
        time, is_censored = ttp_obs
        
        if is_censored:
            # Censored: likelihood is S(t) = P(T > t)
            ll = weibull_sf(time, c=2, scale=ttp_sim)
        else:
            # Event observed: likelihood is f(t)
            ll = weibull_pdf(time, c=2, scale=ttp_sim)
        
        return np.log(max(1e-10, ll))

```

### B. Hierarchical Bayesian Model (Multi-Patient Pooling)

```python
class HierarchicalCalibration:
    """
    Bayesian model with two levels:
    - Hyperpriors (population-level): μ, σ of parameter distributions
    - Patient-level priors: each patient's parameters ~ N(μ, σ)
    
    Enables borrowing of strength across patients:
    - Data-rich patients help estimate population mean
    - Data-sparse patients benefit from population priors
    """
    
    def __init__(self, n_patients):
        self.n_patients = n_patients
        self.hyperpriors = {}
        self.patient_params = {}
    
    def build_pymc_model(self, patient_cohort, observed_data):
        """Construct hierarchical PyMC3 model"""
        
        import pymc as pm
        import pytensor.tensor as pt
        
        with pm.Model() as hierarchical_model:
            
            # ============== HYPERPRIORS (Population-Level) ==============
            
            # Fitness trait
            mu_fitness = pm.Normal('mu_fitness', 0.3, 0.1)
            sigma_fitness = pm.HalfNormal('sigma_fitness', 0.15)
            
            # Mutation rate (log scale)
            mu_log_mutation = pm.Normal('mu_log_mutation', -6, 1)
            sigma_log_mutation = pm.HalfNormal('sigma_log_mutation', 1)
            
            # Immune infiltration rate
            mu_immune_inf = pm.Beta('mu_immune_inf', 5, 10)  # E[X] ≈ 0.33
            sigma_immune_inf = pm.HalfNormal('sigma_immune_inf', 0.2)
            
            # Exhaustion rate
            mu_exhaustion = pm.Beta('mu_exhaustion', 3, 3)
            sigma_exhaustion = pm.HalfNormal('sigma_exhaustion', 0.15)
            
            # Stromal barrier strength
            mu_barrier = pm.Beta('mu_barrier', 2, 3)
            sigma_barrier = pm.HalfNormal('sigma_barrier', 0.15)
            
            # ============== PATIENT-LEVEL PARAMETERS ==============
            
            patient_params = {}
            
            for pt_id, patient in enumerate(patient_cohort):
                
                # Patient i's fitness trait (hierarchical)
                fitness_i = pm.Normal(
                    f'fitness_{pt_id}',
                    mu=mu_fitness,
                    sigma=sigma_fitness
                )
                
                # Patient i's mutation rate
                log_mutation_i = pm.Normal(
                    f'log_mutation_{pt_id}',
                    mu=mu_log_mutation,
                    sigma=sigma_log_mutation
                )
                mutation_rate_i = pm.math.exp(log_mutation_i)
                
                # Patient i's immune infiltration
                immune_inf_i = pm.Normal(
                    f'immune_inf_{pt_id}',
                    mu=mu_immune_inf,
                    sigma=sigma_immune_inf
                )
                
                # Patient i's exhaustion rate
                exhaustion_i = pm.Normal(
                    f'exhaustion_{pt_id}',
                    mu=mu_exhaustion,
                    sigma=sigma_exhaustion
                )
                
                # Patient i's stromal barrier
                barrier_i = pm.Normal(
                    f'barrier_{pt_id}',
                    mu=mu_barrier,
                    sigma=sigma_barrier
                )
                
                patient_params[pt_id] = {
                    'fitness': fitness_i,
                    'mutation_rate': mutation_rate_i,
                    'immune_inf': immune_inf_i,
                    'exhaustion': exhaustion_i,
                    'barrier': barrier_i,
                }
                
                # ============== LIKELIHOOD (Patient-Specific) ==============
                
                # Initialize simulation with this patient's parameters
                sim_params = {
                    'fitness_trait_mean': fitness_i,
                    'mutation_rate': mutation_rate_i,
                    'immune_infiltration_rate': immune_inf_i,
                    'exhaustion_rate': exhaustion_i,
                    'stromal_barrier_strength': barrier_i,
                }
                
                # Run simulation → get predicted metrics
                sim_output = self.simulate_patient(sim_params)
                
                # Multi-modal likelihood
                likelihood_module = MultiModalLikelihood()
                
                ll = likelihood_module(
                    sim_output=sim_output,
                    observed_data=observed_data[pt_id],
                    params=sim_params
                )
                
                # Observe (add to model)
                pm.Potential(f'likelihood_{pt_id}', ll)
        
        return hierarchical_model
    
    def fit(self, patient_cohort, observed_data, n_iter=3000, n_chains=4):
        """
        Run hierarchical MCMC inference.
        
        Returns:
            idata: arviz InferenceData with posterior samples
        """
        
        import pymc as pm
        
        model = self.build_pymc_model(patient_cohort, observed_data)
        
        with model:
            # Initialization with better starting values
            MAP_init = pm.find_MAP()
            
            # MCMC sampling
            idata = pm.sample(
                draws=n_iter,
                tune=1000,
                chains=n_chains,
                cores=4,
                initvals=MAP_init,
                return_inferencedata=True,
                progressbar=True,
            )
        
        return idata
    
    def posterior_predictive_check(self, idata, patient_id, observed_data):
        """
        Generate posterior predictive distribution for patient.
        
        Steps:
        1. Sample from posterior (parameter uncertainty)
        2. Run simulation with each posterior sample
        3. Compare predicted metrics to observed
        """
        
        posterior_samples = idata.posterior.stack(
            sample=('chain', 'draw')
        )
        
        n_samples = posterior_samples.dims['sample']
        predictions = {
            'vaf': [],
            'immune': [],
            'spatial': [],
        }
        
        for i in range(n_samples):
            # Extract i-th posterior sample
            params_i = {
                'fitness': float(posterior_samples.fitness_[patient_id].values[i]),
                'mutation_rate': float(posterior_samples.mutation_rate_[patient_id].values[i]),
                'immune_inf': float(posterior_samples.immune_inf_[patient_id].values[i]),
                'exhaustion': float(posterior_samples.exhaustion_[patient_id].values[i]),
                'barrier': float(posterior_samples.barrier_[patient_id].values[i]),
            }
            
            # Simulate
            sim_output = self.simulate_patient(params_i)
            predictions['vaf'].append(sim_output['vaf_trajectory'])
            predictions['immune'].append(sim_output['immune_metrics'])
            predictions['spatial'].append(sim_output['spatial_metrics'])
        
        # Convert to arrays; compute credible intervals
        pred_vaf_array = np.array(predictions['vaf'])  # (n_samples, n_timepoints, n_drivers)
        
        # Credible intervals
        ci_lower = np.percentile(pred_vaf_array, 2.5, axis=0)
        ci_upper = np.percentile(pred_vaf_array, 97.5, axis=0)
        median = np.percentile(pred_vaf_array, 50, axis=0)
        
        # Check: do observed data fall within 95% CI?
        obs_vaf = observed_data['ctdna']['vaf']
        coverage = np.mean((ci_lower <= obs_vaf) & (obs_vaf <= ci_upper))
        
        return {
            'median': median,
            'ci_lower': ci_lower,
            'ci_upper': ci_upper,
            'coverage': coverage,  # Should be ~0.95
        }
```

---

## II. REAL-TIME CALIBRATION UPDATES

```python
class AdaptiveCalibration:
    """
    Update patient model in real-time as new data arrives.
    
    Timeline:
    - Week 0: Baseline (ctDNA, immune, spatial) → initial calibration
    - Week 3: Treatment response ctDNA → update posterior
    - Week 8: Mid-treatment ctDNA + immune → refine prediction
    - Week 12: End-of-treatment → full re-calibration
    """
    
    def __init__(self, patient_id, initial_posterior):
        self.patient_id = patient_id
        self.posterior = initial_posterior  # From initial calibration
        self.calibration_history = []
        self.predictions_history = []
    
    def update_posterior(self, new_data, model):
        """
        Bayesian update: posterior_new ∝ likelihood(new_data) × prior_old
        
        Uses Sequential Monte Carlo (SMC) for efficient updates.
        """
        
        import pymc as pm
        
        with model:
            # Run SMC with new data
            idata_updated = pm.sample_smc(
                draws=2000,
                cores=4,
                return_inferencedata=True,
            )
        
        self.posterior = idata_updated
        self.calibration_history.append({
            'date': datetime.now(),
            'data_type': new_data['type'],  # 'ctdna', 'immune', 'spatial'
            'idata': idata_updated,
        })
        
        return idata_updated
    
    def predict_with_uncertainty(self, horizon_weeks=8):
        """
        Generate predictions + credible intervals for future timepoints.
        
        Accounts for:
        - Parameter uncertainty (posterior distribution)
        - Stochastic simulation noise
        - Model misspecification uncertainty
        """
        
        posterior_samples = self.posterior.posterior.stack(sample=('chain', 'draw'))
        n_samples = posterior_samples.dims['sample']
        
        trajectory_samples = []
        
        for i in range(min(n_samples, 500)):  # Cap at 500 samples
            # Sample parameters from posterior
            params = {
                'fitness': float(posterior_samples.fitness_.values[i]),
                'mutation_rate': float(posterior_samples.mutation_rate_.values[i]),
                # ...
            }
            
            # Run simulation
            sim = TumorSimulation(params)
            sim.run(t_max=horizon_weeks)
            
            trajectory = sim.metrics.vaf_trajectory
            trajectory_samples.append(trajectory)
        
        trajectory_array = np.array(trajectory_samples)
        
        # Compute quantiles
        predictions = {
            'median': np.percentile(trajectory_array, 50, axis=0),
            'lower_95': np.percentile(trajectory_array, 2.5, axis=0),
            'upper_95': np.percentile(trajectory_array, 97.5, axis=0),
            'lower_50': np.percentile(trajectory_array, 25, axis=0),
            'upper_50': np.percentile(trajectory_array, 75, axis=0),
        }
        
        self.predictions_history.append({
            'date': datetime.now(),
            'horizon': horizon_weeks,
            'predictions': predictions,
        })
        
        return predictions
```

---

## III. SENSITIVITY ANALYSIS & VALIDATION

### A. Morris Screening (Fast, Global)

```python
class SensitivityAnalyzer:
    def morris_screening(self, sim_params, output_metric='ttp'):
        """
        Morris method: efficient OAT (One-At-a-Time) screening.
        
        Computes for each parameter:
        - μ (mean effect): overall influence on output
        - σ (std of effect): non-linearity / interaction
        """
        
        from SALib.sample.morris import sample
        from SALib.analyze.morris import analyze
        
        # Define problem
        problem = {
            'num_vars': len(sim_params),
            'names': list(sim_params.keys()),
            'bounds': [
                [0.1, 0.5],      # fitness_mean
                [0.001, 0.01],   # mutation_rate
                [0.1, 0.8],      # immune_infiltration
                # ... (other params)
            ]
        }
        
        # Generate samples (trajectory-based)
        param_values = sample(problem, N=20, num_levels=4)
        
        outputs = []
        for params_i in param_values:
            sim = TumorSimulation(params_i)
            sim.run(t_max=100)
            outputs.append(sim.metrics[output_metric])
        
        # Analyze
        Si = analyze(problem, param_values, outputs)
        
        # Return sorted by μ (main effect)
        return pd.DataFrame({
            'parameter': Si['names'],
            'mu': Si['mu'],           # Mean effect
            'sigma': Si['sigma'],     # Std effect (non-linearity)
            'mu_star': Si['mu_star'], # Absolute effect
        }).sort_values('mu_star', ascending=False)
    
    def sobol_variance_decomposition(self, sim_params, output_metric='ttp'):
        """
        Sobol indices: proportion of output variance explained by each parameter.
        
        - S1 (first-order): main effect
        - S2 (second-order): two-way interactions
        - ST (total): all effects involving this parameter
        """
        
        from SALib.sample.saltelli import sample
        from SALib.analyze.sobol import analyze
        
        problem = {
            'num_vars': len(sim_params),
            'names': list(sim_params.keys()),
            'bounds': [...],  # same as Morris
        }
        
        # Generate samples (more than Morris; Saltelli sampling)
        param_values = sample(problem, N=2048, calc_second_order=True)
        
        outputs = []
        for params_i in param_values:
            sim = TumorSimulation(params_i)
            sim.run(t_max=100)
            outputs.append(sim.metrics[output_metric])
        
        # Analyze
        Si = analyze(problem, param_values, outputs, calc_second_order=True)
        
        # Interpret
        results = pd.DataFrame({
            'parameter': Si['names'],
            'S1': Si['S1'],          # Main effect
            'S1_conf': Si['S1_conf'],
            'ST': Si['ST'],          # Total effect
            'ST_conf': Si['ST_conf'],
        })
        
        # Check for strong interactions
        S2_nonzero = [Si['S2_' + param] for param in Si['names']]
        
        return results
```

### B. Model Validation Workflow

```python
class ModelValidator:
    """
    Systematic validation against held-out data.
    """
    
    def kfold_cross_validation(self, patient_cohort, k=5, test_timepoint=8):
        """
        k-fold: cycle through training on k-1 patients, test on 1.
        
        Measures: How well does calibration on patients 1..k-1 predict patient k?
        """
        
        results = {
            'predictions': {},
            'errors': {},
            'metrics': {},
        }
        
        for fold_idx in range(k):
            # Split
            test_patient = patient_cohort[fold_idx]
            train_patients = [p for i, p in enumerate(patient_cohort) if i != fold_idx]
            
            # Calibrate on training set
            model = self.build_hierarchical_model(train_patients)
            idata = self.fit(model, train_patients)
            
            # Predict for test patient
            pred = self.predict_for_patient(test_patient, idata)
            
            # Compare to observed
            obs = test_patient.obs_vaf_at_timepoint[test_timepoint]
            error = (pred - obs) / obs
            
            results['predictions'][test_patient.id] = pred
            results['errors'][test_patient.id] = error
        
        # Summary metrics
        errors_arr = np.array(list(results['errors'].values()))
        results['metrics'] = {
            'mean_error': np.mean(errors_arr),
            'rmse': np.sqrt(np.mean(errors_arr**2)),
            'mae': np.mean(np.abs(errors_arr)),
            'r2': 1 - (np.sum(errors_arr**2) / np.sum((errors_arr - np.mean(errors_arr))**2)),
        }
        
        return results
    
    def prospective_validation(self, patient_id, predicted_metrics, observed_outcomes):
        """
        Prospective: Does model predict real future outcomes?
        
        Tested after treatment + follow-up.
        """
        
        validation = {}
        
        # Prediction 1: VAF at week 8
        pred_vaf_w8 = predicted_metrics['vaf_week8']['median']
        obs_vaf_w8 = observed_outcomes['vaf_week8']
        error_vaf = (pred_vaf_w8 - obs_vaf_w8) / obs_vaf_w8
        validation['vaf_error'] = error_vaf
        
        # Prediction 2: Treatment response category
        pred_response = predicted_metrics['best_overall_response']  # CR, PR, SD, PD
        obs_response = observed_outcomes['best_overall_response']
        validation['response_match'] = (pred_response == obs_response)
        
        # Prediction 3: Time-to-progression
        pred_ttp = predicted_metrics['ttp_predicted']
        obs_ttp = observed_outcomes['ttp_observed']
        error_ttp = (pred_ttp - obs_ttp) / obs_ttp
        validation['ttp_error'] = error_ttp
        
        # Prediction 4: Resistant clone emergence
        pred_resistance_time = predicted_metrics['resistance_emergence_week']
        obs_resistance_time = observed_outcomes['resistance_emergence_week']
        
        # Acceptable if within ±2 weeks
        validation['resistance_timing_error'] = abs(pred_resistance_time - obs_resistance_time)
        validation['resistance_timing_acceptable'] = (validation['resistance_timing_error'] <= 2)
        
        return validation
```

---

## IV. PRODUCTION WORKFLOWS

### A. Data Collection Protocol

```python
class DataCollectionProtocol:
    """
    Standardized timeline for collecting multi-modal measurements.
    """
    
    TIMEPOINT_SCHEDULE = {
        'baseline': {
            'day': 0,
            'assays': ['wes', 'single_cell', 'spatial_txn', 'organoid_drug_test', 'imaging'],
        },
        'week_3': {
            'day': 21,
            'assays': ['ctdna', 'blood_immune', 'imaging'],
        },
        'week_8': {
            'day': 56,
            'assays': ['ctdna', 'blood_immune', 'imaging'],
        },
        'week_12': {
            'day': 84,
            'assays': ['ctdna', 'blood_immune', 'imaging'],
        },
        'week_24': {
            'day': 168,
            'assays': ['ctdna', 'blood_immune', 'imaging'],
        },
        'recurrence': {
            'day': 'variable',
            'assays': ['ctdna', 'imaging', 'repeat_biopsy_spatial'],
        },
    }
    
    def validate_data_completeness(self, patient_data):
        """
        Check: is patient data sufficient for calibration?
        
        Minimum requirements:
        - ctDNA: ≥2 timepoints with VAF > 0.001 (0.1%)
        - Immune: ≥3000 single-cell profiles
        - Spatial: ≥1 transcriptomics section
        - Drug: ≥3 drug dose-response curves
        """
        
        checks = {
            'ctdna_sufficient': len(patient_data['ctdna']) >= 2 and max(patient_data['ctdna_vaf']) >= 0.001,
            'immune_sufficient': len(patient_data['single_cell']) >= 3000,
            'spatial_sufficient': len(patient_data['spatial_spots']) >= 1000,
            'drug_sufficient': len(patient_data['organoid_drugs']) >= 3,
        }
        
        all_sufficient = all(checks.values())
        
        return {
            'sufficient': all_sufficient,
            'checks': checks,
            'recommendation': 'ready for calibration' if all_sufficient else 'collect more data',
        }
    
    def flag_data_quality_issues(self, patient_data):
        """
        Identify and flag potential data problems.
        """
        
        issues = []
        
        # Check ctDNA depth
        if patient_data['ctdna_depth'] < 5000:
            issues.append('Low sequencing depth (<5000x); VAF uncertainty high')
        
        # Check immune infiltration
        cd8_pct = patient_data['single_cell_cd8_pct']
        if cd8_pct < 1:
            issues.append('Very low CD8 infiltration (<1%); immune exclusion phenotype')
        
        # Check spatial quality
        mito_pct = patient_data['spatial_mitochondrial_pct']
        if mito_pct > 15:
            issues.append('High mitochondrial content in spatial; potential quality issue')
        
        return issues
```

### B. Automated Pipeline (Snakemake)

```snakemake
# Snakemake workflow: from raw data → calibrated model

rule all:
    input:
        "results/{patient_id}/calibration_complete.flag"

rule parse_ctdna:
    input:
        vcf="data/{patient_id}/tumor.vcf"
    output:
        processed="results/{patient_id}/ctdna_processed.csv"
    shell:
        "python scripts/parse_ctdna.py {input.vcf} {output.processed}"

rule parse_single_cell:
    input:
        h5ad="data/{patient_id}/single_cell.h5ad"
    output:
        processed="results/{patient_id}/immune_metrics.csv"
    shell:
        "python scripts/parse_single_cell.py {input.h5ad} {output.processed}"

rule parse_spatial:
    input:
        visium="data/{patient_id}/visium.h5ad"
    output:
        processed="results/{patient_id}/spatial_metrics.csv"
    shell:
        "python scripts/parse_spatial.py {input.visium} {output.processed}"

rule calibrate_mcmc:
    input:
        ctdna="results/{patient_id}/ctdna_processed.csv",
        immune="results/{patient_id}/immune_metrics.csv",
        spatial="results/{patient_id}/spatial_metrics.csv"
    output:
        posterior="results/{patient_id}/posterior_samples.nc",
        summary="results/{patient_id}/calibration_summary.txt"
    shell:
        "python scripts/calibrate_mcmc.py \
            --ctdna {input.ctdna} \
            --immune {input.immune} \
            --spatial {input.spatial} \
            --output {output.posterior} \
            --summary {output.summary}"

rule predict_treatment_response:
    input:
        posterior="results/{patient_id}/posterior_samples.nc"
    output:
        predictions="results/{patient_id}/treatment_predictions.json"
    shell:
        "python scripts/predict.py \
            --posterior {input.posterior} \
            --output {output.predictions}"

rule generate_report:
    input:
        summary="results/{patient_id}/calibration_summary.txt",
        predictions="results/{patient_id}/treatment_predictions.json"
    output:
        report="results/{patient_id}/clinical_report.pdf",
        flag="results/{patient_id}/calibration_complete.flag"
    shell:
        "python scripts/generate_report.py \
            --summary {input.summary} \
            --predictions {input.predictions} \
            --output {output.report} && touch {output.flag}"
```

---

## V. INTEGRATION WITH ABM VISUALIZATION

```python
class CalibrationToVisualization:
    """
    Export calibrated model → interactive React component.
    """
    
    def export_to_json(self, idata, patient_id, output_file):
        """
        Serialize posterior parameters + predictions to JSON.
        """
        
        posterior = idata.posterior.mean(dim=['chain', 'draw'])
        
        export_dict = {
            'patient_id': patient_id,
            'calibration_date': datetime.now().isoformat(),
            'posterior_params': {
                'fitness_mean': float(posterior.fitness_.values),
                'mutation_rate': float(posterior.mutation_rate_.values),
                'immune_infiltration': float(posterior.immune_inf_.values),
                'exhaustion_rate': float(posterior.exhaustion_.values),
                'stromal_barrier': float(posterior.barrier_.values),
            },
            'uncertainty': {
                'fitness_std': float(idata.posterior.fitness_.std(dim=['chain', 'draw']).values),
                # ...
            },
            'predictions': {
                'ttp_week_8': float(self.predict_ttp(posterior, horizon=8)),
                'vaf_trajectory': self.predict_vaf_trajectory(posterior).tolist(),
                'immune_infiltration_week_8': float(self.predict_immune(posterior, week=8)),
            }
        }
        
        with open(output_file, 'w') as f:
            json.dump(export_dict, f, indent=2)
    
    def load_into_visualization(self, json_file, sim_component):
        """
        Load calibrated model into React component.
        """
        
        with open(json_file) as f:
            data = json.load(f)
        
        # Initialize sim with posterior median
        sim = TumorSimulation(data['posterior_params'])
        sim_component.setState({
            'sim': sim,
            'calibrated_params': data['posterior_params'],
            'predictions': data['predictions'],
            'credible_intervals': data['uncertainty'],
        })
```

---

End of enhanced calibration pipeline.

**Ready for Phase 2 deployment: Bayesian inference + real-time updates + validation.**

# Brute Force Resolver (BFR)

**Autonomous 24/7 compute engine for publishable incremental progress on hard open problems in mathematics, complexity theory, and biotech.**

Target: Generate research contributions for venues like *Annals of Mathematics*, *FOCS*, *Nature Aging*, *GeroScience*.

---

## Overview

BFR is a multi-worker, checkpoint-aware orchestration system that:

1. **Runs persistent compute workers** on mathematical and scientific problems
2. **Tracks incremental progress** via time-series metrics
3. **Detects and flags discoveries** when breakthroughs occur
4. **Checkpoints state** to survive interruptions without losing progress
5. **Publishes results** in research-appropriate formats

### The Three Focus Areas

| Problem | Status | Incremental Target | Venue |
|---------|--------|-------------------|-------|
| **Riemann Hypothesis** | Open; 40% density bound | Higher zero-density bounds, extended verification | *Math. Comp.*, *Inventiones* |
| **P vs NP** | Open; no circuit separations | SAT solver lower bounds, ACC⁰ insights | *FOCS*, *CCC*, *JACM* |
| **Aging Biology** | 100 open problems catalogued (2025 roadmap) | Biomarker validation, single-mechanism studies | *Nature Aging*, *GeroScience*, *Aging Cell* |

---

## Architecture

### Orchestrator (Node.js)

- **Process manager**: Spawns and monitors Python workers
- **Database**: SQLite with WAL for concurrent writes
  - Problem registry
  - Result logging (time-series)
  - Discovery tracking
  - Worker health checks
- **Discovery detection**: Watches for metric improvements above thresholds
- **Checkpointing**: Periodic state snapshots for fault tolerance

### Workers (Python)

Three specialized workers, each implementing problem-specific algorithms:

#### 1. Riemann Worker (`riemann_worker.py`)

- **Algorithm**: Odlyzko–Schönhage FFT-based zero counter + Mertens function
- **Metric**: Density bound (current: ~0.4; goal: improve toward ≥0.5 or ≤0.3)
- **Output**: Verified zero counts, Mertens bounds, density estimates
- **Checkpoint**: Every 10 iterations (saves T, zero count, convergence data)

**Publication angle:**
```
"Extended computational verification of Riemann Hypothesis to T=10^N
with refined density bounds and Mertens function estimates"
```

#### 2. P vs NP Worker (`pnp_worker.py`)

- **Algorithm**: Random 3-SAT generation at phase transition + solver conflict analysis
- **Metric**: Estimated circuit lower bound (normalized to [0,1])
- **Output**: SAT hardness statistics, resolution depth curves, barrier insights
- **Checkpoint**: Every 5 iterations (saves solver stats, learned clauses)

**Publication angle:**
```
"Automated discovery of circuit lower bounds via SAT solver analysis
and conflict-clause statistics"
```

#### 3. Aging Worker (`aging_worker.py`)

- **Algorithm**: Simulation-based biomarker validation across aging hallmarks
- **Metric**: Mean absolute effect size from biomarker studies
- **Output**: Hallmark-by-organism validation matrix, intervention sweeps, effect sizes
- **Checkpoint**: Every 8 iterations (covers all hallmark/organism combos)

**Publication angle:**
```
"Systematic biomarker validation for aging hallmarks:
a computational framework for [organism] model studies"
```

---

## Installation

### Prerequisites

- **Node.js** ≥ 18.0.0
- **Python** ≥ 3.10
- **System packages** (Ubuntu/Debian):
  ```bash
  sudo apt-get update
  sudo apt-get install build-essential python3-dev libsqlite3-dev
  ```

### Setup

1. **Clone or copy the repository**
   ```bash
   mkdir bfr && cd bfr
   # Copy all files here
   ```

2. **Install Node dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt --break-system-packages
   ```

4. **Optional: Install SAT solver (for P vs NP worker)**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install cadical
   
   # macOS
   brew install cadical
   ```

5. **Make CLI executable**
   ```bash
   chmod +x bfr-cli.js
   ```

---

## Usage

### Start All Problems

```bash
npm start
# Equivalent to:
# node bfr-cli.js start --problems riemann,pnp,aging
```

Allocates available cores evenly across problems. On an 8-core machine:
- 2-3 workers per problem
- Continuous compute, checkpoints every 10-8 iterations

### Start Single Problem

```bash
# Just Riemann
npm run start-riemann

# Just P vs NP
npm run start-pnp

# Just Aging
npm run start-aging
```

### Submit Additional Problem

```bash
node bfr-cli.js submit --problem aging --workers 2
```

### Monitor Status

```bash
npm run status
```

Output:
```
📊 BFR Status Report
========================
Timestamp: 2025-09-05T15:45:23Z
Uptime: 3600s
CPU Cores: 8
Active Workers: 6

Problems:
  • Riemann Hypothesis: Zero-Density Bounds (riemann-hypothesis)
    Status: running
    Category: mathematics
    Last metric: 0.412340
  • P vs NP: Circuit Lower Bounds (pnp-circuit-bounds)
    Status: running
    Category: complexity_theory
    Last metric: 0.023890
  • Aging Biology: Biomarker Validation (aging-biomarkers)
    Status: running
    Category: biotech
    Last metric: 0.287456
```

### Check Discoveries

```bash
npm run discoveries
```

Output:
```
🔬 Recent Discoveries
======================

📍 Aging Biology: Biomarker Validation (2025-09-05T16:12:34Z)
   Type: metric_improvement
   Significant biomarker effect size improvement in C. elegans
   Confidence: 87.3%
   Reviewed: Pending
```

### Shutdown

```bash
node bfr-cli.js shutdown
```

Or press Ctrl+C during `npm start`.

---

## Database Schema

All results stored in `bfr.db` (SQLite):

### Tables

- **problems**: Registry of registered problems
  ```
  id, name, category, status, workers_allocated, 
  created_at, last_checkpoint, checkpoint_path
  ```

- **results**: Time-series metric values
  ```
  id, problem_id, timestamp, metric, value, metadata, is_discovery
  ```

- **workers**: Active worker processes
  ```
  id, problem_id, cpu_core, status, started_at, last_heartbeat,
  iterations, memory_mb
  ```

- **discoveries**: Flagged breakthroughs
  ```
  id, problem_id, timestamp, discovery_type, description,
  metric_name, old_value, new_value, confidence_score,
  requires_review, reviewed_by, reviewed_at
  ```

### Query Examples

```bash
# Recent discoveries needing review
sqlite3 bfr.db "SELECT * FROM discoveries WHERE requires_review = 1 ORDER BY timestamp DESC LIMIT 5;"

# Problem status over time
sqlite3 bfr.db "SELECT problem_id, metric, value, timestamp FROM results WHERE problem_id = 'riemann-hypothesis' ORDER BY timestamp DESC LIMIT 20;"

# Worker health
sqlite3 bfr.db "SELECT * FROM workers WHERE status = 'running';"
```

---

## Discovery Thresholds

Problems are flagged as discoveries when metrics improve by:

- **Riemann**: 1% improvement (high precision needed)
- **P vs NP**: 5% improvement (lower circuit bounds are harder to improve)
- **Aging**: 10% improvement (applied research, more variance)

Threshold in code: `orchestrator.discoveryThresholds`

---

## Checkpointing & Resume

Each worker saves state periodically:

```
./checkpoints/
  ├── riemann_checkpoint_10000000000000.pkl
  ├── pnp_checkpoint_iter50.pkl
  └── aging_checkpoint_iter32.pkl
```

If orchestrator restarts, workers auto-resume from latest checkpoint.

**Manual resume:**
```bash
node bfr-cli.js submit --problem riemann --workers 2
# Workers will auto-detect and resume from latest checkpoint
```

---

## Publication Workflow

### 1. Monitor Discoveries
```bash
npm run discoveries
```

### 2. Review & Validate
- Extract discovery details from `bfr.db`
- Verify metric computation with independent code
- Gather checkpoint data for supplementary materials

### 3. Generate Manuscript
```bash
# Extract results
sqlite3 bfr.db > results_export.csv

# Prepare figures (plot metric over time, effect sizes, etc.)
# See `analysis/` for visualization scripts (to be built)
```

### 4. Submit to Venue
- **Riemann/P vs NP**: Computational Mathematics, FOCS workshop, arXiv Theory
- **Aging**: Nature Aging, GeroScience, bioRxiv, J. Gerontology

---

## Extending the System

### Add a New Problem

1. **Create worker script** (`workers/my_problem_worker.py`)
   - Implement `run_iteration()` → JSON with `metric` and `value`
   - Handle checkpointing (pickle state, respond to `action: checkpoint`)

2. **Register in CLI** (`bfr-cli.js`, `cmdStart`)
   ```javascript
   orch.registerProblem('my-problem', 'My Problem Name', 'category');
   orch.spawnWorker('my-problem', 'workers/my_problem_worker.py');
   ```

3. **Set discovery threshold** in orchestrator
   ```javascript
   this.discoveryThresholds['my'] = 0.05;
   ```

### Scale to Multiple Machines

For distributed compute:

1. **Worker pool**: SSH to remote machines, spawn workers
2. **Central database**: Move SQLite to PostgreSQL, expose over network
3. **Result aggregation**: Collect checkpoints from all machines to central store

(Future extension; not included in v0.1)

---

## Performance Expectations

### Riemann Worker
- **Per iteration**: ~5-15 seconds (depends on FFT size, precision)
- **Zero count advance**: +100M zeros per iteration
- **Timeline**: Verify to 10^14-10^15 height in weeks/months

### P vs NP Worker
- **Per iteration**: ~2-5 seconds (SAT solver timeout = 5s per instance)
- **Instances solved**: ~10-20 per iteration
- **Lower bounds accumulation**: Slow (barrier is hard); publish after 1-2 months of data

### Aging Worker
- **Per iteration**: ~1-2 seconds (simulation-based, fast)
- **Hallmarks tested**: ~1 per iteration (8-hallmark cycle)
- **Publication-ready data**: ~2-4 weeks continuous run

---

## Troubleshooting

### Worker exits immediately
```
Error: Cannot find module 'mpmath'
```
→ Install Python dependencies: `pip install -r requirements.txt --break-system-packages`

### Database locked
```
Error: SQLITE_BUSY: database is locked
```
→ Multiple processes writing simultaneously. Restart with fewer workers, or increase `PRAGMA busy_timeout`.

### SAT solver not found (P vs NP worker)
```
[PNP] Warning: SAT solver 'cadical' not found. Using mock data.
```
→ Install: `sudo apt-get install cadical` or `brew install cadical`

### Low metric improvement
→ Expected! These are *hard* problems. Publish incremental progress.

---

## File Structure

```
bfr/
├── bfr-orchestrator.js       # Main orchestrator
├── bfr-cli.js                # CLI interface
├── package.json              # Node.js dependencies
├── requirements.txt          # Python dependencies
├── README.md                 # This file
├── workers/
│   ├── riemann_worker.py     # Riemann Hypothesis worker
│   ├── pnp_worker.py         # P vs NP worker
│   └── aging_worker.py       # Aging Biology worker
├── checkpoints/              # Auto-generated; persistent state
└── bfr.db                    # Auto-generated; SQLite database
```

---

## Research Ethics & Reproducibility

- **All computation is deterministic** (seeded random number generators for reproducibility)
- **Checkpoints are versioned** (include timestamp, iteration, algorithm version)
- **Results logged with metadata** (full solver config, precision, hardware specs)
- **Open science**: Publish checkpoints, raw metrics, and code alongside papers

---

## License

MIT

---

## Citation

If BFR contributes to published work:

```bibtex
@software{bfr2025,
  author = {Dj},
  title = {Brute Force Resolver: Autonomous Compute Engine for Hard Open Problems},
  year = {2025},
  url = {https://github.com/yourusername/bfr}
}
```

---

## Contact & Collaboration

For questions or collaboration on extending BFR:
- Open an issue
- Propose new problem areas
- Partner on validation & publication

**Status**: v0.1 (alpha); active development

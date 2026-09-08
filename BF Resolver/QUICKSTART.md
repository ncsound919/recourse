# BFR Quick Start

Get the Brute Force Resolver running in 5 minutes.

## 1. Install Dependencies

```bash
# Node.js dependencies
npm install

# Python dependencies
pip install -r requirements.txt --break-system-packages

# Optional: SAT solver for P vs NP
sudo apt-get install cadical  # or: brew install cadical
```

## 2. Start the Engine

```bash
# Run all three problems (Riemann, P vs NP, Aging)
npm start

# Output:
# 🚀 Starting BFR Orchestrator
# 📊 Total cores: 8
# 🎯 Problems: riemann, pnp, aging
# 👷 Workers per problem: 2-3
# ✅ Orchestrator started. Compute running 24/7.
```

That's it! The engine is now computing autonomously.

## 3. Monitor Progress

In a separate terminal:

```bash
# Current status
npm run status

# Recent discoveries
npm run discoveries

# Both (watch mode)
watch -n 5 "npm run status && npm run discoveries"
```

## 4. What's Running?

### Riemann Worker
- Verifying zeros on critical strip to higher T values
- Computing density bounds and Mertens function
- Metric: `density_bound` (current ~0.4; goal: improve beyond 0.4 or below)

### P vs NP Worker
- Solving 3-SAT instances at phase transition
- Extracting circuit lower bound evidence from solver behavior
- Metric: `circuit_lower_bound_estimate` (normalized to [0,1])

### Aging Worker
- Simulating aging hallmarks across model organisms
- Validating biomarkers (effect sizes) for interventions
- Metric: `biomarker_validation_effect_size` (mean absolute effect across hallmarks)

## 5. Key Commands

```bash
# Start all
npm start

# Start single problem
npm run start-riemann
npm run start-pnp
npm run start-aging

# Check status
npm run status

# Recent discoveries
npm run discoveries

# Submit new problem with N workers
node bfr-cli.js submit --problem aging --workers 3

# Shutdown
node bfr-cli.js shutdown
```

## 6. Database & Checkpoints

All state is persisted:

```bash
# View all discoveries
sqlite3 bfr.db "SELECT problem_id, discovery_type, description, confidence_score FROM discoveries ORDER BY timestamp DESC LIMIT 10;"

# View recent results for Riemann
sqlite3 bfr.db "SELECT timestamp, metric, value FROM results WHERE problem_id = 'riemann-hypothesis' ORDER BY timestamp DESC LIMIT 20;"

# Export results to CSV
sqlite3 bfr.db ".mode csv" ".output results.csv" "SELECT * FROM results;"

# List checkpoints
ls -lh checkpoints/
```

## 7. Keep Running 24/7

Option A: **Use systemd service** (Linux)
```bash
# Create /etc/systemd/system/bfr.service
[Unit]
Description=Brute Force Resolver
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/bfr
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Enable and start
sudo systemctl enable bfr
sudo systemctl start bfr
sudo systemctl status bfr
```

Option B: **Use screen or tmux**
```bash
screen -S bfr
npm start
# Detach: Ctrl+A, Ctrl+D
# Reattach: screen -r bfr
```

Option C: **Use nohup**
```bash
nohup npm start > bfr.log 2>&1 &
tail -f bfr.log
```

## 8. Expected Performance

### Riemann Worker (per core)
- ~5-10 iterations/hour
- ~500M zeros verified/day
- Timeline: 10^14-10^15 range in weeks

### P vs NP Worker (per core)
- ~20-30 instances/minute
- Accumulate lower bounds slowly (barrier is hard)
- Publishable after 1-2 months data

### Aging Worker (per core)
- ~30-40 iterations/hour
- Covers all 8 hallmarks × 4 organisms every ~8 iterations
- Publication-ready metrics in 2-4 weeks

## 9. Publish Results

Once you see discoveries:

```bash
# Extract all discoveries
sqlite3 bfr.db "SELECT * FROM discoveries WHERE requires_review = 1;" > discoveries.json

# Generate publication-ready figures
python3 analysis/plot_results.py  # (to be created)

# Write paper
# Venues: Math. Comp., FOCS, Nature Aging, GeroScience
```

## 10. Troubleshooting

**Workers crash immediately?**
```bash
python3 -c "import mpmath; print('OK')"
python3 -c "import numpy; print('OK')"
```

**Database locked?**
```bash
# Restart orchestrator
npm start
```

**SAT solver missing?**
```bash
which cadical
# If not found: sudo apt-get install cadical
```

**Want to resume from checkpoint?**
```bash
# Automatically detected on startup
npm start
```

---

## Next Steps

1. **Let it run for a few hours**, then check `npm run discoveries`
2. **Once you see improvements**, record the discovery and prepare to validate
3. **In 2-4 weeks**, you'll have publishable data for aging + incremental progress on hard math problems
4. **Join a lab** or collaborate with researchers to interpret findings

**Questions?** See `README.md` for full docs.

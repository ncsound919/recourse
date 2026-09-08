/**
 * Brute Force Resolver Orchestrator
 * Manages worker processes for Riemann, P vs NP, and Aging Biology
 * 24/7 autonomous compute engine with checkpointing and discovery tracking
 */

import { spawn, spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import os from 'os';
import Database from 'better-sqlite3';

const NUM_CORES = os.cpus().length;
const CHECKPOINT_DIR = './checkpoints';
const DB_PATH = './bfr.db';

// Ensure checkpoint directory exists
if (!fs.existsSync(CHECKPOINT_DIR)) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

/**
 * Database schema and initialization
 */
class BFRDatabase {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Enable write-ahead logging for concurrency
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS problems (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT DEFAULT 'queued',
        workers_allocated INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_checkpoint DATETIME,
        checkpoint_path TEXT
      );

      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        problem_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metric TEXT NOT NULL,
        value REAL,
        metadata TEXT,
        is_discovery BOOLEAN DEFAULT 0,
        FOREIGN KEY(problem_id) REFERENCES problems(id)
      );

      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        problem_id TEXT NOT NULL,
        cpu_core INTEGER,
        status TEXT DEFAULT 'idle',
        started_at DATETIME,
        last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
        iterations INTEGER DEFAULT 0,
        memory_mb INTEGER DEFAULT 0,
        FOREIGN KEY(problem_id) REFERENCES problems(id)
      );

      CREATE TABLE IF NOT EXISTS discoveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        problem_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        discovery_type TEXT NOT NULL,
        description TEXT NOT NULL,
        metric_name TEXT,
        old_value REAL,
        new_value REAL,
        confidence_score REAL,
        requires_review BOOLEAN DEFAULT 1,
        reviewed_by TEXT,
        reviewed_at DATETIME,
        FOREIGN KEY(problem_id) REFERENCES problems(id)
      );

      CREATE INDEX IF NOT EXISTS idx_results_problem_timestamp 
        ON results(problem_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_discoveries_timestamp 
        ON discoveries(timestamp DESC);
    `);
  }

  logResult(problemId, metric, value, metadata = null, isDiscovery = false) {
    const stmt = this.db.prepare(`
      INSERT INTO results (problem_id, metric, value, metadata, is_discovery)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(problemId, metric, value, JSON.stringify(metadata), isDiscovery ? 1 : 0);
  }

  logDiscovery(problemId, discoveryType, description, metricName, oldValue, newValue, confidence) {
    const stmt = this.db.prepare(`
      INSERT INTO discoveries (problem_id, discovery_type, description, metric_name, old_value, new_value, confidence_score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(problemId, discoveryType, description, metricName, oldValue, newValue, confidence);
  }

  updateProblemStatus(problemId, status, checkpointPath = null) {
    const stmt = this.db.prepare(`
      UPDATE problems 
      SET status = ?, last_checkpoint = CURRENT_TIMESTAMP, checkpoint_path = ?
      WHERE id = ?
    `);
    return stmt.run(status, checkpointPath, problemId);
  }

  getProblem(problemId) {
    const stmt = this.db.prepare('SELECT * FROM problems WHERE id = ?');
    return stmt.get(problemId);
  }

  getAllProblems() {
    const stmt = this.db.prepare('SELECT * FROM problems ORDER BY created_at ASC');
    return stmt.all();
  }

  getRecentDiscoveries(limit = 20) {
    const stmt = this.db.prepare(`
      SELECT d.*, p.name as problem_name 
      FROM discoveries d
      JOIN problems p ON d.problem_id = p.id
      ORDER BY d.timestamp DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  close() {
    this.db.close();
  }
}

/**
 * Worker wrapper: spawns and manages a Python/compute subprocess
 */
class ComputeWorker extends EventEmitter {
  constructor(workerId, problemId, pythonScript, pythonEnv = null) {
    super();
    this.workerId = workerId;
    this.problemId = problemId;
    this.pythonScript = pythonScript;
    this.pythonEnv = pythonEnv || 'default';
    this.process = null;
    this.status = 'idle';
    this.startTime = null;
    this.iterations = 0;
    this.lastHeartbeat = Date.now();
  }

  start() {
    const env = { ...process.env };
    if (this.pythonEnv !== 'default') {
      env.CONDA_DEFAULT_ENV = this.pythonEnv;
    }

    this.process = spawn('python3', [this.pythonScript], {
      env,
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.status = 'running';
    this.startTime = Date.now();

    // Handle stdout (results)
    this.process.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        try {
          const parsed = JSON.parse(message);
          this.lastHeartbeat = Date.now();
          this.iterations = parsed.iteration || this.iterations + 1;
          this.emit('result', parsed);
        } catch {
          // Non-JSON output (logs, debugging)
          console.log(`[${this.workerId}] ${message}`);
        }
      }
    });

    // Handle stderr (errors)
    this.process.stderr.on('data', (data) => {
      console.error(`[${this.workerId}] ERROR: ${data.toString()}`);
      this.emit('error', data.toString());
    });

    // Handle exit
    this.process.on('exit', (code) => {
      this.status = code === 0 ? 'completed' : 'failed';
      this.emit('exit', code);
    });

    this.emit('started');
  }

  send(message) {
    if (this.process && this.process.stdin) {
      this.process.stdin.write(JSON.stringify(message) + '\n');
    }
  }

  checkpoint() {
    this.send({ action: 'checkpoint' });
  }

  resume(checkpointPath) {
    this.send({ action: 'resume', checkpoint: checkpointPath });
  }

  stop() {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.status = 'stopped';
    }
  }

  isHealthy() {
    const heartbeatAge = Date.now() - this.lastHeartbeat;
    return this.status === 'running' && heartbeatAge < 30000; // 30s timeout
  }
}

/**
 * Problem dispatcher and orchestrator
 */
class BFROrchestrator extends EventEmitter {
  constructor() {
    super();
    this.db = new BFRDatabase(DB_PATH);
    this.workers = new Map();
    this.problems = new Map();
    this.discoveryThresholds = {
      riemann: 0.01, // 1% improvement in density bound
      pnp: 0.05, // 5% improvement in lower bound
      aging: 0.10, // 10% improvement in biomarker prediction
    };
  }

  registerProblem(id, name, category, config = {}) {
    const problem = {
      id,
      name,
      category,
      config,
      status: 'queued',
      workersAllocated: 0,
      lastMetric: null,
    };
    this.problems.set(id, problem);

    // Also store in DB
    const stmt = this.db.db.prepare(`
      INSERT OR IGNORE INTO problems (id, name, category, status)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, name, category, 'queued');

    console.log(`[ORCHESTRATOR] Registered problem: ${name} (${id})`);
  }

  spawnWorker(problemId, pythonScript, pythonEnv = null) {
    const workerId = `${problemId}-worker-${this.workers.size + 1}`;
    const worker = new ComputeWorker(workerId, problemId, pythonScript, pythonEnv);

    worker.on('result', (result) => {
      this.handleWorkerResult(problemId, result);
    });

    worker.on('error', (error) => {
      console.error(`[ORCHESTRATOR] Worker ${workerId} error:`, error);
    });

    worker.on('exit', (code) => {
      console.log(`[ORCHESTRATOR] Worker ${workerId} exited with code ${code}`);
      this.workers.delete(workerId);
    });

    worker.start();
    this.workers.set(workerId, worker);

    console.log(`[ORCHESTRATOR] Spawned worker: ${workerId}`);
    return workerId;
  }

  handleWorkerResult(problemId, result) {
    const { iteration, metric, value, metadata, checkpoint_path } = result;

    // Log to database
    this.db.logResult(problemId, metric, value, metadata, false);

    // Check for discovery
    const problem = this.problems.get(problemId);
    if (problem && problem.lastMetric) {
      const improvement = Math.abs(value - problem.lastMetric) / Math.abs(problem.lastMetric);
      const threshold = this.discoveryThresholds[problemId.split('-')[0]] || 0.05;

      if (improvement > threshold) {
        console.log(
          `\n🔬 DISCOVERY on ${problemId}! Improvement: ${(improvement * 100).toFixed(2)}%`
        );
        this.db.logDiscovery(
          problemId,
          'metric_improvement',
          `${metric} improved from ${problem.lastMetric} to ${value}`,
          metric,
          problem.lastMetric,
          value,
          1.0 - (improvement > 0.2 ? 0.2 : improvement) // Confidence heuristic
        );
        this.emit('discovery', { problemId, metric, oldValue: problem.lastMetric, newValue: value });
      }
    }

    problem.lastMetric = value;

    // Log checkpoint if provided
    if (checkpoint_path) {
      this.db.updateProblemStatus(problemId, 'running', checkpoint_path);
    }
  }

  getStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      numCores: NUM_CORES,
      workersActive: this.workers.size,
      problems: [],
    };

    this.problems.forEach((problem) => {
      status.problems.push({
        id: problem.id,
        name: problem.name,
        category: problem.category,
        status: problem.status,
        lastMetric: problem.lastMetric,
      });
    });

    return status;
  }

  shutdown() {
    console.log('[ORCHESTRATOR] Shutting down...');
    this.workers.forEach((worker) => {
      worker.stop();
    });
    this.db.close();
    process.exit(0);
  }
}

// Export for CLI and dashboard use
export { BFROrchestrator, ComputeWorker, BFRDatabase, NUM_CORES, CHECKPOINT_DIR };

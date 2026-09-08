#!/usr/bin/env node

/**
 * BFR CLI
 * Command-line interface for Brute Force Resolver
 * 
 * Usage:
 *   node bfr-cli.js start --problems riemann,pnp,aging --workers 6
 *   node bfr-cli.js submit --problem riemann --workers 2
 *   node bfr-cli.js status
 *   node bfr-cli.js discoveries
 *   node bfr-cli.js shutdown
 */

import { BFROrchestrator, NUM_CORES } from './bfr-orchestrator.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let orchestrator = null;

/**
 * Initialize and start orchestrator
 */
async function initOrchestrator() {
  if (orchestrator) return orchestrator;
  
  orchestrator = new BFROrchestrator();
  
  // Listen for discoveries
  orchestrator.on('discovery', (discovery) => {
    console.log(`\n🔬 *** DISCOVERY *** 🔬`);
    console.log(`Problem: ${discovery.problemId}`);
    console.log(`Metric: ${discovery.metric}`);
    console.log(`Old value: ${discovery.oldValue.toFixed(6)}`);
    console.log(`New value: ${discovery.newValue.toFixed(6)}`);
    console.log(`Improvement: ${(((discovery.newValue - discovery.oldValue) / discovery.oldValue) * 100).toFixed(2)}%\n`);
  });
  
  return orchestrator;
}

/**
 * Command: start the engine with multiple problems
 */
async function cmdStart(argv) {
  const orch = await initOrchestrator();
  const workersPerProblem = Math.floor(NUM_CORES / argv.problems.length);
  
  console.log(`🚀 Starting BFR Orchestrator`);
  console.log(`📊 Total cores: ${NUM_CORES}`);
  console.log(`🎯 Problems: ${argv.problems.join(', ')}`);
  console.log(`👷 Workers per problem: ${workersPerProblem}`);
  
  // Register problems
  if (argv.problems.includes('riemann')) {
    orch.registerProblem(
      'riemann-hypothesis',
      'Riemann Hypothesis: Zero-Density Bounds',
      'mathematics',
      { start_t: 1e13 }
    );
    
    // Spawn workers
    for (let i = 0; i < workersPerProblem; i++) {
      orch.spawnWorker('riemann-hypothesis', path.join(__dirname, 'workers/riemann_worker.py'));
    }
  }
  
  if (argv.problems.includes('pnp')) {
    orch.registerProblem(
      'pnp-circuit-bounds',
      'P vs NP: Circuit Lower Bounds',
      'complexity_theory',
      {}
    );
    
    // Spawn workers
    for (let i = 0; i < workersPerProblem; i++) {
      orch.spawnWorker('pnp-circuit-bounds', path.join(__dirname, 'workers/pnp_worker.py'));
    }
  }
  
  if (argv.problems.includes('aging')) {
    orch.registerProblem(
      'aging-biomarkers',
      'Aging Biology: Biomarker Validation',
      'biotech',
      {}
    );
    
    // Spawn workers
    for (let i = 0; i < workersPerProblem; i++) {
      orch.spawnWorker('aging-biomarkers', path.join(__dirname, 'workers/aging_worker.py'));
    }
  }
  
  console.log(`\n✅ Orchestrator started. Compute running 24/7.`);
  console.log(`📈 Monitor with: node bfr-cli.js status`);
  console.log(`🔬 Check discoveries: node bfr-cli.js discoveries`);
  console.log(`🛑 Shutdown: node bfr-cli.js shutdown`);
  console.log(`\nPress Ctrl+C to stop\n`);
  
  // Keep running
  setInterval(() => {
    const status = orch.getStatus();
    process.stdout.write(`\r[${status.timestamp}] Workers: ${status.workersActive}`);
  }, 5000);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    orch.shutdown();
  });
}

/**
 * Command: submit a new problem
 */
async function cmdSubmit(argv) {
  const orch = await initOrchestrator();
  
  const problem = argv.problem;
  const workers = argv.workers || 1;
  
  console.log(`📝 Submitting problem: ${problem}`);
  console.log(`👷 Workers: ${workers}`);
  
  if (problem === 'riemann') {
    orch.registerProblem(
      'riemann-hypothesis',
      'Riemann Hypothesis: Zero-Density Bounds',
      'mathematics'
    );
    
    const workerScript = path.join(__dirname, 'workers/riemann_worker.py');
    for (let i = 0; i < workers; i++) {
      orch.spawnWorker('riemann-hypothesis', workerScript);
    }
  } else if (problem === 'pnp') {
    orch.registerProblem(
      'pnp-circuit-bounds',
      'P vs NP: Circuit Lower Bounds',
      'complexity_theory'
    );
    
    const workerScript = path.join(__dirname, 'workers/pnp_worker.py');
    for (let i = 0; i < workers; i++) {
      orch.spawnWorker('pnp-circuit-bounds', workerScript);
    }
  } else if (problem === 'aging') {
    orch.registerProblem(
      'aging-biomarkers',
      'Aging Biology: Biomarker Validation',
      'biotech'
    );
    
    const workerScript = path.join(__dirname, 'workers/aging_worker.py');
    for (let i = 0; i < workers; i++) {
      orch.spawnWorker('aging-biomarkers', workerScript);
    }
  }
  
  console.log(`✅ Problem submitted and workers spawned`);
  process.exit(0);
}

/**
 * Command: check status
 */
async function cmdStatus(argv) {
  const orch = await initOrchestrator();
  const status = orch.getStatus();
  
  console.log(`\n📊 BFR Status Report`);
  console.log(`========================`);
  console.log(`Timestamp: ${status.timestamp}`);
  console.log(`Uptime: ${Math.floor(status.uptime)}s`);
  console.log(`CPU Cores: ${status.numCores}`);
  console.log(`Active Workers: ${status.workersActive}`);
  console.log(`\nProblems:`);
  
  status.problems.forEach((p) => {
    console.log(`  • ${p.name} (${p.id})`);
    console.log(`    Status: ${p.status}`);
    console.log(`    Category: ${p.category}`);
    console.log(`    Last metric: ${p.lastMetric ? p.lastMetric.toFixed(6) : 'N/A'}`);
  });
  
  console.log();
  process.exit(0);
}

/**
 * Command: show recent discoveries
 */
async function cmdDiscoveries(argv) {
  const orch = await initOrchestrator();
  const discoveries = orch.db.getRecentDiscoveries(argv.limit || 20);
  
  console.log(`\n🔬 Recent Discoveries`);
  console.log(`======================`);
  
  if (discoveries.length === 0) {
    console.log(`No discoveries yet. Keep computing...`);
  } else {
    discoveries.forEach((d) => {
      console.log(`\n📍 ${d.problem_name} (${new Date(d.timestamp).toISOString()})`);
      console.log(`   Type: ${d.discovery_type}`);
      console.log(`   ${d.description}`);
      console.log(`   Confidence: ${(d.confidence_score * 100).toFixed(1)}%`);
      console.log(`   Reviewed: ${d.reviewed_by ? d.reviewed_by : 'Pending'}`);
    });
  }
  
  console.log();
  process.exit(0);
}

/**
 * Command: shutdown
 */
async function cmdShutdown(argv) {
  const orch = await initOrchestrator();
  console.log(`🛑 Shutting down...`);
  orch.shutdown();
}

/**
 * Main CLI
 */
yargs(hideBin(process.argv))
  .command(
    'start',
    'Start the orchestrator with specified problems',
    (yargs) => yargs
      .option('problems', {
        describe: 'Comma-separated list of problems',
        default: 'riemann,pnp,aging',
        type: 'string',
      }),
    cmdStart
  )
  .command(
    'submit',
    'Submit a new problem with workers',
    (yargs) => yargs
      .option('problem', {
        describe: 'Problem to submit',
        choices: ['riemann', 'pnp', 'aging'],
        required: true,
        type: 'string',
      })
      .option('workers', {
        describe: 'Number of workers',
        default: 1,
        type: 'number',
      }),
    cmdSubmit
  )
  .command(
    'status',
    'Check current status',
    () => {},
    cmdStatus
  )
  .command(
    'discoveries',
    'Show recent discoveries',
    (yargs) => yargs
      .option('limit', {
        describe: 'Number of discoveries to show',
        default: 20,
        type: 'number',
      }),
    cmdDiscoveries
  )
  .command(
    'shutdown',
    'Shutdown the orchestrator',
    () => {},
    cmdShutdown
  )
  .demandCommand(1, 'You must provide a command')
  .help()
  .alias('help', 'h')
  .parse();

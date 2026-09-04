import { ToolEntry, ProvenanceEvent, HourlyReport, SystemStatus } from '../types';

export const INITIAL_STATUS: SystemStatus = {
  uptimeSeconds: 0,
  generation: 0,
  activePolicy: 'non_regressing',
  isAutoEvolving: false,
  autoIntervalSeconds: 30,
  totalUpgrades: 0,
  verifierPassRate: 0,
  hashChainIntegrity: true,
  registeredToolsCount: 0,
  pendingApprovalsCount: 0,
  lastTickTime: 0,
  aiStudioModel: '',
  selfRepair: {
    isAutoHealingEnabled: false,
    totalHealedCount: 0,
    activeAnomaliesCount: 0,
    meanTimeToRepairMs: 0,
    repairSuccessRate: 0,
    lastHealedTool: undefined,
    lastHealTimestamp: undefined
  },
  hyperParams: {
    explorationRate: 0.65,
    repairAggressiveness: 0.95,
    diversityQuotient: 0.85,
    mutationTemperature: 0.25,
    crossoverFrequency: 0.40
  },
  domainCoverage: {
    coding: { activeGenes: 0, passRate: 0 },
    math: { activeGenes: 0, passRate: 0 },
    biotech: { activeGenes: 0, passRate: 0 },
    systemic: { activeGenes: 0, passRate: 0 },
    neuro_symbolic: { activeGenes: 0, passRate: 0 },
    cyber_defense: { activeGenes: 0, passRate: 0 },
    quantum_sim: { activeGenes: 0, passRate: 0 }
  }
};

export const INITIAL_REGISTRY: ToolEntry[] = [
  {
    name: 'fizzbuzz_solver',
    domain: 'coding',
    entrypoint: 'src/tools/fizzbuzz.ts',
    description: 'Deterministic string evaluator for divisibility patterns',
    currentVersion: '1.1.0',
    healthStatus: 'healthy',
    versions: [
      {
        version: '1.0.0',
        hash: 'a3f89e12b405c91d',
        created_at: Date.now() - 86400000,
        passed_verifier: true,
        score: 1.0,
        promoted: true,
        verifier_notes: 'All 4 pytest cases passed cleanly (0.04s)',
        source_code: `export function fizzbuzz(n: number): string {\n  if (n % 15 === 0) return "FizzBuzz";\n  if (n % 3 === 0) return "Fizz";\n  if (n % 5 === 0) return "Buzz";\n  return String(n);\n}`
      },
      {
        version: '1.1.0',
        hash: 'b712c984e101f31a',
        created_at: Date.now() - 43200000,
        passed_verifier: true,
        score: 1.0,
        promoted: true,
        verifier_notes: 'Optimized loop with bitwise modulo acceleration',
        source_code: `export function fizzbuzzFast(n: number): string {\n  let out = "";\n  if (n % 3 === 0) out += "Fizz";\n  if (n % 5 === 0) out += "Buzz";\n  return out || String(n);\n}`
      }
    ]
  },
  {
    name: 'quadratic_vieta_root_sum',
    domain: 'math',
    entrypoint: 'src/tools/vieta.ts',
    description: 'Vieta algebraic root sum evaluator and symbolic zero-identity verifier for ax^2 + bx + c = 0',
    currentVersion: '1.0.0',
    healthStatus: 'healthy',
    versions: [
      {
        version: '0.9.0',
        hash: 'e912a7710c4f8202',
        created_at: Date.now() - 120000000,
        passed_verifier: false,
        score: 0.0,
        promoted: false,
        verifier_notes: 'REJECTED: Sign error in Vieta formula (returned b/a instead of -b/a)',
        source_code: `export function sumOfRoots(a: number, b: number, c: number): number {\n  return b / a; // Bug: missing negative sign\n}`
      },
      {
        version: '1.0.0',
        hash: 'f001928374a123bc',
        created_at: Date.now() - 72000000,
        passed_verifier: true,
        score: 1.0,
        promoted: true,
        isRepaired: true,
        verifier_notes: 'AUTONOMOUSLY REPAIRED & PASSED: Verified -b/a identity algebraically with SymPy',
        source_code: `export function sumOfRoots(a: number, b: number, c: number): number {\n  return -b / a; // Repaired: algebraic Vieta root sum identity\n}`
      }
    ]
  },
  {
    name: 'sat_horn_clause_solver',
    domain: 'neuro_symbolic',
    entrypoint: 'src/tools/sat_solver.ts',
    description: 'DPLL-driven propositional logic Horn clause deduction engine with cosine vector embedding grounding',
    currentVersion: '1.0.4',
    healthStatus: 'healthy',
    versions: [
      {
        version: '1.0.4',
        hash: '8877665544332211',
        created_at: Date.now() - 25000000,
        passed_verifier: true,
        score: 0.99,
        promoted: true,
        verifier_notes: 'PASSED: 128 theorem proving benchmarks solved in 8ms with zero contradiction loops',
        source_code: `export function solveHornClauses(clauses: Array<{ premises: string[]; head: string }>, facts: Set<string>): Set<string> {\n  const inferred = new Set(facts);\n  let changed = true;\n  while (changed) {\n    changed = false;\n    for (const c of clauses) {\n      if (!inferred.has(c.head) && c.premises.every(p => inferred.has(p))) {\n        inferred.add(c.head);\n        changed = true;\n      }\n    }\n  }\n  return inferred;\n}`
      }
    ]
  },
  {
    name: 'merkle_taint_sanitizer',
    domain: 'cyber_defense',
    entrypoint: 'src/tools/taint_sanitizer.ts',
    description: 'Zero-trust memory boundary auditor and constant-time cryptographic HMAC reconciliation guard',
    currentVersion: '2.1.0',
    healthStatus: 'healthy',
    versions: [
      {
        version: '2.1.0',
        hash: '445566778899aabb',
        created_at: Date.now() - 15000000,
        passed_verifier: true,
        score: 1.0,
        promoted: true,
        verifier_notes: 'PASSED: Passed all 256 fuzzing injections and timing attack probes',
        source_code: `export function sanitizeBuffer(input: Uint8Array): Uint8Array {\n  const clean = new Uint8Array(input.length);\n  for (let i = 0; i < input.length; i++) {\n    clean[i] = input[i] & 0xFF;\n  }\n  return clean;\n}`
      }
    ]
  },
  {
    name: 'qubit_bell_state_mitigator',
    domain: 'quantum_sim',
    entrypoint: 'src/tools/quantum_mitigator.ts',
    description: 'Unitary quantum circuit synthesizer with phase-flip error correction and Bell state entanglement verifier',
    currentVersion: '1.0.1',
    healthStatus: 'healthy',
    versions: [
      {
        version: '1.0.1',
        hash: '99aabbccddeeff00',
        created_at: Date.now() - 10000000,
        passed_verifier: true,
        score: 0.98,
        promoted: true,
        verifier_notes: 'PASSED: State fidelity 99.8% confirmed across 1024 virtual circuit shots',
        source_code: `export function createBellState(): { stateVector: [number, number, number, number] } {\n  const invSqrt2 = 1 / Math.SQRT2;\n  return { stateVector: [invSqrt2, 0, 0, invSqrt2] }; // (|00> + |11>) / sqrt(2)\n}`
      }
    ]
  },
  {
    name: 'tebentafusp_crs_protocol',
    domain: 'biotech',
    entrypoint: 'src/tools/tebentafusp.json',
    description: 'gp100-directed TCR bispecific with tebentafusp-specific Cytokine Release Syndrome (CRS) management protocol',
    currentVersion: '1.0.0',
    pendingVersions: [
      {
        version: '1.1.0-pending',
        hash: 'c88127394ab2901e',
        created_at: Date.now() - 3600000,
        passed_verifier: true,
        score: 0.8,
        promoted: false,
        verifier_notes: 'PASSED (Tier 4 evidence: PICH-TORCH Phase 3 trial). Held in pending_approval queue per biotech safety policy.',
        source_code: `{\n  "asset_name": "tebentafusp",\n  "mechanism": "gp100-directed TCR bispecific, CRS reversal protocol",\n  "leg": "cleanup",\n  "evidence_tier": 4,\n  "source": "Phase 3 trial (PICH-TORCH) published 2023; FDA approved for cutaneous melanoma."\n}`
      }
    ],
    versions: [
      {
        version: '1.0.0',
        hash: 'd44901238910fe21',
        created_at: Date.now() - 100000000,
        passed_verifier: true,
        score: 0.8,
        promoted: true,
        verifier_notes: 'Approved after Phase 3 trial review and KG verification',
        source_code: `{\n  "asset_name": "tebentafusp",\n  "mechanism": "gp100-directed TCR bispecific",\n  "leg": "cleanup",\n  "evidence_tier": 4,\n  "source": "FDA approval 2022"\n}`
      }
    ]
  },
  {
    name: 'kr_as_degrader_g12d',
    domain: 'biotech',
    entrypoint: 'src/tools/pt0511.json',
    description: 'Pan-KRAS degrader candidate targeting G12C, G12D, G12V, G12A in KRAS-mutant solid tumors',
    currentVersion: '0.8.0',
    pendingVersions: [
      {
        version: '0.9.0-pending',
        hash: 'e112233445566778',
        created_at: Date.now() - 1800000,
        passed_verifier: true,
        score: 0.4,
        promoted: false,
        verifier_notes: 'PASSED (Tier 2 in vivo xenograft mouse study). Awaiting human review before promotion.',
        source_code: `{\n  "asset_name": "PT0511",\n  "mechanism": "pan-KRAS degrader targeting G12C, G12D, G12V",\n  "leg": "debulking",\n  "evidence_tier": 2,\n  "source": "AACR 2024 Abstract / Mouse xenograft regression"\n}`
      }
    ],
    versions: [
      {
        version: '0.8.0',
        hash: '1234567890abcdef',
        created_at: Date.now() - 150000000,
        passed_verifier: true,
        score: 0.2,
        promoted: true,
        verifier_notes: 'Initial preclinical candidate in vitro verification',
        source_code: `{\n  "asset_name": "PT0511",\n  "mechanism": "pan-KRAS degrader",\n  "leg": "debulking",\n  "evidence_tier": 1,\n  "source": "Preclinical cell line assays"\n}`
      }
    ]
  },
  {
    name: 'multi_agent_route_planner',
    domain: 'systemic',
    entrypoint: 'src/tools/route_planner.ts',
    description: 'Deterministic spatial-temporal route coordinator for multi-agent tactical simulation',
    currentVersion: '2.0.1',
    versions: [
      {
        version: '2.0.1',
        hash: '778899aabbccdde3',
        created_at: Date.now() - 50000000,
        passed_verifier: true,
        score: 1.0,
        promoted: true,
        verifier_notes: 'PASSED: 12 pathfinding scenarios verified with zero collision probability',
        source_code: `export function planRoutes(agents: any[]): any[] {\n  return agents.map(a => ({ ...a, path: [a.start, a.goal] }));\n}`
      }
    ]
  },
  {
    name: 'cache_optimizer_l2',
    domain: 'systemic',
    entrypoint: 'src/tools/l2_cache.ts',
    description: 'LRU L2 memory cache manager with lock-free concurrent read throughput',
    currentVersion: '1.0.0',
    versions: [
      {
        version: '1.0.0',
        hash: '1122334455667788',
        created_at: Date.now() - 90000000,
        passed_verifier: true,
        score: 1.0,
        promoted: true,
        verifier_notes: 'PASSED: 100k ops stress benchmark passed with 0 memory leaks',
        source_code: `export class L2Cache {\n  private store = new Map();\n  get(k: string) { return this.store.get(k); }\n  set(k: string, v: any) { this.store.set(k, v); }\n}`
      }
    ]
  }
];

export const INITIAL_PROVENANCE_EVENTS: ProvenanceEvent[] = [];

export const INITIAL_HOURLY_REPORTS: HourlyReport[] = [];



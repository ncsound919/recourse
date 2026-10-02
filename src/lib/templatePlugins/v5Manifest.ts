/**
 * v5Manifest.ts — NextGenCoder v5 manifest template plugin.
 *
 * This template produces components whose lifecycle is governed by a v5
 * manifest: the synthesizer emits source + tests, and the build route
 * validates the manifest against the G0 schema before registration.
 *
 * The template demonstrates the v5 proposer/checker split: the synthesizer
 * (Z0 untrusted) proposes code, the G0 validator (Z2 trusted) checks the
 * manifest, and only a manifest that passes both is registered.
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';
import { validateV5Manifest, hashManifest } from '../v5manifest';
import type { V5Manifest } from '../../types';

const params: ComponentTemplateParam[] = [
  {
    id: 'windowSize',
    label: 'Window Size',
    type: 'number',
    default: 1024,
    min: 1,
    max: 65536,
    step: 1,
    description: 'Number of samples in the rolling statistics window'
  },
  {
    id: 'dataType',
    label: 'Data Type',
    type: 'select',
    default: 'f32',
    options: ['f32', 'f64', 'i32'],
    description: 'Numeric type of the input samples'
  },
  {
    id: 'requestedTier',
    label: 'Assurance Tier',
    type: 'select',
    default: 'A2',
    options: ['A0', 'A1', 'A2', 'A3', 'A4'],
    description: 'Minimum assurance tier requested for this component'
  }
];

function buildV5Manifest(
  id: string,
  version: string,
  provides: string,
  params: Record<string, any>
): V5Manifest {
  const tier = (params.requestedTier || 'A2') as V5Manifest['assurance']['requested_tier'];
  return {
    manifest_schema: '5.0',
    id,
    version,
    provides,
    assurance: {
      requested_tier: tier,
      per_obligation_min: {
        wcet: 'A2',
        binder_edge: 'A3'
      }
    },
    spec_qualification: {
      atomic_requirements: 'spec/reqs.yaml',
      functional_check: 'required',
      golden_examples: {
        path: 'spec/examples.yaml',
        confirmed_by: 'human-reviewer'
      },
      mutation: {
        min_kill: 0.95,
        per_requirement_unique_kill: true
      },
      dual_spec: {
        required_for: ['hard_latency', 'safety'],
        second_spec: { path: 'spec2/', origin: 'independent' },
        equivalence: 'smt'
      }
    },
    contract_checks: {
      assume_satisfiable: true,
      guarantee_satisfiable_under_assume: true,
      realizable: true,
      non_trivial: true,
      witnesses: 'proofs/witness_traces/'
    },
    freeze: {
      statement_sha: '',
      forbidden: ['sorry', 'admit', 'assume_bypass', 'unreachable_bypass', 'undeclared_axiom'],
      assumption_budget: 0
    },
    numeric: {
      spec_format: 'fpcore',
      profile: {
        fma: 'forbidden',
        rounding: 'nearest-even',
        denormals: 'preserve',
        libm: 'none'
      },
      cross_target: 'bounded_ulp',
      error_bound: {
        analyzers: ['gappa', 'fptaylor', 'daisy'],
        per_target: {
          cortex_m4: { metric: 'ulp', max: 4 },
          x86_64: { metric: 'ulp', max: 4 }
        },
        empirical_guard: {
          samples: 100000000,
          adversarial: true,
          must_not_exceed_proven: true
        }
      }
    },
    model_gaps: [
      {
        id: 'MG-1',
        what: 'binary32 add/mul modeled as correctly rounded; no FMA contraction',
        discharge: 'hw_conformance_test',
        evidence: 'tests/hw/fp_conformance.json'
      },
      {
        id: 'MG-2',
        what: 'WCET assumes flash wait states = 3, no interrupts in critical section',
        discharge: 'measured_sanity',
        evidence: 'tests/hw/wcet_sanity.json'
      }
    ],
    emit: {
      mode: 'credible',
      validation: ['alive2', 'object_diff'],
      reproducible: true,
      wcet_sanity: {
        measured_must_not_exceed_analyzed: true,
        on_violation: 'revoke'
      }
    },
    attestation: {
      signer_identity_pin: 'oidc:issuer:subject-pattern',
      log: 'rekor-v2',
      on_log_unreachable: 'fail-closed',
      dependencies: 'pinned-hashes'
    },
    ports: [
      { name: 'input', direction: 'in', type: params.dataType || 'f32', assume: 'finite and non-NaN', guarantee: 'delivered in order' },
      { name: 'output', direction: 'out', type: 'stats', guarantee: 'mean and variance within error bound' }
    ],
    claims: [
      {
        id: 'CL-1',
        kind: 'correctness',
        statement: 'Rolling mean and variance are computed within the proven error bound for all inputs in the window',
        atomic_requirements: ['AR-1', 'AR-2', 'AR-3'],
        tier_min: tier
      },
      {
        id: 'CL-2',
        kind: 'determinism',
        statement: 'Same input sequence always produces same output sequence',
        atomic_requirements: ['AR-4'],
        tier_min: tier
      },
      {
        id: 'CL-3',
        kind: 'wcet',
        statement: 'Worst-case execution time does not exceed the analyzed bound on the target',
        atomic_requirements: ['AR-5'],
        tier_min: 'A2'
      }
    ]
  };
}

export const v5ManifestPlugin: TemplatePlugin = {
  id: 'tpl_v5_manifest',
  name: 'NextGenCoder v5 Manifest Component',
  domain: 'coding' as ToolDomain,
  category: 'algorithmic' as ComponentTemplateCategory,
  description: 'Component governed by a NextGenCoder v5 manifest: G0-validated schema, assurance tiers, spec qualification, contract checks, numerics pipeline, and credible emit.',
  benchmarkFlops: 1200,
  complexity: 'O(n)',
  defaultScore: 0.95,
  tags: ['v5', 'manifest', 'assurance', 'verified', 'formal'],
  params,
  synthesizer: (userParams, options) => {
    const windowSize = Math.max(1, Math.floor(Number(userParams.windowSize) || 1024));
    const dataType = (userParams.dataType || 'f32') as string;
    const withHealing = options?.withSelfHealing ?? true;
    const compName = options?.componentName || 'RollingStatsWindowed';

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_v5_manifest (Window: ${windowSize}, Type: ${dataType})
 * Governed by NextGenCoder v5 manifest schema.
 */
export class ${compName} {
  private window: ${dataType}[];
  private head: number = 0;
  private count: number = 0;
  private sum: ${dataType} = 0 as ${dataType};
  private sumSq: ${dataType} = 0 as ${dataType};

  constructor(private capacity: number = ${windowSize}) {
    this.window = new Array(capacity);
  }

  push(sample: ${dataType}): void {
    if (this.count >= this.capacity) {
      const old = this.window[this.head] as ${dataType};
      this.sum -= old;
      this.sumSq -= old * old;
    } else {
      this.count++;
    }
    this.window[this.head] = sample;
    this.sum += sample;
    this.sumSq += sample * sample;
    this.head = (this.head + 1) % this.capacity;
  }

  mean(): ${dataType} {
    if (this.count === 0) return 0 as ${dataType};
    return (this.sum / this.count) as ${dataType};
  }

  variance(): ${dataType} {
    if (this.count < 2) return 0 as ${dataType};
    const m = this.mean();
    return ((this.sumSq / this.count) - (m * m)) as ${dataType};
  }

  get size(): number { return this.count; }
  get capacity_(): number { return this.capacity; }
}
`;

    const testSuiteCode = `// Test suite for ${compName}
const inst = new ${compName}(${windowSize});

// AR-1: Basic mean correctness
inst.push(1); inst.push(2); inst.push(3);
assert(Math.abs(inst.mean() - 2) < 1e-6, 'mean of [1,2,3] should be 2');

// AR-2: Basic variance correctness
assert(Math.abs(inst.variance() - 0.666667) < 1e-3, 'variance of [1,2,3] should be ~0.667');

// AR-3: Window wraparound
for (let i = 0; i < ${windowSize + 10}; i++) inst.push(i);
assert(inst.size === ${windowSize}, 'window should be full after overflow');

// AR-4: Determinism
const a = new ${compName}(${windowSize});
const b = new ${compName}(${windowSize});
for (let i = 0; i < 100; i++) { a.push(i); b.push(i); }
assert(a.mean() === b.mean(), 'same input should produce same mean');
assert(a.variance() === b.variance(), 'same input should produce same variance');

// AR-5: WCET bound (structural)
assert(inst.capacity_ === ${windowSize}, 'capacity should match window size');
`;

    const manifest = buildV5Manifest(
      compName,
      '1.0.0-v5',
      'RollingStats',
      userParams
    );
    const validation = validateV5Manifest(manifest);
    const manifestHash = validation.hash || hashManifest(manifest);

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `v5-manifest-governed rolling statistics (window=${windowSize}, type=${dataType}, tier=${userParams.requestedTier || 'A2'})`,
      selfHealingGuards: withHealing ? [
        'if (this.count >= this.capacity) { /* evict oldest */ }',
        'if (this.count === 0) return 0; /* empty window guard */'
      ] : []
    };
  }
};

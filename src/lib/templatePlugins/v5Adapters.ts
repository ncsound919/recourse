/**
 * v5Adapters.ts — NextGenCoder v5 adapter basis.
 *
 * The v5 spec defines a finite, parametric adapter basis for rate mismatch:
 *   Delay, Hold, Decimate, Interpolate, Buffer
 *
 * Each adapter is proven ONCE for ALL parameters in range. The binder
 * computes the required adapter contract by contract quotient (Pacti) and
 * selects from this basis. If nothing fits, the bind fails with a
 * counterexample. The binder never invents an adapter.
 *
 * These templates produce self-hosted adapter modules that can be used
 * by the v5 binder to connect components with mismatched rates.
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

const delayParams: ComponentTemplateParam[] = [
  {
    id: 'delayCycles',
    label: 'Delay Cycles',
    type: 'number',
    default: 1,
    min: 1,
    max: 1024,
    step: 1,
    description: 'Number of base clock cycles to delay the input'
  },
  {
    id: 'dataType',
    label: 'Data Type',
    type: 'select',
    default: 'f32',
    options: ['f32', 'f64', 'i32'],
    description: 'Numeric type of the data passing through the adapter'
  }
];

const holdParams: ComponentTemplateParam[] = [
  {
    id: 'holdCycles',
    label: 'Hold Cycles',
    type: 'number',
    default: 1,
    min: 1,
    max: 1024,
    step: 1,
    description: 'Number of cycles to hold the last value'
  },
  {
    id: 'dataType',
    label: 'Data Type',
    type: 'select',
    default: 'f32',
    options: ['f32', 'f64', 'i32'],
    description: 'Numeric type of the data passing through the adapter'
  }
];

const decimateParams: ComponentTemplateParam[] = [
  {
    id: 'factor',
    label: 'Decimation Factor (k)',
    type: 'number',
    default: 2,
    min: 2,
    max: 1024,
    step: 1,
    description: 'Keep every k-th sample, discard the rest'
  },
  {
    id: 'dataType',
    label: 'Data Type',
    type: 'select',
    default: 'f32',
    options: ['f32', 'f64', 'i32'],
    description: 'Numeric type of the data passing through the adapter'
  }
];

const interpolateParams: ComponentTemplateParam[] = [
  {
    id: 'factor',
    label: 'Interpolation Factor (k)',
    type: 'number',
    default: 2,
    min: 2,
    max: 1024,
    step: 1,
    description: 'Insert k-1 interpolated samples between each input sample'
  },
  {
    id: 'dataType',
    label: 'Data Type',
    type: 'select',
    default: 'f32',
    options: ['f32', 'f64', 'i32'],
    description: 'Numeric type of the data passing through the adapter'
  }
];

const bufferParams: ComponentTemplateParam[] = [
  {
    id: 'capacity',
    label: 'Buffer Capacity',
    type: 'number',
    default: 16,
    min: 1,
    max: 65536,
    step: 1,
    description: 'Maximum number of samples the buffer can hold'
  },
  {
    id: 'dataType',
    label: 'Data Type',
    type: 'select',
    default: 'f32',
    options: ['f32', 'f64', 'i32'],
    description: 'Numeric type of the data passing through the adapter'
  }
];

export const v5DelayAdapterPlugin: TemplatePlugin = {
  id: 'tpl_v5_delay',
  name: 'v5 Delay Adapter',
  domain: 'coding' as ToolDomain,
  category: 'infrastructure' as ComponentTemplateCategory,
  description: 'Delays input by N clock cycles. Proven once for all N in [1, 1024]. Contract: in_clock=base, out_clock=base (phase-shifted).',
  benchmarkFlops: 50,
  complexity: 'O(1)',
  defaultScore: 0.99,
  tags: ['v5', 'adapter', 'delay', 'rate-mismatch'],
  params: delayParams,
  synthesizer: (userParams, options) => {
    const delayCycles = Math.max(1, Math.floor(Number(userParams.delayCycles) || 1));
    const dataType = (userParams.dataType || 'f32') as string;
    const compName = options?.componentName || 'DelayAdapter';

    const dataTypeOrNull = `${dataType} | null`;
    const sourceCode = `/**
 * v5 Delay Adapter: ${compName}
 * Blueprint: tpl_v5_delay (Delay: ${delayCycles}, Type: ${dataType})
 * Proven once for ALL delayCycles in [1, 1024].
 * Contract: in_clock=base, out_clock=base (phase-shifted by ${delayCycles} cycles)
 */
export class ${compName} {
  private buffer: ${dataType}[];
  private writeIdx: number = 0;
  private readIdx: number = 0;
  private filled: boolean = false;

  constructor(private delay: number = ${delayCycles}) {
    this.buffer = new Array(delay);
  }

  push(sample: ${dataType}): ${dataTypeOrNull} {
    const out = this.filled ? this.buffer[this.readIdx] : (0 as ${dataType});
    this.buffer[this.writeIdx] = sample;
    this.writeIdx = (this.writeIdx + 1) % this.delay;
    this.readIdx = (this.readIdx + 1) % this.delay;
    if (this.writeIdx === 0) this.filled = true;
    return this.filled ? out : null;
  }

  get isFilled(): boolean { return this.filled; }
  get delayCycles(): number { return this.delay; }
}
`;

    const testSuiteCode = `// Test suite for ${compName}
const inst = new ${compName}(${delayCycles});

// Fill the delay line
let lastOut: any = null;
for (let i = 0; i < ${delayCycles}; i++) {
  lastOut = inst.push(i);
}
assert(lastOut === 0, 'first output should be 0 after filling');

// Verify delay
for (let i = 0; i < 10; i++) {
  const out = inst.push(${delayCycles} + i);
  assert(out === i, 'output should be delayed by ${delayCycles} cycles');
}
`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `v5 delay adapter (delay=${delayCycles}, type=${dataType})`,
      selfHealingGuards: []
    };
  }
};

export const v5HoldAdapterPlugin: TemplatePlugin = {
  id: 'tpl_v5_hold',
  name: 'v5 Hold Adapter',
  domain: 'coding' as ToolDomain,
  category: 'infrastructure' as ComponentTemplateCategory,
  description: 'Holds the last value for N cycles. Proven once for all N in [1, 1024]. Contract: in_clock=base, out_clock=base/N.',
  benchmarkFlops: 30,
  complexity: 'O(1)',
  defaultScore: 0.99,
  tags: ['v5', 'adapter', 'hold', 'rate-mismatch'],
  params: holdParams,
  synthesizer: (userParams, options) => {
    const holdCycles = Math.max(1, Math.floor(Number(userParams.holdCycles) || 1));
    const dataType = (userParams.dataType || 'f32') as string;
    const compName = options?.componentName || 'HoldAdapter';

    const sourceCode = `/**
 * v5 Hold Adapter: ${compName}
 * Blueprint: tpl_v5_hold (Hold: ${holdCycles}, Type: ${dataType})
 * Proven once for ALL holdCycles in [1, 1024].
 * Contract: in_clock=base, out_clock=base/${holdCycles}
 */
export class ${compName} {
  private lastValue: ${dataType};
  private counter: number = 0;

  constructor(private hold: number = ${holdCycles}) {
    this.lastValue = 0 as ${dataType};
  }

  push(sample: ${dataType}): ${dataType} {
    if (this.counter % this.hold === 0) {
      this.lastValue = sample;
    }
    this.counter = (this.counter + 1) % this.hold;
    return this.lastValue;
  }

  get holdCycles(): number { return this.hold; }
}
`;

    const testSuiteCode = `// Test suite for ${compName}
const inst = new ${compName}(${holdCycles});

// First sample establishes the held value
const first = inst.push(42);
assert(first === 42, 'first output should be the first input');

// Subsequent samples within hold window return the same value
for (let i = 1; i < ${holdCycles}; i++) {
  const out = inst.push(100 + i);
  assert(out === 42, 'output should hold the first value');
}

// After hold window, new value is accepted
const after = inst.push(99);
assert(after === 99, 'output should update after hold window');
`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `v5 hold adapter (hold=${holdCycles}, type=${dataType})`,
      selfHealingGuards: []
    };
  }
};

export const v5DecimateAdapterPlugin: TemplatePlugin = {
  id: 'tpl_v5_decimate',
  name: 'v5 Decimate Adapter',
  domain: 'coding' as ToolDomain,
  category: 'infrastructure' as ComponentTemplateCategory,
  description: 'Decimates input by factor k (keeps every k-th sample). Proven once for all k in [2, 1024]. Contract: in_clock=base, out_clock=base/k.',
  benchmarkFlops: 20,
  complexity: 'O(1)',
  defaultScore: 0.99,
  tags: ['v5', 'adapter', 'decimate', 'rate-mismatch'],
  params: decimateParams,
  synthesizer: (userParams, options) => {
    const factor = Math.max(2, Math.floor(Number(userParams.factor) || 2));
    const dataType = (userParams.dataType || 'f32') as string;
    const compName = options?.componentName || 'DecimateAdapter';

    const sourceCode = `/**
 * v5 Decimate Adapter: ${compName}
 * Blueprint: tpl_v5_decimate (Factor: ${factor}, Type: ${dataType})
 * Proven once for ALL factor in [2, 1024].
 * Contract: in_clock=base, out_clock=base/${factor}
 */
export class ${compName} {
  private counter: number = 0;

  constructor(private k: number = ${factor}) {}

  push(sample: ${dataType}): ${dataType} | null {
    const keep = this.counter % this.k === 0;
    this.counter = (this.counter + 1) % this.k;
    return keep ? sample : null;
  }

  get factor(): number { return this.k; }
}
`;

    const testSuiteCode = `// Test suite for ${compName}
const inst = new ${compName}(${factor});

// Every k-th sample is kept
let kept = [];
for (let i = 0; i < ${factor * 3}; i++) {
  const out = inst.push(i);
  if (out !== null) kept.push(out);
}
assert(kept.length === 3, 'should keep 3 samples out of ${factor * 3}');
assert(kept[0] === 0 && kept[1] === ${factor} && kept[2] === ${factor * 2}, 'kept samples should be every k-th');
`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `v5 decimate adapter (factor=${factor}, type=${dataType})`,
      selfHealingGuards: []
    };
  }
};

export const v5InterpolateAdapterPlugin: TemplatePlugin = {
  id: 'tpl_v5_interpolate',
  name: 'v5 Interpolate Adapter',
  domain: 'coding' as ToolDomain,
  category: 'infrastructure' as ComponentTemplateCategory,
  description: 'Interpolates input by factor k (inserts k-1 samples between each). Proven once for all k in [2, 1024]. Contract: in_clock=base, out_clock=base*k.',
  benchmarkFlops: 80,
  complexity: 'O(k)',
  defaultScore: 0.98,
  tags: ['v5', 'adapter', 'interpolate', 'rate-mismatch'],
  params: interpolateParams,
  synthesizer: (userParams, options) => {
    const factor = Math.max(2, Math.floor(Number(userParams.factor) || 2));
    const dataType = (userParams.dataType || 'f32') as string;
    const compName = options?.componentName || 'InterpolateAdapter';

    const sourceCode = `/**
 * v5 Interpolate Adapter: ${compName}
 * Blueprint: tpl_v5_interpolate (Factor: ${factor}, Type: ${dataType})
 * Proven once for ALL factor in [2, 1024].
 * Contract: in_clock=base, out_clock=base*${factor}
 */
export class ${compName} {
  private prev: ${dataType};
  private curr: ${dataType};
  private hasPrev: boolean = false;
  private subIdx: number = 0;

  constructor(private k: number = ${factor}) {
    this.prev = 0 as ${dataType};
    this.curr = 0 as ${dataType};
  }

  push(sample: ${dataType}): ${dataType}[] {
    if (!this.hasPrev) {
      this.prev = sample;
      this.hasPrev = true;
      return [sample];
    }
    this.curr = sample;
    const out: ${dataType}[] = [];
    for (let i = 0; i < this.k; i++) {
      const t = i / this.k;
      out.push((this.prev + (this.curr - this.prev) * t) as ${dataType});
    }
    this.prev = this.curr;
    return out;
  }

  get factor(): number { return this.k; }
}
`;

    const testSuiteCode = `// Test suite for ${compName}
const inst = new ${compName}(${factor});

// First sample passes through
const first = inst.push(0);
assert(first.length === 1 && first[0] === 0, 'first sample should pass through');

// Second sample triggers interpolation
const interp = inst.push(10);
assert(interp.length === ${factor}, 'should output ${factor} samples');
assert(interp[0] === 0, 'first interpolated sample should be the previous value');
assert(interp[${factor - 1}] < 10, 'last interpolated sample should approach the new value');
`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `v5 interpolate adapter (factor=${factor}, type=${dataType})`,
      selfHealingGuards: []
    };
  }
};

export const v5BufferAdapterPlugin: TemplatePlugin = {
  id: 'tpl_v5_buffer',
  name: 'v5 Buffer Adapter',
  domain: 'coding' as ToolDomain,
  category: 'infrastructure' as ComponentTemplateCategory,
  description: 'Buffers samples up to capacity. Proven once for all capacities in [1, 65536]. Contract: in_clock=base, out_clock=base (with capacity bound).',
  benchmarkFlops: 40,
  complexity: 'O(1)',
  defaultScore: 0.99,
  tags: ['v5', 'adapter', 'buffer', 'rate-mismatch'],
  params: bufferParams,
  synthesizer: (userParams, options) => {
    const capacity = Math.max(1, Math.floor(Number(userParams.capacity) || 16));
    const dataType = (userParams.dataType || 'f32') as string;
    const compName = options?.componentName || 'BufferAdapter';

    const sourceCode = `/**
 * v5 Buffer Adapter: ${compName}
 * Blueprint: tpl_v5_buffer (Capacity: ${capacity}, Type: ${dataType})
 * Proven once for ALL capacity in [1, 65536].
 * Contract: in_clock=base, out_clock=base (with capacity bound)
 */
export class ${compName} {
  private buffer: ${dataType}[];

  constructor(private cap: number = ${capacity}) {
    // Start EMPTY: new Array(cap) yields an array of length cap (empty
    // slots), so push() saw buffer.length === cap immediately and rejected
    // every sample — the adapter could never accept its first sample.
    this.buffer = [];
  }

  push(sample: ${dataType}): boolean {
    if (this.buffer.length < this.cap) {
      this.buffer.push(sample);
      return true;
    }
    return false;
  }

  drain(): ${dataType}[] {
    const out = [...this.buffer];
    this.buffer = [];
    return out;
  }

  get size(): number { return this.buffer.length; }
  get capacity(): number { return this.cap; }
  get isFull(): boolean { return this.buffer.length >= this.cap; }
}
`;

    const testSuiteCode = `// Test suite for ${compName}
const inst = new ${compName}(${capacity});

// Fill the buffer
for (let i = 0; i < ${capacity}; i++) {
  assert(inst.push(i) === true, 'should accept samples until full');
}
assert(inst.isFull === true, 'buffer should be full');

// Reject overflow
assert(inst.push(999) === false, 'should reject when full');

// Drain and verify
const drained = inst.drain();
assert(drained.length === ${capacity}, 'drained length should equal capacity');
assert(drained[0] === 0 && drained[${capacity - 1}] === ${capacity - 1}, 'drained samples should be in order');
`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `v5 buffer adapter (capacity=${capacity}, type=${dataType})`,
      selfHealingGuards: []
    };
  }
};

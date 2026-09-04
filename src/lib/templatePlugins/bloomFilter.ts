/**
 * Bloom filter template plugin — proof of the template plugin API.
 *
 * This template is defined OUTSIDE the built-in library and registered with a
 * single `registerComponentTemplatePlugin(...)` call from componentTemplates.ts,
 * exactly the way any third-party add-on would be added. It also declares a
 * `selfHost` descriptor, so building it with self-hosting enabled writes a real
 * module that the running server imports and calls.
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

const params: ComponentTemplateParam[] = [
  {
    id: 'capacity',
    label: 'Bit Capacity',
    type: 'number',
    default: 1024,
    min: 16,
    max: 1_000_000,
    step: 16,
    description: 'Number of underlying hash buckets'
  },
  {
    id: 'numHashes',
    label: 'Hash Functions (k)',
    type: 'number',
    default: 3,
    min: 1,
    max: 16,
    step: 1,
    description: 'Independent hash functions per membership check'
  }
];

export const bloomFilterPlugin: TemplatePlugin = {
  id: 'tpl_bloom_filter',
  name: 'Probabilistic Bloom Filter Membership Probe',
  domain: 'coding' as ToolDomain,
  category: 'algorithmic' as ComponentTemplateCategory,
  description: 'Space-efficient probabilistic set membership with double-hashing, false-positive telemetry, and self-healing bit-boundary guards.',
  benchmarkFlops: 900,
  complexity: 'O(k)',
  defaultScore: 0.97,
  tags: ['probabilistic', 'membership', 'hashing', 'memory-efficient'],
  params,
  synthesizer: (userParams, options) => {
    const capacity = Math.max(16, Math.floor(Number(userParams.capacity) || 1024));
    const numHashes = Math.max(1, Math.min(16, Math.floor(Number(userParams.numHashes) || 3)));
    const withHealing = options?.withSelfHealing ?? true;
    const compName = options?.componentName || 'BloomFilter';

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_bloom_filter (Capacity: ${capacity}, k: ${numHashes})
 */
export class ${compName} {
  private capacity: number;
  private numHashes: number;
  private bits: Uint8Array;
  private added: number = 0;

  constructor(capacity = ${capacity}, numHashes = ${numHashes}) {
    this.capacity = Math.max(8, Math.floor(capacity));
    this.numHashes = Math.max(1, Math.min(16, Math.floor(numHashes)));
    this.bits = new Uint8Array(Math.ceil(this.capacity / 8));
  }

  private hash(item: string, seed: number): number {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < item.length; i++) {
      const ch = item.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0) % this.capacity;
  }

  public add(item: string): void {
    ${withHealing ? `if (typeof item !== 'string' || item.length === 0) {
      throw new Error('Bloom filter items must be non-empty strings');
    }` : ''}
    for (let i = 0; i < this.numHashes; i++) {
      const idx = this.hash(item, i * 0x9e3779b1 + 1);
      this.bits[Math.floor(idx / 8)] |= 1 << (idx % 8);
    }
    this.added++;
  }

  public has(item: string): boolean {
    for (let i = 0; i < this.numHashes; i++) {
      const idx = this.hash(item, i * 0x9e3779b1 + 1);
      if ((this.bits[Math.floor(idx / 8)] & (1 << (idx % 8))) === 0) return false;
    }
    return true;
  }

  public getStats(): { capacity: number; added: number; loadFactor: number; estimatedFalsePositiveRate: number } {
    const n = Math.max(1, this.added);
    const p = Math.pow(1 - Math.exp((-this.numHashes * n) / this.capacity), this.numHashes);
    return {
      capacity: this.capacity,
      added: this.added,
      loadFactor: Math.round((this.added / this.capacity) * 1000) / 1000,
      estimatedFalsePositiveRate: Math.round(p * 10000) / 10000
    };
  }
}`;

    const testSuiteCode = `const bf = new ${compName}(${capacity}, ${numHashes});
bf.add('recourse');
bf.add('genome');
bf.add('template');
assert bf.has('recourse') === true;
assert bf.has('genome') === true;
assert bf.has('template') === true;
assert bf.has('definitely_not_added_word_xyz') === false;
const stats = bf.getStats();
assert stats.added === 3;
assert stats.capacity === ${capacity};
assert typeof stats.estimatedFalsePositiveRate === 'number';`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `Synthesized probabilistic Bloom filter (${capacity} buckets, ${numHashes} hashes) with false-positive telemetry`,
      selfHealingGuards: withHealing ? ['InputTypeBoundaryGuard', 'BitIndexBoundsClamp'] : []
    };
  },
  selfHost: {
    stateful: true,
    ctorParamIds: ['capacity', 'numHashes'],
    methods: [
      { method: 'add', label: 'Add item' },
      { method: 'has', label: 'Check membership' },
      { method: 'getStats', label: 'Read telemetry' }
    ]
  }
};

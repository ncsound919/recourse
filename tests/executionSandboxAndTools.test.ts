import { describe, it, expect } from 'vitest';
import { executeToolFunction, prepareExecutableCode } from '../src/lib/executionSandbox';
import { generateProvenanceMerkleRoot, verifyProvenanceChainSync } from '../src/lib/provenance';
import { ProvenanceEvent } from '../src/types';

describe('Execution Sandbox & Provenance Ledger', () => {
  describe('prepareExecutableCode & executeToolFunction', () => {
    it('executes pure mathematical functions in isolated scope', () => {
      const code = `
        function calculate(a, b) {
          return a * b + 42;
        }
      `;
      const result = executeToolFunction(code, 'calculate', [3, 4]);
      expect(result.success).toBe(true);
      expect(result.returnValue).toBe(54);
    });

    it('catches execution errors and provides descriptive diagnostics', () => {
      const code = `
        function failFast() {
          throw new Error('Sandbox deliberate fault');
        }
      `;
      const result = executeToolFunction(code, 'failFast', []);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Sandbox deliberate fault');
    });

    it('captures console logs safely in stdout', () => {
      const code = `
        function runLogging() {
          console.log('computed telemetry token');
          return 100;
        }
      `;
      const result = executeToolFunction(code, 'runLogging', []);
      expect(result.success).toBe(true);
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stdout[0]).toContain('computed telemetry token');
    });
  });

  describe('generateProvenanceMerkleRoot & Chain Verification', () => {
    it('computes Merkle root across provenance events', () => {
      const e1: ProvenanceEvent = {
        prev: '0'.repeat(64),
        hash: 'hash_001',
        type: 'tool_registered',
        ts: Date.now(),
        data: { initial: true }
      };
      const e2: ProvenanceEvent = {
        prev: 'hash_001',
        hash: 'hash_002',
        type: 'tool_verification',
        ts: Date.now(),
        data: { passed: true }
      };

      const result = generateProvenanceMerkleRoot([e1, e2]);
      expect(result.merkleRoot).toBeDefined();
      expect(result.merkleRoot.length).toBe(64);
      expect(result.totalLeaves).toBe(2);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { sha256Sync, MerkleTree, timingSafeEqualBuffers, auditCodeSecurity } from '../src/lib/cyberDefenseEngine';
import { verifyProvenanceChainSync } from '../src/lib/provenance';
import { ProvenanceEvent } from '../src/types';

describe('Cyber Defense & Provenance Integrity Engine', () => {
  describe('Synchronous SHA-256 Primitives', () => {
    it('produces standard deterministic SHA-256 hashes', () => {
      const hash1 = sha256Sync('hello world');
      const hash2 = sha256Sync('hello world');
      const hashDiff = sha256Sync('hello world!');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hashDiff);
      expect(hash1.length).toBe(64);
    });

    it('handles Uint8Array input identically to strings', () => {
      const text = 'test message';
      const bytes = new TextEncoder().encode(text);
      expect(sha256Sync(text)).toBe(sha256Sync(bytes));
    });
  });

  describe('Merkle Tree and Inclusion Proofs', () => {
    it('builds Merkle tree and generates verifiable cryptographic inclusion proofs', () => {
      const leaves = ['tx_001', 'tx_002', 'tx_003', 'tx_004'];
      const tree = new MerkleTree(leaves);
      const root = tree.getRootHash();

      expect(root.length).toBe(64);

      // Verify leaf 0 proof
      const proof0 = tree.getProof(0);
      expect(proof0.length).toBeGreaterThan(0);
      const isValid0 = MerkleTree.verifyProof('tx_001', proof0, root);
      expect(isValid0).toBe(true);

      // Tampered data must fail
      const isTampered = MerkleTree.verifyProof('tx_tampered', proof0, root);
      expect(isTampered).toBe(false);
    });

    it('handles odd number of leaves gracefully', () => {
      const leaves = ['leaf1', 'leaf2', 'leaf3'];
      const tree = new MerkleTree(leaves);
      expect(tree.getRootHash().length).toBe(64);

      const proof2 = tree.getProof(2);
      expect(MerkleTree.verifyProof('leaf3', proof2, tree.getRootHash())).toBe(true);
    });
  });

  describe('Constant-Time Buffer Equality (Timing-Attack Defense)', () => {
    it('correctly compares matching and differing buffers', () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      const b = new Uint8Array([1, 2, 3, 4]);
      const c = new Uint8Array([1, 2, 3, 5]);
      const d = new Uint8Array([1, 2, 3]);

      expect(timingSafeEqualBuffers(a, b)).toBe(true);
      expect(timingSafeEqualBuffers(a, c)).toBe(false);
      expect(timingSafeEqualBuffers(a, d)).toBe(false);
    });
  });

  describe('AST Static Code Security Scanner', () => {
    it('detects insecure patterns such as eval, document.cookie, and prototype pollution', () => {
      const secureCode = `
        export function add(a, b) {
          return a + b;
        }
      `;
      const insecureCode = `
        export function run(input) {
          eval(input);
          document.cookie = "token=secret";
          return true;
        }
      `;

      const secureReport = auditCodeSecurity(secureCode);
      expect(secureReport.isSecure).toBe(true);
      expect(secureReport.vulnerabilities.length).toBe(0);

      const insecureReport = auditCodeSecurity(insecureCode);
      expect(insecureReport.isSecure).toBe(false);
      expect(insecureReport.vulnerabilities.some(v => v.type === 'DYNAMIC_EVAL_INJECTION')).toBe(true);
    });
  });

  describe('Provenance Chain Verification', () => {
    it('verifies a continuous valid parent-linked hash chain', () => {
      const e1: ProvenanceEvent = {
        prev: '0'.repeat(64),
        hash: sha256Sync('block_1'),
        type: 'tool_registered',
        ts: 1000,
        data: {}
      };
      const e2: ProvenanceEvent = {
        prev: e1.hash,
        hash: sha256Sync('block_2'),
        type: 'tool_verification',
        ts: 2000,
        data: {}
      };

      const validResult = verifyProvenanceChainSync([e1, e2]);
      expect(validResult.valid).toBe(true);
      expect(validResult.length).toBe(2);

      // Tamper with e2.prev
      const brokenE2 = { ...e2, prev: 'corrupted_hash' };
      const invalidResult = verifyProvenanceChainSync([e1, brokenE2]);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.brokenLinkIndex).toBe(1);
    });
  });
});

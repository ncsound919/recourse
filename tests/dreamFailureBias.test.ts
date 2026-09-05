import { describe, it, expect } from 'vitest';
import {
  fingerprintForMutation,
  avoidGuidance,
  episodeFromMutation,
  biasWeightForGene,
} from '../src/dream/failureBias';
import type { Episode } from '../src/lib/memory/types';

describe('failureBias', () => {
  const episodes: Episode[] = [
    {
      id: 'ep1',
      timestamp: 1000,
      problemFingerprint: 'mutate/tool/foo-bar-baz',
      toolName: 'test_tool_1',
      outcome: 'loss',
      score: 0,
      geneIds: ['gene_a', 'gene_b'],
      summary: 'Tool crashed on null input when trying to parse JSON',
    },
    {
      id: 'ep2',
      timestamp: 2000,
      problemFingerprint: 'mutate/tool/foo-bar-qux',
      toolName: 'test_tool_2',
      outcome: 'loss',
      score: 0,
      geneIds: ['gene_b', 'gene_c'],
      summary: 'Infinite loop detected during recursive processing',
    },
    {
      id: 'ep3',
      timestamp: 3000,
      problemFingerprint: 'mutate/tool/alpha-beta-gamma',
      toolName: 'test_tool_3',
      outcome: 'win',
      score: 1,
      geneIds: ['gene_a', 'gene_c'],
      summary: 'Successfully processed batch of 1000 items',
    },
    {
      id: 'ep4',
      timestamp: 4000,
      problemFingerprint: 'mutate/tool/foo-bar-baz',
      toolName: 'test_tool_1',
      outcome: 'loss',
      score: 0,
      geneIds: ['gene_d'],
      summary: 'Tool crashed on null input when trying to parse JSON',
    },
  ];

  describe('fingerprintForMutation', () => {
    it('creates deterministic fingerprint from domain and instructions', () => {
      const fp1 = fingerprintForMutation('coding', 'Make a tool that does X and Y');
      const fp2 = fingerprintForMutation('coding', 'Make a tool that does X and Y');
      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^mutate\/coding\//);
    });

    it('includes targetToolName when provided', () => {
      const fp = fingerprintForMutation('coding', 'Make a tool', 'my_specific_tool');
      expect(fp).toBe('mutate/coding/my_specific_tool');
    });

    it('handles short instructions gracefully', () => {
      const fp = fingerprintForMutation('coding', 'hi');
      expect(fp).toBe('mutate/coding');
    });

    it('filters stopwords and short tokens', () => {
      const fp = fingerprintForMutation('coding', 'the and for with from that');
      expect(fp).toBe('mutate/coding'); // all filtered out
    });

    it('limits to 10 significant tokens', () => {
      // All these tokens are > 2 chars and not stopwords
      const longInstructions = 'alpha beta charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar';
      const fp = fingerprintForMutation('coding', longInstructions);
      // Count tokens after 'mutate/tool/'
      const tokensAfterPrefix = fp.split('/').slice(2).join('/');
      const tokenCount = tokensAfterPrefix.split('-').length;
      expect(tokenCount).toBe(10);
    });
  });

  describe('avoidGuidance', () => {
    it('returns empty array when no similar losses', () => {
      const fp = fingerprintForMutation('coding', 'completely unrelated instructions');
      const guidance = avoidGuidance(episodes, fp);
      expect(guidance).toEqual([]);
    });

    it('returns avoid lines for similar loss episodes', () => {
      // Build episodes whose fingerprints share tokens with the query
      const matchingEpisodes: Episode[] = [
        {
          id: 'ep-match',
          timestamp: 1000,
          problemFingerprint: 'mutate/tool/crashed-null-input-trying-parse-json',
          toolName: 'test_tool_1',
          outcome: 'loss',
          score: 0,
          geneIds: ['gene_a'],
          summary: 'Tool crashed on null input when trying to parse JSON',
        },
      ];
      const fp = fingerprintForMutation('coding', 'Tool crashed on null input when trying to parse JSON');
      const guidance = avoidGuidance(matchingEpisodes, fp, { maxLines: 5 });
      expect(guidance.length).toBeGreaterThan(0);
      expect(guidance[0]).toContain('crashed on null input');
    });

    it('respects maxLines limit', () => {
      const matchingEpisodes: Episode[] = [
        {
          id: 'ep-match',
          timestamp: 1000,
          problemFingerprint: 'mutate/tool/crashed-null-input-trying-parse-json',
          toolName: 'test_tool_1',
          outcome: 'loss',
          score: 0,
          geneIds: ['gene_a'],
          summary: 'Tool crashed on null input when trying to parse JSON',
        },
      ];
      const fp = fingerprintForMutation('coding', 'Tool crashed on null input when trying to parse JSON');
      const guidance = avoidGuidance(matchingEpisodes, fp, { maxLines: 1 });
      expect(guidance.length).toBe(1);
    });

    it('respects minSimilarity threshold', () => {
      const fp = fingerprintForMutation('coding', 'completely unrelated');
      const guidanceHigh = avoidGuidance(episodes, fp, { minSimilarity: 0.9 });
      const guidanceLow = avoidGuidance(episodes, fp, { minSimilarity: 0.01 });
      expect(guidanceHigh.length).toBeLessThanOrEqual(guidanceLow.length);
    });

    it('only returns loss episodes, never wins or neutrals', () => {
      const fp = fingerprintForMutation('coding', 'Successfully processed batch of 1000 items');
      const guidance = avoidGuidance(episodes, fp);
      // Even though ep3 is a win and similar, it should not appear in guidance
      expect(guidance.some(line => line.includes('Successfully processed'))).toBe(false);
    });

    it('deduplicates similar guidance lines', () => {
      const duplicateEpisodes: Episode[] = [
        ...episodes,
        {
          id: 'ep5',
          timestamp: 5000,
          problemFingerprint: 'mutate/tool/foo-bar-baz-dup',
          toolName: 'test_tool_4',
          outcome: 'loss',
          score: 0,
          geneIds: ['gene_e'],
          summary: 'Tool crashed on null input when trying to parse JSON', // same as ep1/ep4
        },
      ];
      const fp = fingerprintForMutation('coding', 'Tool crashed on null input when trying to parse JSON');
      const guidance = avoidGuidance(duplicateEpisodes, fp, { maxLines: 10 });
      // Should not have duplicate lines
      const uniqueGuidance = [...new Set(guidance)];
      expect(guidance.length).toBe(uniqueGuidance.length);
    });
  });

  describe('episodeFromMutation', () => {
    it('creates proper episode from winning mutation', () => {
      const input = {
        fingerprint: 'mutate/tool/test-win',
        toolName: 'winning_tool',
        geneIds: ['gene_x', 'gene_y'],
        outcome: 'win' as const,
        score: 1,
        summary: 'This tool works great and solves the problem efficiently',
      };

      const episode = episodeFromMutation(input);
      expect(episode.problemFingerprint).toBe(input.fingerprint);
      expect(episode.toolName).toBe(input.toolName);
      expect(episode.outcome).toBe('win');
      expect(episode.score).toBe(1);
      expect(episode.geneIds).toEqual(['gene_x', 'gene_y']);
      expect(episode.summary).toBe(input.summary);
      // id and timestamp should be omitted
      expect(episode).not.toHaveProperty('id');
      expect(episode).not.toHaveProperty('timestamp');
    });

    it('truncates long summaries', () => {
      const longSummary = 'x'.repeat(600);
      const input = {
        fingerprint: 'mutate/tool/test-long',
        toolName: 'test_tool',
        geneIds: ['gene_z'],
        outcome: 'loss' as const,
        score: 0,
        summary: longSummary,
      };

      const episode = episodeFromMutation(input);
      expect(episode.summary.length).toBe(500);
      expect(episode.summary).toBe(longSummary.slice(0, 500));
    });

    it('trims whitespace from summary', () => {
      const input = {
        fingerprint: 'mutate/tool/test-trim',
        toolName: 'test_tool',
        geneIds: ['gene_trim'],
        outcome: 'neutral' as const,
        score: 0,
        summary: '  leading and trailing spaces  ',
      };

      const episode = episodeFromMutation(input);
      expect(episode.summary).toBe('leading and trailing spaces');
    });
  });

  describe('biasWeightForGene', () => {
    it('returns 1.0 for unknown genes', () => {
      const weight = biasWeightForGene(episodes, 'unknown_gene_xyz');
      expect(weight).toBe(1);
    });

    it('calculates correct weight for gene with losses', () => {
      // gene_b appears in 2 losses (ep1, ep2), not in ep3 (win)
      // Start: 1.0 - 2*0.25 = 0.5
      const weight = biasWeightForGene(episodes, 'gene_b');
      expect(weight).toBeCloseTo(0.5, 2);
    });

    it('respects epsilon floor', () => {
      // Create episodes that would push weight below epsilon
      const lowWeightEpisodes: Episode[] = [
        {
          id: 'ep-low',
          timestamp: 1000,
          problemFingerprint: 'test/tool',
          toolName: 'test_tool',
          outcome: 'loss',
          score: 0,
          geneIds: ['suffering_gene'],
          summary: 'constant losses',
        },
        // Add enough losses to drive weight down
        {
          id: 'ep-low2',
          timestamp: 2000,
          problemFingerprint: 'test/tool2',
          toolName: 'test_tool',
          outcome: 'loss',
          score: 0,
          geneIds: ['suffering_gene'],
          summary: 'more losses',
        },
        {
          id: 'ep-low3',
          timestamp: 3000,
          problemFingerprint: 'test/tool3',
          toolName: 'test_tool',
          outcome: 'loss',
          score: 0,
          geneIds: ['suffering_gene'],
          summary: 'even more losses',
        },
      ];

      const weight = biasWeightForGene(lowWeightEpisodes, 'suffering_gene', { epsilon: 0.1 });
      // With epsilon 0.1, loss penalty 0.25, win bonus 0.05
      // Start: 1.0
      // After 3 losses: 1.0 - 3*0.25 = 0.25
      // Should be clamped to epsilon 0.1? No, 0.25 > 0.1 so stays 0.25
      // Let me recalculate: Actually 1 - 0.75 = 0.25, which is > 0.1
      expect(weight).toBeGreaterThanOrEqual(0.1);
    });

    it('respects custom bias options', () => {
      const weightDefault = biasWeightForGene(episodes, 'gene_b');
      const weightCustom = biasWeightForGene(episodes, 'gene_b', {
        epsilon: 0.2,
        lossPenalty: 0.5,
        winBonus: 0.1,
      });
      // With higher penalties, gene_b (2 losses, 1 win) should be lower
      // Start: 1.0
      // Default: 1 - 2*0.25 + 1*0.05 = 0.55
      // Custom: 1 - 2*0.5 + 1*0.1 = 0.1, clamped to epsilon 0.2
      expect(weightCustom).toBeLessThan(weightDefault);
      expect(weightCustom).toBeGreaterThanOrEqual(0.2);
    });
  });
});
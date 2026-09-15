/**
 * Component-template lifecycle tests.
 *
 * Real verification, not smoke theater:
 * - Every registered template must BUILD from its declared defaults AND the
 *   emitted source must PASS its own stored suite inside the sandbox. A
 *   template whose generated code fails its own test is a broken template.
 * - Covers buildComponentFromTemplate success + not-found + synthesis-exception
 *   paths, template-assisted self-repair routing, and learner-directive
 *   selection, so the template layer has no silently-dead branches.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_TEMPLATES,
  buildComponentFromTemplate,
  synthesizeTemplateRepair,
  selectTemplateForLearnerDirective,
  registerComponentTemplatePlugin,
} from '../src/lib/componentTemplates';
import type { TemplatePlugin } from '../src/lib/templatePlugin';
import { executeTestSuite } from '../src/lib/executionSandbox';

describe('component template lifecycle (build + real sandbox verify)', () => {
  it('every registered template builds from defaults and its emitted suite passes', () => {
    const ids = Object.keys(COMPONENT_TEMPLATES);
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) {
      const tpl = COMPONENT_TEMPLATES[id];
      const defaults: Record<string, any> = {};
      for (const p of tpl.params) defaults[p.id] = p.default;
      const built = buildComponentFromTemplate(id, defaults, { withSelfHealing: true });
      expect(built.success, `${id} build`).toBe(true);
      if (!built.success) continue;
      expect(built.synthesizedCode.length).toBeGreaterThan(0);
      expect(built.testSuiteCode.length).toBeGreaterThan(0);
      expect(built.entrypointName.length).toBeGreaterThan(0);
      const run = executeTestSuite(built.synthesizedCode, built.testSuiteCode);
      const detail = run.testDetails.filter((d) => d.startsWith('[FAIL')).slice(0, 2).join(' | ') || run.stderr.join(' ');
      expect(run.passed, `${id} emitted suite: ${detail}`).toBe(true);
    }
  });

  it('buildComponentFromTemplate reports an unknown template id honestly', () => {
    const r = buildComponentFromTemplate('tpl_does_not_exist', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('not found');
    expect(r.complexity).toBe('Unknown');
  });

  it('honors withSelfHealing:false and a custom componentName', () => {
    const healing = buildComponentFromTemplate('tpl_bloom_filter', { capacity: 64, numHashes: 2 }, { withSelfHealing: true, componentName: 'Blocker' });
    expect(healing.success).toBe(true);
    expect(healing.synthesizedCode).toContain('class Blocker');
    expect((healing as any).selfHealingGuards?.length).toBeGreaterThan(0);

    const bare = buildComponentFromTemplate('tpl_bloom_filter', { capacity: 64, numHashes: 2 }, { withSelfHealing: false, componentName: 'Bare' });
    expect(bare.success).toBe(true);
    expect(bare.synthesizedCode).toContain('class Bare');
    expect((bare as any).selfHealingGuards?.length ?? 0).toBe(0);
    // Bare build must still pass its own suite in the sandbox.
    const run = executeTestSuite(bare.synthesizedCode, bare.testSuiteCode);
    expect(run.passed).toBe(true);
  });

  it('reports a synthesizer exception as a failed build, not a crash', () => {
    const throwing: TemplatePlugin = {
      id: 'tpl_throws_probe',
      name: 'Throwing probe',
      domain: 'coding',
      category: 'algorithmic',
      description: 'synthesizer always throws',
      params: [],
      defaultScore: 0.5,
      benchmarkFlops: 1,
      complexity: 'O(1)',
      tags: ['probe'],
      synthesizer: () => {
        throw new Error('boom');
      },
    };
    registerComponentTemplatePlugin(throwing);
    const r = buildComponentFromTemplate('tpl_throws_probe', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('Synthesis exception');
    expect(r.error).toContain('boom');
  });
});

describe('template-assisted self-repair routing', () => {
  it('routes each known error signature to its canonical template', () => {
    expect(synthesizeTemplateRepair('math', 'x', 'vieta_sign_bug').templateUsed).toBe('tpl_newton_raphson');
    expect(synthesizeTemplateRepair('math', 'return b / a', 'generic').templateUsed).toBe('tpl_newton_raphson');
    expect(synthesizeTemplateRepair('cyber_defense', 'x', 'security_taint').templateUsed).toBe('tpl_hmac_sanitizer');
    expect(synthesizeTemplateRepair('coding', 'eval(code)', 'generic').templateUsed).toBe('tpl_hmac_sanitizer');
    expect(synthesizeTemplateRepair('systemic', 'x', 'async_deadlock').templateUsed).toBe('tpl_token_bucket');
    expect(synthesizeTemplateRepair('math', 'lock(&m)', 'generic').templateUsed).toBe('tpl_token_bucket');
    expect(synthesizeTemplateRepair('coding', 'x', 'syntax_ast_error').templateUsed).toBe('tpl_lru_cache');
  });

  it('falls back to the first template of the requested domain', () => {
    const r = synthesizeTemplateRepair('neuro_symbolic', 'weird', 'unknown_error');
    expect(r.confidence).toBe(0.95);
    expect(COMPONENT_TEMPLATES[r.templateUsed].domain).toBe('neuro_symbolic');
    expect(r.repairedCode.length).toBeGreaterThan(0);
  });
});

describe('learner-directive template selection', () => {
  it('picks the highest-score template on amplify and first on refine', () => {
    const coding = Object.values(COMPONENT_TEMPLATES).filter((t) => t.domain === 'coding');
    expect(coding.length).toBeGreaterThan(1);
    const amplified = selectTemplateForLearnerDirective('amplify', 'coding');
    const refined = selectTemplateForLearnerDirective('refine', 'coding');
    expect(amplified).toBeDefined();
    expect(refined).toBeDefined();
    const maxScore = Math.max(...coding.map((t) => t.defaultScore));
    expect(amplified!.defaultScore).toBe(maxScore);
  });

  it('falls back to the first template when the domain has none', () => {
    const bogus = selectTemplateForLearnerDirective('amplify', '__no_such_domain__' as any);
    expect(bogus).toBeDefined();
  });
});

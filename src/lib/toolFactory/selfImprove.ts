import { selectTemplateForLearnerDirective } from '../componentTemplates.js';
import { registerComponentTemplatePlugin, isTemplateRegistered } from '../templatePlugin.js';
import { recordSelfRepairExperience } from '../componentTemplates.js';
import { composeTool } from './composer.js';
import { registerBuiltinChunks } from './builtinChunks.js';
import type { ToolRecipe } from './types.js';

// Ensure built-in chunks exist even if a test cleared them.
registerBuiltinChunks();
import type { ComponentTemplateParam } from '../../types.js';

const TEMPLATE_CHUNK_MAP: Record<string, string> = {
  tpl_lru_cache: 'chk_lru_cache_core',
  tpl_lru_cache_factory: 'chk_lru_cache_core',
  tpl_token_bucket: 'chk_token_bucket_core',
  tpl_token_bucket_factory: 'chk_token_bucket_core',
  tpl_hmac_sanitizer: 'chk_hmac_sanitizer_core',
  tpl_hmac_sanitizer_factory: 'chk_hmac_sanitizer_core'
};

const DOMAIN_DEFAULT_CHUNK: Record<string, string> = {
  coding: 'chk_lru_cache_core',
  math: 'chk_lru_cache_core',
  cyber_defense: 'chk_hmac_sanitizer_core',
  systemic: 'chk_lru_cache_core'
};

function chunkForBase(base: { id: string; domain: string }): string {
  return TEMPLATE_CHUNK_MAP[base.id] ?? DOMAIN_DEFAULT_CHUNK[base.domain] ?? 'chk_lru_cache_core';
}

/**
 * Hook the tool factory into the self-improvement directive flow.
 *
 * Given a learner directive kind + domain, propose a composed tool (if a
 * suitable base template + chunk exist), register it as a first-class
 * template, and record the experience. Returns the new template id or null.
 */
export function composeFromDirective(directiveKind: string, domain: string): string | null {
  const base = selectTemplateForLearnerDirective(directiveKind, domain as any);
  if (!base) return null;

  const chunkId = chunkForBase(base);
  const newId = `${base.id}_factory_${directiveKind}`.replace(/[^a-zA-Z0-9_]/g, '_');
  if (isTemplateRegistered(newId)) return newId;

  const params: ComponentTemplateParam[] = (base.params ?? []).map((p) => ({ ...p }));

  const recipe: ToolRecipe = {
    id: newId,
    name: `${base.name} (Factory ${directiveKind})`,
    domain: base.domain,
    category: base.category,
    description: `Factory-composed variant of ${base.name} from ${directiveKind} directive.`,
    params,
    chunks: [chunkId],
    snippets: [],
    tags: [...(base.tags ?? []), 'factory-composed', `directive:${directiveKind}`],
    sizeBudget: 200,
    selfHost: base.selfHost
  };

  let composed;
  try {
    composed = composeTool(recipe);
  } catch {
    return null;
  }

  try {
    registerComponentTemplatePlugin({
      id: newId,
      name: recipe.name,
      domain: recipe.domain,
      category: recipe.category,
      description: recipe.description,
      params: recipe.params,
      defaultScore: base.defaultScore,
      benchmarkFlops: base.benchmarkFlops,
      complexity: base.complexity,
      tags: recipe.tags,
      artifactKind: base.artifactKind,
      selfHost: base.selfHost,
      synthesizer: () => ({
        sourceCode: composed.sourceCode,
        testSuiteCode: composed.testSuiteCode,
        entrypointName: composed.entrypointName,
        summary: composed.summary,
        selfHealingGuards: []
      })
    });
  } catch {
    return null;
  }

  try {
    recordSelfRepairExperience('factory_compose', domain as any, true, 0.95, newId);
  } catch {
    /* non-fatal */
  }

  return newId;
}
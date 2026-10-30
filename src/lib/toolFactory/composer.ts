import Handlebars from 'handlebars';
import { getChunk } from './chunks.js';
import { getSnippet } from './snippets.js';
import { registerBuiltinChunks } from './builtinChunks.js';
import type { ToolRecipe, ComposedTool } from './types.js';

const COMPOSER_VERSION = '0.1.0';

function finalParams(recipe: ToolRecipe): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of recipe.params) {
    out[p.id] = p.default;
  }
  return out;
}

export function composeTool(recipe: ToolRecipe): ComposedTool {
  try { registerBuiltinChunks(); } catch { /* already registered */ }
  if (!recipe || typeof recipe !== 'object') throw new Error('recipe must be an object');
  if (!recipe.id) throw new Error('recipe requires id');
  if (!recipe.name) throw new Error('recipe requires name');

  const params = finalParams(recipe);
  const chunkIds = recipe.chunks ?? [];
  const snippetIds = recipe.snippets ?? [];

  // Resolve + render chunks
  const renderedChunks: string[] = [];
  for (const cid of chunkIds) {
    const chunk = getChunk(cid);
    if (!chunk) throw new Error(`Unknown chunk "${cid}"`);
    const tpl = Handlebars.compile(chunk.body, { noEscape: true });
    renderedChunks.push(tpl({ ...params, params, recipe }));
  }
  // Resolve + render snippets
  const renderedSnippets: string[] = [];
  for (const sid of snippetIds) {
    const sn = getSnippet(sid);
    if (!sn) throw new Error(`Unknown snippet "${sid}"`);
    const tpl = Handlebars.compile(sn.code, { noEscape: true });
    renderedSnippets.push(tpl({ ...params, params, recipe }));
  }

  const entrypointName = recipe.name.replace(/[^a-zA-Z0-9]/g, '') || 'ComposedTool';

  const rawSource = `/**
 * Autonomously composed tool: ${recipe.name}
 * Recipe: ${recipe.id}
 */
${renderedSnippets.join('\n\n')}

export class ${entrypointName} {
${renderedChunks.join('\n\n')}
}
`;

  const ctx = { ...params, params, recipe, entrypointName };
  const chunkTests = (recipe.chunks ?? [])
    .map((cid) => {
      const t = getChunk(cid)?.test;
      if (!t) return '';
      try {
        return Handlebars.compile(t, { noEscape: true })(ctx);
      } catch {
        return t;
      }
    })
    .filter(Boolean);
  const snippetTests = (recipe.snippets ?? [])
    .map((sid) => {
      const t = getSnippet(sid)?.test;
      if (!t) return '';
      try {
        return Handlebars.compile(t, { noEscape: true })(ctx);
      } catch {
        return t;
      }
    })
    .filter(Boolean);
  const rawTests = `// Auto-generated tests for ${entrypointName}
${chunkTests.join('\n')}
${snippetTests.join('\n')}
`;

  // Prettier is async in v3; keep composer synchronous and deterministic by
  // returning the rendered source. Formatting can be applied by async callers.
  const sourceCode = rawSource;
  const hasTests = (recipe.chunks ?? []).some((c) => getChunk(c)?.test) ||
    (recipe.snippets ?? []).some((s) => getSnippet(s)?.test);
  const testSuiteCode = hasTests ? rawTests.trim() : '';

  const sizeLines = sourceCode.split('\n').length;
  const budget = recipe.sizeBudget ?? 200;
  if (sizeLines > budget) {
    throw new Error(`Composed tool exceeds size budget: ${sizeLines} > ${budget} LOC`);
  }

  return {
    id: recipe.id,
    name: recipe.name,
    sourceCode,
    testSuiteCode,
    entrypointName,
    summary: recipe.description,
    selfHealingGuards: [],
    sizeLines,
    provenance: {
      recipeId: recipe.id,
      chunkIds,
      snippetIds,
      composerVersion: COMPOSER_VERSION,
      prettierVersion: 'n/a (async; format in async callers)'
    }
  };
}

export function composeToolSync(recipe: ToolRecipe): ComposedTool {
  return composeTool(recipe);
}

// Re-export schema helper for convenience
export { paramsToJsonSchema } from './schema.js';

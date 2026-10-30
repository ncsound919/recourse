import { buildComponentFromTemplate, getComponentTemplate } from '../componentTemplates.js';
import { writeSelfHostedTool, defaultSelfHostRoot } from '../selfHosting.js';
import { composeTool } from './composer.js';
import type { ToolRecipe } from './types.js';

export interface PublishResult {
  success: boolean;
  error?: string;
  entryName?: string;
  artifactKind?: string;
}

/**
 * Publish an already-registered factory template as a self-hosted artifact.
 * Caller owns verification; this only materializes built code.
 */
export function publishTemplate(
  templateId: string,
  params: Record<string, any> = {},
  root: string = defaultSelfHostRoot()
): PublishResult {
  const tpl = getComponentTemplate(templateId);
  if (!tpl) return { success: false, error: `Unknown template "${templateId}"` };
  if (!tpl.selfHost) return { success: false, error: `Template "${templateId}" has no selfHost descriptor` };

  const built = buildComponentFromTemplate(templateId, params, { withSelfHealing: true });
  if (!built.success) return { success: false, error: built.error || 'build failed' };

  const res = writeSelfHostedTool(
    {
      name: tpl.id,
      templateId: tpl.id,
      domain: tpl.domain,
      entrypointName: built.entrypointName,
      params: params ?? {},
      sourceCode: built.synthesizedCode,
      testSuiteCode: built.testSuiteCode,
      summary: tpl.description,
      selfHost: tpl.selfHost,
      artifactKind: tpl.artifactKind ?? 'function'
    },
    root
  );
  if (!res.success) return { success: false, error: res.error };
  return {
    success: true,
    entryName: res.entry.name,
    artifactKind: res.entry.artifactKind
  };
}

/**
 * Publish a raw recipe directly (bypassing the template registry).
 */
export function publishRecipe(
  recipe: ToolRecipe,
  params: Record<string, any> = {},
  root: string = defaultSelfHostRoot()
): PublishResult {
  if (!recipe.selfHost) return { success: false, error: `Recipe "${recipe.id}" has no selfHost descriptor` };
  const mergedParams = { ...params };
  for (const p of recipe.params) {
    if (mergedParams[p.id] === undefined && p.default !== undefined) mergedParams[p.id] = p.default;
  }
  const composed = composeTool({ ...recipe, params: recipe.params.map((p) => ({ ...p, default: mergedParams[p.id] ?? p.default })) });
  const res = writeSelfHostedTool(
    {
      name: recipe.id,
      templateId: recipe.id,
      domain: recipe.domain,
      entrypointName: composed.entrypointName,
      params: mergedParams,
      sourceCode: composed.sourceCode,
      testSuiteCode: composed.testSuiteCode,
      summary: composed.summary,
      selfHost: recipe.selfHost,
      artifactKind: recipe.artifactKind ?? 'function'
    },
    root
  );
  if (!res.success) return { success: false, error: res.error };
  return { success: true, entryName: res.entry.name, artifactKind: res.entry.artifactKind };
}
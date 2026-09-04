/**
 * Template plugin registry — the single, additive way a component template
 * enters Recourse.
 *
 * A template plugin is pure metadata plus a `synthesizer` that turns param
 * values into real source + tests. Built-in templates ship pre-registered from
 * `componentTemplates.ts`; anyone (including the running app or a test) can add
 * more with `registerComponentTemplatePlugin(plugin)`. Templates that also
 * declare a `selfHost` descriptor can be written to disk as a real module and
 * called through the self-hosting runtime (see `selfHosting.ts`).
 */

import type {
  ComponentTemplate,
  ComponentTemplateParam,
  ComponentTemplateCategory,
  ToolDomain,
  ArtifactKind
} from '../types';

/** A JSON-callable method exposed by a self-hosted tool. */
export interface SelfHostMethod {
  /** Method name on the module's entrypoint class/instance. */
  method: string;
  /** Human-readable label for UIs. */
  label: string;
  /**
   * Optional per-argument coercion before the call. `'uint8'` maps a JSON
   * array of numbers onto a Uint8Array, which JSON cannot express natively.
   * An entry here only applies to the argument at the same index.
   */
  argCoercions?: Array<'uint8'>;
}

/** Declares how a template's output becomes a live, callable module. */
export interface SelfHostDescriptor {
  /** True when the module keeps a singleton instance across calls. */
  stateful: boolean;
  /**
   * Param ids (from `params`) passed to the constructor, in order. Ignored for
   * stateless descriptors whose methods are static.
   */
  ctorParamIds?: string[];
  /** Whitelist of callable methods. Unknown methods are rejected. */
  methods: SelfHostMethod[];
}

export interface ComponentSynthesizerResult {
  sourceCode: string;
  testSuiteCode: string;
  entrypointName: string;
  summary: string;
  selfHealingGuards: string[];
}

export type ComponentSynthesizer = (
  params: Record<string, any>,
  options?: { withSelfHealing?: boolean; componentName?: string }
) => ComponentSynthesizerResult;

export interface TemplatePlugin {
  id: string;
  name: string;
  domain: ToolDomain;
  category: ComponentTemplateCategory;
  description: string;
  params: ComponentTemplateParam[];
  defaultScore: number;
  benchmarkFlops: number;
  complexity: string;
  tags: string[];
  synthesizer: ComponentSynthesizer;
  /** Present => the template can self-host into the running app. */
  selfHost?: SelfHostDescriptor;
  /** Runtime transport for the self-hosted output (default 'function'). */
  artifactKind?: ArtifactKind;
}

/** Meta view of a template (never exposes the synthesizer function). */
export interface ComponentTemplateMeta extends ComponentTemplate {
  /** True when the template declares a selfHost descriptor. */
  selfHostable: boolean;
  /** Runtime transport of the self-hosted output, when self-hostable. */
  artifactKind?: 'function' | 'cli' | 'api' | 'mcp' | 'a2a' | 'loop';
}

const ID_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

/** Live registry. Built-ins are inserted at componentTemplates load time. */
export const COMPONENT_TEMPLATES: Record<string, TemplatePlugin> = {};

/**
 * Registers a template plugin. Duplicate ids and malformed plugins are
 * rejected loudly — the registry never silently overwrites a template.
 */
export function registerComponentTemplatePlugin(plugin: TemplatePlugin): void {
  if (!plugin || typeof plugin !== 'object') {
    throw new Error('Template plugin must be an object');
  }
  if (!plugin.id || typeof plugin.id !== 'string') {
    throw new Error('Template plugin requires a string "id"');
  }
  if (!ID_RE.test(plugin.id)) {
    throw new Error(`Invalid template id "${plugin.id}" — must match /^[a-zA-Z_][a-zA-Z0-9_-]*$/`);
  }
  if (typeof plugin.name !== 'string' || !plugin.name.trim()) {
    throw new Error(`Template "${plugin.id}" requires a "name"`);
  }
  if (typeof plugin.synthesizer !== 'function') {
    throw new Error(`Template "${plugin.id}" requires a "synthesizer" function`);
  }
  if (!Array.isArray(plugin.params)) {
    throw new Error(`Template "${plugin.id}" requires a "params" array`);
  }
  if (COMPONENT_TEMPLATES[plugin.id]) {
    throw new Error(`A template with id "${plugin.id}" is already registered`);
  }
  COMPONENT_TEMPLATES[plugin.id] = { ...plugin, params: plugin.params.map((p) => ({ ...p })) };
}

export function isTemplateRegistered(id: string): boolean {
  return Boolean(COMPONENT_TEMPLATES[id]);
}

export function countRegisteredTemplates(): number {
  return Object.keys(COMPONENT_TEMPLATES).length;
}

export function getComponentTemplate(id: string): TemplatePlugin | undefined {
  return COMPONENT_TEMPLATES[id];
}

export function listComponentTemplates(
  domain?: ToolDomain,
  category?: ComponentTemplateCategory | string
): ComponentTemplateMeta[] {
  let list = Object.values(COMPONENT_TEMPLATES);
  if (domain) list = list.filter((t) => t.domain === domain);
  if (category) list = list.filter((t) => t.category === category);
  return list.map(({ synthesizer, selfHost, ...meta }) => ({
    ...meta,
    selfHostable: Boolean(selfHost),
    artifactKind: selfHost ? (meta.artifactKind ?? 'function') : undefined
  }));
}

/**
 * Tool Factory types — the contracts for composing tools from primitives.
 *
 * A tool is never hand-written as a monolithic synthesizer. It is a recipe
 * over (template base + chunks + snippets + schema + params). The composer
 * turns a recipe into a real TemplatePlugin-compatible artifact.
 */

import type {
  ToolDomain,
  ComponentTemplateCategory,
  ComponentTemplateParam,
  ArtifactKind
} from '../../types';

export interface ChunkPlugin {
  id: string;
  language: 'ts' | 'js';
  /** Handlebars partial body (the code fragment). */
  body: string;
  /** Optional micro-test asserting the chunk behaves. */
  test?: string;
  /** Other chunk ids this chunk depends on. */
  deps?: string[];
  /** Provenance. */
  provenance?: { source: string; commit?: string };
}

export interface SnippetPlugin {
  id: string;
  language: 'ts' | 'js';
  /** A single verified function's source. */
  code: string;
  test?: string;
  provenance?: { source: string; commit?: string };
}

export interface ToolRecipe {
  id: string;
  name: string;
  domain: ToolDomain;
  category: ComponentTemplateCategory;
  description: string;
  /** Schema-driven params. */
  params: ComponentTemplateParam[];
  /** Chunk ids to splice (rendered as Handlebars partials). */
  chunks?: string[];
  /** Snippet ids to splice. */
  snippets?: string[];
  /** Optional parent template id to inherit from. */
  templateBase?: string;
  /** Artifact transports to publish over. */
  artifactKind?: ArtifactKind;
  selfHost?: {
    stateful: boolean;
    ctorParamIds?: string[];
    methods: Array<{ method: string; label: string; argCoercions?: Array<'uint8'> }>;
  };
  tags: string[];
  /** Sector pack id (optional) applied as context overrides. */
  sectorPack?: string;
  /** Size budget in LOC for the synthesised source. */
  sizeBudget?: number;
}

export interface SectorPack {
  id: string;
  /** Param default overrides keyed by param id. */
  paramDefaults?: Record<string, unknown>;
  /** Chunk ids forced into every tool in this sector. */
  forcedChunks?: string[];
  /** Tag additions. */
  tags?: string[];
}

export interface ComposedTool {
  id: string;
  name: string;
  sourceCode: string;
  testSuiteCode: string;
  entrypointName: string;
  summary: string;
  selfHealingGuards: string[];
  sizeLines: number;
  provenance: {
    recipeId: string;
    chunkIds: string[];
    snippetIds: string[];
    composerVersion: string;
    prettierVersion: string;
  };
}

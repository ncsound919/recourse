/**
 * Make a `MultiFileSpec` runnable by the EXISTING forge.
 *
 * The forge executes one self-contained source string in the sandbox. Rather
 * than rewrite the sandbox for multi-file modules, this bundles a spec's files
 * into a single program (flattening ESM import/export syntax) and renders the
 * forge prompt from the spec plan. That lets the current, already-honest forge
 * verify a multi-file tool with a one-line change at the call site.
 *
 * Scope is deliberately honest: `bundleModules` is a best-effort flatten for
 * expression/function modules (no name-collision handling, no advanced ESM). It
 * is not a general bundler; a spec that needs real module semantics should wait
 * for sandbox-level module support.
 */

import type { ForgeSpec } from './capabilityForge';
import { describeSpec, type MultiFileSpec } from './multiFileSpec';

export interface ModuleSource {
  rel: string;
  source: string;
}

const IMPORT_LINE_RE = /^\s*import\s.+\sfrom\s+['"].+['"];?\s*$/;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+['"].+['"];?\s*$/;
const EXPORT_LIST_RE = /^\s*export\s*\{[^}]*\}\s*(from\s+['"].+['"])?;?\s*$/;
const EXPORT_DEFAULT_RE = /^(\s*)export\s+default\s+/;
const EXPORT_RE = /^(\s*)export\s+/;

/** Flatten one module's ESM syntax into plain top-level statements. */
export function stripModuleSyntax(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !IMPORT_LINE_RE.test(line) && !SIDE_EFFECT_IMPORT_RE.test(line) && !EXPORT_LIST_RE.test(line))
    .map((line) => line.replace(EXPORT_DEFAULT_RE, '$1').replace(EXPORT_RE, '$1'))
    .join('\n')
    .trim();
}

/** Deterministically concatenate modules (manifest order) into one source string. */
export function bundleModules(modules: ModuleSource[]): string {
  return modules
    .map((m) => `// ---- ${m.rel} ----\n${stripModuleSyntax(m.source)}`)
    .join('\n\n');
}

export interface BundledForgeSpec extends ForgeSpec {
  /** Single-source program for the existing sandbox verifier. */
  bundledSource: string;
  /** Files in the spec whose source was not supplied (honest, empty = complete). */
  missing: string[];
}

/**
 * Build a forge-ready spec from a multi-file spec and the generated sources.
 * Missing sources are reported, never invented. Deterministic: same inputs give
 * byte-identical `prompt` and `bundledSource`.
 */
export function multiFileToForgeSpec(
  spec: MultiFileSpec,
  sources: Record<string, string>
): BundledForgeSpec {
  const modules: ModuleSource[] = spec.files.map((f) => ({ rel: f.rel, source: sources[f.rel] ?? '' }));
  const missing = modules.filter((m) => m.source.trim() === '').map((m) => m.rel);

  const prompt = [
    describeSpec(spec),
    '',
    '## Build',
    'Emit all files above as ONE self-contained program (no cross-file imports;',
    'the verifier executes a single flattened source).',
    missing.length ? `Missing sources: ${missing.join(', ')}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return {
    id: spec.id,
    name: spec.name,
    domain: spec.domain,
    title: spec.title,
    ...(spec.kind ? { kind: spec.kind } : {}),
    prompt,
    refSuite: spec.refSuite,
    bundledSource: bundleModules(modules),
    missing,
  };
}

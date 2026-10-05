/**
 * Make a `MultiFileSpec` runnable by the EXISTING forge.
 *
 * The forge executes one self-contained source string in the sandbox. Rather
 * than rewrite the sandbox for multi-file modules, this bundles a spec's files
 * into a single program (flattening ESM import/export syntax) and renders the
 * forge prompt from the spec plan. That lets the current, already-honest forge
 * verify a multi-file tool with a one-line change at the call site.
 *
 * Scope is deliberately honest: this is a best-effort flatten for
 * expression/function modules, not a general bundler. Flattening puts every
 * module's top-level declarations in one scope, so two modules that declare the
 * same name would silently shadow each other and the later `const` would throw
 * at runtime. `bundleModulesDetailed` therefore reports those collisions and
 * `multiFileToForgeSpec` surfaces them in `collisions`; a caller verifying
 * untrusted code must refuse a bundle that has any. It is never silently merged.
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

/** Top-level `function|class|const|let|var` declaration at column 0. */
const TOP_LEVEL_DECL_RE = /^(?:export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

/** Names a module declares at top level, in source order. */
export function topLevelNames(source: string): string[] {
  const out: string[] = [];
  const flattened = stripModuleSyntax(source);
  TOP_LEVEL_DECL_RE.lastIndex = 0;
  for (let m = TOP_LEVEL_DECL_RE.exec(flattened); m !== null; m = TOP_LEVEL_DECL_RE.exec(flattened)) {
    out.push(m[1]);
  }
  return [...new Set(out)];
}

export interface Collision {
  name: string;
  /** Every module that declares `name`, in manifest order. */
  modules: string[];
}

export interface BundleResult {
  /** The flattened program. Present even when collisions exist. */
  source: string;
  /** Names declared by more than one module. Empty is the only safe case. */
  collisions: Collision[];
}

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
function concatenate(modules: ModuleSource[]): string {
  return modules
    .map((m) => `// ---- ${m.rel} ----\n${stripModuleSyntax(m.source)}`)
    .join('\n\n');
}

/**
 * Flatten and report top-level name collisions across the flattened scope.
 * Deterministic: manifest order, names in source order.
 */
export function bundleModulesDetailed(modules: ModuleSource[]): BundleResult {
  const byName = new Map<string, string[]>();
  for (const m of modules) {
    for (const name of topLevelNames(m.source)) {
      const owners = byName.get(name) ?? [];
      owners.push(m.rel);
      byName.set(name, owners);
    }
  }
  const collisions: Collision[] = [...byName.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([name, owners]) => ({ name, modules: owners }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { source: concatenate(modules), collisions };
}

/**
 * Flatten to a single source string. Callers verifying untrusted code should use
 * `bundleModulesDetailed` and refuse on a non-empty `collisions` — this
 * convenience form cannot report them.
 */
export function bundleModules(modules: ModuleSource[]): string {
  return concatenate(modules);
}

export interface BundledForgeSpec extends ForgeSpec {
  /** Single-source program for the existing sandbox verifier. */
  bundledSource: string;
  /** Files in the spec whose source was not supplied (honest, empty = complete). */
  missing: string[];
  /** Top-level names declared by more than one file. Must be empty to verify. */
  collisions: Collision[];
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
  const bundle = bundleModulesDetailed(modules);

  const problems = [
    ...missing.map((rel) => `missing source: ${rel}`),
    ...bundle.collisions.map(
      (c) => `top-level name '${c.name}' declared by ${c.modules.join(', ')} — cannot be flattened`,
    ),
  ];
  const prompt = [
    describeSpec(spec),
    '',
    '## Build',
    'Emit all files above as ONE self-contained program (no cross-file imports;',
    'the verifier executes a single flattened source). Top-level names must be',
    'unique across the files — two files declaring the same name cannot be flattened.',
    problems.length ? `Unresolved: ${problems.join('; ')}` : '',
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
    bundledSource: bundle.source,
    missing,
    collisions: bundle.collisions,
  };
}

import type { ScienceLogResult } from './scienceLog.js';

/**
 * factory.ts — the deterministic SCAFFOLD lane: turn a compact intent into a
 * full-stack artifact set, not a micro-tool.
 *
 * WHY THIS EXISTS. The forge builds single exported functions (a micro-tool).
 * A software factory must also emit the boring, repeated, multi-file structure
 * — a React component with its CSS module and test, a typed fetch service, a
 * whole CRUD feature, a new project — and it must do that WITHOUT an LLM, so
 * the expensive generation budget is spent only on real logic. That engine
 * already exists in the ecosystem: Cheetah 4 (`@overlaygame/cheetah`), a
 * deterministic React/TS scaffolder (no LLM, no randomness, byte-identical for
 * the same spec). It is reachable through SIEVE's hardened facade
 * (`INFRASTRUCTURE/sieve/src/scaffold.mjs` → POST /scaffold); this module is the
 * Recourse-side contract for it — the taxonomy of what can be built, the
 * request builder, and the artifact summary.
 *
 * This module is PURE (no I/O): the route owns the HTTP call and the state.
 */

export type ScaffoldKind =
  | 'project' | 'component' | 'hook' | 'context' | 'page' | 'service'
  | 'feature' | 'batch' | 'doc';

export interface FactoryCapability {
  kind: ScaffoldKind;
  /** Cheetah subcommand this kind maps to. */
  command: string;
  /** What the engine produces, in human terms. */
  produces: string;
  /** Full-stack: does it emit more than a single file? */
  multiFile: boolean;
  description: string;
}

/**
 * The catalogue. `feature` is the highest-expansion full-stack primitive: one
 * intent ("a CRUD feature for Player with name/hp fields") becomes types +
 * service + form + list + tests.
 */
export const FACTORY_CAPABILITIES: readonly FactoryCapability[] = [
  { kind: 'project', command: 'new', multiFile: true, produces: 'a Vite + React + TS project', description: 'Scaffold a whole new project.' },
  { kind: 'component', command: 'component', multiFile: true, produces: 'component.tsx + css module + test', description: 'A React component with its styles and test.' },
  { kind: 'hook', command: 'hook', multiFile: true, produces: 'hook.ts + test', description: 'A custom hook with its test.' },
  { kind: 'context', command: 'context', multiFile: true, produces: 'provider + useXContext hook + test', description: 'A context provider and its consumer hook.' },
  { kind: 'page', command: 'page', multiFile: true, produces: 'page.tsx + css module + test', description: 'A page component.' },
  { kind: 'service', command: 'service', multiFile: true, produces: 'typed fetch service + test', description: 'A typed API service module.' },
  { kind: 'feature', command: 'feature', multiFile: true, produces: 'a full feature (types + service + form + list + tests)', description: 'The highest-expansion primitive: form | api | crud from one intent.' },
  { kind: 'batch', command: 'scaffold', multiFile: true, produces: 'many artifacts from one spec file', description: 'Generate types/components/hooks/pages/services from a spec.' },
  { kind: 'doc', command: 'plan', multiFile: false, produces: 'a deterministic development document (plan/design/prd/agents/env)', description: 'Method-pack documents, deterministic.' },
] as const;

export const FEATURE_RECIPES = ['form', 'api', 'crud'] as const;
export type FeatureRecipe = (typeof FEATURE_RECIPES)[number];

export const DOC_COMMANDS = ['plan', 'design', 'prd', 'agents', 'env'] as const;

export interface ScaffoldRequestInput {
  kind: ScaffoldKind;
  /** Artifact name (PascalCase-ish identifier); required except for `doc`/`batch`. */
  name?: string;
  /** For kind=feature: form | api | crud. */
  recipe?: FeatureRecipe;
  /** For kind=feature: "name:string, hp:number, admin:boolean?" */
  fields?: string;
  /** For kind=batch: path to the spec file (yaml/json). */
  spec?: string;
  /** For kind=batch: output directory. */
  out?: string;
  /** For kind=doc: which method pack. */
  docCommand?: (typeof DOC_COMMANDS)[number];
  /** Extra argv passed through verbatim. */
  args?: string[];
  /**
   * Opt-in: also render the development record as a .docx through the
   * LibreOffice MCP lane. Fail-open — an unwritable paper is reported as
   * unavailable in `FactoryArtifactRecord.scienceLog`, never faked.
   */
  scienceLog?: boolean;
}

export interface BuiltRequest {
  command: string;
  args: string[];
}

const NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$.-]*$/;
const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*:(string|number|boolean)\??$/;

/** Validate the Cheetah `--fields` dialect: "name:string, hp:number, admin:boolean?". */
export function parseFieldsDialect(fields: string | undefined): { ok: true; fields: string[] } | { ok: false; reason: string } {
  const raw = String(fields ?? '').trim();
  if (!raw) return { ok: false, reason: 'fields are required for a feature (e.g. "name:string, hp:number")' };
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, reason: 'fields must list at least one "name:type"' };
  for (const p of parts) {
    if (!FIELD_RE.test(p)) return { ok: false, reason: `invalid field "${p}" — expected name:string|number|boolean with optional ? (e.g. admin:boolean?)` };
  }
  return { ok: true, fields: parts };
}

/**
 * Build the Cheetah argv for a kind. Refusals name the reason — never a guess.
 * A name is validated as an identifier because Cheetah interpolates it into
 * file and symbol names.
 */
export function buildScaffoldRequest(input: ScaffoldRequestInput): { ok: true; request: BuiltRequest } | { ok: false; reason: string } {
  const cap = FACTORY_CAPABILITIES.find((c) => c.kind === input.kind);
  if (!cap) return { ok: false, reason: `unknown factory kind "${String(input.kind)}" — valid: ${FACTORY_CAPABILITIES.map((c) => c.kind).join(', ')}` };
  const extra = Array.isArray(input.args) ? input.args.filter((a) => typeof a === 'string') : [];

  const needName = input.kind !== 'batch' && input.kind !== 'doc';
  const name = String(input.name ?? '').trim();
  if (needName) {
    if (!name) return { ok: false, reason: `${input.kind} requires a name` };
    if (!NAME_RE.test(name)) return { ok: false, reason: `invalid name "${name}" — must be a valid identifier (letters, digits, _, $, ., -)` };
  }

  if (input.kind === 'feature') {
    const recipe = String(input.recipe ?? '').trim() as FeatureRecipe;
    if (!FEATURE_RECIPES.includes(recipe)) {
      return { ok: false, reason: `feature requires a recipe of ${FEATURE_RECIPES.join(' | ')}` };
    }
    const parsed = parseFieldsDialect(input.fields);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    return { ok: true, request: { command: 'feature', args: [recipe, name, '--fields', parsed.fields.join(', '), ...extra] } };
  }

  if (input.kind === 'batch') {
    const spec = String(input.spec ?? '').trim();
    if (!spec) return { ok: false, reason: 'batch requires a spec file path (yaml/json)' };
    return { ok: true, request: { command: 'scaffold', args: [spec, ...(input.out ? ['--out', String(input.out)] : []), ...extra] } };
  }

  if (input.kind === 'doc') {
    const doc = String(input.docCommand ?? '').trim();
    if (!DOC_COMMANDS.includes(doc as (typeof DOC_COMMANDS)[number])) {
      return { ok: false, reason: `doc requires docCommand of ${DOC_COMMANDS.join(' | ')}` };
    }
    return { ok: true, request: { command: doc, args: [...(name ? [name] : []), ...extra] } };
  }

  if (input.kind === 'project') {
    // `new <name> [dir]` — the directory is passed through `args` if supplied.
    return { ok: true, request: { command: 'new', args: [name, ...extra] } };
  }

  return { ok: true, request: { command: cap.command, args: [name, ...extra] } };
}

export interface FactoryArtifactRecord {
  id: string;
  at: number;
  kind: ScaffoldKind;
  command: string;
  args: string[];
  cwd: string;
  /** Files the engine reported creating. */
  files: string[];
  /** Engine exit + whether it reported ok. */
  engineOk: boolean;
  /** Verification verdict when requested. */
  verification: { ran: boolean; ok: boolean | null; method: string; detail?: string } | null;
  /** Provenance: who/what requested it (e.g. an idea id). */
  requestedBy?: string;
  hash?: string | null;
  /**
   * Science-paper logging result (opt-in via `scienceLog`). Absent when not
   * requested or when the paper could not be written. Present-but-unavailable is
   * meaningful: it records that the attempt happened and why it failed.
   */
  scienceLog?: ScienceLogResult;
}

/** A stable id for an artifact (no clock in the id so a re-run is recognisable). */
export function artifactId(kind: ScaffoldKind, command: string, nameOrSpec: string): string {
  const slug = String(nameOrSpec ?? '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 48);
  return `factory_${kind}_${command}_${slug}`;
}

/** Normalize the SIEVE /scaffold response into a record. Never invents fields. */
export function summarizeScaffoldResult(
  kind: ScaffoldKind,
  request: BuiltRequest,
  cwd: string,
  scaffoldResult: unknown,
  opts: { requestedBy?: string } = {},
): FactoryArtifactRecord {
  const r = (scaffoldResult ?? {}) as Record<string, unknown>;
  const files = Array.isArray(r.files) ? (r.files as unknown[]).map(String) : [];
  const engineOk = r.ok === true;
  const nameOrSpec = request.args[0] ?? '';
  return {
    id: artifactId(kind, request.command, nameOrSpec),
    at: Date.now(),
    kind,
    command: request.command,
    args: request.args,
    cwd,
    files,
    engineOk,
    verification: null,
    ...(opts.requestedBy ? { requestedBy: opts.requestedBy } : {}),
    hash: typeof r.hash === 'string' ? r.hash : null,
  };
}

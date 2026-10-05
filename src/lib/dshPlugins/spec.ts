/**
 * spec.ts — the declarative description of a DeepSeek Harness plugin bundle.
 *
 * This is the input the scaffolder consumes. It is deliberately a *description*
 * rather than a template with holes: everything the generator needs to write a
 * correct, buildable cordis bundle is named here, and nothing else is.
 *
 * Why a spec and not free-form source injection: a generated plugin that boots
 * inside the harness has the user's shell, their files, and their credentials.
 * Handing the caller arbitrary source text would make every forge output a
 * remote-code-execution surface with a `pnpm build` at the end of it. So the
 * spec can only declare *structure* — a name, a handful of route tools, a
 * base URL — and the generator owns every line of code that results. A caller
 * who wants a novel tool implements it as a Recourse self-hosted tool behind a
 * route, which is sandboxed and gated, rather than as injected source.
 *
 * The generated bundle's shape mirrors `dsh-recourse` exactly: zero runtime
 * dependencies, `import type` for every `@deepseek-ai/*` reference, structural
 * `ToolDefinition`s, and secrets named by environment variable rather than
 * inlined. See `template.ts` for the file-by-file contract.
 */

import { validateGrants } from '../wasmSandbox/grants';
import type { CapabilityGrants } from '../wasmSandbox/types';

/** Node-resolvable package name, and the name the profile's `link:`/`bundles` list uses. */
export const PACKAGE_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
/** Cordis plugin id: the `id` row in `cordis.patch.yml`. */
export const PLUGIN_ID_RE = /^[a-z][a-z0-9-]*$/;
/** DSH function-name contract: `[A-Za-z0-9_-]`, max 64 chars. */
export const TOOL_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * An environment variable NAME: uppercase, underscore-separated.
 *
 * Not pedantry. The name is spliced verbatim into generated TypeScript as a
 * single-quoted string literal *and* into a block comment. Without a charset
 * rule a value like `X' + (sideEffect()) + '` closes the literal and injects
 * arbitrary code into a file that is then compiled and loaded by the harness.
 * Constraining the shape makes that unrepresentable, rather than something the
 * emitter has to escape and hope it escapes correctly.
 */
export const ENV_VAR_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

/**
 * Collapse free text to a single, comment-safe line.
 *
 * Free text reaches generated source in three places: a block-comment header, a
 * README table, and a YAML scalar. A newline there either starts a fresh line
 * that reads as structure rather than prose, or folds a YAML scalar into
 * garbage; a comment terminator closes a block comment outright. Applied at the
 * validation boundary so no emitter has to remember.
 */
export function sanitizeFreeText(value: string, max = 400): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    // Insert a space rather than a backslash: the lexer only recognises the
    // exact two-character sequence, and `*\/` would then leak into the
    // generated package.json description where it is just noise.
    .replace(/\*\//g, '* /')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

/** One tool the model can call, bound to a Recourse route. */
export interface DshToolSpec {
  /** Model-facing function name, `[A-Za-z0-9_-]`, <= 64 chars. */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** HTTP method used to reach Recourse. */
  readonly method: 'GET' | 'POST';
  /** Recourse route path, e.g. `/api/recourse/status`. */
  readonly path: string;
  /**
   * Whether Recourse treats this route as a guarded mutation. Appends the
   * fail-closed secret warning to the description when no secret is configured.
   */
  readonly mutating?: boolean;
  /** Use the long timeout budget (forge/evolve class operations, minutes). */
  readonly long?: boolean;
  /** Query-string parameters, forwarded as-is after validation. */
  readonly query?: Readonly<Record<string, string>>;
}

/** One configured field the generated `cordis.patch.yml` row declares. */
export interface DshConfigEntry {
  /** Config key in the patch row. */
  readonly key: string;
  /** Rendered as a bare YAML scalar when it looks like a number or bool. */
  readonly value: string | number | boolean;
}

/** The full description of a bundle to generate. */
export interface DshPluginSpec {
  /** Cordis plugin id (the patch row's `id`). Lowercase alphanumerics. */
  readonly id: string;
  /** npm package name, e.g. `dsh-openhub`. */
  readonly packageName: string;
  readonly description: string;
  /** Semver. Defaults to 1.0.0. */
  readonly version?: string;
  readonly license?: string;
  readonly author?: string;
  /** Recourse origin the generated tools call. Defaults to this service's own. */
  readonly apiBaseUrl?: string;
  /**
   * Name of the environment variable holding Recourse's mutation secret.
   * The *name* is written into config; the value never is.
   */
  readonly apiSecretEnvVar?: string;
  /** Order slot for the generated system-prompt section. Defaults to 118. */
  readonly promptSectionOrder?: number;
  /** Contribute the model-facing usage section at all. Defaults to true. */
  readonly contributePrompt?: boolean;
  /** Extra rows appended to the generated patch row's `config` map. */
  readonly extraConfig?: readonly DshConfigEntry[];
  readonly tools: readonly DshToolSpec[];
  /**
   * Default-deny grants recorded in the signed manifest. These describe what the
   * generated bundle's *scaffold step* is permitted to touch on disk; the
   * runtime grants live in the patch row.
   */
  readonly capabilities?: CapabilityGrants;
}

export interface SpecValidation {
  readonly ok: boolean;
  readonly errors: string[];
  /** The spec with defaults applied. Only present when `ok`. */
  readonly spec?: NormalizedDshPluginSpec;
}

/** A {@link DshPluginSpec} with every default resolved. */
export interface NormalizedDshPluginSpec {
  readonly id: string;
  readonly packageName: string;
  readonly description: string;
  readonly version: string;
  readonly license: string;
  readonly author: string;
  readonly apiBaseUrl: string;
  readonly apiSecretEnvVar: string;
  readonly promptSectionOrder: number;
  readonly contributePrompt: boolean;
  readonly extraConfig: readonly DshConfigEntry[];
  readonly tools: readonly DshToolSpec[];
  readonly capabilities: CapabilityGrants;
}

/** Default Recourse origin: this very service. */
export function defaultApiBaseUrl(): string {
  const port = process.env.PORT?.trim() || '3050';
  const host = process.env.RECOURSE_HOST?.trim() || '127.0.0.1';
  return `http://${host}:${port}`;
}

/**
 * Validate a raw spec and resolve defaults.
 *
 * Fails closed on the two things that would produce a plugin that builds but does
 * not work: a package name the harness cannot resolve, and a tool name the model
 * cannot call. Everything else degrades to a default.
 */
export function validateDshPluginSpec(raw: unknown): SpecValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['spec must be an object'] };
  }
  const s = raw as Record<string, unknown>;

  const id = typeof s.id === 'string' ? s.id.trim() : '';
  if (!PLUGIN_ID_RE.test(id)) errors.push(`id must match ${PLUGIN_ID_RE} (got ${JSON.stringify(s.id)})`);

  const packageName = typeof s.packageName === 'string' ? s.packageName.trim() : '';
  if (!PACKAGE_NAME_RE.test(packageName)) {
    errors.push(`packageName must be a valid npm package name (got ${JSON.stringify(s.packageName)})`);
  } else if (packageName.includes('/')) {
    // A scoped name is a legal npm name but not a legal DIRECTORY name, and the
    // bundle directory is derived from it. Failing here names the real cause
    // instead of surfacing later as `invalid-name` from the resolver.
    errors.push('packageName must be unscoped: the bundle directory name is derived from it');
  }

  const description = typeof s.description === 'string' ? sanitizeFreeText(s.description) : '';
  if (!description) errors.push('description is required');

  const version = s.version === undefined ? '1.0.0' : String(s.version);
  if (!SEMVER_RE.test(version)) errors.push(`version must be semver (got ${JSON.stringify(s.version)})`);

  if (s.license !== undefined && typeof s.license !== 'string') errors.push('license must be a string');
  if (s.author !== undefined && typeof s.author !== 'string') errors.push('author must be a string');
  if (s.apiBaseUrl !== undefined) {
    if (typeof s.apiBaseUrl !== 'string') errors.push('apiBaseUrl must be a string');
    // Reaches a YAML scalar, where a newline folds the value into nonsense.
    else if (/[\r\n]/.test(s.apiBaseUrl)) errors.push('apiBaseUrl must not contain newlines');
  }
  if (s.apiSecretEnvVar !== undefined) {
    if (typeof s.apiSecretEnvVar !== 'string') {
      errors.push('apiSecretEnvVar must be a string');
    } else if (!ENV_VAR_NAME_RE.test(s.apiSecretEnvVar.trim())) {
      // Reaches generated TypeScript as a single-quoted literal and a block
      // comment. A loose charset here is arbitrary code execution.
      errors.push(
        `apiSecretEnvVar must be an environment variable NAME matching ${ENV_VAR_NAME_RE} (got ${JSON.stringify(s.apiSecretEnvVar)})`,
      );
    }
  }
  if (
    s.promptSectionOrder !== undefined &&
    !(typeof s.promptSectionOrder === 'number' && Number.isInteger(s.promptSectionOrder) && s.promptSectionOrder > 0)
  ) {
    errors.push('promptSectionOrder must be a positive integer');
  }
  if (s.contributePrompt !== undefined && typeof s.contributePrompt !== 'boolean') {
    errors.push('contributePrompt must be a boolean');
  }

  // Tools.
  const tools: DshToolSpec[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(s.tools)) {
    errors.push('tools must be an array');
  } else {
    if (s.tools.length === 0) errors.push('tools must declare at least one tool');
    s.tools.forEach((entry, i) => {
      const label = `tools[${i}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`${label} must be an object`);
        return;
      }
      const t = entry as Record<string, unknown>;
      const name = typeof t.name === 'string' ? t.name : '';
      if (!TOOL_NAME_RE.test(name)) {
        errors.push(`${label}.name must match ${TOOL_NAME_RE} (got ${JSON.stringify(t.name)})`);
      } else if (seen.has(name)) {
        errors.push(`${label}.name "${name}" is duplicated`);
      } else {
        seen.add(name);
      }
      if (typeof t.title !== 'string' || !t.title.trim()) errors.push(`${label}.title is required`);
      if (typeof t.description !== 'string' || !t.description.trim()) errors.push(`${label}.description is required`);
      if (t.method !== 'GET' && t.method !== 'POST') {
        errors.push(`${label}.method must be "GET" or "POST"`);
      }
      const p = typeof t.path === 'string' ? t.path : '';
      if (!p.startsWith('/')) errors.push(`${label}.path must start with "/"`);
      // A `|` would add a row to the generated README table, and a newline would
      // end the table cell. Both are silent corruption of a shipped file.
      else if (p.includes('..')) errors.push(`${label}.path must not contain traversal`);
      else if (/[\r\n|]/.test(p)) errors.push(`${label}.path must not contain newlines or "|"`);

      // Query values land inside `pathWith(base, { ... })` in the generated
      // catalog, typed `Record<string, string>`. A non-string compiles as a TS
      // error and `noEmitOnError` means the harness never gets a lib/ to load —
      // so it is checked here rather than discovered at build time.
      let query: Record<string, string> | undefined;
      if (t.query !== undefined) {
        if (typeof t.query !== 'object' || t.query === null || Array.isArray(t.query)) {
          errors.push(`${label}.query must be an object of string values`);
        } else {
          query = {};
          for (const [k, v] of Object.entries(t.query as Record<string, unknown>)) {
            if (typeof v !== 'string') {
              errors.push(`${label}.query.${k} must be a string (got ${typeof v})`);
              continue;
            }
            if (!/^[A-Za-z0-9_.-]+$/.test(k)) errors.push(`${label}.query key "${k}" must be an identifier`);
            query[k] = sanitizeFreeText(v, 200);
          }
        }
      }

      tools.push({
        name,
        title: typeof t.title === 'string' ? sanitizeFreeText(t.title, 120) : '',
        description: typeof t.description === 'string' ? sanitizeFreeText(t.description, 600) : '',
        method: (t.method === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST',
        path: p,
        ...(t.mutating === true ? { mutating: true } : {}),
        ...(t.long === true ? { long: true } : {}),
        ...(query ? { query } : {}),
      });
    });
  }

  // Capability grants run through the same default-deny validator the sandbox
  // uses, so a scaffold spec cannot declare broad host access by accident.
  let capabilities: CapabilityGrants = {};
  if (s.capabilities !== undefined) {
    const grants = validateGrants(s.capabilities);
    if ('errors' in grants) errors.push(...grants.errors.map((e) => `capabilities: ${e}`));
    else capabilities = grants.grants;
  }

  // extraConfig
  const extraConfig: DshConfigEntry[] = [];
  if (s.extraConfig !== undefined) {
    if (!Array.isArray(s.extraConfig)) errors.push('extraConfig must be an array');
    else {
      s.extraConfig.forEach((entry, i) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push(`extraConfig[${i}] must be an object`);
          return;
        }
        const e = entry as Record<string, unknown>;
        if (typeof e.key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key)) {
          errors.push(`extraConfig[${i}].key must be an identifier`);
          return;
        }
        const v = e.value;
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
          errors.push(`extraConfig[${i}].value must be a string, number or boolean`);
          return;
        }
        extraConfig.push({ key: e.key, value: v });
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    spec: {
      id,
      packageName,
      description,
      version,
      license: typeof s.license === 'string' ? s.license : 'MIT',
      author: typeof s.author === 'string' ? s.author : 'Recourse',
      apiBaseUrl: typeof s.apiBaseUrl === 'string' && s.apiBaseUrl.trim()
        ? s.apiBaseUrl.trim().replace(/\/+$/, '')
        : defaultApiBaseUrl(),
      apiSecretEnvVar: typeof s.apiSecretEnvVar === 'string' && s.apiSecretEnvVar.trim()
        ? s.apiSecretEnvVar.trim()
        : 'RECOURSE_API_SECRET',
      promptSectionOrder: typeof s.promptSectionOrder === 'number' ? s.promptSectionOrder : 118,
      contributePrompt: s.contributePrompt !== false,
      extraConfig,
      tools,
      capabilities,
    },
  };
}
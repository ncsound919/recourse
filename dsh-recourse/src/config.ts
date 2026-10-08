/**
 * Plugin configuration, normalized without a schemastery dependency.
 *
 * Why no `Config` schema export: this plugin deliberately ships ZERO runtime
 * dependencies (see README). Cordis hands `apply` whatever object the
 * `cordis.patch.yml` row declared, so we normalize it here instead of pulling a
 * validator in. The cost is that the harness config editor gets plain YAML
 * rather than a generated form; the benefit is that the plugin cannot break
 * because a hoisted peer package went missing.
 */

/** Fully-resolved configuration. Every field has a defaulted value. */
export interface RecoursePluginConfig {
  /** Recourse HTTP origin. No trailing slash. */
  readonly apiBaseUrl: string;
  /** Bearer secret for Recourse's guarded routes. Empty means "fail closed upstream". */
  readonly apiSecret: string;
  /** Cooperative timeout applied to every call that does not override it. */
  readonly defaultTimeoutMs: number;
  /** Cooperative timeout for the long-running forge / evolve calls. */
  readonly longTimeoutMs: number;
  /** Order slot for this plugin's system-prompt section. */
  readonly promptSectionOrder: number;
  /** Whether to contribute the model-facing usage section. */
  readonly contributePrompt: boolean;
  /** Whether to mount the authenticated web proxy used by the panel. */
  readonly mountWebProxy: boolean;
}

/** The raw, untrusted shape a `cordis.patch.yml` row can produce. */
type RawConfig = Record<string, unknown>;

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

/**
 * Read a secret from an environment variable.
 *
 * The plugin is deliberately NOT reading `RECOURSE_API_SECRET` implicitly. An
 * implicit read makes a silent capability change: the day someone exports it,
 * guarded tools start mutating without anyone editing config. The default is
 * the empty string, which is the honest fail-closed position -- Recourse then
 * answers 503 and the tool reports that.
 */
function secretFromEnv(envVar: string): string {
  const raw = process.env[envVar];
  return typeof raw === 'string' ? raw.trim() : '';
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3050';

/** Normalize an untrusted patch-row config into {@link RecoursePluginConfig}. */
export function normalizeConfig(raw: unknown): RecoursePluginConfig {
  const input: RawConfig = typeof raw === 'object' && raw !== null ? (raw as RawConfig) : {};
  const baseUrl = str(input.apiBaseUrl, DEFAULT_BASE_URL).replace(/\/+$/, '');
  const secretVar = str(input.apiSecretEnvVar, 'RECOURSE_API_SECRET');

  return {
    apiBaseUrl: baseUrl,
    apiSecret: str(input.apiSecret, secretFromEnv(secretVar)),
    defaultTimeoutMs: positiveInt(input.defaultTimeoutMs, 15_000),
    longTimeoutMs: positiveInt(input.longTimeoutMs, 600_000),
    promptSectionOrder: positiveInt(input.promptSectionOrder, 117),
    contributePrompt: bool(input.contributePrompt, true),
    mountWebProxy: bool(input.mountWebProxy, true),
  };
}
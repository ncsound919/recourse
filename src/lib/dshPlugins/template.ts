/**
 * template.ts — renders a validated {@link NormalizedDshPluginSpec} into the
 * complete file set of a DSH cordis bundle.
 *
 * Pure: takes a spec, returns `Map<relativePath, contents>`. Nothing here
 * touches the filesystem, which is what lets `scaffold.ts` own policy (where to
 * write, whether to overwrite) and lets the tests assert on rendered bytes with
 * no temp directory at all.
 *
 * ## The contract the generated bundle honours
 *
 * These are not stylistic preferences. Each one is a failure this generator has
 * to avoid, and each is inherited from `dsh-recourse`, which learned them on a
 * real profile:
 *
 * 1. **Zero runtime dependencies.** Every `@deepseek-ai/*` reference is
 *    `import type`, which TypeScript erases. A runtime import resolves against
 *    the *host's* `node_modules`, which on a linked profile can be a dangling
 *    junction — the bundle then fails to load at boot with an error that points
 *    at the harness rather than at this package.
 * 2. **`apply` requires nothing and injects everything.** `apply` runs *before*
 *    the web app provides `tools` or `systemPrompt`. A plugin that probes for
 *    them there sees nothing and silently does nothing. So `inject` is empty and
 *    each feature attaches through `ctx.inject`.
 * 3. **Structural `ToolDefinition`s, not the host's `defineTool`.** `defineTool`
 *    is a runtime import, which rule 1 forbids. The cost is that argument
 *    validation becomes ours, which is what `params.ts` exists to pay.
 * 4. **Secrets are named, never inlined.** `apiSecretEnvVar` in the patch row is
 *    a variable *name*. Nothing this generator writes contains a credential.
 * 5. **`tsc` before boot.** A profile links the package by path, so `lib/` is
 *    generated locally and gitignored. Without a build step the harness fails to
 *    load with a missing `lib/index.js`.
 */

import { L, apiModule, fill, paramsModule, specModule } from './templates/runtime';
import type { DshToolSpec, NormalizedDshPluginSpec } from './spec';

/**
 * DSH client packages a generated bundle declares as devDependencies. They are
 * needed for `import type` to resolve under `tsc` and are never imported at
 * runtime. Pinned to the same 0.2.0-rc.2 line `dsh-recourse` targets.
 */
const DSH_CLIENT_DEPS: readonly string[] = [
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-ui-commands',
  '@deepseek-ai/dsh-host-webserver',
];

const DSH_CLIENT_VERSION = '0.2.0-rc.2';

/**
 * Single-quoted YAML, doubling any embedded quote.
 *
 * Single quotes are used throughout because Windows drive letters contain
 * backslashes, which double-quoted YAML treats as escape characters — `'C:\x'`
 * survives, `"C:\x"` does not.
 */
function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Render a scalar the way YAML wants it: bare for primitives, quoted otherwise. */
function yamlScalar(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return yamlQuote(value);
}

/**
 * The path expression for one tool.
 *
 * A tool with fixed query parameters compiles to `pathWith(base, {...})`; the
 * rest are plain string literals. Keys and values are emitted through
 * `JSON.stringify`, which is also valid YAML flow-scalar syntax for these
 * cases, so a value containing a colon or a space cannot break the file.
 */
function pathExpression(tool: DshToolSpec): string {
  const entries = Object.entries(tool.query ?? {});
  if (entries.length === 0) return JSON.stringify(tool.path);
  const pairs = entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ');
  return `pathWith(${JSON.stringify(tool.path)}, { ${pairs} })`;
}

function renderCatalog(spec: NormalizedDshPluginSpec): string {
  const entries = spec.tools.map((t) => {
    const lines = [
      '  {',
      `    name: ${JSON.stringify(t.name)},`,
      `    title: ${JSON.stringify(t.title)},`,
      `    description: ${JSON.stringify(t.description)},`,
      `    kind: ${JSON.stringify(t.method === 'POST' ? 'execute' : 'fetch')},`,
      `    method: ${JSON.stringify(t.method)},`,
      `    path: ${pathExpression(t)},`,
      '    project: passthrough,',
    ];
    if (t.mutating) lines.push('    mutating: true,');
    if (t.long) lines.push('    long: true,');
    lines.push('  },');
    return lines.join('\n');
  });

  return [
    '/**',
    ' * The complete tool catalog: one declarative entry per Recourse route this',
    ' * bundle exposes.',
    ' *',
    ' * Adding a tool is a row here, not new code. `defineTool` turns every entry into',
    ' * a `ToolDefinition` with the same validation, cancellation and presentation',
    ' * contract.',
    ' */',
    '',
    "import { passthrough, pathWith, type ToolSpec } from './spec.js';",
    '',
    `/** Tool names the model sees. Order here is order in the usage section. */`,
    `export const TOOL_NAMES: readonly string[] = [${spec.tools.map((t) => JSON.stringify(t.name)).join(', ')}];`,
    '',
    'export const TOOL_SPECS: readonly ToolSpec[] = [',
    entries.join('\n'),
    '];',
    '',
  ].join('\n');
}

function renderConfigModule(spec: NormalizedDshPluginSpec): string {
  return [
    '/**',
    ' * Plugin configuration, normalized without a schema dependency.',
    ' *',
    ' * Why no exported schema: this bundle ships ZERO runtime dependencies (see',
    ' * README). Cordis hands `apply` whatever object the `cordis.patch.yml` row',
    ' * declared, so we normalize it here instead of pulling a validator in.',
    ' *',
    ` * Note what is *not* read implicitly: ${spec.apiSecretEnvVar}. An implicit read makes a`,
    ' * silent capability change — the day someone exports it, guarded tools start',
    ' * mutating without anyone editing config. The default is the empty string, which',
    ' * is the honest fail-closed position.',
    ' */',
    '',
    '/** Fully-resolved configuration. Every field has a defaulted value. */',
    'export interface PluginConfig {',
    '  /** Recourse HTTP origin. No trailing slash. */',
    '  readonly apiBaseUrl: string;',
    '  /** Bearer secret for Recourse\'s guarded routes. Empty means fail closed upstream. */',
    '  readonly apiSecret: string;',
    '  /** Cooperative timeout applied to every call that does not override it. */',
    '  readonly defaultTimeoutMs: number;',
    '  /** Cooperative timeout for the long-running calls. */',
    '  readonly longTimeoutMs: number;',
    '  /** Order slot for this bundle\'s system-prompt section. */',
    '  readonly promptSectionOrder: number;',
    '  /** Whether to contribute the model-facing usage section. */',
    '  readonly contributePrompt: boolean;',
    '}',
    '',
    'type RawConfig = Record<string, unknown>;',
    '',
    'function str(value: unknown, fallback: string): string {',
    '  return typeof value === \'string\' && value.length > 0 ? value : fallback;',
    '}',
    '',
    'function bool(value: unknown, fallback: boolean): boolean {',
    '  return typeof value === \'boolean\' ? value : fallback;',
    '}',
    '',
    'function positiveInt(value: unknown, fallback: number): number {',
    '  return typeof value === \'number\' && Number.isFinite(value) && value > 0',
    '    ? Math.floor(value)',
    '    : fallback;',
    '}',
    '',
    '/** Read a secret from a named environment variable. Empty when unset. */',
    'function secretFromEnv(envVar: string): string {',
    '  const raw = process.env[envVar];',
    '  return typeof raw === \'string\' ? raw.trim() : \'\';',
    '}',
    '',
    `const DEFAULT_BASE_URL = ${JSON.stringify(spec.apiBaseUrl)};`,
    '',
    '/** Normalize an untrusted patch-row config into {@link PluginConfig}. */',
    'export function normalizeConfig(raw: unknown): PluginConfig {',
    '  const input: RawConfig = typeof raw === \'object\' && raw !== null ? (raw as RawConfig) : {};',
    '  const baseUrl = str(input.apiBaseUrl, DEFAULT_BASE_URL).replace(/\\/+$/, \'\');',
    `  const secretVar = str(input.apiSecretEnvVar, ${JSON.stringify(spec.apiSecretEnvVar)});`,
    '',
    '  return {',
    '    apiBaseUrl: baseUrl,',
    '    apiSecret: str(input.apiSecret, secretFromEnv(secretVar)),',
    '    defaultTimeoutMs: positiveInt(input.defaultTimeoutMs, 15000),',
    '    longTimeoutMs: positiveInt(input.longTimeoutMs, 600000),',
    `    promptSectionOrder: positiveInt(input.promptSectionOrder, ${spec.promptSectionOrder}),`,
    `    contributePrompt: bool(input.contributePrompt, ${spec.contributePrompt}),`,
    '  };',
    '}',
    '',
  ].join('\n');
}

function renderPromptModule(spec: NormalizedDshPluginSpec): string {
  // JSON.stringify per entry, not interpolation: a tool title is operator-supplied
  // text and may contain a quote, a backtick, or a `${`.
  const bullets = spec.tools
    .map((t) => `  ${JSON.stringify(`\`${t.name}\` — ${t.title}.`)},`)
    .join('\n');

  return [
    '/**',
    ' * The model-facing usage section.',
    ' *',
    ' * Without an explicit protocol the model treats these as one more set of',
    ' * functions to call opportunistically. This section is written as policy: what',
    ' * to do, in what order, and which results are allowed to be believed.',
    ' */',
    '',
    "import type { PluginConfig } from './config.js';",
    '',
    '/**',
    ' * Build the usage text.',
    ' *',
    ' * `toolNames` is a getter rather than an array because the set of registered',
    ' * tools changes: `tools` may attach after `systemPrompt`, and a teardown',
    ' * removes them again. Snapshotting at effect time would have the section',
    ' * advertise tools the harness does not have.',
    ' */',
    'export function buildUsageSection(',
    '  toolNames: () => readonly string[],',
    '  config: PluginConfig,',
    '): () => string {',
    '  const mutationStatus =',
    '    config.apiSecret.length > 0',
    "      ? 'This harness carries {{SECRET_ENV_VAR}}, so the mutating tools can authenticate.'",
    "      : 'This harness has no {{SECRET_ENV_VAR}}, so the mutating tools will fail closed with an explicit error until it is set. Read tools still work.';",
    '',
    '  // Only claim a tool exists when the host actually registered it. A section',
    '  // naming an unregistered tool teaches the model to call into the void.',
    '  // Read inside the thunk so a registration that lands after this effect, or a',
    '  // teardown that lands before the next turn, is reflected.',
    '  const declared = (): string => {',
    '    const live = toolNames();',
    '    return live.length > 0',
    "      ? live.map((n) => '- ' + BACKTICK + n + BACKTICK).join('\\n')",
    "      : '(no tools were registered on this host)';",
    '  };',
    '',
    '  return () =>',
    '    [',
    "      '## {{PLUGIN_ID}} — Recourse-backed capabilities',",
    "      '',",
    '      DESCRIPTION,',
    "      '',",
    "      '### Available tools',",
    "      '',",
    '      declared(),',
    "      '',",
    "      '### The loop',",
    "      '',",
    "      '1. **Orient.** Read status before acting; never propose a change blind.',",
    "      '2. **Act.** Call the tool matching the question. Every route answers from the',",
    "      '   live Recourse service rather than from a cache you are maintaining.',",
    "      '3. **Gate.** Mutating tools succeed only when this harness holds',",
    "      '   {{SECRET_ENV_VAR}}. Surface pending state and let the human decide.',",
    "      '4. **Report honestly.** If Recourse is unreachable or its guarded routes are',",
    "      '   closed, say exactly that. Do not simulate an outcome, and do not retry the',",
    "      '   same mutation hoping a different answer appears.',",
    "      '',",
    "      '### What you may believe',",
    "      '',",
    "      '- A result is evidence only if the tool actually returned it.',",
    "      '- Never claim a capability works because a proposal was made.',",
    "      '- A failed-closed call is a fact about this harness, not about the work.',",
    "      '',",
    "      '### Current wiring',",
    "      '',",
    '      mutationStatus,',
    "    ].join('\\n');",
    '}',
    '',
    '/** One-line summary of what this bundle is for, shown in the section body. */',
    `const DESCRIPTION = ${JSON.stringify(spec.description)};`,
    '',
    '/** Backtick as a value, so the tool list needs no nested quoting. */',
    'const BACKTICK = ' + JSON.stringify('`') + ';',
    '',
    '/** Tool documentation, kept beside the code so a rename cannot orphan it. */',
    `export const TOOL_DOCS: readonly string[] = [\n${bullets}\n];`,
    '',
  ].join('\n').replace(/\{\{PLUGIN_ID\}\}/g, spec.id)
    .replace(/\{\{SECRET_ENV_VAR\}\}/g, spec.apiSecretEnvVar);
}

function renderIndexModule(spec: NormalizedDshPluginSpec): string {
  return fill(
    L`
/**
 * {{PACKAGE_NAME}} — generated by Recourse.
 *
 * {{DESCRIPTION}}
 *
 * ## Scheduling
 *
 * \`apply\` hard-requires nothing and registers nothing itself. Each feature is
 * wired through \`ctx.inject\`, which fires when that feature's service appears:
 *
 * | feature | waits for      |
 * |---------|----------------|
 * | tools   | \`tools\`        |
 * | prompt  | \`systemPrompt\` |
 *
 * That matters because \`apply\` runs BEFORE the web app has provided those
 * services. A plugin that probes for them at that moment sees nothing and
 * silently does nothing.
 *
 * ## Dependencies
 *
 * Deliberately zero runtime dependencies: every \`@deepseek-ai/*\` reference is
 * \`import type\`, which TypeScript erases. That keeps the bundle working
 * regardless of the state of the host's own \`node_modules\`.
 */

import type { Context } from '@deepseek-ai/cordis';
// Type-only: pulls in the \`Context\` service augmentation for \`systemPrompt\`.
import type {} from '@deepseek-ai/dsh-system-prompt';

import { RecourseApi } from './api.js';
import { TOOL_SPECS } from './catalog.js';
import { normalizeConfig } from './config.js';
import { buildUsageSection } from './prompt.js';
import { defineTool } from './spec.js';

export const name = {{PLUGIN_ID_JSON}};

/**
 * No hard service requirements.
 *
 * Every dependency this bundle has is optional and is resolved with
 * \`ctx.inject\` below. Listing one here would make the whole entry wait for it,
 * and then fail the profile layer on a host that lacks it.
 */
export const inject: string[] = [];

/** Plugin entry point. Returns immediately; features attach as services appear. */
export function apply(ctx: Context, config?: unknown): void {
  const cfg = normalizeConfig(config);

  const api = new RecourseApi({
    baseUrl: cfg.apiBaseUrl,
    secret: cfg.apiSecret,
    defaultTimeoutMs: cfg.defaultTimeoutMs,
  });

  const tools = TOOL_SPECS.map((spec) =>
    defineTool(api, { ...spec, needsSecret: spec.mutating === true }, cfg.longTimeoutMs),
  );

  // The prompt section reports only what actually registered. It cannot read the
  // built list directly: \`tools\` may never appear on this host, and a section
  // claiming tools that do not exist teaches the model to call into the void.
  // The section is a thunk re-read on every prompt assembly, so registration
  // order relative to \`systemPrompt\` does not matter.
  const registered = new Set<string>();

  ctx.logger.info(
    \`[{{PACKAGE_NAME}}] upstream \${cfg.apiBaseUrl}; secret \${
      api.hasSecret ? 'present' : 'ABSENT - guarded routes will fail closed'
    }; \${tools.length} tool(s) pending service injection\`,
  );

  // ---- tools -----------------------------------------------------------
  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.effect(() => {
      const disposers: Array<() => void> = [];
      for (const tool of tools) {
        try {
          disposers.push(toolCtx.tools.register(tool));
          registered.add(tool.name);
        } catch (error) {
          // A name collision with another bundle costs this one tool, not the
          // layer. Most likely cause is a stale bridge still registering the old
          // \`mcp__*__*\` names alongside ours.
          toolCtx.logger.warn(
            \`[{{PACKAGE_NAME}}] could not register \${tool.name}: \${
              error instanceof Error ? error.message : String(error)
            }\`,
          );
        }
      }
      return () => {
        for (const dispose of disposers.reverse()) {
          try {
            dispose();
          } catch {
            /* one failing disposer must not block the rest */
          }
        }
        // Registration is scoped to the effect; a teardown must not leave the
        // section advertising tools the harness no longer has.
        registered.clear();
      };
    }, '{{PACKAGE_NAME}}: tools');
  });

  // ---- model-facing usage policy ---------------------------------------
  if (!cfg.contributePrompt) return;
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.effect(
      () =>
        promptCtx.systemPrompt.section({
          name: '{{PLUGIN_ID}}:usage',
          order: cfg.promptSectionOrder,
          text: buildUsageSection(
            () => [...registered],
            cfg,
          ),
        }),
      '{{PACKAGE_NAME}}: prompt',
    );
  });
}
`,
    {
      PACKAGE_NAME: spec.packageName,
      DESCRIPTION: spec.description,
      PLUGIN_ID: spec.id,
      PLUGIN_ID_JSON: JSON.stringify(spec.id),
    },
  );
}

function renderPackageJson(spec: NormalizedDshPluginSpec): string {
  const devDeps: Record<string, string> = {
    '@deepseek-ai/cordis': '~4.0.4',
    '@deepseek-ai/dsh-llm': DSH_CLIENT_VERSION,
    '@deepseek-ai/dsh-system-prompt': DSH_CLIENT_VERSION,
    '@deepseek-ai/dsh-tools': DSH_CLIENT_VERSION,
    '@types/node': '^24.19.0',
    typescript: '~5.9.3',
  };
  for (const dep of DSH_CLIENT_DEPS) devDeps[dep] = DSH_CLIENT_VERSION;

  const pkg = {
    name: spec.packageName,
    version: spec.version,
    description: spec.description,
    type: 'module',
    main: 'lib/index.js',
    types: 'lib/index.d.ts',
    exports: {
      '.': { types: './lib/index.d.ts', default: './lib/index.js' },
      './package.json': './package.json',
    },
    files: ['lib', 'cordis.patch.yml', 'README.md'],
    license: spec.license,
    author: spec.author,
    engines: { node: '^22.19.0 || >=24' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    scripts: {
      build: 'tsc -p tsconfig.json',
      clean: 'node -e "require(\'node:fs\').rmSync(\'lib\',{recursive:true,force:true})"',
      typecheck: 'tsc -p tsconfig.json --noEmit',
      verify: 'pnpm run typecheck && pnpm run build',
    },
    peerDependencies: { '@deepseek-ai/cordis': '>=4.0.0' },
    peerDependenciesMeta: { '@deepseek-ai/cordis': { optional: true } },
    devDependencies: devDeps,
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

function renderTsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          lib: ['ES2023'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          rootDir: 'src',
          outDir: 'lib',
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          strict: true,
          noImplicitOverride: true,
          noFallthroughCasesInSwitch: true,
          noEmitOnError: true,
          skipLibCheck: true,
          isolatedModules: true,
          verbatimModuleSyntax: true,
          forceConsistentCasingInFileNames: true,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ) + '\n'
  );
}

function renderCordisPatch(spec: NormalizedDshPluginSpec): string {
  const lines = [
    `# ${spec.packageName} bundle patch.`,
    '#',
    '# Mounts this bundle into the host composition. Cordis applies this after every',
    '# bundle layer, so the row below is what the host actually instantiates.',
    '#',
    '# Config note: `apiSecretEnvVar` names an environment variable rather than the',
    '# secret itself, so the value never lands in this file.',
    '- insert:',
    `    - id: ${spec.id}`,
    '      # Node-resolvable package name - must stay in sync with package.json `name`.',
    `      name: ${spec.packageName}`,
    '      config:',
    `        apiBaseUrl: !!js process.env.RECOURSE_API_URL || ${yamlQuote(spec.apiBaseUrl)}`,
    `        apiSecretEnvVar: ${yamlQuote(spec.apiSecretEnvVar)}`,
    '        defaultTimeoutMs: 15000',
    '        # Forge-class operations run a real model plus a real sandbox; they need',
    "        # minutes, not seconds. This is what a stdio bridge's blanket timeout",
    '        # cannot express.',
    '        longTimeoutMs: 600000',
    `        promptSectionOrder: ${spec.promptSectionOrder}`,
    `        contributePrompt: ${spec.contributePrompt}`,
  ];
  for (const entry of spec.extraConfig) {
    lines.push(`        ${entry.key}: ${yamlScalar(entry.value)}`);
  }
  return lines.join('\n') + '\n';
}

function renderReadme(spec: NormalizedDshPluginSpec): string {
  const rows = spec.tools
    .map((t) => `| \`${t.name}\` | ${t.method} | \`${t.path}\` | ${t.title} |`)
    .join('\n');

  return [
    `# ${spec.packageName}`,
    '',
    spec.description,
    '',
    'Generated by Recourse from a declarative plugin spec. Everything here is',
    'regeneratable: change the spec, re-run the scaffolder, and the diff is the change.',
    '',
    '## What it does',
    '',
    '| Piece | Purpose |',
    '| --- | --- |',
    '| `src/index.ts` | Cordis entry point: registers tools when `tools` appears. |',
    '| `src/catalog.ts` | One declarative row per tool. Adding a tool is a row. |',
    '| `src/spec.ts` | Turns a catalog row into a structural `ToolDefinition`. |',
    '| `src/params.ts` | Model-facing JSON Schema + argument validation. |',
    '| `src/api.ts` | HTTP client. Forwards cancellation; reports failures verbatim. |',
    '| `src/config.ts` | Normalizes the `cordis.patch.yml` row. |',
    '| `src/prompt.ts` | The model-facing usage section. |',
    '| `cordis.patch.yml` | How this bundle mounts into the host composition. |',
    '',
    '## Tool surface',
    '',
    '| Tool | Method | Route | Purpose |',
    '| --- | --- | --- | --- |',
    rows,
    '',
    '## Why zero runtime dependencies',
    '',
    'Every `@deepseek-ai/*` reference is `import type`, which TypeScript erases. A',
    'runtime import resolves against the *host* `node_modules`, which on a linked',
    'profile can be a dangling junction — the bundle then fails to load at boot with',
    'an error that points at the harness rather than at this package.',
    '',
    'The cost is that argument validation is ours rather than the host\'s, which is',
    'what `params.ts` exists to pay.',
    '',
    '## Why `apply` injects instead of requiring',
    '',
    '`apply` runs BEFORE the web app has provided `tools` or `systemPrompt`. A plugin',
    'that probes for them at that moment sees nothing and silently does nothing.',
    '`inject` is therefore empty and each feature attaches through `ctx.inject`, which',
    'fires when the service appears.',
    '',
    '## Secrets',
    '',
    `\`cordis.patch.yml\` configures the bundle with \`apiSecretEnvVar:`,
    `'${spec.apiSecretEnvVar}'\` — the **name** of an environment variable, never the`,
    'value. Nothing in this repository contains a credential, and nothing should.',
    '',
    "Recourse's guarded mutation routes fail closed: with the variable unset they",
    'return `503`, with the wrong value `401`. If every mutating call fails with a',
    'bare `503` and nothing in the harness log, that variable did not reach the',
    'process.',
    '',
    '## Install',
    '',
    '```bash',
    'pnpm install',
    'pnpm build        # REQUIRED: lib/ is generated, and the profile links to it',
    'pnpm verify',
    '```',
    '',
    'Then add the bundle to the harness profile:',
    '',
    '```jsonc',
    '// <dsh profile>/package.json',
    '{',
    `  "dependencies": { ${JSON.stringify(spec.packageName)}: "link:/absolute/path/to/${spec.packageName}" },`,
    `  "dsh": { "profile": { "bundles": ["${spec.packageName}"] } }`,
    '}',
    '```',
    '',
    'Both halves matter. A dependency without a `bundles` entry installs a plugin that',
    'is never loaded; a `bundles` entry without a dependency is a boot that cannot',
    'resolve the package.',
    '',
    '## License',
    '',
    spec.license,
    '',
  ].join('\n');
}

const GITIGNORE = ['node_modules/', 'lib/', '*.tsbuildinfo', ''].join('\n');

function renderManifestBase(spec: NormalizedDshPluginSpec): Record<string, unknown> {
  return {
    id: spec.id,
    name: spec.packageName,
    version: spec.version,
    author: spec.author,
    license: spec.license,
    description: spec.description,
    entry: 'src/index.ts',
    capabilities: spec.capabilities,
  };
}

/**
 * Render every file of the bundle.
 *
 * Returned as a Map keyed by package-relative path so the caller chooses the root.
 * Keys use forward slashes on every platform because they are archive paths, not
 * filesystem paths.
 */
export function renderDshBundle(spec: NormalizedDshPluginSpec): Map<string, string> {
  const files = new Map<string, string>();
  files.set('package.json', renderPackageJson(spec));
  files.set('tsconfig.json', renderTsconfig());
  files.set('cordis.patch.yml', renderCordisPatch(spec));
  files.set('.gitignore', GITIGNORE);
  files.set('README.md', renderReadme(spec));
  files.set('plugin.manifest.json', JSON.stringify(renderManifestBase(spec), null, 2) + '\n');
  files.set('src/index.ts', renderIndexModule(spec));
  files.set('src/catalog.ts', renderCatalog(spec));
  files.set('src/spec.ts', specModule(spec.apiSecretEnvVar));
  files.set('src/params.ts', paramsModule);
  files.set('src/api.ts', apiModule(spec.apiSecretEnvVar));
  files.set('src/config.ts', renderConfigModule(spec));
  files.set('src/prompt.ts', renderPromptModule(spec));
  return files;
}
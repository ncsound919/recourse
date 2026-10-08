# dsh-recourse

Recourse as the recursive self-improvement centerpiece for the
[DeepSeek Harness](https://github.com/deepseek-ai) (DSH): native in-harness
tools, a Mission Control panel, and the **forge → gate → install → learn**
feedback loop.

This package is a DSH plugin. It is not the Recourse service itself — it is the
adapter that mounts Recourse into the harness, replacing the older
`mcp-recourse` stdio bridge.

---

## What it does

| Piece | Purpose |
| --- | --- |
| `src/tools.ts` | Registers the `recourse_*` native tools the model can call directly. |
| `src/prompt.ts` | Contributes one model-facing usage section (order `117`) so the model knows these tools exist. |
| `src/web-routes.ts` | Mounts an authenticated web proxy the in-harness panel reads from. |
| `src/client/MissionControl.tsx` | The in-harness panel (served through the client's UI slots). |
| `src/client` build | The panel bundle, built by esbuild via `scripts/build-client.mjs`. |

The loop it closes: the harness **forges** a capability through Recourse, Recourse
**gates** it in a real sandbox, the harness **installs** it as a tool, and the
recursive learner **learns** from the episode that followed.

## Why the native plugin instead of the MCP bridge

The stdio bridge imposed a blanket ~30s timeout. Forge and evolve runs a real
model plus a real sandbox and needs *minutes*. The plugin carries two budgets
instead: `defaultTimeoutMs: 15000` for ordinary reads and
`longTimeoutMs: 600000` for the long operations. It also removes a process
hop, so tool errors surface with their real detail rather than a bridge
timeout.

## Requirements

- Node `^22.19.0 || >=24`
- A running Recourse service (default `http://127.0.0.1:3050`)
- `RECOURSE_API_SECRET` exported into the harness process (see below)

## Install

```bash
pnpm install
pnpm build        # REQUIRED: lib/ is generated, and the profile links to it
pnpm verify       # typecheck + build + test + BOM audit
```

Then add it to the harness profile (see `harness-overlay/`):

```jsonc
// <dsh profile>/package.json
{
  "dependencies": { "dsh-recourse": "link:/absolute/path/to/dsh-recourse" },
  "dsh": { "profile": { "bundles": [ /* ... */, "dsh-recourse" ] } }
}
```

The plugin mounts itself via `cordis.patch.yml`, which replaces the profile's
`mcp-recourse` row. Rollback is removing the `dsh-recourse` bundle entry and
restoring the `mcp-recourse` row.

## Secrets

`cordis.patch.yml` configures the plugin with `apiSecretEnvVar:
'RECOURSE_API_SECRET'` — the **name** of an environment variable, never the
value. Nothing in this repository contains a credential, and nothing should.

Recourse's guarded mutation routes fail closed: with the variable unset they
return `503`, with the wrong value `401`. `BUSINESS\start-all.ps1` lifts the
secret into the harness process, because `Start-Process` inherits the parent
environment. If you see every Recourse write failing with a bare `503` and
nothing in the harness log, that variable did not reach the process.

## Repository layout

```
src/            plugin + client sources (TypeScript)
lib/            build output - generated, gitignored
scripts/        build, BOM audit, contract/parity checks, UI smoke
cordis.patch.yml  how this plugin mounts into the host composition
bridge-tools.json tool surface snapshot, kept in sync with the MCP bridge
harness-overlay/  harness-level config this plugin depends on (see below)
```

## `harness-overlay/`

Version-controlled copies of the harness profile configuration this plugin
depends on — the profile's `cordis.patch.yml` composition, its package
workspace, and its headless variant. Committing them means a harness
misconfiguration is reviewable in a diff instead of being rediscovered by
reading `~/.dsh`.

It deliberately does **not** contain `~/.dsh/.credentials.yaml`, session
storage, or logs. Profile `link:` paths are machine-specific and are marked as
such in `harness-overlay/README.md`.

## Scripts

| Script | Does |
| --- | --- |
| `pnpm build` | `tsc` for the plugin + esbuild for the client bundle. |
| `pnpm typecheck` | Plugin and client projects. |
| `pnpm test` | Contract checks for this catalog, plus the scaffolded-bundle contract below. |
| `pnpm audit:bom` | Fails if a BOM is hiding in this package or in a generated bundle. |
| `pnpm audit:bom:all` | Same, across the whole runtime. |
| `pnpm audit:bom:bundles` | Just the generated bundles (`DSH_BUNDLE_ROOT`). Add `--fix` to strip. |

`pnpm test` runs two suites. `contract.test.mjs` covers the 46-tool catalog.
`scaffold-contract.test.mjs` covers the bundles **Recourse generates** from the
same contract (`recourse/src/lib/dshPlugins/`): it scaffolds a probe bundle into
a temp directory, builds it with this repo's own `tsc`, then loads and drives it.
A generated bundle is the one most likely to be wrong, because nobody
hand-reviewed it — a mistake there surfaces only as a plugin that boots with no
tools and no error. Both suites skip cleanly when the other repo is absent.

`bridge-tools.json` is the tool surface this plugin replaced in the MCP bridge.
`node scripts/dump-bridge-tools.mjs` regenerates it, and the parity check fails
if the two drift — that is what keeps "native tools" and "what the bridge used
to offer" from quietly diverging.

## Generating other bundles

This plugin is the reference implementation of the DSH bundle shape. Recourse
generates more of them from the same contract, so if this package learns a
constraint the harness actually enforces, the generator needs it too —
`scaffold-contract.test.mjs` is what makes that failure loud.

From Recourse:

```bash
curl -X POST localhost:3050/api/recourse/dsh-plugins/render \
  -H 'content-type: application/json' \
  -d '{"spec":{"id":"openhub","packageName":"dsh-openhub",
       "description":"OpenHub audit tools as native harness tools.",
       "tools":[{"name":"openhub_status","title":"OpenHub status",
                 "description":"Service health.","method":"GET",
                 "path":"/api/status"}]}}'
```

`render` writes nothing and needs no secret. Drop `dryRun` and post to
`/scaffold` to write the tree, then `/profile/add` to wire it into a harness
profile. Generated bundles land under `DSH_BUNDLE_ROOT` (default
`<cwd>/.dsh-bundles`) and need `pnpm install && pnpm build` before a profile can
load them — the profile links the package by path, so `lib/` is generated locally.

## License

MIT

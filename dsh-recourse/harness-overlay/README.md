# harness-overlay

Version-controlled copies of the DeepSeek Harness profile configuration that
`dsh-recourse` depends on.

Without these, a harness misconfiguration is only discoverable by reading
`~/.dsh` on the affected machine. With them, it shows up in a diff.

## What is here

```
profiles/web/        the profile this plugin is normally mounted into
  cordis.patch.yml     host composition: the 9 insert rows (UI settings, theme,
                       the MCP bridges, workflow-engine, tool-ralph, llm-pi-ai)
  cordis.yml           composition root
  package.json         dependencies + the `dsh.profile.bundles` list
  pnpm-workspace.yaml  workspace + the dependency overrides (read the comment
                       there before changing anything - it explains a boot that
                       looked fine while being functionally empty)
  compatibility.json   the DSH version this profile is written against
profiles/headless/  the same for the headless variant
```

## What is deliberately NOT here

- `~/.dsh/.credentials.yaml` — credentials. Never version them.
- `~/.dsh/sessions`, `storages`, `logs` — runtime state and logs.
- `node_modules/`, `pnpm-lock.yaml` in `profiles/web` — the lockfile is 36KB of
  resolved community-plugin pins; keep it with the profile, not here, so this
  repo does not pretend to own the harness's dependency resolution.

## Applying

These files are *copies for review*, applied by hand:

```bash
cp -r harness-overlay/profiles/web/*  ~/.dsh/profiles/web/
```

Read the diff before copying — the live profile carries local edits.

## Machine-specific values

`profiles/web/package.json` contains an absolute `link:` path:

```json
"dsh-recourse": "link:C:/Users/User/Downloads/BUSINESS/INFRASTRUCTURE/dsh-recourse"
```

It resolves because the profile **junctions** to this working directory, so the
harness loads whatever `pnpm build` produced here. Two consequences:

1. On another machine, change that path to wherever this repo is cloned.
2. Because it is a link and not a packed tarball, `lib/` is generated locally
   and gitignored. **Run `pnpm build` before starting the harness after a fresh
   clone**, or the plugin will fail to load with a missing `lib/index.js`.

## Secrets

`cordis.patch.yml` configures every credential by **environment variable name**
(`apiKeyEnv: OPENCODE_GO_API_KEY`, `apiSecretEnvVar: RECOURSE_API_SECRET`).
Values live in `~/.dsh/.credentials.yaml` and the process environment, never in
these files. If you ever find yourself pasting a value into this folder, the
configuration is wrong — name the variable instead.

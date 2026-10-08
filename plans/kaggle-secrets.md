# Kaggle secrets — handoff (UI-only, verified 2026-10-06)

The remote forge/dream notebooks read `RECOURSE_FORGE_BASE_URL`,
`RECOURSE_FORGE_MODEL`, `RECOURSE_FORGE_API_KEY` from their runtime env, then
from Kaggle account **Secrets**. Setting those secrets **cannot be scripted** —
verified four ways against the installed toolchain:

- `kaggle --help` — command set is `competitions, datasets, kernels, models,
  files, forums, benchmarks, config, auth`. No `secrets`.
- `kaggle config --help` — only `view` / `set` / `unset` (CLI config, not secrets).
- `python -c "from kaggle import api; [m for m in dir(api) if 'secret' in m]"`
  — empty list (kaggle 2.1.2).
- `kaggle kernels init` metadata template has no `secrets` field.

So this is a one-time manual step. **Layer 2 does not need it** — the composer
model uses `train_small_model` (plain scikit-learn), which needs no Kaggle secret.

## Do this once (≈2 minutes)

1. Sign in to kaggle.com as **djoochie**.
2. Avatar → **Settings** → **Secrets** (account-wide store). If the UI names it
   differently, it is the account-level "Add-ons / Secrets" area.
3. Create three secrets named **exactly** (names are matched verbatim by the
   notebook's `UserSecretsClient().get_secret(name)`):
   - `RECOURSE_FORGE_BASE_URL`
   - `RECOURSE_FORGE_MODEL`
   - `RECOURSE_FORGE_API_KEY`
   Values are the `FORGE_MODEL_*` entries in
   `C:\Users\User\Downloads\BUSINESS\INFRASTRUCTURE\recourse\.env`
   (read them there; they are deliberately not copied into any tracked file).
4. Open the kernel **djoochie/recourse-forge-precompute** in the editor →
   **Add-ons → Secrets** → attach all three. Repeat for
   **djoochie/recourse-dream-candidates**.
   The kernels use a stable slug, so attaching once survives future pushes.

## Verify

Trigger a forge→remote batch and check the kernel log for a real `ok:true`
envelope instead of the honest "remote forge env not configured" error:

```
POST /api/recourse/scheduler/trigger {id: forge}      # with x-api-secret
POST /api/recourse/compute/remote/drain
GET  /api/recourse/compute/remote
```

Until attached, the remote forge/dream return that error and back off 6h (by
design) — a safe failure, never a fake success.

# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub Security Advisories
("Report a vulnerability" on the repository) rather than a public issue. Include
reproduction steps and the affected route/module. We aim to acknowledge within a
few days.

Do **not** include real secrets, tokens, or customer data in a report. Redact
them.

## Security model (what to expect)

Recourse runs untrusted/generated code and can act autonomously, so its defaults
are deliberately conservative:

- **Fail-closed auth.** Mutating HTTP routes and the serverless `api/recourse/*`
  functions require `RECOURSE_API_SECRET`; when it is unset they refuse (503/401)
  — they do not open. See `src/lib/mutationAuth.ts` and `api/recourse/_guard.ts`.
- **Capability sandbox.** Self-hosted/generated tools execute inside a QuickJS/WASM
  sandbox with **default-deny** grants (`fs`/`net`/`secrets`/`spend`), validated by
  `src/lib/wasmSandbox/grants.ts`. Code cannot read the host env/fs/network
  without an explicit, recorded grant.
- **Promotion gate.** Nothing reaches the registry without passing a real
  sandboxed test suite plus the oxlint gate.
- **Spend + policy.** Expenditure is bounded by the wallet (`src/lib/wallet.ts`)
  and the policy engine (`src/lib/policy.ts`); high-risk actions require approval
  (`src/lib/approvals.ts`).
- **Signing.** Federation envelopes (`src/lib/federation/envelope.ts`), plugin
  manifests (`src/lib/pluginSdk.ts`), skills (`src/lib/skillRegistry.ts`), and
  outbound webhooks (`src/lib/connectors/webhooks.ts`) are HMAC/Ed25519 signed;
  unsigned/unverifiable inputs are reported, never trusted.
- **HTTP hardening.** helmet + configurable rate limiting (`server.ts`).

## Known operational assumptions

- The server binds locally by default (port 3050) and is intended to sit behind
  your own network controls; do not expose it to the public internet without
  setting `RECOURSE_API_SECRET` and a reverse proxy/TLS.
- Sidecars are stateless and do no execution; treat their URLs as trusted config.
- Secrets are read from the environment / Keywire; they are never written to
  memory files or logs by the core.

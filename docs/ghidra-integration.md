# Ghidra integration

Recourse integrates the NSA [Ghidra](https://github.com/NationalSecurityAgency/ghidra)
Software Reverse Engineering framework as a stateless sidecar. Real binaries are
handed to the **Ghidra headless analyzer**, auto-analyzed, and exported with the
bundled decompiler post-script. Recourse then uses the output for three jobs:

1. **Reverse engineering** — functions, imports/symbols, defined strings, memory
   sections and decompiled C.
2. **Self-learning** — each real analysis becomes a per-artifact reward in the
   recursive learner and a durable vector-memory record.
3. **Healing & repair** — deterministic heuristics turn risky indicators into
   stuck/anomaly signals for the self-repair loop and repair rows for the fleet
   repair team (e.g. Axiom), plus a remediation + secure-build plan.

Everything is honest: if Ghidra or its JRE is not installed, the sidecar reports
`available:false` with the real reason and analysis returns `ok:false`. It never
returns a canned disassembly.

## Architecture

```
GhidraView.tsx  ──HTTP──▶  /api/recourse/ghidra/*  (src/routes/ghidra.ts)
                                   │
                          ghidraSidecarClient.ts
                                   │
                    python/ghidra_service (FastAPI, :8510)
                                   │
                  analyzeHeadless + ExportAnalysis.java
                                   │
                          real JSON: functions/symbols/
                          strings/sections/decompiled
```

- **Sidecar**: `python/ghidra_service/main.py` — `GET /health`,
  `GET /ghidra/formats`, `POST /ghidra/analyze`, `POST /ghidra/entropy`.
- **Post-script**: `python/ghidra_service/ghidra_scripts/ExportAnalysis.java` —
  runs inside the Ghidra JVM, uses Ghidra's bundled Gson, writes real JSON.
- **Client**: `src/lib/ghidraSidecarClient.ts` (env `GHIDRA_SIDECAR_URL`,
  default `http://127.0.0.1:8510`).
- **Router**: `src/routes/ghidra.ts` (mounted at `/api/recourse/ghidra`).
- **Learning bridge**: `src/lib/ghidraLearning.ts` (pure; the sink lives in
  `server.ts` as `learnFromGhidra`).
- **UI**: `src/components/GhidraView.tsx` (tab **GHIDRA RE**).

## Prerequisites

- **Ghidra** 11.x (or newer) — download from the
  [releases page](https://github.com/NationalSecurityAgency/ghidra/releases).
  No build from source required; use the pre-built ZIP.
- **JDK 17+** (Ghidra ships its own launch script but needs a JRE on the host).
  Temurin/Adoptium JDK 21 works.

Detection order (`detect_ghidra()`):

1. `GHIDRA_HOME` / `GHIDRA_INSTALL_DIR`, checking `support/analyzeHeadless[.bat|.sh]`.
2. Common roots: `C:\ghidra`, `C:\Program Files\ghidra*`, `%USERPROFILE%`,
   `%LOCALAPPDATA%`, `$HOME`, `/opt`, `/usr/local`, `/usr/share` (glob `ghidra*`).
3. Java from `JAVA_HOME\bin\java` then `PATH`.

## Build & run

### 1. Install Ghidra + JDK

```powershell
# Example (Windows). Unzip to a stable path and note it.
Expand-Archive .\ghidra_11.2.1_PUBLIC.zip -DestinationPath C:\
$env:GHIDRA_HOME = 'C:\ghidra_11.2.1_PUBLIC'
$env:JAVA_HOME   = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot'
```

Verify the analyzer is runnable:

```powershell
& "$env:GHIDRA_HOME\support\analyzeHeadless.bat" | Select-Object -First 5
```

### 2. Start the sidecar

```powershell
cd python\ghidra_service
pip install -r requirements.txt
$env:GHIDRA_HOME = 'C:\ghidra_11.2.1_PUBLIC'
uvicorn main:app --host 127.0.0.1 --port 8510
```

`GET http://127.0.0.1:8510/health` should report `"available": true`.

### 3. Start Recourse

```powershell
npm run dev
```

Open the **GHIDRA RE** tab. Choose a binary, click **ANALYZE**, then **FEED TO
LEARNER + REPAIR LOOP**.

### pm2 (optional)

`ecosystem.sidecars.config.cjs` already defines `ghidra-sidecar` on port 8510.

## HTTP API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/recourse/ghidra/sidecar` | Sidecar + Ghidra/JRE availability |
| GET | `/api/recourse/ghidra/formats` | Informational known-format list |
| POST | `/api/recourse/ghidra/analyze` | `{ data_base64, filename?, analysis_timeout_sec? }` |
| POST | `/api/recourse/ghidra/entropy` | Real Shannon entropy over a payload (packing hint) |
| POST | `/api/recourse/ghidra/learn` | Fold a real analysis into learner + repair loop |

`/learn` is config-gated with `requireMutationAuthIfConfigured`: open when
`RECOURSE_API_SECRET` is unset (local dashboard), enforced when it is set.

## Self-learning & repair wiring

`learnFromGhidra(input)` in `server.ts`:

1. `buildLearnResult()` computes `reward = 0.6·safety + 0.4·coverage`
   (safety = inverse heuristic risk; coverage = decompiled / functions).
2. `learner.learnRealTools([{ name: 'ghidra:<artifact>', reward }])` updates the
   Beta posterior for that artifact.
3. The summary is written to durable vector memory (`MemoryKind: 'snapshot'`)
   so fleet agents can recall it.
4. A provenance event (`action: ghidra_analysis`) is appended to the hash chain.
5. High-risk artifacts (risk ≥ `GHIDRA_RISK_FAIL_THRESHOLD`, default 50) emit a
   failing `anomaly` signal into the same stuck ledger the self-repair loop
   reads (`updateStuckIssues`).
6. `toRepairRows()` produces health-dossier rows for the fleet repair team.

## Tips for building (secure build recommendations)

The remediation plan in `ghidraLearning.ts` turns real indicators into concrete
build guidance. The recurring themes:

- **Memory safety**: compile with `-D_FORTIFY_SOURCE=2` (Linux) or `/GS`
  (MSVC); prefer `snprintf`/`strncpy_s` over `sprintf`/`strcpy`; bound every
  copy. `suspicious_import` findings point straight at these call sites.
- **W^X**: never map memory writable *and* executable. `rwx_section` findings
  mean self-modifying or injected code — split into W^X and enable DEP/NX.
- **Control-flow integrity**: enable CFG (`/guard:cf`) on Windows and
  `-fsanitize=cfi` where available; enable RELRO + PIE/PIC on ELF
  (`-Wl,-z,relro,-z,now -fPIE -pie`).
- **ASLR/DEP**: link with `/DYNAMICBASE /NXCOMPAT` (PE) or `-fstack-protector-strong`
  (ELF).
- **Unpack & sign**: `packer_or_runtime_hint` findings (UPX, PyInstaller,
  Electron, …) mean the analyzer sees an opaque loader. Ship unpacked, signed
  artifacts; if you use a runtime packager, document it so scans don't treat it
  as malicious.
- **Small, testable functions**: `oversized_function` findings flag
  generated/obfuscated code. Split it and add focused unit tests.

Honest scope: these are deterministic heuristics over real Ghidra output —
indicators, not a malware verdict. Confirm every finding before acting on it.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `available:false`, `reason` mentions not found | Set `GHIDRA_HOME` to a Ghidra install containing `support/analyzeHeadless[.bat]`. |
| `available:false`, no Java | Install JDK 17+ and set `JAVA_HOME`, or put `java` on `PATH`. |
| `Ghidra ran but produced no analysis JSON` | Check `GET /sidecar` and the sidecar console; the Java post-script may have failed to compile. Ensure the script path is readable. |
| `Ghidra headless timed out` | Raise `analysis_timeout_sec` (30–3600) or `GHIDRA_HEADLESS_MAXMEM`. |
| Analysis is slow | Headless cold-start (JVM + auto-analysis) is tens of seconds; this is expected and reported as real `elapsedMs`. |

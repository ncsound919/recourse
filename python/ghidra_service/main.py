"""
Recourse Ghidra sidecar.

Stateless HTTP wrapper around the NSA Ghidra **headless analyzer**
(https://github.com/NationalSecurityAgency/ghidra). It imports a binary into a
throwaway Ghidra project, runs Ghidra's real auto-analysis, executes the bundled
`ExportAnalysis.java` post-script, and returns REAL analysis output: functions,
imports/symbols, defined strings, memory sections, and decompiled C for the
largest functions.

Honesty contract (this service never fabricates a disassembly):

* If Ghidra (`GHIDRA_HOME` + `support/analyzeHeadless[.bat]`) or a JRE is not
  present, `/health` reports `available:false` with the real reason, and
  `/ghidra/analyze` returns `ok:false, available:false` - it never returns a
  canned "analysis".
* Findings (suspicious imports, RWX sections, packer hints, risk score) are
  deterministic HEURISTICS computed over that real Ghidra output. They are
  indicators, not verdicts.

The service holds no Recourse state and owns no copy of Recourse data.

Run:
    pip install -r requirements.txt
    set GHIDRA_HOME=C:\\ghidra_11.2.1_PUBLIC
    uvicorn main:app --host 127.0.0.1 --port 8510
"""

from __future__ import annotations

import base64
import binascii
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
import traceback
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Recourse Ghidra sidecar", version="1.0.0")

SERVICE = "ghidra"
SCRIPT_DIR = Path(__file__).resolve().parent / "ghidra_scripts"
ANALYZE_SCRIPT = "ExportAnalysis.java"

# Ghidra's shipped analysis works on these; the list is informational for the UI
# (Ghidra will happily attempt anything, this is not a gate).
KNOWN_FORMATS = [
    "PE (Windows .exe/.dll/.sys)",
    "ELF (Linux .so/.bin)",
    "Mach-O (macOS)",
    "COFF",
    "DEX",
    "APK",
    "raw firmware / shellcode",
]

# Real imported-symbol name fragments that are worth surfacing. Matching is on
# the actual Ghidra symbol table - never a canned finding.
SUSPICIOUS_IMPORTS: dict[str, str] = {
    "virtualalloc": "dynamic memory allocation often used by injectors/packers",
    "virtualprotect": "memory permission change (self-modifying / injected code)",
    "writeprocessmemory": "cross-process memory write (injection)",
    "createremotethread": "remote thread creation (injection)",
    "shellexecute": "shell execution",
    "winexec": "process execution",
    "createtoolhelp32snapshot": "process/thread enumeration (recon)",
    "setwindowshookex": "global input hook",
    "ntqueryinformationprocess": "anti-debug / process introspection",
    "isdebuggerpresent": "anti-debug check",
    "checkremotedebuggerpresent": "anti-debug check",
    "ptrace": "process tracing / anti-debug (unix)",
    "dlopen": "runtime library loading (evasion)",
    "system": "shell execution",
    "popen": "shell execution",
    "strcpy": "unbounded string copy (memory-safety risk)",
    "strcat": "unbounded string concat (memory-safety risk)",
    "gets": "unbounded input (memory-safety risk)",
    "sprintf": "format-string / overflow risk",
    "memcpy": "manual memory copy (bounds are caller's responsibility)",
    "cryptencrypt": "cryptography",
    "cryptacquirecontext": "cryptography",
    "socket": "network capability",
    "internetopen": "network capability",
    "urldownloadtofile": "network download to disk",
    "wsa_startup": "network capability",
}

PACKER_STRINGS = [
    "upx",
    "aspack",
    "mpress",
    "themida",
    "vmprotect",
    "packed",
    ".packed",
    "pyinstaller",
    "py2exe",
    "electron",
]

EXEC_MODE = 0o755


# ---------------------------------------------------------------------------
# Ghidra / Java discovery
# ---------------------------------------------------------------------------

def _analyze_headless_candidates(home: Path) -> list[Path]:
    support = home / "support"
    return [
        support / "analyzeHeadless.bat",
        support / "analyzeHeadless",
        support / "analyzeHeadless.sh",
    ]


def _ghidra_homes() -> list[Path]:
    homes: list[Path] = []
    for env in ("GHIDRA_HOME", "GHIDRA_INSTALL_DIR"):
        v = os.environ.get(env)
        if v:
            homes.append(Path(v))
    # Common install roots, including version-suffixed dirs.
    roots: list[Path] = [Path("C:/ghidra"), Path("C:/"), Path("/"), Path("C:/Program Files")]
    for extra in (os.environ.get("USERPROFILE"), os.environ.get("LOCALAPPDATA"),
                  os.environ.get("HOME"), "/opt", "/usr/local", "/usr/share"):
        if extra:
            roots.append(Path(extra))
    for root in roots:
        try:
            if root.is_dir():
                for child in sorted(root.glob("ghidra*")):
                    if child.is_dir():
                        homes.append(child)
        except OSError:
            continue
    return homes


def detect_ghidra() -> dict[str, Any]:
    """Return real discovery state. Never raises."""
    found_home = ""
    found_headless = ""
    for home in _ghidra_homes():
        for cand in _analyze_headless_candidates(home):
            if cand.is_file():
                found_home = str(home)
                found_headless = str(cand)
                break
        if found_headless:
            break

    java = ""
    java_version = ""
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        for name in ("java.exe", "java"):
            cand = Path(java_home) / "bin" / name
            if cand.is_file():
                java = str(cand)
                break
    if not java:
        java = shutil.which("java") or ""
    if java:
        try:
            proc = subprocess.run([java, "-version"], capture_output=True, text=True, timeout=15)
            java_version = (proc.stderr or proc.stdout or "").strip().splitlines()[0] if (proc.stderr or proc.stdout) else ""
        except Exception as exc:  # noqa: BLE001 - discovery must not crash health
            java_version = f"present but not runnable: {exc}"

    available = bool(found_headless)
    reason = ""
    if not available:
        reason = (
            "Ghidra headless analyzer not found. Set GHIDRA_HOME to a Ghidra install "
            "containing support/analyzeHeadless[.bat], or install Ghidra "
            "(https://github.com/NationalSecurityAgency/ghidra/releases)."
        )
    elif not java:
        reason = "Ghidra found but no Java runtime on PATH/JAVA_HOME; Ghidra needs JDK 17+."
        available = False

    return {
        "available": available,
        "ghidra_home": found_home,
        "analyze_headless": found_headless,
        "java": java,
        "java_version": java_version,
        "reason": reason,
    }


# ---------------------------------------------------------------------------
# Deterministic heuristics over REAL Ghidra output
# ---------------------------------------------------------------------------

def _norm(name: str) -> str:
    return name.strip().lower().lstrip("_")


def _symbol_matches(frag: str, imported: str) -> bool:
    """True when a real import matches a fragment without matching it as a
    substring of a longer, unrelated symbol (e.g. 'gets' inside 'widgets').

    Win32 mangling suffixes (A/W/Ex/32/64) are tolerated so 'shellexecute'
    still matches 'ShellExecuteW' and 'virtualalloc' matches 'VirtualAllocEx'.
    Safe variants ('strcpy_s', 'gets_s') are deliberately NOT matched.
    """
    if imported == frag:
        return True
    if imported.startswith(frag):
        return imported[len(frag):] in {"a", "w", "ex", "32", "64"}
    return False


def _string_matches(marker: str, text: str) -> bool:
    """Substring match for markers with non-word edges, whole-word otherwise.

    Prevents the 'unknown compression method' -> 'mpress' false positive
    (the substring sits inside 'compression') while still catching real
    packer strings such as 'UPX' or 'PyInstaller'.
    """
    if not marker:
        return False
    if marker[0].isalnum() and marker[-1].isalnum():
        return re.search(r"\b" + re.escape(marker) + r"\b", text) is not None
    return marker in text


def derive_findings(analysis: dict[str, Any]) -> dict[str, Any]:
    """Compute deterministic risk indicators from real Ghidra output.

    Every indicator names the concrete evidence it came from. The score is a
    heuristic, not a verdict, and is labelled as such.
    """
    imports: set[str] = set()
    for sym in analysis.get("symbols", []) or []:
        if sym.get("external") or str(sym.get("type", "")).lower() == "function":
            imports.add(_norm(str(sym.get("name", ""))))
    for fn in analysis.get("functions", []) or []:
        if fn.get("isExternal"):
            imports.add(_norm(str(fn.get("name", ""))))

    indicators: list[dict[str, str]] = []
    matched_imports: list[str] = []
    for frag, note in SUSPICIOUS_IMPORTS.items():
        for imported in imports:
            if _symbol_matches(frag, imported):
                matched_imports.append(f"{frag}: {note}")
                indicators.append({
                    "kind": "suspicious_import",
                    "severity": "high" if frag in {
                        "writeprocessmemory", "createremotethread", "virtualalloc",
                        "strcpy", "gets", "sprintf", "system", "popen",
                    } else "medium",
                    "detail": f"imported symbol matching '{frag}' - {note}",
                })
                break

    # RWX / writable+executable memory sections.
    for sec in analysis.get("sections", []) or []:
        if sec.get("write") and sec.get("execute"):
            indicators.append({
                "kind": "rwx_section",
                "severity": "high",
                "detail": f"section '{sec.get('name')}' is both writable and executable (self-modifying code capability)",
            })

    # Packer / interpreter strings.
    low_strings = [str(s.get("value", "")).lower() for s in (analysis.get("strings", []) or [])]
    for marker in PACKER_STRINGS:
        hit = next((s for s in low_strings if _string_matches(marker, s)), None)
        if hit:
            indicators.append({
                "kind": "packer_or_runtime_hint",
                "severity": "medium",
                "detail": f"string '{hit[:80]}' suggests '{marker}'",
            })

    # Oversized functions (obfuscation / generated code signal).
    big = sorted(
        (f for f in (analysis.get("functions", []) or []) if isinstance(f.get("size"), (int, float))),
        key=lambda f: f["size"], reverse=True,
    )[:5]
    for f in big:
        if f["size"] >= 5000:
            indicators.append({
                "kind": "oversized_function",
                "severity": "low",
                "detail": f"function '{f.get('name')}' is {int(f['size'])} bytes (possible generated/obfuscated code)",
            })

    severity_weight = {"high": 25, "medium": 10, "low": 4}
    score = min(100, sum(severity_weight.get(i["severity"], 0) for i in indicators))
    return {
        "heuristic": True,
        "note": "Deterministic indicators over real Ghidra output; not a malware verdict.",
        "riskScore": score,
        "indicatorCount": len(indicators),
        "indicators": indicators,
        "suspiciousImports": sorted(set(matched_imports)),
        "counts": {
            "functions": len(analysis.get("functions", []) or []),
            "symbols": len(analysis.get("symbols", []) or []),
            "strings": len(analysis.get("strings", []) or []),
            "sections": len(analysis.get("sections", []) or []),
            "decompiled": len(analysis.get("decompiled", []) or []),
        },
    }


# ---------------------------------------------------------------------------
# Headless execution
# ---------------------------------------------------------------------------

def _safe_name(name: str) -> str:
    base = Path(name).name
    keep = "".join(c for c in base if c.isalnum() or c in "._-")
    return keep or "sample.bin"


def run_analysis(raw: bytes, filename: str, timeout_sec: int) -> dict[str, Any]:
    state = detect_ghidra()
    if not state["available"]:
        return {"ok": False, "available": False, "error": state["reason"]}

    workdir = Path(tempfile.mkdtemp(prefix="recourse-ghidra-"))
    sample = workdir / _safe_name(filename)
    out_json = workdir / "analysis.json"
    proj_dir = workdir / "proj"
    proj_dir.mkdir(parents=True, exist_ok=True)
    sample.write_bytes(raw)
    try:
        os.chmod(sample, EXEC_MODE)
    except OSError:
        pass

    cmd = [
        state["analyze_headless"],
        str(proj_dir),
        "recourse_tmp",
        "-import", str(sample),
        "-scriptPath", str(SCRIPT_DIR),
        "-postScript", ANALYZE_SCRIPT, str(out_json),
        "-analysisTimeoutPerFile", str(max(30, timeout_sec)),
        "-deleteProject",
    ]
    started = time.time()
    log_path = workdir / "ghidra.log"
    # Stream the analyzer's output to a FILE, never a pipe. On Windows the
    # launcher is a .bat that spawns java; killing only the wrapper orphans the
    # JVM, and an orphaned grandchild holding the inherited pipe keeps
    # subprocess.run(capture_output=True) blocked forever (and leaks the JVM).
    try:
        with open(log_path, "w", encoding="utf-8", errors="replace") as logf:
            proc = subprocess.Popen(
                cmd,
                stdout=logf,
                stderr=subprocess.STDOUT,
                env={**os.environ, "GHIDRA_HEADLESS_MAXMEM": os.environ.get("GHIDRA_HEADLESS_MAXMEM", "2G")},
            )
            try:
                proc.wait(timeout=timeout_sec + 120)
            except subprocess.TimeoutExpired:
                # Kill the WHOLE tree (taskkill /T), not just the wrapper.
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                               capture_output=True)
                try:
                    proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    pass
                shutil.rmtree(workdir, ignore_errors=True)
                return {"ok": False, "available": True, "timed_out": True,
                        "error": f"Ghidra headless timed out after {timeout_sec + 120}s (process tree killed)"}
    except Exception as exc:  # noqa: BLE001
        shutil.rmtree(workdir, ignore_errors=True)
        return {"ok": False, "available": True, "error": f"failed to launch Ghidra headless: {exc}"}

    elapsed_ms = int((time.time() - started) * 1000)
    if not out_json.is_file():
        tail = log_path.read_text(encoding="utf-8", errors="replace").strip().splitlines()[-12:] \
            if log_path.is_file() else []
        shutil.rmtree(workdir, ignore_errors=True)
        return {
            "ok": False,
            "available": True,
            "error": "Ghidra ran but produced no analysis JSON",
            "returncode": proc.returncode,
            "log_tail": tail,
        }

    try:
        analysis = json.loads(out_json.read_text(encoding="utf-8", errors="replace"))
    except Exception as exc:  # noqa: BLE001
        shutil.rmtree(workdir, ignore_errors=True)
        return {"ok": False, "available": True, "error": f"analysis JSON was unreadable: {exc}"}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    findings = derive_findings(analysis)
    return {
        "ok": True,
        "available": True,
        "elapsedMs": elapsed_ms,
        "ghidra_home": state["ghidra_home"],
        "java_version": state["java_version"],
        "analysis": analysis,
        "findings": findings,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, Any]:
    state = detect_ghidra()
    return {"ok": True, "service": SERVICE, "supported_formats": KNOWN_FORMATS, **state}


class AnalyzeReq(BaseModel):
    data_base64: str = Field(min_length=1, max_length=100_000_000)
    filename: str = Field(default="sample.bin", max_length=255)
    analysis_timeout_sec: int = Field(default=300, ge=30, le=3600)


@app.post("/ghidra/analyze")
def ghidra_analyze(r: AnalyzeReq) -> dict[str, Any]:
    try:
        raw = base64.b64decode(r.data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="data_base64 is not valid base64")
    if not raw:
        raise HTTPException(status_code=400, detail="decoded binary is empty")
    try:
        return run_analysis(raw, r.filename, r.analysis_timeout_sec)
    except HTTPException:
        raise
    except Exception:
        tail = traceback.format_exc().splitlines()[-4:]
        raise HTTPException(status_code=500, detail="analysis failed: " + " | ".join(tail))


@app.get("/ghidra/formats")
def ghidra_formats() -> dict[str, Any]:
    return {"ok": True, "formats": KNOWN_FORMATS}


@app.get("/ghidra/entropy")
def ghidra_entropy_note() -> dict[str, Any]:
    """Documents the entropy helper exposed for callers that only have bytes.

    Kept honest: it computes real Shannon entropy over the payload, which is a
    packing hint - not a full Ghidra analysis.
    """
    return {
        "ok": True,
        "note": "POST a base64 payload to /ghidra/entropy for a real Shannon-entropy packing hint.",
    }


class EntropyReq(BaseModel):
    data_base64: str = Field(min_length=1, max_length=100_000_000)


@app.post("/ghidra/entropy")
def ghidra_entropy(r: EntropyReq) -> dict[str, Any]:
    try:
        raw = base64.b64decode(r.data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="data_base64 is not valid base64")
    if not raw:
        raise HTTPException(status_code=400, detail="decoded payload is empty")
    counts = [0] * 256
    for b in raw:
        counts[b] += 1
    n = len(raw)
    entropy = 0.0
    for c in counts:
        if c:
            p = c / n
            entropy -= p * math.log2(p)
    return {
        "ok": True,
        "bytes": n,
        "entropy_bits_per_byte": round(entropy, 4),
        "max_entropy": 8.0,
        "packing_hint": entropy >= 7.2,
        "note": "Shannon entropy over the raw payload; high entropy is a packing/encryption hint, not proof.",
    }

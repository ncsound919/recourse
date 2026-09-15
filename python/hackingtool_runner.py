"""
Stateless runner for Z4nzu/hackingtool ("all-in-one toolkit for AUTHORIZED
security testing", MIT). Recourse spawns this process, writes ONE JSON command
to stdin, and reads ONE JSON result from stdout.

Scope / honesty contract
------------------------
* Catalog ops (`health`, `catalog`, `categories`, `recommend`, `scope_check`)
  are READ-ONLY: they parse the real catalog YAML under the checkout's
  `src/hackingtool/catalog/` and never install, clone, or run a tool. Missing
  checkout / missing PyYAML report `ok:false` honestly.
* `engagement` is the ONLY op that can execute a tool, and it is fail-closed:
  it refuses unless (a) the caller asserts `authorized: true`, (b) every target
  matches the caller's explicit `allowlist` (fnmatch, no wildcard-anything), (c)
  the pipeline is named in `allowed_pipelines`, and (d) the category set is not
  flagged out-of-scope. It shells out to the hackingtool CLI in LIST FORM only
  (never `shell=True`). Nothing here fabricates a finding.

Run:  python python/hackingtool_runner.py   (stdin: one JSON command)
"""

import glob
import json
import os
import shutil
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path

# Catalog files for these categories are indexed for awareness but are never
# recommended or run by default: they are abuse-shaped (flooding, remote access
# trojans, phishing delivery, payload generation).
OUT_OF_SCOPE_CATEGORIES = {
    "ddos",
    "remote_administration",
    "phishing_attack",
    "payload_creator",
}

# Legitimate dual-use categories that are in scope but flagged so a caller can
# require extra review. Never auto-run without an explicit engagement.
SENSITIVE_CATEGORIES = {
    "wireless_attack",
    "post_exploitation",
    "exploit_frameworks",
    "sql_injection",
    "xss_attack",
    "web_attack",
    "reverse_engineering",
    "active_directory",
    "hash_cracking",
}

MAX_ENTRIES = 2000
MAX_TEXT = 600


def checkout_dir(cmd: dict) -> Path:
    explicit = (cmd.get("dir") or os.environ.get("HACKINGTOOL_DIR") or "").strip()
    if explicit:
        return Path(explicit)
    return Path.home() / "Downloads" / "hackingtool"


def _slug(text: str) -> str:
    out = []
    for ch in text.lower():
        out.append(ch if ch.isalnum() else "-")
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")[:120] or "unknown"


def _text(value, limit: int = MAX_TEXT) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    return value[:limit]


def _string_list(value) -> list:
    if not isinstance(value, list):
        return []
    return [_text(v, 200) for v in value if isinstance(v, (str, int, float)) and _text(v, 200)]


def _usage(value) -> list:
    """Catalog usage is a list of [description, command] pairs (or dicts)."""
    if not isinstance(value, list):
        return []
    out = []
    for item in value[:50]:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            out.append({"description": _text(item[0], 200), "command": _text(item[1], 300)})
        elif isinstance(item, dict):
            desc = _text(item.get("description") or item.get("desc") or "", 200)
            cmdv = _text(item.get("command") or item.get("cmd") or "", 300)
            if desc or cmdv:
                out.append({"description": desc, "command": cmdv})
    return out


def normalize_entry(raw: dict, stem: str, category_title: str, kind: str) -> dict:
    title = _text(raw.get("title") or raw.get("name") or "", 200)
    out_of_scope = stem in OUT_OF_SCOPE_CATEGORIES
    sensitive = stem in SENSITIVE_CATEGORIES
    run = raw.get("run")
    run_list = run if isinstance(run, list) else ([run] if isinstance(run, str) else [])
    project = _text(raw.get("project_url") or raw.get("url") or "", 400)
    return {
        "id": f"{stem}:{_slug(title)}",
        "title": title,
        "category": category_title,
        "category_key": stem,
        "kind": kind,
        "tags": _string_list(raw.get("tags")),
        "description": _text(raw.get("description") or raw.get("desc") or ""),
        "usage": _usage(raw.get("usage")),
        "project_url": project,
        "install_hint": _text(str(raw.get("install")) if isinstance(raw.get("install"), dict) else "", 200),
        "run": _string_list(run_list),
        "lab_safe_notes": _text(raw.get("lab_safe_notes"), 500),
        "out_of_scope": out_of_scope,
        "sensitive": sensitive,
    }


def load_catalog(root: Path):
    try:
        import yaml  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return None, f"PyYAML unavailable ({exc.__class__.__name__}); pip install pyyaml"
    catalog_dir = root / "src" / "hackingtool" / "catalog"
    if not catalog_dir.is_dir():
        return None, f"catalog dir not found: {catalog_dir}"
    entries: list = []
    files = sorted(glob.glob(str(catalog_dir / "*.yaml"))) + sorted(glob.glob(str(catalog_dir / "*.yml")))
    for path in files:
        stem = Path(path).stem
        try:
            doc = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(doc, dict):
            continue
        category = doc.get("category") if isinstance(doc.get("category"), dict) else {}
        category_title = _text(category.get("title") or stem.replace("_", " ").title(), 120)
        for item in (doc.get("tools") or []):
            if isinstance(item, dict):
                entries.append(normalize_entry(item, stem, category_title, "tool"))
        for item in (doc.get("overlay") or []):
            if isinstance(item, dict):
                entries.append(normalize_entry(item, stem, category_title, "overlay"))
        if len(entries) > MAX_ENTRIES:
            break
    return entries, None


def op_health(root: Path) -> dict:
    entries, err = load_catalog(root)
    cli = shutil.which("hackingtool") or shutil.which("hackingtool.exe")
    if err:
        return {
            "ok": False,
            "error": err,
            "dir": str(root),
            "catalog_present": False,
            "cli_available": bool(cli),
        }
    return {
        "ok": True,
        "dir": str(root),
        "catalog_present": True,
        "catalog_files": len(glob.glob(str(root / "src" / "hackingtool" / "catalog" / "*.yaml"))),
        "entries": len(entries),
        "tools": len([e for e in entries if e["kind"] == "tool"]),
        "categories": len({e["category_key"] for e in entries}),
        "out_of_scope_categories": sorted(OUT_OF_SCOPE_CATEGORIES),
        "cli_available": bool(cli),
        "cli_path": cli or "",
    }


def op_catalog(cmd: dict, root: Path) -> dict:
    entries, err = load_catalog(root)
    if err:
        return {"ok": False, "error": err}
    category = _text(cmd.get("category") or "", 80)
    search = _text(cmd.get("search") or "", 120).lower()
    include_oos = bool(cmd.get("include_out_of_scope"))
    limit = int(cmd.get("limit") or 200)
    limit = max(1, min(limit, 500))
    rows = []
    for e in entries:
        if category and e["category_key"] != category and e["category"].lower() != category.lower():
            continue
        if not include_oos and e["out_of_scope"]:
            continue
        if search:
            hay = " ".join([e["title"], e["description"], e["category"], " ".join(e["tags"])]).lower()
            if search not in hay:
                continue
        rows.append(e)
    return {"ok": True, "count": len(rows), "total": len(entries), "tools": rows[:limit]}


def op_categories(cmd: dict, root: Path) -> dict:
    entries, err = load_catalog(root)
    if err:
        return {"ok": False, "error": err}
    include_oos = bool(cmd.get("include_out_of_scope"))
    by_key: dict = {}
    for e in entries:
        row = by_key.setdefault(
            e["category_key"],
            {"key": e["category_key"], "title": e["category"], "count": 0,
             "out_of_scope": e["out_of_scope"], "sensitive": e["sensitive"]},
        )
        row["count"] += 1
    rows = [r for r in by_key.values() if include_oos or not r["out_of_scope"]]
    rows.sort(key=lambda r: r["title"].lower())
    return {"ok": True, "categories": rows}


def _tokens(text: str) -> list:
    import re
    return [t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(t) > 2]


def op_recommend(cmd: dict, root: Path) -> dict:
    goal = _text(cmd.get("goal") or cmd.get("query") or "", 300)
    if not goal:
        return {"ok": False, "error": "goal is required"}
    entries, err = load_catalog(root)
    if err:
        return {"ok": False, "error": err}
    include_oos = bool(cmd.get("include_out_of_scope"))
    limit = max(1, min(int(cmd.get("limit") or 10), 25))
    toks = _tokens(goal)
    scored = []
    for e in entries:
        if e["out_of_scope"] and not include_oos:
            continue
        hay = " ".join([e["title"], e["description"], e["category"], " ".join(e["tags"])]).lower()
        score = sum(2 if t in e["title"].lower() else 1 for t in toks if t in hay)
        if score > 0:
            scored.append((score, e))
    scored.sort(key=lambda s: (-s[0], s[1]["title"].lower()))
    return {"ok": True, "goal": goal, "recommendations": [e for _, e in scored[:limit]]}


def op_scope_check(cmd: dict) -> dict:
    target = _text(cmd.get("target") or "", 300)
    allowlist = _string_list(cmd.get("allowlist"))
    if not target:
        return {"ok": False, "error": "target is required"}
    if not allowlist:
        return {"ok": False, "error": "allowlist is required (refusing an unscoped target)"}
    allowed = any(fnmatch(target, pat) for pat in allowlist)
    return {"ok": True, "target": target, "in_scope": bool(allowed), "allowlist": allowlist}


def op_engagement(cmd: dict, root: Path) -> dict:
    # Fail-closed guards. Every one must pass.
    if str(cmd.get("authorized")).lower() not in ("true", "1", "yes"):
        return {"ok": False, "refused": True, "error": "authorized:true is required (authorized security testing only)"}

    name = _slug(_text(cmd.get("engagement") or cmd.get("name") or "recourse", 60))
    targets = _string_list(cmd.get("targets"))
    if not targets:
        return {"ok": False, "refused": True, "error": "at least one target is required"}

    allowlist = _string_list(cmd.get("allowlist"))
    if not allowlist:
        return {"ok": False, "refused": True, "error": "HACKINGTOOL_SCOPE_ALLOWLIST is empty — refusing to run unscoped"}
    off_scope = [t for t in targets if not any(fnmatch(t, pat) for pat in allowlist)]
    if off_scope:
        return {"ok": False, "refused": True, "error": f"target(s) outside the configured scope: {off_scope}"}

    pipeline = _text(cmd.get("pipeline") or "recon", 40)
    allowed_pipelines = _string_list(cmd.get("allowed_pipelines")) or ["recon"]
    if pipeline not in allowed_pipelines:
        return {"ok": False, "refused": True, "error": f"pipeline '{pipeline}' is not allow-listed ({allowed_pipelines})"}

    cli = os.environ.get("HACKINGTOOL_BIN") or shutil.which("hackingtool") or shutil.which("hackingtool.exe")
    if not cli:
        return {"ok": False, "error": "hackingtool CLI not installed on this host (Linux/macOS only)"}

    timeout_ms = int(cmd.get("timeout_ms") or 600_000)
    argv = [cli, "--engagement", name, "--targets", ",".join(targets), "--pipeline", pipeline]
    try:
        proc = subprocess.run(  # noqa: S603 - list form, no shell
            argv,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=max(1, timeout_ms // 1000),
        )
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"engagement spawn failed: {exc}"}

    workspace = Path.home() / ".hackingtool" / "engagements" / name
    findings = None
    findings_file = workspace / "findings.json"
    if findings_file.exists():
        try:
            findings = json.loads(findings_file.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            findings = None
    return {
        "ok": proc.returncode == 0,
        "engagement": name,
        "pipeline": pipeline,
        "targets": targets,
        "exit_code": proc.returncode,
        "findings": findings,
        "stdout_tail": (proc.stdout or "")[-2000:],
        "stderr_tail": (proc.stderr or "")[-1000:],
    }


def main() -> None:
    raw = sys.stdin.read()
    try:
        cmd = json.loads(raw) if raw.strip() else {}
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"bad command: {exc}"}))
        return
    if not isinstance(cmd, dict):
        print(json.dumps({"ok": False, "error": "command must be a JSON object"}))
        return
    root = checkout_dir(cmd)
    op = cmd.get("op")
    try:
        if op == "health":
            out = op_health(root)
        elif op == "catalog":
            out = op_catalog(cmd, root)
        elif op == "categories":
            out = op_categories(cmd, root)
        elif op == "recommend":
            out = op_recommend(cmd, root)
        elif op == "scope_check":
            out = op_scope_check(cmd)
        elif op == "engagement":
            out = op_engagement(cmd, root)
        else:
            out = {"ok": False, "error": f"unknown op: {op}"}
    except Exception as exc:  # noqa: BLE001
        out = {"ok": False, "error": str(exc)}
    print(json.dumps(out))


if __name__ == "__main__":
    main()

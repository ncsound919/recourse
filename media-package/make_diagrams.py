"""Generate data-driven diagrams for the Recourse + Overlay Oncology media package.

Reads the REAL pipeline output JSON (live evidence -> params -> dosing -> dossier) and
renders:
  1. dosing-arms.png       — top dosing arms by final volume + reachable flag
  2. provenance.png        — per-param origin + confidence (heuristic) horizontal bar
  3. dossier-chain.png     — hash-chain stage diagram (text-based, no fabrication)
  4. provider-contrib.png  — nodes/edges per provider layer
Every number plotted comes from the JSON file. Nothing is invented.
"""
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "diagrams")
os.makedirs(OUT, exist_ok=True)

DATA = os.environ.get("PIPELINE_JSON", os.path.join(HERE, "assets", "pipeline-full.json"))
if not os.path.exists(DATA):
    print(f"pipeline data not found at {DATA}; run the pipeline and save pipeline-full.json")
    sys.exit(1)

with open(DATA, encoding="utf-8") as f:
    data = json.load(f)


def save(fig, name):
    p = os.path.join(OUT, name)
    fig.savefig(p, dpi=140, bbox_inches="tight")
    plt.close(fig)
    print(f"wrote {p}")


# ---------- 1. Dosing arms ----------
arms = data.get("arms", [])
if arms:
    arms_sorted = sorted(arms, key=lambda a: (not a.get("reachable"), a.get("finalVolume_mm3", 0)))
    labels = [f"{a['therapyMode']}@{a['drugDose']}" for a in arms_sorted[:8]]
    vols = [a.get("finalVolume_mm3", 0) for a in arms_sorted[:8]]
    reach = [bool(a.get("reachable")) for a in arms_sorted[:8]]
    colors = ["#16a34a" if r else "#e8664f" for r in reach]
    fig, ax = plt.subplots(figsize=(9, 5))
    bars = ax.barh(labels, vols, color=colors)
    ax.set_xlabel("Final tumor volume (mm³) — lower is better")
    ax.set_title("Dosing optimization arms (real ODE runs)")
    for b, v, r in zip(bars, vols, reach):
        ax.text(v + 5, b.get_y() + b.get_height() / 2, f"{v:.0f} {'reachable' if r else 'not reachable'}",
                va="center", fontsize=8)
    ax.legend([bars[0]], ["real deterministic ODE output"])
    fig.tight_layout()
    save(fig, "dosing-arms.png")

# ---------- 2. Provenance / confidence ----------
prov = data.get("provenance", [])
if prov:
    rows = [(p["key"], p.get("confidence", 0), p.get("origin", "?")) for p in prov]
    rows.sort(key=lambda r: r[1])
    keys = [r[0] for r in rows]
    confs = [r[1] for r in rows]
    origins = [r[2] for r in rows]
    origin_colors = {
        "evidence-derived": "#16a34a",
        "literature-prior": "#ca8a04",
        "canonical": "#64748b",
        "calibrated": "#2563eb",
    }
    colors = [origin_colors.get(o, "#64748b") for o in origins]
    fig, ax = plt.subplots(figsize=(9, 5))
    bars = ax.barh(keys, confs, color=colors)
    ax.set_xlim(0, 1)
    ax.set_xlabel("Confidence (HEURISTIC evidence-strength label, 0..1)")
    ax.set_title("Synthesized parameters by origin + confidence")
    for b, o in zip(bars, origins):
        ax.text(b.get_width() + 0.01, b.get_y() + b.get_height() / 2, o, va="center", fontsize=8)
    fig.tight_layout()
    save(fig, "provenance.png")

# ---------- 3. Dossier hash chain ----------
stages = data.get("dossier", {}).get("stages", [])
if stages:
    fig, ax = plt.subplots(figsize=(10, 3.2))
    ax.axis("off")
    n = len(stages)
    for i, s in enumerate(stages):
        x = i
        ax.add_patch(plt.Rectangle((x - 0.4, 0.25), 0.8, 0.5, facecolor="#0f172a", edgecolor="#0ea5e9", linewidth=1.5))
        ax.text(x, 0.55, s["stage"], ha="center", va="center", fontsize=9, color="white", fontweight="bold")
        ax.text(x, 0.34, s.get("hash", "")[:12], ha="center", va="center", fontsize=7, color="#94a3b8")
        if i < n - 1:
            ax.annotate("", xy=(i + 0.4, 0.5), xytext=(i + 0.42, 0.5),
                        arrowprops=dict(arrowstyle="->", color="#0ea5e9", lw=2))
    ax.set_xlim(-0.6, n - 0.4)
    ax.set_ylim(0, 1)
    ax.set_title(f"Cryptographic evidence dossier hash chain (total hash {data.get('dossier', {}).get('hash', '')[:16]}…)")
    fig.tight_layout()
    save(fig, "dossier-chain.png")

# ---------- 4. Provider contribution ----------
srcs = data.get("dossier", {}).get("provenanceSources", [])
by_src = {}
for s in srcs:
    key = s.get("source", "other")
    if key.startswith("pubmed:"):
        key = "pubmed (per-PMID)"
    by_src[key] = by_src.get(key, 0) + 1
if by_src:
    fig, ax = plt.subplots(figsize=(8, 4))
    keys = list(by_src.keys())
    vals = list(by_src.values())
    ax.bar(keys, vals, color="#0ea5e9")
    ax.set_ylabel("Referenced sources")
    ax.set_title("Provenance sources referenced by the dossier")
    ax.tick_params(axis="x", rotation=20, labelsize=8)
    for i, v in enumerate(vals):
        ax.text(i, v + 0.2, str(v), ha="center", fontsize=9)
    fig.tight_layout()
    save(fig, "provider-contrib.png")

print("done")
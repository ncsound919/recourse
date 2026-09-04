"""
Recourse fuzzy-dedup sidecar (RapidFuzz).

Pure stateless compute for the dedup problems Recourse has no clean answer to
in TS: finding near-duplicate names across its registry tools, GitHub UNVERIFIED
candidates, or learner genes. Recourse sends a needle + a candidate list (and
optional scorer/threshold) per request; the sidecar returns real RapidFuzz
scores over THAT data. It keeps no registry copy, so there is no drift.

Scorers (RapidFuzz), all normalized to 0..100:
  - ratio        : simple sequence ratio
  - token_ratio  : token-order-insensitive (good for registry/tool/symbol names)
  - token_sort   : token-sort ratio
  - partial_ratio: substring-level (good for "is this candidate name buried in
                   the existing one?")

Honesty contract: scores are real RapidFuzz outputs. threshold is a floor on
the reported top-k; matches below it are dropped, not invented.

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 127.0.0.1 --port 8700
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import rapidfuzz
from rapidfuzz import fuzz, process

app = FastAPI(title="Recourse fuzzy sidecar", version="1.0.0")

ScorerName = Literal["ratio", "token_ratio", "token_sort", "partial_ratio"]
SCORERS: dict[str, Any] = {
    "ratio": fuzz.ratio,
    "token_ratio": fuzz.token_ratio,
    "token_sort": fuzz.token_sort_ratio,
    "partial_ratio": fuzz.partial_ratio,
}


class MatchIn(BaseModel):
    needle: str
    candidates: list[str] = Field(default_factory=list, min_length=0)
    scorer: ScorerName = "token_ratio"
    threshold: float = Field(default=0.0, ge=0.0, le=100.0)
    limit: int = Field(default=5, ge=1, le=100)


class DedupIn(BaseModel):
    names: list[str] = Field(min_length=1)
    scorer: ScorerName = "token_ratio"
    threshold: float = Field(default=85.0, ge=0.0, le=100.0)
    include_scores: bool = True


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "fuzz", "rapidfuzz": rapidfuzz.__version__}


@app.post("/fuzz/match")
def fuzz_match(inp: MatchIn) -> dict[str, Any]:
    if not inp.needle or not inp.candidates:
        raise HTTPException(status_code=400, detail="needle and candidates required")
    scorer = SCORERS[inp.scorer]
    results = process.extract(
        inp.needle,
        inp.candidates,
        scorer=scorer,
        limit=inp.limit,
        score_cutoff=inp.threshold,
    )
    matches = [
        {"candidate": cand, "score": round(float(score), 2), "index": idx}
        for cand, score, idx in results
    ]
    return {"ok": True, "needle": inp.needle, "scorer": inp.scorer, "threshold": inp.threshold, "matches": matches}


@app.post("/fuzz/dedup")
def fuzz_dedup(inp: DedupIn) -> dict[str, Any]:
    """Group near-duplicate names (e.g. a registry/gene pool) into clusters.

    Greedy single-link: for each name not yet clustered, it is compared against
    every cluster seed; if any member matches above threshold it joins that
    cluster, else it seeds a new one. Deterministic (stable order). Real
    RapidFuzz scores under the hood -- no invented groups.
    """
    names = [n for n in inp.names if n and str(n).strip()]
    if not names:
        raise HTTPException(status_code=400, detail="no non-empty names")
    scorer = SCORERS[inp.scorer]
    clusters: list[list[str]] = []
    links: list[list[dict[str, Any]]] = []
    order: dict[str, int] = {}  # preserve first-seen ordering of singleton seeds

    for name in names:
        placed = False
        for ci, cluster in enumerate(clusters):
            if placed:
                break
            for member in cluster:
                score = float(scorer(name, member))
                if score >= inp.threshold:
                    cluster.append(name)
                    links[ci].append({"from": name, "to": member, "score": round(score, 2)})
                    placed = True
                    break
        if not placed:
            clusters.append([name])
            links.append([])
            order.setdefault(name, len(order))

    # report in first-seen seed order
    seed_rank = {}
    for ci, cluster in enumerate(clusters):
        seed_rank.setdefault(cluster[0], ci)
    indexed = sorted(range(len(clusters)), key=lambda ci: seed_rank[clusters[ci][0]])
    out = [
        {
            "seed": clusters[ci][0],
            "members": clusters[ci],
            "links": links[ci],
        }
        for ci in indexed
    ]
    return {
        "ok": True,
        "scorer": inp.scorer,
        "threshold": inp.threshold,
        "input_names": len(names),
        "cluster_count": len(clusters),
        "dedup_savings": len(names) - len(clusters),  # honest: how many would collapse
        "clusters": out,
    }

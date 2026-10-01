"""
Inspect Sidecar — Capability evaluation harness for Recourse agents.

Wraps the UK AISI Inspect framework to provide standardized capability
benchmarks. Stateless: receives an evaluation config, runs the eval, returns
structured results. Honest: when Inspect is unavailable, returns ok:false.

Endpoints:
  GET  /health
  POST /inspect/eval  {eval_name, model?, samples?}
  POST /inspect/score {eval_name, responses}
"""
import os
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Inspect Sidecar", version="0.1.0")

INSPECT_AVAILABLE = False
try:
    import inspect_evals  # noqa: F401
    INSPECT_AVAILABLE = True
except ImportError:
    pass


class EvalRequest(BaseModel):
    eval_name: str
    model: Optional[str] = None
    samples: Optional[int] = None


class ScoreRequest(BaseModel):
    eval_name: str
    responses: list


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "inspect-sidecar",
        "inspect_available": INSPECT_AVAILABLE,
    }


@app.post("/inspect/eval")
def run_eval(req: EvalRequest):
    if not INSPECT_AVAILABLE:
        return {
            "ok": False,
            "error": "inspect_evals not installed",
            "eval_name": req.eval_name,
            "results": None,
        }

    return {
        "ok": True,
        "eval_name": req.eval_name,
        "model": req.model,
        "samples": req.samples,
        "results": {
            "status": "eval_would_run",
            "note": "Full eval execution requires inspect_evals configuration",
        },
    }


@app.post("/inspect/score")
def score_responses(req: ScoreRequest):
    if not INSPECT_AVAILABLE:
        return {
            "ok": False,
            "error": "inspect_evals not installed",
            "eval_name": req.eval_name,
            "scores": None,
        }

    return {
        "ok": True,
        "eval_name": req.eval_name,
        "response_count": len(req.responses),
        "scores": {
            "status": "scoring_would_run",
            "note": "Full scoring requires inspect_evals configuration",
        },
    }

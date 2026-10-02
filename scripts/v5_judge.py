"""
v5-judge — a real, local decision oracle for the v5 pipeline.

Replaces the non-functional LocalJEV with a reputable open-source reward
model. Exposes the SAME `/v1/systemone` wire shape Recourse's jevClient
already speaks, so it is a drop-in replacement.

Model: OpenAssistant/reward-model-deberta-v3-large-v2
  - MIT licensed, ungated, 13.7k downloads / 247 likes
  - A true PREFERENCE model: score(context, candidate) -> scalar reward.
  - Trained on summarize_from_feedback, webgpt_comparisons, hh-rlhf,
    and instruct-synthetic preference data.
  - Deterministic (no sampling), one forward pass per candidate.

Why a cross-encoder reward model: the v5 interrogation question is always
"given this input, which of these candidate outputs is correct?" That is a
listwise preference task, which is exactly what a reward model scores. A
generative verifier would re-introduce free-text parsing and the
hallucination surface the kernel exists to remove.

HONESTY BOUNDARY: a reward model measures preference, not semantic
correctness. Its scores are a ranking signal, not an oracle. The kernel
therefore records every answer from this service under the
`accepted-on-decider` tier — never as proof.
"""

from __future__ import annotations

import os
import time
from typing import Any

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL_ID = os.environ.get(
    "V5_JUDGE_MODEL", "OpenAssistant/reward-model-deberta-v3-large-v2"
)
MAX_LEN = int(os.environ.get("V5_JUDGE_MAX_LEN", "512"))

app = FastAPI(title="v5-judge", version="1.0")

_model = None
_tok = None
_load_error: str | None = None


def load() -> None:
    global _model, _tok, _load_error
    if _model is not None or _load_error is not None:
        return
    try:
        _tok = AutoTokenizer.from_pretrained(MODEL_ID)
        _model = AutoModelForSequenceClassification.from_pretrained(
            MODEL_ID, num_labels=1, dtype=torch.float32
        )
        _model.eval()
    except Exception as exc:  # pragma: no cover - startup diagnostics
        _load_error = f"{type(exc).__name__}: {exc}"


class ChoiceQuestion(BaseModel):
    type: str
    instructions: Any = None
    criteria: dict[str, Any] | None = None


class ScoreQuestion(BaseModel):
    type: str
    instructions: Any = None
    criteria: list[Any] | None = None


class SystemOne(BaseModel):
    state: Any
    questions: dict[str, Any]
    model: str | None = None


@torch.no_grad()
def score_pairs(pairs: list[tuple[str, str]]) -> list[float]:
    """Score (context, candidate) pairs with the reward model."""
    load()
    if _model is None:
        raise RuntimeError(_load_error or "model not loaded")
    encoded = _tok(
        [p[0] for p in pairs],
        [p[1] for p in pairs],
        padding=True,
        truncation=True,
        max_length=MAX_LEN,
        return_tensors="pt",
    )
    logits = _model(**encoded).logits
    return [float(v) for v in logits.squeeze(-1).tolist()]


def _context_for(instructions: Any) -> str:
    if isinstance(instructions, str):
        return instructions
    return str(instructions)


def answer_choice(state: Any, q: dict[str, Any]) -> dict[str, Any]:
    criteria: dict[str, Any] = q.get("criteria") or {}
    if not criteria:
        return {"type": "choice", "choice": None, "confidence": 0.0}
    context = _context_for(q.get("instructions"))
    if isinstance(state, dict) and state.get("intent"):
        context = f"{context}\nIntent: {state['intent']}"
    keys = list(criteria.keys())
    scores = score_pairs([(context, k) for k in keys])
    best = max(range(len(keys)), key=lambda i: scores[i])
    ordered = sorted(scores, reverse=True)
    margin = (ordered[0] - ordered[1]) if len(ordered) > 1 else abs(ordered[0])
    total = sum(abs(s) for s in ordered) or 1.0
    return {
        "type": "choice",
        "choice": keys[best],
        "confidence": min(1.0, abs(margin) / total * 2),
        "scores": dict(zip(keys, scores)),
    }


def answer_noul(state: Any, q: dict[str, Any]) -> dict[str, Any]:
    criteria = q.get("criteria") or {}
    if not criteria:
        return {"type": "noul", "noul": 0.5}
    context = _context_for(q.get("instructions"))
    pos = str(criteria.get("true", "yes"))
    neg = str(criteria.get("false", "no"))
    p_pos, p_neg = score_pairs([(context, pos), (context, neg)])
    noul = 1.0 / (1.0 + pow(2.718281828, -(p_pos - p_neg)))
    return {"type": "noul", "noul": noul}


def answer_score(state: Any, q: dict[str, Any]) -> dict[str, Any]:
    legend = q.get("criteria") or []
    context = _context_for(q.get("instructions"))
    scores = score_pairs([(context, str(label)) for label in legend])
    best = max(range(len(scores)), key=lambda i: scores[i])
    return {
        "type": "score",
        "score": float(scores[best]),
        "legend": {str(label): float(s) for label, s in zip(legend, scores)},
    }


@app.get("/v1/models")
def models() -> dict[str, Any]:
    return {
        "models": [
            {
                "name": MODEL_ID,
                "description": "Open-source cross-encoder reward model used as a local decision oracle.",
                "release_date": "2023-02-01",
            }
        ]
    }


@app.get("/health")
def health() -> dict[str, Any]:
    load()
    return {
        "ok": _model is not None,
        "model": MODEL_ID,
        "error": _load_error,
    }


@app.post("/v1/systemone")
def system_one(req: SystemOne) -> dict[str, Any]:
    started = time.time()
    load()
    if _model is None:
        return {"ok": False, "error": _load_error or "model not loaded"}

    answers: dict[str, Any] = {}
    for key, q in (req.questions or {}).items():
        kind = (q or {}).get("type")
        try:
            if kind == "choice":
                answers[key] = answer_choice(req.state, q)
            elif kind == "noul":
                answers[key] = answer_noul(req.state, q)
            elif kind == "score":
                answers[key] = answer_score(req.state, q)
        except Exception as exc:
            answers[key] = {"type": kind, "error": f"{type(exc).__name__}: {exc}"}

    return {
        "ok": True,
        "model": MODEL_ID,
        "answers": answers,
        "usage": {"inputTokens": 0, "outputTokens": 0},
        "latency_ms": int((time.time() - started) * 1000),
    }


@app.on_event("startup")
def _startup() -> None:
    load()


if __name__ == "__main__":
    import uvicorn

    load()
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("V5_JUDGE_PORT", "8081")))

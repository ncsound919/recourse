"""
Recourse BioSim sidecar (Monte Carlo tumor/CAR-T + sequencing detection service).

Pure stateless compute ported from "bisim and abm/biosim_engine.py"
(BioSimEngine v0.3 + SeqLayer P_ERR, detect_prob, lod95). It receives
simulation parameters in each request and returns real numpy/scipy
computation over THAT input. It holds no state and owns no cohort copy, so
the single source of truth stays in the TypeScript side
(src/lib/biosimSidecarClient.ts + tpl_biosim_trial template).

Honesty contract mirrors Recourse intake: every endpoint is a read-only,
whitelisted operation; a malformed payload is a 4xx with a structured
error, never a fabricated answer.

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 127.0.0.1 --port 8503
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from scipy import stats

app = FastAPI(title="Recourse BioSim sidecar", version="1.0.0")

PLATFORMS = ("illumina", "ont")
P_ERR = {"illumina": 1.33e-4, "ont": 1.31e-2}


# ======================= tumor / CAR-T layer =======================
@dataclass
class EngineParams:
    gens: int = 60
    growth: float = 1.30
    mu_driver: float = 1e-4
    driver_boost: float = 0.01
    f_cap: float = 1.10
    capacity: int = 200_000
    car_t_dose: float = 3e5
    kill_rate: float = 0.9
    kill_mult: float = 0.05
    kill_cap: float = 0.6
    effector_tau: float = 4.0
    t_start: int = 14


class BioSimEngine:
    """Faithful port of BioSimEngine v0.3 from bisim and abm/biosim_engine.py."""

    def __init__(self, p: EngineParams, seed: int = 0):
        self.p = p
        self.rng = np.random.default_rng(seed)
        self.mu_log_mean, self.mu_log_var = np.log(2e-5), 0.5

    def _mu(self) -> float:
        return float(np.exp(self.rng.normal(self.mu_log_mean, np.sqrt(self.mu_log_var))))

    def run_trial(self, dose: Optional[float] = None) -> dict[str, Any]:
        p, rng = self.p, self.rng
        # NOTE: original used `dose or p.car_t_dose`, which silently maps an
        # explicit dose=0 to the default. The explicit None check preserves it.
        if dose is None:
            dose = p.car_t_dose
        n, f, ag = 200, 1.0, 1.0
        mu_ag = self._mu()
        extinct_at, recurrent_at, nadir = None, None, None
        for g in range(p.gens):
            n = int(min(n * p.growth * f, p.capacity))
            if rng.random() < p.mu_driver * n:
                f = min(f * (1 + p.driver_boost), p.f_cap)
            nag = rng.poisson(mu_ag * n)
            if nag:
                ag = max(0.0, ag - nag / n)
            if g >= p.t_start:
                eff = dose * np.exp(-(g - p.t_start) / p.effector_tau)
                k = min(p.kill_cap, p.kill_rate * p.kill_mult * eff / max(n, 1))
                n_surv = n * (1 - ag * k)
                ag = ag * (1 - k) / (1 - ag * k + 1e-12)
                n = max(0, int(n_surv))
                if nadir is None:
                    nadir = n
            if n < 10:
                extinct_at = g
                break
            if (
                recurrent_at is None
                and nadir is not None
                and g > p.t_start + 2
                and n > max(500, 3 * nadir)
            ):
                recurrent_at = g
        return {
            "final": n,
            "extinct": extinct_at,
            "recurred": recurrent_at,
            "agneg": float(1 - ag),
            "mu": float(mu_ag),
            "nadir": nadir,
            "dose": float(dose),
        }

    def monte_carlo(self, n_trials: int, dose: Optional[float] = None) -> list[dict[str, Any]]:
        return [self.run_trial(dose) for _ in range(n_trials)]


# ======================= sequencing layer =======================
def detect_prob(n: int, vaf: float, platform: str) -> float:
    """Port of SeqLayer.detect_prob: binomial tail above the error threshold."""
    p_err = P_ERR[platform]
    thr = max(3.0, n * p_err + 4 * np.sqrt(n * p_err))
    return float(1 - stats.binom.cdf(int(thr), n, min(vaf + p_err, 1.0)))


def lod95(platform: str, n: int) -> float:
    """Port of SeqLayer.lod95: lowest VAF with >=95% detection probability."""
    vafs = np.logspace(-4, -0.6, 200)
    for v in vafs:
        if detect_prob(n, float(v), platform) >= 0.95:
            return float(v)
    return float("nan")


# ======================= request models =======================
class TrialReq(BaseModel):
    gens: int = 60
    growth: float = 1.30
    mu_driver: float = 1e-4
    driver_boost: float = 0.01
    car_t_dose: float = 3e5
    kill_rate: float = 0.9
    t_start: int = 14
    seed: int = 0


class MonteCarloReq(BaseModel):
    n_trials: int = Field(default=200, ge=1, le=5000)
    dose: float = Field(default=3e5, ge=0.0, le=1e9)
    seed: int = 0
    gens: int = 60
    growth: float = 1.30
    mu_driver: float = 1e-4
    driver_boost: float = 0.01
    kill_rate: float = 0.9
    t_start: int = 14


class SequenceReq(BaseModel):
    agneg: float = Field(ge=0.0, le=1.0)
    depth: int = Field(default=2000, ge=1, le=10_000_000)
    platform: str = "illumina"
    seed: Optional[int] = None


class Lod95Req(BaseModel):
    platform: str = "illumina"
    depth: int = Field(default=2000, ge=1, le=10_000_000)


def _engine_from_trial(r: TrialReq | MonteCarloReq) -> EngineParams:
    if r.gens < 1 or r.gens > 2000:
        raise HTTPException(status_code=400, detail="gens must be in [1, 2000]")
    if not (0.5 <= r.growth <= 5.0):
        raise HTTPException(status_code=400, detail="growth must be in [0.5, 5.0]")
    if not (0.0 <= r.mu_driver <= 0.01):
        raise HTTPException(status_code=400, detail="mu_driver must be in [0.0, 0.01]")
    if not (0.0 <= r.driver_boost <= 1.0):
        raise HTTPException(status_code=400, detail="driver_boost must be in [0.0, 1.0]")
    if not (0.0 <= r.kill_rate <= 2.0):
        raise HTTPException(status_code=400, detail="kill_rate must be in [0.0, 2.0]")
    if not (0 <= r.t_start <= r.gens):
        raise HTTPException(status_code=400, detail="t_start must be in [0, gens]")
    car_t_dose = getattr(r, "car_t_dose", None)
    if car_t_dose is None:
        car_t_dose = getattr(r, "dose", 3e5)
    if not (0.0 <= car_t_dose <= 1e9):
        raise HTTPException(status_code=400, detail="dose must be in [0.0, 1e9]")
    return EngineParams(
        gens=r.gens,
        growth=r.growth,
        mu_driver=r.mu_driver,
        driver_boost=r.driver_boost,
        car_t_dose=float(car_t_dose),
        kill_rate=r.kill_rate,
        t_start=r.t_start,
    )


def _check_platform(platform: str) -> str:
    p = (platform or "").strip().lower()
    if p not in P_ERR:
        raise HTTPException(status_code=400, detail=f"platform must be one of {list(P_ERR)}")
    return p


# ======================= routes =======================
@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "biosim", "numpy": np.__version__}


@app.post("/biosim/trial")
def trial(r: TrialReq) -> dict[str, Any]:
    """Single tumor/CAR-T trial with the supplied parameters and seed."""
    p = _engine_from_trial(r)
    eng = BioSimEngine(p, seed=r.seed)
    out = eng.run_trial()
    return {"ok": True, "seed": r.seed, "trial": out}


@app.post("/biosim/montecarlo")
def montecarlo(r: MonteCarloReq) -> dict[str, Any]:
    """Monte Carlo over n_trials with common engine params; honest summary stats."""
    p = _engine_from_trial(r)
    eng = BioSimEngine(p, seed=r.seed)
    trials = eng.monte_carlo(r.n_trials, dose=r.dose)
    cured = np.array([t["extinct"] is not None for t in trials], dtype=float)
    recurred = np.array([t["recurred"] is not None for t in trials], dtype=float)
    finals = np.array([t["final"] for t in trials], dtype=float)
    return {
        "ok": True,
        "seed": r.seed,
        "dose": r.dose,
        "n_trials": r.n_trials,
        "cure_rate": float(cured.mean()),
        "recurrence_rate": float(recurred.mean()),
        "mean_final_burden": float(finals.mean()),
        "trials": trials if r.n_trials <= 500 else trials[:500],
        "truncated": r.n_trials > 500,
    }


@app.post("/biosim/sequence")
def sequence(r: SequenceReq) -> dict[str, Any]:
    """Would sequencing catch this trial's escape clone at sampling?

    vaf = agneg / 2 (diploid assumption, as in SeqLayer.sequence).
    """
    platform = _check_platform(r.platform)
    vaf = float(r.agneg) / 2.0
    p_detect = detect_prob(r.depth, vaf, platform)
    draw = np.random.default_rng(r.seed).random() if r.seed is not None else float(np.random.random())
    return {
        "ok": True,
        "vaf": vaf,
        "depth": r.depth,
        "platform": platform,
        "p_detect": p_detect,
        "detected": bool(draw < p_detect),
    }


@app.post("/biosim/lod95")
def lod95_route(r: Lod95Req) -> dict[str, Any]:
    """Limit of detection (95%) for a platform at a given depth."""
    platform = _check_platform(r.platform)
    v = lod95(platform, r.depth)
    if np.isnan(v):
        return {
            "ok": True,
            "platform": platform,
            "depth": r.depth,
            "lod95_vaf": None,
            "reached": False,
            "note": "95% detection not reached within VAF scan range [1e-4, 10^-0.6]",
        }
    return {"ok": True, "platform": platform, "depth": r.depth, "lod95_vaf": v, "reached": True}

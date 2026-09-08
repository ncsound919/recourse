"""
Recourse Trend Engine sidecar (Python analysis layer).

Implements the blueprint's Analysis stack with real libraries:
  - statsmodels STL decomposition (trend/seasonal/remainder)
  - ruptures PELT changepoint detection
  - scipy/numpy lagged cross-correlation, momentum, anomaly bands

Stateless compute: Recourse sends series data in each request, the sidecar
returns real library computation over THAT input. It holds no state, owns no
copy of the ledger, and never fabricates output.

Honesty contract mirrors the other Recourse sidecars: every endpoint is a
read-only, whitelisted operation; malformed payload -> 4xx with a structured
error; a computation that cannot run (insufficient points, degenerate input)
is reported with ok:false and a reason — never a made-up number.

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 127.0.0.1 --port 8800
"""

from __future__ import annotations

from typing import Any, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Recourse Trend Engine sidecar", version="1.0.0")

try:
    from statsmodels.tsa.seasonal import STL
    HAS_STL = True
except Exception:  # pragma: no cover - environment fallback
    HAS_STL = False

try:
    import ruptures as rpt
    HAS_RUPTURES = True
except Exception:  # pragma: no cover - environment fallback
    HAS_RUPTURES = False


# ======================= request/response models =======================

class SeriesPoint(BaseModel):
    t: int
    value: float


class SeriesInput(BaseModel):
    id: str = Field(default="s1")
    name: str = Field(default="series")
    domain: str = Field(default="unknown")
    points: List[SeriesPoint] = Field(..., min_length=4)


class DecomposeRequest(BaseModel):
    series: SeriesInput
    period: int = Field(default=7, ge=2, le=365)
    robust: bool = False


class BurstRequest(BaseModel):
    series: SeriesInput
    gamma: float = Field(default=2.0, ge=0.1, le=10.0)
    persistence: int = Field(default=2, ge=1, le=20)


class ChangepointRequest(BaseModel):
    series: SeriesInput
    penalty: float = Field(default=5.0, ge=0.1, le=100.0)
    min_segment: int = Field(default=3, ge=2, le=100)


class CrossCorrRequest(BaseModel):
    a: SeriesInput
    b: SeriesInput
    max_lag: int = Field(default=7, ge=1, le=30)


class ScanRequest(BaseModel):
    series: List[SeriesInput] = Field(..., min_length=1, max_length=64)


# ======================= core algorithms =======================

def _values(points: List[SeriesPoint]) -> np.ndarray:
    return np.array([p.value for p in points], dtype=float)


def _times(points: List[SeriesPoint]) -> np.ndarray:
    return np.array([p.t for p in points], dtype=int)


def stl_decompose(values: np.ndarray, period: int, robust: bool) -> dict[str, Any]:
    """Real statsmodels STL decomposition. Raises on degenerate input."""
    n = len(values)
    if not HAS_STL:
        raise RuntimeError("statsmodels STL unavailable")
    if n < 2 * period:
        raise ValueError(f"need >= 2*period points for STL (have {n}, period {period})")
    stl = STL(values, period=period, robust=robust)
    res = stl.fit()
    return {
        "trend": [float(x) for x in res.trend],
        "seasonal": [float(x) for x in res.seasonal],
        "remainder": [float(x) for x in res.resid],
        "period": period,
    }


def changepoints(values: np.ndarray, penalty: float, min_segment: int) -> dict[str, Any]:
    """Real ruptures PELT changepoint detection. Falls back to a scipy
    CUSUM scan when ruptures is not installed (labeled method)."""
    n = len(values)
    if n < 4:
        raise ValueError("need >= 4 points for changepoint detection")
    if HAS_RUPTURES:
        algo = rpt.Pelt(model="rbf", min_size=min_segment).fit(values.reshape(-1, 1))
        bkps = algo.predict(pen=penalty)
        # ruptures returns end-boundaries; last is always n.
        return {
            "method": "ruptures.Pelt(rbf)",
            "changepoints": [int(b) for b in bkps if b < n],
            "library": "ruptures",
        }
    # CUSUM fallback: running sum of deviations; peaks mark regime shifts.
    mean = values.mean()
    cusum = np.cumsum(values - mean)
    idx = int(np.argmax(np.abs(cusum)))
    return {
        "method": "scipy CUSUM fallback (ruptures not installed)",
        "changepoints": [idx],
        "library": "scipy",
    }


def burst_automaton(values: np.ndarray, times: np.ndarray, gamma: float, persistence: int) -> list[dict[str, Any]]:
    """Two-state Kleinberg-style burst detection over z-scored volume."""
    mean = float(values.mean())
    sd = float(values.std())
    if sd == 0:
        return []
    bursts: list[dict[str, Any]] = []
    in_burst = False
    start_i = 0
    peak = 0.0
    peak_t = int(times[0])
    below = 0
    for i, v in enumerate(values):
        z = (v - mean) / sd
        if z >= gamma:
            below = 0
            if not in_burst:
                in_burst = True
                start_i = i
                peak = z
                peak_t = int(times[i])
            elif z > peak:
                peak = z
                peak_t = int(times[i])
        elif in_burst:
            below += 1
            if below >= persistence:
                in_burst = False
                bursts.append({
                    "start": int(times[start_i]),
                    "end": int(times[i]),
                    "strength": round(min(1.0, peak / (gamma * 3)), 4),
                    "peak_t": peak_t,
                })
                below = 0
    if in_burst:
        bursts.append({
            "start": int(times[start_i]),
            "end": int(times[-1]),
            "strength": round(min(1.0, peak / (gamma * 3)), 4),
            "peak_t": peak_t,
        })
    return bursts


def anomaly_bands(values: np.ndarray, times: np.ndarray, period: int, sigma: float) -> list[dict[str, Any]]:
    """±σ bands on the STL remainder (or simple detrend remainder when STL
    is unavailable or the series is too short for a seasonal fit)."""
    n = len(values)
    if HAS_STL and n >= 2 * period:
        dec = stl_decompose(values, period, robust=False)
        remainder = np.array(dec["remainder"])
    else:
        k = max(2, period // 2)
        trend = np.convolve(values, np.ones(k) / k, mode="same")
        remainder = values - trend
    rem_sd = float(remainder.std())
    if rem_sd == 0:
        return []
    anomalies: list[dict[str, Any]] = []
    for i, (v, r, t) in enumerate(zip(values, remainder, times)):
        z = abs(r) / rem_sd
        if z >= sigma:
            anomalies.append({
                "t": int(t),
                "type": "spike" if r > 0 else "drop",
                "score": round(min(3.0, z), 3),
                "value": float(v),
                "remainder": float(r),
                "sigma": sigma,
            })
    return anomalies


def lagged_crosscorr(a: np.ndarray, b: np.ndarray, max_lag: int) -> dict[str, Any]:
    """Lagged Pearson cross-correlation: best lag (b leads a when lag>0)."""
    best = {"lag": 0, "corr": 0.0}
    n = min(len(a), len(b))
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            x = a[lag:n]
            y = b[0 : n - lag]
        else:
            x = a[0 : n + lag]
            y = b[-lag:n]
        if len(x) < 3:
            continue
        xm, ym = x.mean(), y.mean()
        sx, sy = x.std(), y.std()
        if sx == 0 or sy == 0:
            continue
        r = float(((x - xm) * (y - ym)).mean() / (sx * sy))
        if abs(r) >= abs(best["corr"]):
            best = {"lag": lag, "corr": r}
    return {
        "best_lag": best["lag"],
        "correlation": round(best["corr"], 4),
        "significant": abs(best["corr"]) >= 0.5,
    }


def momentum_of(values: np.ndarray, period: int) -> dict[str, Any]:
    n = len(values)
    last = float(values[-1])
    prev = float(values[-2]) if n >= 2 else last
    k = max(2, period // 2)
    trend = np.convolve(values, np.ones(k) / k, mode="same")
    tail = trend[-4:]
    accel = float(tail[-1] - tail[0]) / (float(tail.std()) if tail.std() else 1.0)
    return {
        "last_value": round(last, 3),
        "prev_value": round(prev, 3),
        "wow_delta": round(last - prev, 3),
        "z_acceleration": round(max(-3.0, min(3.0, accel)), 3),
    }


# ======================= routes =======================

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "recourse-trend-engine",
        "version": app.version,
        "statsmodels": HAS_STL,
        "ruptures": HAS_RUPTURES,
    }


@app.post("/trend/decompose")
def trend_decompose(req: DecomposeRequest) -> dict[str, Any]:
    values = _values(req.series.points)
    try:
        return {"ok": True, "series_id": req.series.id, **stl_decompose(values, req.period, req.robust)}
    except (ValueError, RuntimeError) as e:
        return {"ok": False, "series_id": req.series.id, "error": str(e)}


@app.post("/trend/burst")
def trend_burst(req: BurstRequest) -> dict[str, Any]:
    values = _values(req.series.points)
    times = _times(req.series.points)
    return {
        "ok": True,
        "series_id": req.series.id,
        "bursts": burst_automaton(values, times, req.gamma, req.persistence),
    }


@app.post("/trend/changepoint")
def trend_changepoint(req: ChangepointRequest) -> dict[str, Any]:
    values = _values(req.series.points)
    try:
        return {"ok": True, "series_id": req.series.id, **changepoints(values, req.penalty, req.min_segment)}
    except ValueError as e:
        return {"ok": False, "series_id": req.series.id, "error": str(e)}


@app.post("/trend/anomaly")
def trend_anomaly(req: DecomposeRequest) -> dict[str, Any]:
    values = _values(req.series.points)
    times = _times(req.series.points)
    sigma = 2.0
    return {
        "ok": True,
        "series_id": req.series.id,
        "anomalies": anomaly_bands(values, times, req.period, sigma),
    }


@app.post("/trend/crosscorr")
def trend_crosscorr(req: CrossCorrRequest) -> dict[str, Any]:
    a = _values(req.a.points)
    b = _values(req.b.points)
    return {
        "ok": True,
        "a": req.a.id,
        "b": req.b.id,
        **lagged_crosscorr(a, b, req.max_lag),
    }


@app.post("/trend/momentum")
def trend_momentum(req: SeriesInput) -> dict[str, Any]:
    values = _values(req.points)
    period = max(2, len(values) // 4)
    return {
        "ok": True,
        "series_id": req.id,
        **momentum_of(values, period),
    }


@app.post("/trend/scan")
def trend_scan(req: ScanRequest) -> dict[str, Any]:
    """Full multi-series scan: decomposition, bursts, anomalies, momentum,
    cross-correlations for every significant pair. Mirrors the TS engine."""
    period = 7
    out_anomalies: list[dict[str, Any]] = []
    out_bursts: list[dict[str, Any]] = []
    out_momentum: list[dict[str, Any]] = []
    out_cross: list[dict[str, Any]] = []
    per_series: dict[str, dict[str, Any]] = {}

    for s in req.series:
        values = _values(s.points)
        times = _times(s.points)
        anomalies = anomaly_bands(values, times, period, 2.0)
        bursts = burst_automaton(values, times, 2.0, 2)
        for a in anomalies:
            out_anomalies.append({"series_id": s.id, **a})
        for b in bursts:
            out_bursts.append({"series_id": s.id, **b})
        out_momentum.append({"series_id": s.id, **momentum_of(values, period)})
        per_series[s.id] = {"name": s.name, "domain": s.domain, "values": values}

    ids = list(per_series.keys())
    for i in range(len(ids)):
        for j in range(len(ids)):
            if i == j:
                continue
            x = lagged_crosscorr(per_series[ids[i]]["values"], per_series[ids[j]]["values"], 5)
            if x["significant"]:
                out_cross.append({"a": ids[i], "b": ids[j], **x})

    return {
        "ok": True,
        "anomalies": out_anomalies,
        "bursts": out_bursts,
        "momentum": out_momentum,
        "cross_domain": out_cross,
        "libraries": {"statsmodels": HAS_STL, "ruptures": HAS_RUPTURES},
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8800)
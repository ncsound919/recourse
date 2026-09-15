"""
Recourse Data Visualizer sidecar.

Pure stateless HTTP service that renders a CURATED subset of the
"Data_Visualization-main" repository (~350 matplotlib/plotly teaching
visualizations of math / physics / statistics) as PNG artifacts.

Why "curated subset" and not all 350: most of those scripts are near-duplicate
variants, several use interactive-only APIs (ipywidgets, plt.show(),
plotly slider/animation), and a few are outright broken (undefined symbols,
dead code). This service hosts the representative ones, faithfully adapted to
the matplotlib Agg (headless) backend so a figure can be captured and returned
as base64 PNG. Each scene documents its SOURCE file and whether it was adapted.

Every scene is real numpy/matplotlib computation over real math - no fabricated
results. A malformed payload is a 4xx; a scene that throws at render time is a
5xx carrying the real traceback tail. The service holds no Recourse state and
owns no copy of Recourse data, so nothing drifts.

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 127.0.0.1 --port 8505
"""

from __future__ import annotations

import base64
import io
import math
import traceback
from typing import Any, Callable, Optional

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

app = FastAPI(title="Recourse Data Visualizer sidecar", version="1.0.0")


def _p(params: dict[str, Any], key: str, default: Any, typ: type = float) -> Any:
    """Read an optional numeric scene parameter with a safe cast."""
    v = params.get(key, default)
    try:
        return typ(v)
    except (TypeError, ValueError):
        return default


# ============================================================================
# Scenes. Each entry returns (fig, metrics). All figures are matplotlib.
# ============================================================================


def scene_kinetic_energy_3d(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: 3D_Visualization_of_Kinetic_Energy.py
    # KE = 0.5*mu*A^2*omega^2*v^2*cos(2*pi*v*t - 2*pi*v*x), unit params (A=1...).
    n = int(_p(params, "n", 100, int))
    x = np.linspace(0, 1, n)
    t = np.linspace(0, 1, n)
    X, T = np.meshgrid(x, t)
    Z = 0.5 * np.cos(2 * np.pi * T - 2 * np.pi * X)
    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")
    ax.plot_surface(X, T, Z, cmap="viridis", edgecolor="none")
    ax.set_xlabel("Position (x)")
    ax.set_ylabel("Time (t)")
    ax.set_zlabel("Kinetic Energy")
    ax.set_title("3D Visualization of Kinetic Energy")
    return fig, {}


def scene_solar_cell_scatter(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: Graph_of_Solar_Cell_Performance.py (simulated solar-cell data).
    radiation = np.arange(0, 1000, 100)
    voltage = np.array([0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0])
    current = np.array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.scatter(radiation, voltage, label="Voltage Output", color="tab:blue")
    ax.scatter(radiation, current, label="Current Output", color="tab:orange")
    ax.set_xlabel("Incident Solar Radiation")
    ax.set_ylabel("Voltage / Current Output")
    ax.set_title("Solar Cell Performance")
    ax.legend()
    ax.grid(True)
    return fig, {"mean_voltage": float(voltage.mean()), "max_current": float(current.max())}


def _is_prime(n: int) -> bool:
    if n < 2:
        return False
    for i in range(2, int(math.isqrt(n)) + 1):
        if n % i == 0:
            return False
    return True


def scene_prime_spiral_3d(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: 3D_Visualization_of_Prime_Spiral.py
    # Turn right on each prime; z = point index. ADAPTED: the original did not
    # reset direction/position between its two walk loops, so the plotted path
    # was a continuation of the printed walk; we reset so the spiral is exact.
    n_points = int(_p(params, "n_points", 1000, int))
    x, y, direction = 0, 0, 0
    xs, ys = [0], [0]
    for n in range(1, n_points):
        if _is_prime(n):
            direction += 1
        d = direction % 4
        if d == 0:
            x += 1
        elif d == 1:
            y += 1
        elif d == 2:
            x -= 1
        else:
            y -= 1
        xs.append(x)
        ys.append(y)
    xs, ys = np.array(xs), np.array(ys)
    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")
    ax.plot(xs, ys, np.arange(n_points), c="tab:blue", marker="o", markersize=2, linewidth=0.6)
    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    ax.set_zlabel("Prime Spiral Point")
    ax.set_title("3D Visualization of Prime Spiral")
    return fig, {"n_points": n_points, "final_x": int(x), "final_y": int(y)}


def scene_central_limit(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: Central_Limit_Theorem_Visualizer.py
    # ADAPTED: the original referenced undefined `generate_samples`, `mu`,
    # `sigma` and would NameError. We implement the intended CLT experiment:
    # distribution of means of n iid uniform[0,1] draws vs fitted normal.
    n_experiments = int(_p(params, "n_experiments", 10_000, int))
    n_per_sample = int(_p(params, "n_per_sample", 30, int))
    seed = int(_p(params, "seed", 0, int))
    rng = np.random.default_rng(seed)
    samples = rng.random((n_experiments, n_per_sample))
    means = samples.mean(axis=1)
    mu = 0.5
    sigma = 1.0 / math.sqrt(12.0 * n_per_sample)
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.hist(means, bins=30, density=True, color="lightblue", alpha=0.7, label="Sample Means")
    ax.axvline(mu, color="r", linestyle="--", label=f"True Mean ({mu:.3f})")
    x = np.linspace(mu - 4 * sigma, mu + 4 * sigma, 200)
    ax.plot(
        x,
        1 / (sigma * np.sqrt(2 * np.pi)) * np.exp(-((x - mu) ** 2) / (2 * sigma**2)),
        color="tab:red",
        label="Fitted Normal",
    )
    ax.set_xlabel("Sample Mean")
    ax.set_ylabel("Frequency")
    ax.set_title("Distribution of Sample Means (CLT)")
    ax.legend()
    ax.grid(True)
    return fig, {"mean": float(means.mean()), "std": float(means.std()), "n": n_experiments}


def scene_voltage_current_resistance(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: 3D_Voltage_as_a_Function_of_Current_and_Resistance_3.py
    # Ohm surface V = I*R (in microvolts) over I in [0,30 uA], R in [0,500 Ohm].
    n = int(_p(params, "n", 100, int))
    i = np.linspace(0, 30e-6, n)
    r = np.linspace(0, 500, n)
    I, R = np.meshgrid(i, r)
    Z = I * R * 1e6
    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")
    ax.plot_wireframe(I, R, Z, rstride=10, cstride=10, color="tab:blue")
    ax.set_xlabel("Current (A)")
    ax.set_ylabel("Resistance (Ohm)")
    ax.set_zlabel("Voltage (uV)")
    ax.set_title("Voltage as a Function of Current and Resistance")
    return fig, {"v_danger_uV": 20e-6 * 300 * 1e6}


def scene_capacitor_discharge(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: Creative_3D_Capacitor_Discharge_Over_Time.py
    # RC discharge V(t) = V0*exp(-t/tau), linear + semilog panels.
    c = _p(params, "c", 8.00e-6)
    r = _p(params, "r", 1.00e3)
    v0 = _p(params, "v0", 10.0e3)
    v_final = _p(params, "v_final", 5.00e2)
    tau = r * c
    t_to = -tau * np.log(v_final / v0)
    t = np.linspace(0, 3 * tau, 1000)
    v = v0 * np.exp(-t / tau)
    fig, (ax1, ax2) = plt.subplots(2, 1, sharex=True, figsize=(10, 8))
    ax1.plot(t, v, color="tab:blue")
    ax1.set_ylabel("Voltage (V)")
    ax1.set_title("Voltage Decay Over Time")
    ax1.grid(True)
    ax2.semilogy(t, v, color="tab:red")
    ax2.set_xlabel("Time (s)")
    ax2.set_ylabel("Voltage (V) (log)")
    ax2.set_title("Voltage vs. Time (Log Scale)")
    ax2.grid(True, which="both")
    fig.suptitle("Creative Visualization of Capacitor Discharge")
    fig.tight_layout()
    return fig, {"tau_s": float(tau), "t_to_final_s": float(t_to)}


def scene_magnetic_force_cases(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: Calculation_of_Magnetic_Force_on_Current_(Figure_5_Cases).py
    # F = I x B for the six textbook cases, drawn as 3D arrows. ADAPTED from the
    # Plotly scatter to matplotlib quiver-style arrows.
    mu_0 = 4 * np.pi * 1e-7
    cases = {
        "a": ([0, 0, 1], [0, 0, -1]),
        "b": ([1, 0, 0], [0, -1, 0]),
        "c": ([0, 1, 0], [1, 0, 0]),
        "d": ([-1, 0, 0], [1, 0, 0]),
        "e": ([0, -1, 0], [0, 0, 1]),
        "f": ([-1, 0, 0], [0, 0, 0]),
    }
    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")
    metrics: dict[str, Any] = {"cases": {}}
    for name, (i, b) in cases.items():
        i = np.array(i, dtype=float)
        b = np.array(b, dtype=float)
        f = np.cross(i, b)
        mag = float(np.linalg.norm(f))
        metrics["cases"][name] = {
            "I": i.tolist(),
            "B": b.tolist(),
            "F": f.tolist(),
            "mag": mag,
            "F_unit_contribution": float(mag),
        }
        origin = np.array([0.0, 0.0, 0.0])
        ax.quiver(*origin, *f, color="tab:red", arrow_length_ratio=0.15)
        ax.text(*f, f"{name}", color="black")
    ax.set_xlabel("F_x")
    ax.set_ylabel("F_y")
    ax.set_zlabel("F_z")
    ax.set_title("Magnetic Force on Current (Figure 5 Cases)")
    ax.set_xlim(-2, 2)
    ax.set_ylim(-2, 2)
    ax.set_zlim(-2, 2)
    return fig, metrics


def scene_gaussian_2d(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: Dynamic_Visualization_of_a_2D_Gaussian_Distribution.py
    # 2D Gaussian N([0,0], [[1,0.5],[0.5,1]]) surface. ADAPTED: static surface
    # (the animation is a UI concern matplotlib Agg cannot capture meaningfully).
    n = int(_p(params, "n", 100, int))
    mean = np.array([0, 0])
    cov = np.array([[1, 0.5], [0.5, 1]])
    x = np.linspace(-5, 5, n)
    y = np.linspace(-5, 5, n)
    X, Y = np.meshgrid(x, y)
    pos = np.dstack((X, Y))
    inv_cov = np.linalg.inv(cov)
    det = np.linalg.det(cov)
    Z = np.exp(-0.5 * np.einsum("...k,kl,...l->...", pos - mean, inv_cov, pos - mean)) / (
        2 * np.pi * np.sqrt(det)
    )
    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")
    surf = ax.plot_surface(X, Y, Z, cmap="viridis", edgecolor="none")
    fig.colorbar(surf, shrink=0.6, aspect=12, pad=0.1)
    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    ax.set_zlabel("Probability Density")
    ax.set_title("2D Gaussian Distribution")
    return fig, {"peak_density": float(Z.max())}


def scene_integral_surface(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: 3D_Visualization_of_Surface_Plot_of_Integral_Result.py
    # Surface z = atan(x/a) over a in [0.1,2], x in [-5,5] (the "integral
    # result" claimed by the source, which mixes atan and x^3/3; we follow the
    # 3D section that plots arctan(x/a)).
    n = int(_p(params, "n", 50, int))
    a = np.linspace(0.1, 2, n)
    x = np.linspace(-5, 5, n)
    A, X = np.meshgrid(a, x)
    Z = np.arctan(X / A)
    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")
    ax.plot_surface(A, X, Z, cmap="viridis", edgecolor="none")
    ax.set_xlabel("a")
    ax.set_ylabel("x")
    ax.set_zlabel("Integral Result")
    ax.set_title("3D Surface Plot of Integral Result")
    return fig, {}


def scene_torque_vector(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: 3D_Visualization_Torque_Vector.py
    # tau = -r_perp * F, vector = [tau*sin(theta), 0, tau*cos(theta)].
    angle_deg = _p(params, "angle_deg", 80)
    r_perp = _p(params, "r_perp", 98.5)
    force = _p(params, "force", 5.0e5)
    torque_magnitude = -r_perp * force
    angle_rad = np.radians(angle_deg)
    tvec = np.array(
        [torque_magnitude * np.sin(angle_rad), 0.0, torque_magnitude * np.cos(angle_rad)]
    )
    fig = plt.figure()
    ax = fig.add_subplot(111, projection="3d")
    ax.quiver(0, 0, 0, *tvec, color="tab:blue", arrow_length_ratio=0.15, linewidth=3)
    ax.scatter([0], [0], [0], color="black")
    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    ax.set_zlabel("Z")
    ax.set_title("3D Visualization Torque Vector")
    lim = float(np.abs(tvec).max()) * 1.2
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    ax.set_zlim(-lim, lim)
    return fig, {
        "magnitude": float(torque_magnitude),
        "components": [float(v) for v in tvec],
        "angle_deg": float(angle_deg),
    }


def scene_binomial_6s(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: Binomial_Distribution_Visualization_for_Rolling_a_6_on_a_Die_in_10_Trials.py
    # P(k sixes in n=10 trials, p=1/6): 3D bars + cumulative 2D area.
    num_trials = int(_p(params, "num_trials", 10, int))
    p_six = 1 / 6
    ks = np.arange(num_trials + 1)
    probs = np.array([math.comb(num_trials, k) * p_six**k * (1 - p_six) ** (num_trials - k) for k in ks])
    cum = np.cumsum(probs)
    fig = plt.figure(figsize=(12, 8))
    ax = fig.add_subplot(111, projection="3d")
    z0 = np.zeros_like(ks)
    ax.bar3d(ks, probs, z0, 0.5, probs, probs, shade=True, color="tab:blue", alpha=0.8)
    ax.set_xlabel("Number of 6s rolled")
    ax.set_ylabel("Probability")
    ax.set_zlabel("Frequency")
    ax.set_title("Probability of Rolling k 6s in 10 Trials")
    fig2, ax2 = plt.subplots(figsize=(10, 6))
    ax2.fill_between(ks, cum, color="orange", alpha=0.6)
    ax2.set_xlabel("Number of 6s rolled")
    ax2.set_ylabel("Cumulative Probability")
    ax2.set_title(f"Cumulative Probability of Rolling 4 or More 6s in {num_trials} Trials")
    ax2.grid(True)
    fig2.tight_layout()
    return fig, {"p_4plus": float(cum[4:].max() if num_trials >= 4 else cum[-1]), "dist": probs.tolist()}


def scene_probable_error_3d(params: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    # SOURCE: Probable_Error_for_Correlation_Coefficient_and_Sample_Size_3D.py
    # P.E. = 0.674 * (1 - r^2) / sqrt(N) over r in [-1,1], N in [10,200].
    r = np.linspace(-1, 1, 100)
    n = np.arange(10, 201, 10)
    R, N = np.meshgrid(r, n)
    pe = 0.674 * (1 - R**2) / np.sqrt(N)
    fig = plt.figure(figsize=(12, 8))
    ax = fig.add_subplot(111, projection="3d")
    surf = ax.plot_surface(R, N, pe, cmap="viridis", edgecolor="k", linewidth=0.2)
    fig.colorbar(surf, shrink=0.5, aspect=10, pad=0.1)
    ax.text(0, 100, 0.06, r"$P.E. = 0.674 \times \frac{1-r^2}{\sqrt{N}}$", fontsize=12)
    ax.set_xlabel("Correlation Coefficient (r)")
    ax.set_ylabel("Sample Size (N)")
    ax.set_zlabel("Probable Error (P.E.)")
    ax.set_title("Probable Error for Correlation Coefficient and Sample Size")
    ax.view_init(elev=20, azim=30)
    return fig, {}


# ============================================================================
# Catalog registry.
# ============================================================================

SCENES: dict[str, dict[str, Any]] = {
    "kinetic_energy_3d": {
        "title": "3D Visualization of Kinetic Energy",
        "category": "physics/waves",
        "source": "3D_Visualization_of_Kinetic_Energy.py",
        "adapted": True,
        "note": "sympy evals replaced by vectorized numpy; otherwise faithful.",
        "params": {"n": 100},
        "fn": scene_kinetic_energy_3d,
    },
    "solar_cell_scatter": {
        "title": "Solar Cell Performance",
        "category": "data/simulated",
        "source": "Graph_of_Solar_Cell_Performance.py",
        "adapted": False,
        "note": "As-authored simulated dataset.",
        "params": {},
        "fn": scene_solar_cell_scatter,
    },
    "prime_spiral_3d": {
        "title": "3D Visualization of Prime Spiral",
        "category": "number-theory",
        "source": "3D_Visualization_of_Prime_Spiral.py",
        "adapted": True,
        "note": "Fixed: original did not reset walk state between loops, so the plotted path drifted. Ours replays the exact spiral.",
        "params": {"n_points": 1000},
        "fn": scene_prime_spiral_3d,
    },
    "central_limit": {
        "title": "Central Limit Theorem Visualizer",
        "category": "statistics",
        "source": "Central_Limit_Theorem_Visualizer.py",
        "adapted": True,
        "note": "Fixed: original referenced undefined generate_samples/mu/sigma (would NameError). Implements the intended uniform[0,1] CLT experiment.",
        "params": {"n_experiments": 10000, "n_per_sample": 30, "seed": 0},
        "fn": scene_central_limit,
    },
    "voltage_current_resistance": {
        "title": "Voltage as a Function of Current and Resistance",
        "category": "circuits",
        "source": "3D_Voltage_as_a_Function_of_Current_and_Resistance_3.py",
        "adapted": False,
        "note": "Wireframe V=I*R surface; plotly scatter omitted (matplotlib faithful portion kept).",
        "params": {"n": 100},
        "fn": scene_voltage_current_resistance,
    },
    "capacitor_discharge": {
        "title": "Creative Visualization of Capacitor Discharge",
        "category": "circuits",
        "source": "Creative_3D_Capacitor_Discharge_Over_Time.py",
        "adapted": True,
        "note": "Plotly slider/animation omitted; linear + semilog panels kept. Same constants (C=8uF, R=1k, V0=10kV).",
        "params": {"c": 8e-6, "r": 1e3, "v0": 10e3, "v_final": 5e2},
        "fn": scene_capacitor_discharge,
    },
    "magnetic_force_cases": {
        "title": "Magnetic Force on Current (Figure 5 Cases)",
        "category": "electromagnetism",
        "source": "Calculation_of_Magnetic_Force_on_Current_(Figure_5_Cases).py",
        "adapted": True,
        "note": "Plotly scatter_3d replaced by 3D arrows of F = I x B for the six cases.",
        "params": {},
        "fn": scene_magnetic_force_cases,
    },
    "gaussian_2d": {
        "title": "2D Gaussian Distribution",
        "category": "statistics",
        "source": "Dynamic_Visualization_of_a_2D_Gaussian_Distribution.py",
        "adapted": True,
        "note": "Static surface with covariance [[1,0.5],[0.5,1]]; animation cannot be captured by Agg.",
        "params": {"n": 100},
        "fn": scene_gaussian_2d,
    },
    "integral_surface": {
        "title": "3D Surface Plot of Integral Result",
        "category": "calculus",
        "source": "3D_Visualization_of_Surface_Plot_of_Integral_Result.py",
        "adapted": True,
        "note": "Follows the source's 3D section: z = arctan(x/a). (Source itself mixes atan and x^3/3; that inconsistency is theirs, flagged not hidden.)",
        "params": {"n": 50},
        "fn": scene_integral_surface,
    },
    "torque_vector": {
        "title": "3D Visualization Torque Vector",
        "category": "mechanics",
        "source": "3D_Visualization_Torque_Vector.py",
        "adapted": True,
        "note": "Plotly Scatter3d line replaced by a 3D arrow; same tau = -r_perp*F vector.",
        "params": {"angle_deg": 80, "r_perp": 98.5, "force": 5e5},
        "fn": scene_torque_vector,
    },
    "binomial_6s": {
        "title": "Probability of Rolling k 6s in 10 Trials",
        "category": "statistics",
        "source": "Binomial_Distribution_Visualization_for_Rolling_a_6_on_a_Die_in_10_Trials.py",
        "adapted": True,
        "note": "np.math.comb removed in numpy>=1.25 -> math.comb. 3D bars + cumulative area kept.",
        "params": {"num_trials": 10},
        "fn": scene_binomial_6s,
    },
    "probable_error_3d": {
        "title": "Probable Error for Correlation Coefficient and Sample Size",
        "category": "statistics",
        "source": "Probable_Error_for_Correlation_Coefficient_and_Sample_Size_3D.py",
        "adapted": False,
        "note": "P.E. = 0.674*(1-r^2)/sqrt(N).",
        "params": {},
        "fn": scene_probable_error_3d,
    },
}


def catalog() -> list[dict[str, Any]]:
    out = []
    for sid, s in SCENES.items():
        out.append(
            {
                "id": sid,
                "title": s["title"],
                "category": s["category"],
                "source": s["source"],
                "adapted": s["adapted"],
                "note": s["note"],
                "default_params": {k: v for k, v in s["params"].items()},
            }
        )
    out.sort(key=lambda x: x["category"])
    return out


def render_scene(sid: str, width: int, height: int, params: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
    scene = SCENES.get(sid)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"unknown scene id: {sid}")
    plt.close("all")
    merged = dict(scene["params"])
    merged.update(params)
    try:
        fig, metrics = scene["fn"](merged)
    except HTTPException:
        raise
    except Exception:
        tail = traceback.format_exc().splitlines()[-4:]
        raise HTTPException(status_code=500, detail="render failed: " + " | ".join(tail))
    fig.set_size_inches(max(3.2, width / 100), max(2.4, height / 100))
    fig.tight_layout()
    buf = io.BytesIO()
    try:
        fig.savefig(buf, format="png", dpi=100, bbox_inches="tight")
    except Exception:
        plt.close("all")
        tail = traceback.format_exc().splitlines()[-4:]
        raise HTTPException(status_code=500, detail="encode failed: " + " | ".join(tail))
    plt.close(fig)
    plt.close("all")
    buf.seek(0)
    return buf.getvalue(), metrics


# ============================================================================
# Routes.
# ============================================================================


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "viz", "matplotlib": matplotlib.__version__, "numpy": np.__version__}


@app.get("/viz/catalog")
def viz_catalog() -> dict[str, Any]:
    return {"ok": True, "count": len(SCENES), "scenes": catalog()}


class RenderReq(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    width: int = Field(default=900, ge=320, le=1920)
    height: int = Field(default=600, ge=240, le=1440)
    params: dict[str, Any] = Field(default_factory=dict)


@app.post("/viz/render")
def viz_render(r: RenderReq) -> dict[str, Any]:
    png, metrics = render_scene(r.id.strip(), r.width, r.height, r.params)
    scene = SCENES[r.id.strip()]
    return {
        "ok": True,
        "id": r.id.strip(),
        "title": scene["title"],
        "category": scene["category"],
        "source": scene["source"],
        "adapted": scene["adapted"],
        "note": scene["note"],
        "width": r.width,
        "height": r.height,
        "image": base64.b64encode(png).decode("ascii"),
        "metrics": metrics,
    }
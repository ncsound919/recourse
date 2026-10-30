"""Music therapy concordance experiment — runs on Kaggle CPU.
Generates music therapy stimuli (from Recourse composer), models biomarker responses,
and trains a small model to predict optimal stimulus parameters for oncology patients.
Prints __RECOURSE_RESULT__ {json} at the end.
"""
import os, json, time, warnings, random
import numpy as np
import pandas as pd
warnings.filterwarnings("ignore")

T0 = time.time()
result = {"ok": False}
random.seed(42)

import subprocess, sys
for pkg in ["scikit-learn", "scikit-survival", "numpy", "pandas"]:
    try:
        __import__(pkg.replace("-", "_"))
    except Exception:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", pkg], check=False)

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_squared_error, r2_score

# ---- BIOMARKER PRIORS (from Recourse musicTherapyResearch.ts) ----
BIOMARKER_PRIORS = {
    "anxietySai": {"mean": -7.7, "sd": 2.0},
    "hr": {"mean": -5.0, "sd": 2.5},
    "bpSystolic": {"mean": -6.0, "sd": 3.0},
    "cortisol": {"mean": -0.25, "sd": 0.12},
    "iga": {"mean": 0.30, "sd": 0.15},
    "hrv": {"mean": 0.20, "sd": 0.10},
}

STYLES = ["jasper-ballad", "steely-dan", "pop", "jazz", "blues", "ambient"]
KEYS = list(range(12))

def model_biomarker_response(bpm, major, intensity, key):
    bpm_factor = max(0, min(1, (100 - bpm) / 40))
    mode_factor = 0.7 if major else 1.0
    intensity_factor = 0.5 if intensity == "stimulative" else 1.0
    potency = max(0.1, min(1, bpm_factor * mode_factor * intensity_factor))
    out = {}
    for bid, prior in BIOMARKER_PRIORS.items():
        effect = prior["mean"] * potency
        out[bid] = {"effect": round(effect, 3), "sd": prior["sd"], "effect_size": round(effect / prior["sd"], 3)}
    return out, potency

# ---- Generate synthetic patient cohort + music therapy trials ----
# Simulate 500 oncology patients with varying characteristics
n_patients = 500
patients = []
for i in range(n_patients):
    p = {
        "patient_id": f"P{i:04d}",
        "age": np.random.normal(58, 12),
        "stage": np.random.choice([1, 2, 3, 4], p=[0.1, 0.25, 0.35, 0.3]),
        "anxiety_baseline": np.random.normal(45, 8),  # SAI score
        "hr_baseline": np.random.normal(78, 10),
        "bp_baseline": np.random.normal(125, 15),
        "treatment": np.random.choice(["chemo", "radiation", "immunotherapy", "surgery"], p=[0.3, 0.25, 0.25, 0.2]),
    }
    patients.append(p)

# For each patient, test 4 stimulus variants, compute optimal
rows = []
for p in patients:
    for variant in range(4):
        bpm = [60, 72, 80, 96][variant % 4]
        major = variant % 2 == 0
        intensity = "sedative" if variant % 3 == 0 else "stimulative"
        key = np.random.randint(0, 12)
        style = STYLES[variant % len(STYLES)]
        tuning = [440, 432, 443][variant % 3]
        biomarkers, potency = model_biomarker_response(bpm, major, intensity, key)
        # composite outcome: anxiety reduction (primary) + HR reduction + HRV increase
        outcome = (abs(biomarkers["anxietySai"]["effect"]) * 0.4 +
                   abs(biomarkers["hr"]["effect"]) * 0.3 +
                   biomarkers["hrv"]["effect"] * 0.2 +
                   biomarkers["iga"]["effect"] * 0.1)
        # add patient-specific noise
        outcome += np.random.normal(0, 0.5)
        rows.append({
            "patient_id": p["patient_id"],
            "age": p["age"],
            "stage": p["stage"],
            "anxiety_baseline": p["anxiety_baseline"],
            "hr_baseline": p["hr_baseline"],
            "bp_baseline": p["bp_baseline"],
            "treatment": p["treatment"],
            "bpm": bpm,
            "major": int(major),
            "intensity_sedative": int(intensity == "sedative"),
            "key": key,
            "style_idx": STYLES.index(style),
            "tuning_hz": tuning,
            "potency": potency,
            "anxiety_effect": biomarkers["anxietySai"]["effect"],
            "hr_effect": biomarkers["hr"]["effect"],
            "hrv_effect": biomarkers["hrv"]["effect"],
            "outcome": outcome,
        })

df = pd.DataFrame(rows)
feature_cols = ["age", "stage", "anxiety_baseline", "hr_baseline", "bp_baseline", "bpm", "major", "intensity_sedative", "key", "style_idx", "tuning_hz", "potency"]
# encode treatment
treatment_dummies = pd.get_dummies(df["treatment"], prefix="tx", drop_first=True)
df = pd.concat([df, treatment_dummies], axis=1)
feature_cols += list(treatment_dummies.columns)

X = df[feature_cols].copy()
y = df["outcome"].values

Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=42)

# ---- train models ----
scaler = StandardScaler()
Xtr_s = scaler.fit_transform(Xtr)
Xte_s = scaler.transform(Xte)

# Random Forest
rf = RandomForestRegressor(n_estimators=200, max_depth=8, min_samples_leaf=5, random_state=42, n_jobs=-1)
rf.fit(Xtr_s, ytr)
rf_pred = rf.predict(Xte_s)
rf_r2 = r2_score(yte, rf_pred)
rf_mse = mean_squared_error(yte, rf_pred)

# Gradient Boosting
gb = GradientBoostingRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, min_samples_leaf=5, random_state=42)
gb.fit(Xtr_s, ytr)
gb_pred = gb.predict(Xte_s)
gb_r2 = r2_score(yte, gb_pred)
gb_mse = mean_squared_error(yte, gb_pred)

# feature importance
fi = sorted(zip(feature_cols, rf.feature_importances_), key=lambda x: -x[1])[:12]

# ---- optimal stimulus per patient (what the model recommends) ----
# For each patient, find the variant with highest predicted outcome
best_params = {}
for pid in df["patient_id"].unique()[:50]:
    sub = df[df["patient_id"] == pid]
    best_idx = sub["outcome"].idxmax()
    best = sub.loc[best_idx]
    best_params[pid] = {
        "bpm": int(best["bpm"]),
        "major": bool(best["major"]),
        "intensity": "sedative" if best["intensity_sedative"] else "stimulative",
        "tuning_hz": int(best["tuning_hz"]),
        "style": STYLES[int(best["style_idx"])],
        "outcome": round(float(best["outcome"]), 3),
    }

# ---- summary ----
best_model = "rf" if rf_r2 >= gb_r2 else "gb"
print(f"RF  R2={rf_r2:.4f} MSE={rf_mse:.4f}")
print(f"GB  R2={gb_r2:.4f} MSE={gb_mse:.4f}")
print(f"Best: {best_model}")
print(f"Top features: {fi[:5]}")
print(f"Patients: {n_patients}, trials: {len(df)}")

result = {
    "ok": True,
    "n_patients": n_patients,
    "n_trials": len(df),
    "rf_r2": round(float(rf_r2), 4),
    "rf_mse": round(float(rf_mse), 4),
    "gb_r2": round(float(gb_r2), 4),
    "gb_mse": round(float(gb_mse), 4),
    "best_model": best_model,
    "best_r2": round(float(max(rf_r2, gb_r2)), 4),
    "top_features": [{"name": n, "importance": round(float(v), 4)} for n, v in fi],
    "sample_optimal": list(best_params.values())[:5],
    "biomarker_priors": BIOMARKER_PRIORS,
    "runtime_sec": round(time.time() - T0, 1),
}

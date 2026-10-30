"""Oncology concordance training script — runs on Kaggle CPU.
Trains small survival models on SurvBoard (TCGA BRCA) or GBSG2 fallback.
Reports C-index. Prints __RECOURSE_RESULT__ {json} at the end.
"""
import os, json, time, glob, warnings
import numpy as np
import pandas as pd
warnings.filterwarnings("ignore")

T0 = time.time()
result = {"ok": False}

import subprocess, sys
for pkg in ["scikit-survival", "xgboost", "lifelines", "scikit-learn"]:
    try:
        __import__(pkg.replace("-", "_"))
    except Exception:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", pkg], check=False)

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sksurv.ensemble import RandomSurvivalForest
from sksurv.metrics import concordance_index_censored
from sksurv.util import Surv
from xgboost import XGBRegressor
import xgboost as xgb
from lifelines import CoxPHFitter
from lifelines.utils import concordance_index

def train_models(X, y_time, y_event, feat_cols):
    X = pd.DataFrame(X).apply(pd.to_numeric, errors="coerce")
    X = X.fillna(X.median())
    # drop columns that are all NaN
    X = X.dropna(axis=1, how="all")
    feat_cols = [c for c in feat_cols if c in X.columns]
    X = X[feat_cols]
    if len(X) < 60 or y_event.sum() < 10 or X.shape[1] < 2:
        return None
    Xtr, Xte, ttr, tte, etr, ete = train_test_split(X, y_time, y_event, test_size=0.25, stratify=y_event, random_state=42)
    scaler = StandardScaler()
    Xtr_p = scaler.fit_transform(Xtr)
    Xte_p = scaler.transform(Xte)
    ytr_surv = Surv.from_arrays(event=etr.astype(bool), time=ttr)
    yte_surv = Surv.from_arrays(event=ete.astype(bool), time=tte)

    cox_c = None
    try:
        cox_train = pd.DataFrame(Xtr_p, columns=feat_cols)
        cox_train["time"] = ttr; cox_train["event"] = etr
        cox_test = pd.DataFrame(Xte_p, columns=feat_cols)
        cox_test["time"] = tte; cox_test["event"] = ete
        cph = CoxPHFitter(penalizer=0.5)
        cph.fit(cox_train, duration_col="time", event_col="event")
        cox_pred = -cph.predict_partial_hazard(cox_test).values.flatten()
        cox_c = concordance_index(cox_test["time"], cox_pred, cox_test["event"])
    except Exception as e:
        print("  Cox failed:", str(e)[:60])

    rsf_c = None; fi = []
    try:
        rsf = RandomSurvivalForest(n_estimators=200, min_samples_split=10, min_samples_leaf=5, max_features="sqrt", n_jobs=-1, random_state=42)
        rsf.fit(Xtr_p, ytr_surv)
        rsf_pred = rsf.predict(Xte_p)
        rsf_c = concordance_index_censored(ete.astype(bool), tte, rsf_pred)[0]
        fi = sorted(zip(feat_cols, rsf.feature_importances_), key=lambda x: -x[1])[:8]
    except Exception as e:
        print("  RSF failed:", str(e)[:60])

    xgb_c = None
    try:
        y_xgb = np.where(etr.astype(bool), ttr, -ttr)
        dtrain = xgb.DMatrix(Xtr_p, label=y_xgb)
        dtest = xgb.DMatrix(Xte_p)
        params = {"objective": "survival:cox", "eval_metric": "cox-nloglik", "eta": 0.05, "max_depth": 4, "subsample": 0.8, "colsample_bytree": 0.8, "seed": 42}
        bst = xgb.train(params, dtrain, num_boost_round=300, verbose_eval=False)
        xgb_pred = bst.predict(dtest)
        xgb_c = concordance_index_censored(ete.astype(bool), tte, xgb_pred)[0]
    except Exception as e:
        print("  XGB failed:", str(e)[:60])

    vals = [(rsf_c or 0, "rsf"), (xgb_c or 0, "xgb"), (cox_c or 0, "cox")]
    best = max(vals)
    return {
        "n": int(len(X)), "n_events": int(y_event.sum()), "n_features": int(X.shape[1]),
        "cox_cindex": round(float(cox_c), 4) if cox_c is not None else None,
        "rsf_cindex": round(float(rsf_c), 4) if rsf_c is not None else None,
        "xgb_cindex": round(float(xgb_c), 4) if xgb_c is not None else None,
        "best_model": best[1], "best_cindex": round(float(best[0]), 4),
        "top_features": [{"name": n, "importance": round(float(v), 4)} for n, v in fi],
    }

all_results = {}
data_sources = []

# ---- 1. SurvBoard (TCGA standardized features) ----
SURVBOARD = None
for cand in [os.environ.get("SURVBOARD_DIR"), "/kaggle/input/survboard", r"D:\survboard", r"E:\survboard"]:
    if cand and os.path.exists(cand):
        SURVBOARD = cand
        break
if SURVBOARD:
    for cancer in ["BRCA", "GBM", "HNSC", "KIRC", "LIHC", "LUAD"]:
        feat_path = None
        for root,_,files in os.walk(SURVBOARD):
            if cancer + ".json" in files:
                feat_path = os.path.join(root, cancer + ".json")
                break
        if not feat_path:
            continue
        data = json.load(open(feat_path))
        if not isinstance(data, list) or len(data) < 50:
            continue
        rows = []
        for d in data:
            r = {"os_months": d.get("os_months"), "deceased": d.get("deceased"), "age": d.get("age"), "stage": d.get("stage")}
            for k, v in d.get("features", {}).items():
                r[k] = v
            rows.append(r)
        df = pd.DataFrame(rows)
        df = df[df["os_months"].notna() & (df["os_months"] > 0)].copy()
        df["event"] = df["deceased"].astype(int)
        df["time"] = df["os_months"].astype(float)
        feat_cols = [c for c in df.columns if c not in ("os_months", "deceased", "event", "time", "age", "stage", "patient_id")]
        for c in ["age", "stage"]:
            if c in df.columns:
                feat_cols = [c] + feat_cols
        X = df[feat_cols].copy()
        res = train_models(X, df["time"].values, df["event"].values, feat_cols)
        if res:
            all_results[f"survboard_{cancer}"] = res
            print(f"SurvBoard {cancer}: n={res['n']} best={res['best_model']} {res['best_cindex']:.4f}")
    data_sources.append("survboard")

# ---- 2. GBSG2 (always available) ----
try:
    from sksurv.datasets import load_gbsg2
    X, y = load_gbsg2()
    df = X.copy()
    df["time"] = y["time"]
    df["event"] = y["cens"].astype(int)
    num_cols = [c for c in X.columns]
    Xf = df[num_cols].copy()
    res = train_models(Xf, df["time"].values, df["event"].values, num_cols)
    if res:
        all_results["gbsg2"] = res
        print(f"GBSG2: n={res['n']} best={res['best_model']} {res['best_cindex']:.4f}")
    data_sources.append("gbsg2")
except Exception as e:
    print("GBSG2 failed:", str(e)[:100])

# ---- pooled summary ----
if all_results:
    cindices = [r["best_cindex"] for r in all_results.values()]
    pooled = float(np.mean(cindices))
    best_ds = max(all_results, key=lambda k: all_results[k]["best_cindex"])
    print("pooled mean C-index:", round(pooled, 4), "best dataset:", best_ds)
else:
    pooled = None
    best_ds = None

result = {
    "ok": True,
    "data_sources": data_sources,
    "datasets": all_results,
    "pooled_cindex": round(pooled, 4) if pooled is not None else None,
    "best_dataset": best_ds,
    "best_cindex": round(max((r["best_cindex"] for r in all_results.values()), default=0), 4) if all_results else None,
    "n_datasets": len(all_results),
    "runtime_sec": round(time.time() - T0, 1),
}

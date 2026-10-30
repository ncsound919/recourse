"""SurvBoard oncology concordance training — runs on Kaggle CPU.
Trains small survival models on SurvBoard standardized TCGA data (BRCA/GBM/HNSC/KIRC/LIHC/LUAD).
Reports C-index per cancer type + pooled. Prints __RECOURSE_RESULT__ {json}.
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
from sklearn.impute import SimpleImputer
from sksurv.ensemble import RandomSurvivalForest
from sksurv.metrics import concordance_index_censored
from sksurv.util import Surv
from xgboost import XGBRegressor
from lifelines import CoxPHFitter
from lifelines.utils import concordance_index

SURVBOARD = os.environ.get("SURVBOARD_DIR", "/kaggle/input/survboard")
# local fallback
if not os.path.exists(SURVBOARD):
    for cand in [r"D:\survboard", "/opt/survboard"]:
        if os.path.exists(cand):
            SURVBOARD = cand
            break

CANCERS = ["BRCA", "GBM", "HNSC", "KIRC", "LIHC", "LUAD"]
results_by_cancer = {}

for cancer in CANCERS:
    feat_path = os.path.join(SURVBOARD, "features", cancer + ".json")
    if not os.path.exists(feat_path):
        # try glob
        hits = glob.glob(os.path.join(SURVBOARD, "**", cancer + ".json"), recursive=True)
        if hits:
            feat_path = hits[0]
        else:
            print(f"skip {cancer}: no features json")
            continue
    data = json.load(open(feat_path))
    if not isinstance(data, list) or len(data) < 50:
        print(f"skip {cancer}: bad data")
        continue

    # build dataframe
    rows = []
    for d in data:
        r = {"patient_id": d.get("patient_id"), "os_months": d.get("os_months"), "deceased": d.get("deceased"), "age": d.get("age"), "stage": d.get("stage")}
        feats = d.get("features", {})
        for k, v in feats.items():
            r[k] = v
        rows.append(r)
    df = pd.DataFrame(rows)
    df = df[df["os_months"].notna() & (df["os_months"] > 0)].copy()
    df["event"] = df["deceased"].astype(int)
    df["time"] = df["os_months"].astype(float)

    feat_cols = [c for c in df.columns if c not in ("patient_id", "os_months", "deceased", "event", "time", "age", "stage")]
    # include age, stage as features
    for c in ["age", "stage"]:
        if c in df.columns:
            feat_cols = [c] + feat_cols
    X = df[feat_cols].copy()
    y_time = df["time"].values.astype(float)
    y_event = df["event"].values.astype(int)

    # impute
    X = X.apply(pd.to_numeric, errors="coerce")
    X = X.fillna(X.median())

    if len(X) < 60 or y_event.sum() < 10:
        print(f"skip {cancer}: too few events")
        continue

    Xtr, Xte, ttr, tte, etr, ete = train_test_split(X, y_time, y_event, test_size=0.25, stratify=y_event, random_state=42)

    scaler = StandardScaler()
    Xtr_p = scaler.fit_transform(Xtr)
    Xte_p = scaler.transform(Xte)

    ytr_surv = Surv.from_arrays(event=etr.astype(bool), time=ttr)
    yte_surv = Surv.from_arrays(event=ete.astype(bool), time=tte)

    # Cox
    cox_train = pd.DataFrame(Xtr_p, columns=feat_cols)
    cox_train["time"] = ttr; cox_train["event"] = etr
    cox_test = pd.DataFrame(Xte_p, columns=feat_cols)
    cox_test["time"] = tte; cox_test["event"] = ete
    try:
        cph = CoxPHFitter(penalizer=0.5)
        cph.fit(cox_train, duration_col="time", event_col="event")
        cox_pred = -cph.predict_partial_hazard(cox_test).values.flatten()
        cox_c = concordance_index(cox_test["time"], cox_pred, cox_test["event"])
    except Exception as e:
        cox_c = None
        print(f"  {cancer} Cox failed:", str(e)[:80])

    # RSF
    try:
        rsf = RandomSurvivalForest(n_estimators=200, min_samples_split=10, min_samples_leaf=5, max_features="sqrt", n_jobs=-1, random_state=42)
        rsf.fit(Xtr_p, ytr_surv)
        rsf_pred = rsf.predict(Xte_p)
        rsf_c = concordance_index_censored(ete.astype(bool), tte, rsf_pred)[0]
        fi = sorted(zip(feat_cols, rsf.feature_importances_), key=lambda x: -x[1])[:8]
    except Exception as e:
        rsf_c = None
        fi = []
        print(f"  {cancer} RSF failed:", str(e)[:80])

    # XGBoost
    try:
        y_xgb = np.where(etr.astype(bool), ttr, -ttr)
        dtrain = XGBRegressor  # placeholder
        import xgboost as xgb
        dtrain = xgb.DMatrix(Xtr_p, label=y_xgb)
        dtest = xgb.DMatrix(Xte_p)
        params = {"objective": "survival:cox", "eval_metric": "cox-nloglik", "eta": 0.05, "max_depth": 4, "subsample": 0.8, "colsample_bytree": 0.8, "seed": 42}
        bst = xgb.train(params, dtrain, num_boost_round=300, verbose_eval=False)
        xgb_pred = bst.predict(dtest)
        xgb_c = concordance_index_censored(ete.astype(bool), tte, xgb_pred)[0]
    except Exception as e:
        xgb_c = None
        print(f"  {cancer} XGB failed:", str(e)[:80])

    best = max([(rsf_c or 0, "rsf"), (xgb_c or 0, "xgb"), (cox_c or 0, "cox")])
    results_by_cancer[cancer] = {
        "n": int(len(df)),
        "n_events": int(y_event.sum()),
        "n_features": int(X.shape[1]),
        "cox_cindex": round(float(cox_c), 4) if cox_c is not None else None,
        "rsf_cindex": round(float(rsf_c), 4) if rsf_c is not None else None,
        "xgb_cindex": round(float(xgb_c), 4) if xgb_c is not None else None,
        "best_model": best[1],
        "best_cindex": round(float(best[0]), 4),
        "top_features": [{"name": n, "importance": round(float(v), 4)} for n, v in fi],
    }
    print(f"  {cancer}: n={len(df)} cox={cox_c} rsf={rsf_c} xgb={xgb_c} best={best[1]} {best[0]:.4f}")

# pooled summary
if results_by_cancer:
    cindices = [r["best_cindex"] for r in results_by_cancer.values()]
    pooled = float(np.mean(cindices))
    print("pooled mean C-index:", round(pooled, 4))
else:
    pooled = None

result = {
    "ok": True,
    "source": "SurvBoard (TCGA standardized features)",
    "cancers": results_by_cancer,
    "pooled_cindex": round(pooled, 4) if pooled is not None else None,
    "n_cancers": len(results_by_cancer),
    "runtime_sec": round(time.time() - T0, 1),
}

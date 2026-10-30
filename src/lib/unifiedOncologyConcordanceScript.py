"""Unified oncology concordance training — runs on Kaggle CPU.
Auto-detects available datasets: SurvBoard (TCGA), MSK-MET (metastatic), METABRIC, GBSG2.
Trains Cox PH / Random Survival Forest / XGBoost survival on each.
Reports per-dataset C-index + pooled. Prints __RECOURSE_RESULT__ {json}.
"""
import os, json, time, glob, warnings
import numpy as np
import pandas as pd
warnings.filterwarnings("ignore")

T0 = time.time()
result = {"ok": False}

import subprocess, sys
for pkg in ["scikit-survival", "xgboost", "lifelines", "scikit-learn", "pyarrow"]:
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
import xgboost as xgb
from lifelines import CoxPHFitter
from lifelines.utils import concordance_index

def find_file(patterns, root):
    for pat in patterns:
        hits = sorted(glob.glob(os.path.join(root, "**", pat), recursive=True))
        if hits:
            return hits[0]
    return None

def train_models(X, y_time, y_event, feat_cols):
    """Returns dict with cox/rsf/xgb C-index + best + top features."""
    X = X.apply(pd.to_numeric, errors="coerce") if hasattr(X, "apply") else X
    X = pd.DataFrame(X).fillna(pd.DataFrame(X).median())
    if len(X) < 60 or y_event.sum() < 10:
        return None
    Xtr, Xte, ttr, tte, etr, ete = train_test_split(X, y_time, y_event, test_size=0.25, stratify=y_event, random_state=42)
    scaler = StandardScaler()
    Xtr_p = scaler.fit_transform(Xtr)
    Xte_p = scaler.transform(Xte)
    ytr_surv = Surv.from_arrays(event=etr.astype(bool), time=ttr)
    yte_surv = Surv.from_arrays(event=ete.astype(bool), time=tte)

    # Cox
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

    # RSF
    rsf_c = None; fi = []
    try:
        rsf = RandomSurvivalForest(n_estimators=200, min_samples_split=10, min_samples_leaf=5, max_features="sqrt", n_jobs=-1, random_state=42)
        rsf.fit(Xtr_p, ytr_surv)
        rsf_pred = rsf.predict(Xte_p)
        rsf_c = concordance_index_censored(ete.astype(bool), tte, rsf_pred)[0]
        fi = sorted(zip(feat_cols, rsf.feature_importances_), key=lambda x: -x[1])[:8]
    except Exception as e:
        print("  RSF failed:", str(e)[:60])

    # XGBoost
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

# ---- 2. MSK-MET (metastatic cancer) ----
MSK = None
for cand in [os.environ.get("MSK_MET_DIR"), "/kaggle/input/msk-met", r"E:\_handoff_oncology\msk-mettropism\msk_met_2021", r"D:\msk-mettropism\msk_met_2021"]:
    if cand and os.path.exists(cand):
        MSK = cand
        break
if MSK:
    pdf = os.path.join(MSK, "data_clinical_patient.txt")
    sdf = os.path.join(MSK, "data_clinical_sample.txt")
    if os.path.exists(pdf) and os.path.exists(sdf):
        pdf_df = pd.read_csv(pdf, sep="\t", comment="#", low_memory=False)
        sdf_df = pd.read_csv(sdf, sep="\t", comment="#", low_memory=False)
        m = pdf_df.merge(sdf_df, on="PATIENT_ID", how="inner", suffixes=("", "_s"))
        m["event"] = m["OS_STATUS"].astype(str).str.startswith("1").astype(int)
        m["time"] = pd.to_numeric(m["OS_MONTHS"], errors="coerce")
        m = m[m["time"].notna() & (m["time"] > 0)].copy()
        # features: age, cancer type, metastatic site, tumor purity, etc.
        num_cols = ["AGE_AT_SEQUENCING", "TUMOR_PURITY", "MET_COUNT", "MET_SITE_COUNT", "MSI_SCORE", "FGA"]
        num_cols = [c for c in num_cols if c in m.columns]
        cat_cols = ["CANCER_TYPE", "SAMPLE_TYPE", "PRIMARY_SITE", "ORGAN_SYSTEM"]
        cat_cols = [c for c in cat_cols if c in m.columns]
        # one-hot cancer type
        X = m[num_cols + cat_cols].copy()
        # simple: encode categoricals as codes
        for c in cat_cols:
            X[c] = X[c].astype("category").cat.codes
        feat_cols = list(X.columns)
        res = train_models(X, m["time"].values, m["event"].values, feat_cols)
        if res:
            all_results["msk_met"] = res
            print(f"MSK-MET: n={res['n']} best={res['best_model']} {res['best_cindex']:.4f}")
        data_sources.append("msk_met")

# ---- 3. METABRIC ----
METABRIC = None
for cand in [os.environ.get("METABRIC_PATH"), r"D:\datasets\Oncology Datasets\Breast Cancer METABRIC.csv", r"E:\_handoff_oncology\Breast Cancer METABRIC.csv", r"E:\_handoff_oncology\oncology_repo\brain-met-esr1\data\raw"]:
    if cand and os.path.exists(cand):
        METABRIC = cand
        break
# also search
if METABRIC is None:
    for root in [r"D:\datasets", r"E:\_handoff_oncology", r"D:\\", r"E:\\"]:
        hits = glob.glob(os.path.join(root, "**", "*METABRIC*.csv"), recursive=True)
        if hits:
            METABRIC = hits[0]
            break
if METABRIC and os.path.isfile(METABRIC):
    try:
        df = pd.read_csv(METABRIC, low_memory=False)
        # find survival columns
        time_col = None; event_col = None
        for c in df.columns:
            cl = c.lower()
            if time_col is None and ("survival" in cl or "os_months" in cl or "overall_survival_months" in cl) and "status" not in cl:
                time_col = c
            if event_col is None and ("status" in cl or "event" in cl or "death" in cl):
                event_col = c
        if time_col and event_col:
            df = df[df[time_col].notna() & (df[time_col] > 0)].copy()
            df["time"] = pd.to_numeric(df[time_col], errors="coerce")
            # event: try to coerce
            ev = df[event_col].astype(str).str.lower()
            if ev.str.contains("deceased|dead|1:|event").any():
                df["event"] = ev.str.contains("deceased|dead|1:|event|yes").astype(int)
            else:
                df["event"] = pd.to_numeric(df[event_col], errors="coerce").fillna(0).astype(int)
            df = df[df["time"].notna() & (df["time"] > 0)].copy()
            # features: numeric columns excluding ids/time/event
            exclude = {time_col, event_col, "time", "event", "patient_id", "PATIENT_ID"}
            num_cols = [c for c in df.columns if c not in exclude and pd.api.types.is_numeric_dtype(df[c])]
            X = df[num_cols].copy()
            res = train_models(X, df["time"].values, df["event"].values, num_cols)
            if res:
                all_results["metabric"] = res
                print(f"METABRIC: n={res['n']} best={res['best_model']} {res['best_cindex']:.4f}")
            data_sources.append("metabric")
    except Exception as e:
        print("METABRIC failed:", str(e)[:100])

# ---- 4. GBSG2 (always available) ----
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

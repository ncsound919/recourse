"""Lane 4 — open burst: an arbitrary heavy job on the account-2 lane.

Generic template: attach any Kaggle dataset(s) with --dataset, mount them at
/kaggle/input/<slug>, do GPU/CPU work, write outputs to /kaggle/working (retrieved
by the runner's artifact pass), and print the __RECOURSE_RESULT__ envelope.

Run:
  npx tsx scripts/kaggle-account2.ts --script scripts/jobs/burst-demo.py --slug a2-burst \\
    --gpu --hours 2 --dataset uciml/iris
"""
import glob, json, os, time

out = {"ok": True}
t0 = time.time()

# 1) what did the caller attach?
mounted = sorted({p.split("/kaggle/input/")[1].split("/")[0] for p in glob.glob("/kaggle/input/**", recursive=True) if "/kaggle/input/" in p})
out["input_roots"] = mounted
csvs = [f for f in glob.glob("/kaggle/input/**/*.csv", recursive=True) if os.path.isfile(f)]
out["csv_count"] = len(csvs)

# 2) read the first CSV if one is present
try:
    if csvs:
        import pandas as pd
        df = pd.read_csv(csvs[0])
        out["dataset"] = {"file": csvs[0], "rows": int(len(df)), "cols": list(df.columns)[:12]}
except Exception as e:
    out["dataset_error"] = repr(e)[:200]

# 3) a GPU proof (real matmul) so the burst job exercises the accelerator
try:
    import torch
    out["cuda"] = bool(torch.cuda.is_available())
    if out["cuda"]:
        x = torch.randn(4096, 4096, device="cuda", dtype=torch.float16)
        out["matmul_finite"] = bool(torch.isfinite(x @ x).all().item())
except Exception as e:
    out["cuda_error"] = repr(e)[:200]

# 4) write an artifact so the runner's retrieval path is exercised
os.makedirs("/kaggle/working", exist_ok=True)
with open("/kaggle/working/burst-summary.json", "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)

out["seconds"] = round(time.time() - t0, 2)
print("__RECOURSE_RESULT__" + json.dumps(out))

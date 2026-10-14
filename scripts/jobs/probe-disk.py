import json, os, shutil, subprocess

out = {"ok": True}
mounts = {}
for p in ["/", "/root", "/root/.cache", "/kaggle/working", "/kaggle/temp", "/tmp"]:
    try:
        t, u, f = shutil.disk_usage(p)
        mounts[p] = {"total_gb": round(t / 1e9, 1), "free_gb": round(f / 1e9, 1)}
    except Exception as e:
        mounts[p] = {"error": repr(e)[:80]}
out["mounts"] = mounts
try:
    out["df"] = subprocess.run(["df", "-h"], capture_output=True, text=True, timeout=20).stdout[:2000]
except Exception as e:
    out["df_error"] = repr(e)[:120]
out["hf_home"] = os.environ.get("HF_HOME", "")
out["env_transformer_cache"] = os.environ.get("TRANSFORMERS_CACHE", "")
print("__RECOURSE_RESULT__" + json.dumps(out))

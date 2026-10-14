"""Can a Kaggle kernel push a dataset via the API? Decides whether model
persistence can be automated from inside a job (vs a manual UI step).
"""
import json, os, subprocess

out = {"ok": True}
out["kaggle_env"] = sorted(k for k in os.environ if "KAGGLE" in k.upper())
out["kaggle_json"] = os.path.exists(os.path.expanduser("~/.kaggle/kaggle.json"))
out["kaggle_config"] = os.path.exists(os.path.expanduser("~/.kaggle"))
try:
    r = subprocess.run(["kaggle", "datasets", "list", "-m"], capture_output=True, text=True, timeout=90)
    out["datasets_list_rc"] = r.returncode
    out["datasets_list_out"] = (r.stdout or r.stderr).strip()[:400]
except Exception as e:
    out["datasets_list_error"] = repr(e)[:200]
try:
    r = subprocess.run(["kaggle", "--version"], capture_output=True, text=True, timeout=30)
    out["cli"] = (r.stdout or r.stderr).strip()[:120]
except Exception as e:
    out["cli_error"] = repr(e)[:120]

print("__RECOURSE_RESULT__" + json.dumps(out))

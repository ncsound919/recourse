import json, subprocess, urllib.request

out = {"ok": True}
try:
    import torch
    out["torch"] = torch.__version__
    out["cuda_available"] = bool(torch.cuda.is_available())
    out["cuda_device_count"] = int(torch.cuda.device_count()) if torch.cuda.is_available() else 0
except Exception as e:
    out["torch_error"] = repr(e)[:200]

try:
    smi = subprocess.run(["nvidia-smi", "-L"], capture_output=True, text=True, timeout=20)
    out["nvidia_smi_rc"] = smi.returncode
    out["nvidia_smi"] = (smi.stdout or smi.stderr).strip()[:300]
except Exception as e:
    out["nvidia_smi_error"] = repr(e)[:200]

try:
    with urllib.request.urlopen("https://pypi.org/simple/", timeout=15) as r:
        out["internet"] = True
        out["internet_status"] = r.status
except Exception as e:
    out["internet"] = False
    out["internet_error"] = repr(e)[:200]

print("__RECOURSE_RESULT__" + json.dumps(out))

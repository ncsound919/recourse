import json, platform, time

t0 = time.time()
info = {"ok": True, "python": platform.python_version(), "marker": "a2-hello-gpu"}
try:
    import torch
    info["torch"] = torch.__version__
    info["cuda"] = bool(torch.cuda.is_available())
    if torch.cuda.is_available():
        info["gpu"] = torch.cuda.get_device_name(0)
        info["gpu_mem_gb"] = round(torch.cuda.get_device_properties(0).total_memory / 1e9, 1)
        x = torch.randn(2048, 2048, device="cuda")
        info["matmul_ok"] = bool(torch.isfinite((x @ x).sum()).item())
except Exception as e:
    info["ok"] = False
    info["torch_error"] = repr(e)[:300]

info["seconds"] = round(time.time() - t0, 2)
print("__RECOURSE_RESULT__" + json.dumps(info))

import json, shutil

out = {"ok": True}
try:
    import torch, transformers
    out["torch"] = torch.__version__
    out["transformers"] = transformers.__version__
except Exception as e:
    out["import_error"] = repr(e)[:300]

candidates = [
    "Qwen/Qwen3.8-27B",
    "Qwen/Qwen3.6-27B",
    "Qwen/Qwen3.6-35B-A3B",
    "Qwen/Qwen3.5-9B",
    "google/gemma-4-31b-it",
    "google/gemma-4-26b-a4b-it",
    "openai/gpt-oss-20b",
]
models = {}
try:
    from transformers import AutoConfig
    for m in candidates:
        try:
            c = AutoConfig.from_pretrained(m)
            models[m] = {"model_type": c.model_type, "architectures": getattr(c, "architectures", None)}
        except Exception as e:
            models[m] = {"error": repr(e)[:180]}
    out["models"] = models
except Exception as e:
    out["config_error"] = repr(e)[:200]

classes = {}
try:
    import transformers
    for cls in ["Qwen3_5ForCausalLM", "Qwen3_5Config", "Qwen3NextForCausalLM",
                "GptOssForCausalLM", "Gemma3ForCausalLM", "Qwen2ForCausalLM", "AutoModelForCausalLM"]:
        classes[cls] = hasattr(transformers, cls)
    out["classes"] = classes
except Exception as e:
    out["classes_error"] = repr(e)[:200]

try:
    total, used, free = shutil.disk_usage("/kaggle/working")
    out["disk_free_gb"] = round(free / 1e9, 1)
except Exception as e:
    out["disk_error"] = repr(e)[:120]

try:
    import bitsandbytes
    out["bitsandbytes"] = getattr(bitsandbytes, "__version__", "?")
except Exception as e:
    out["bnb_error"] = repr(e)[:120]

print("__RECOURSE_RESULT__" + json.dumps(out))

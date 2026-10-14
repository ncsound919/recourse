"""Verify an attached Kaggle mirror of Qwen3.8-27B loads, so the LLM lane can
mount it instead of re-downloading ~56GB from HF every run.

Run with the mirror attached, e.g.:
  npx tsx scripts/kaggle-account2.ts --script scripts/jobs/persist-probe.py --slug a2-persist-probe \
    --gpu --hours 1 --dataset rahim3/qwen3-8-27b-bf16
"""
import glob, json, os, time

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")

out = {"ok": False}
t0 = time.time()

# locate the model dir: the one holding a config.json with model_type qwen3_5
configs = sorted(f for f in glob.glob("/kaggle/input/**/config.json", recursive=True) if os.path.isfile(f))
out["config_files"] = configs[:5]
model_dir = None
for c in configs:
    try:
        cfg = json.load(open(c, encoding="utf-8"))
        if str(cfg.get("model_type", "")).startswith("qwen3_5"):
            model_dir = os.path.dirname(c)
            out["model_type"] = cfg.get("model_type")
            out["architectures"] = cfg.get("architectures")
            break
    except Exception:
        pass
out["model_dir"] = model_dir

if model_dir:
    files = glob.glob(os.path.join(model_dir, "**"), recursive=True)
    total = sum(os.path.getsize(f) for f in files if os.path.isfile(f))
    shards = [os.path.basename(f) for f in files if f.endswith(".safetensors")]
    out["file_count"] = len([f for f in files if os.path.isfile(f)])
    out["total_gb"] = round(total / 1e9, 1)
    out["safetensors_count"] = len(shards)
    out["has_index"] = any(os.path.basename(f) == "model.safetensors.index.json" for f in files)

try:
    if model_dir:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

        tok = AutoTokenizer.from_pretrained(model_dir)
        qc = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16, bnb_4bit_quant_type="nf4")
        model = AutoModelForCausalLM.from_pretrained(model_dir, quantization_config=qc, device_map="auto")
        model.eval()
        msgs = [{"role": "user", "content": "Reply with the single word: ready"}]
        try:
            chat = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        except Exception:
            chat = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        ids = tok(chat, return_tensors="pt").to(model.device)
        with torch.no_grad():
            gen = model.generate(**ids, max_new_tokens=16, do_sample=False)
        out["sample"] = tok.decode(gen[0][ids["input_ids"].shape[1]:], skip_special_tokens=True).strip()[:120]
        out["ok"] = True
except Exception as e:
    out["error"] = repr(e)[:500]

out["seconds"] = round(time.time() - t0, 1)
print("__RECOURSE_RESULT__" + json.dumps(out))

"""Find the working load recipe for the current Qwen3.5-family checkpoints on T4.

Tests a tiny model (0.8B) so the 50GB download is not spent before the recipe is
known. Reports which AutoClass loads it and whether 4-bit bitsandbytes works.
"""
import json, subprocess, sys, time

out = {"ok": True}
t0 = time.time()
try:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "bitsandbytes"], check=False, timeout=600)
except Exception as e:
    out["pip_bnb_error"] = repr(e)[:200]

import torch
from transformers import AutoTokenizer
out["torch"] = torch.__version__
out["cuda"] = bool(torch.cuda.is_available())

MODEL = "Qwen/Qwen3.5-0.8B"
tok = AutoTokenizer.from_pretrained(MODEL)
msgs = [{"role": "user", "content": "In one sentence, what is a truck dispatcher?"}]
chat = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)


def try_load(label, factory, **kw):
    t = time.time()
    try:
        model = factory()
        model.eval()
        inputs = tok(chat, return_tensors="pt")
        inputs = {k: v.to(model.device if hasattr(model, "device") else "cuda") for k, v in inputs.items()}
        with torch.no_grad():
            gen = model.generate(**inputs, max_new_tokens=48, do_sample=False)
        text = tok.decode(gen[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        return {"label": label, "ok": True, "seconds": round(time.time() - t, 1), "sample": text.strip()[:160]}
    except Exception as e:
        return {"label": label, "ok": False, "seconds": round(time.time() - t, 1), "error": repr(e)[:300]}


results = []
import transformers
# 1) text-only causal LM, fp16
results.append(try_load("AutoModelForCausalLM-fp16", lambda: transformers.AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.float16, device_map="auto")))
# 2) conditional generation class, fp16
results.append(try_load("Qwen3_5ForConditionalGeneration-fp16", lambda: transformers.Qwen3_5ForConditionalGeneration.from_pretrained(MODEL, dtype=torch.float16, device_map="auto")))
# 3) 4-bit bitsandbytes on the causal LM
try:
    from transformers import BitsAndBytesConfig
    qc = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16, bnb_4bit_quant_type="nf4")
    results.append(try_load("AutoModelForCausalLM-4bit-nf4", lambda: transformers.AutoModelForCausalLM.from_pretrained(MODEL, quantization_config=qc, device_map="auto")))
except Exception as e:
    results.append({"label": "AutoModelForCausalLM-4bit-nf4", "ok": False, "error": repr(e)[:300]})

out["results"] = results
out["seconds"] = round(time.time() - t0, 1)
print("__RECOURSE_RESULT__" + json.dumps(out))

"""Lane 1 — hardened larger-local-model batch generation (account-2 heavy lane).

Improvements over v1:
  - thinking off: Qwen3.5-family reasons by default; we pass enable_thinking=False
    and strip any residual  block as a fallback.
  - batched generation (left-padded) for GPU utilisation.
  - prompt bank: reads /kaggle/input/**/prompts.jsonl if an attached dataset
    provides one, else a built-in content bank. Accepts {"id","system","user"}.
  - writes generations.jsonl to /kaggle/working (retrievable via kernels output)
    and returns a compact envelope (samples, not the whole payload).
  - uses HF_TOKEN from env or Kaggle Secrets when present (faster downloads).

Run:
  npx tsx scripts/kaggle-account2.ts --script scripts/jobs/llm-generate.py --slug a2-llm --gpu --hours 3
"""
import glob, json, os, re, subprocess, sys, time

# Default is the fast iteration model (~18GB). For the flagship, pass
#   --env A2_MODEL=Qwen/Qwen3.8-27B
MODEL = os.environ.get("A2_MODEL", "Qwen/Qwen3.5-9B")
MAX_NEW_TOKENS = int(os.environ.get("A2_MAX_NEW", "300"))
BATCH_SIZE = int(os.environ.get("A2_BATCH", "4"))

DEFAULT_PROMPTS = [
    {"id": "trucking-blog", "system": "You are a concise B2B marketing writer. No preamble.",
     "user": "Write a 120-word intro for a blog post: how an AI copilot helps independent truck dispatchers stay HOS-compliant."},
    {"id": "social-launch", "system": "You write punchy social copy.",
     "user": "Write a 3-post launch thread (X/LinkedIn) for a driver social app focused on community and road reports."},
    {"id": "voice-agent", "system": "You design conversational voice agents.",
     "user": "Write a 6-turn script for an inbound call-center agent that qualifies a solar lead and books an appointment."},
    {"id": "synthetic-qa", "system": "You create training data. Output strict JSON only.",
     "user": 'Produce 3 diverse Q&A pairs about electronic logging device (ELD) rules as JSON: [{"q":"...","a":"..."}].'},
    {"id": "real-estate-ad", "system": "You write real-estate marketing copy.",
     "user": "Write a 90-word listing description for a 3-bed/2-bath craftsman home with a renovated kitchen and large yard."},
    {"id": "finance-brief", "system": "You are a terse analyst.",
     "user": "Summarise, in 5 bullets, what a small business owner should check monthly in cash-flow reporting."},
]


def find_mounted_model() -> str | None:
    """If a qwen3.5-family model is attached at /kaggle/input, use it (no HF download)."""
    for c in sorted(glob.glob("/kaggle/input/**/config.json", recursive=True)):
        try:
            cfg = json.load(open(c, encoding="utf-8"))
            if str(cfg.get("model_type", "")).startswith("qwen3"):
                return os.path.dirname(c)
        except Exception:
            continue
    return None


def hf_token() -> str:
    for name in ("HF_TOKEN", "HUGGINGFACE_TOKEN", "HUGGINGFACE_HUB_TOKEN"):
        v = os.environ.get(name, "")
        if v:
            return v
    try:
        from kaggle_secrets import UserSecretsClient
        for name in ("HF_TOKEN", "HUGGINGFACE_TOKEN"):
            try:
                v = UserSecretsClient().get_secret(name)
                if v:
                    return v
            except Exception:
                pass
    except Exception:
        pass
    return ""


def load_prompts() -> list:
    hits = sorted(glob.glob("/kaggle/input/**/prompts.jsonl", recursive=True))
    if hits:
        out = []
        with open(hits[0], "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    out.append(json.loads(line))
        if out:
            return out
    return DEFAULT_PROMPTS


def strip_thinking(text: str) -> str:
    # Paired  ...  (any attribute form)
    text = re.sub(r"<think\b[^>]*>.*?</think\b[^>]*>", "", text, flags=re.DOTALL)
    # Unclosed opening: drop everything up to and including a stray closing tag
    if "</think" in text:
        text = text[text.rfind("</think"):]
    text = re.sub(r"</?think\b[^>]*>", "", text)
    return text.strip()


def render(tok, p: dict) -> str:
    msgs = []
    if p.get("system"):
        msgs.append({"role": "system", "content": p["system"]})
    msgs.append({"role": "user", "content": p["user"]})
    for kwargs in ({"enable_thinking": False}, {}):
        try:
            return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, **kwargs)
        except Exception:
            continue
    raise RuntimeError("apply_chat_template failed")


def main() -> dict:
    t0 = time.time()
    out = {"ok": False, "model": MODEL}
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        token = hf_token()
        out["hf_token"] = bool(token)
        out["torch"] = torch.__version__
        out["gpus"] = torch.cuda.device_count()

        mounted = find_mounted_model()
        src = mounted or MODEL
        out["source"] = f"mounted:{mounted}" if mounted else "hf-download"

        tok = AutoTokenizer.from_pretrained(src, token=token or None)
        tok = tok
        tok.padding_side = "left"
        if tok.pad_token is None:
            tok.pad_token = tok.eos_token

        load_kwargs = {"device_map": "auto"}
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "bitsandbytes"], check=False, timeout=600)
            from transformers import BitsAndBytesConfig
            load_kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16, bnb_4bit_quant_type="nf4")
            out["quant"] = "4bit-nf4"
        except Exception as e:
            load_kwargs["dtype"] = torch.float16
            out["quant"] = "fp16 (bnb unavailable: %s)" % repr(e)[:100]

        tload = time.time()
        model = AutoModelForCausalLM.from_pretrained(src, **load_kwargs, token=token or None)
        model.eval()
        out["load_seconds"] = round(time.time() - tload, 1)

        prompts = load_prompts()
        out["num_prompts"] = len(prompts)
        gens = []
        for i in range(0, len(prompts), BATCH_SIZE):
            chunk = prompts[i:i + BATCH_SIZE]
            texts = [render(tok, p) for p in chunk]
            enc = tok(texts, return_tensors="pt", padding=True).to(model.device)
            with torch.no_grad():
                gen = model.generate(**enc, max_new_tokens=MAX_NEW_TOKENS, do_sample=True, temperature=0.7, top_p=0.9)
            in_len = enc["input_ids"].shape[1]
            for p, row in zip(chunk, gen):
                text = strip_thinking(tok.decode(row[in_len:], skip_special_tokens=True))
                gens.append({"id": p.get("id", f"p{i}"), "chars": len(text), "text": text})

        with open("/kaggle/working/generations.jsonl", "w", encoding="utf-8") as f:
            for g in gens:
                f.write(json.dumps({"id": g["id"], "text": g["text"]}, ensure_ascii=False) + "\n")

        out.update({
            "ok": True,
            "count": len(gens),
            "output_file": "/kaggle/working/generations.jsonl",
            "samples": [{"id": g["id"], "chars": g["chars"], "preview": g["text"][:200]} for g in gens],
        })
    except Exception as e:
        out["error"] = repr(e)[:600]
    out["seconds"] = round(time.time() - t0, 1)
    return out


if __name__ == "__main__":
    print("__RECOURSE_RESULT__" + json.dumps(main(), ensure_ascii=False))

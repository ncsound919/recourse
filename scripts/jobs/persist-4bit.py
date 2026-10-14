"""Persist Qwen3.8-27B as a 4-bit (nf4) Kaggle Dataset for fast re-load.

Downloads the HF weights once, quantizes to nf4 (~14GB vs ~56GB bf16), saves to
/kaggle/working, and pushes it as a Kaggle Dataset via the kernel's own API.
Subsequent runs mount it and load WITHOUT re-quantizing (much less to read).

Run:
  npx tsx scripts/kaggle-account2.ts --script scripts/jobs/persist-4bit.py --slug a2-persist-4bit --gpu --hours 3
"""
import glob, json, os, subprocess, sys, time

# 27B in 4-bit needs both T4s (~14GB weights + overhead > 16GB); do not pin to one.

import torch

MODEL = "Qwen/Qwen3.8-27B"
OUTDIR = "/kaggle/working/qwen38-27b-nf4"
DATASET_ID = "tap919/qwen38-27b-nf4"


def main() -> dict:
    t0 = time.time()
    out = {"ok": False, "model": MODEL, "dataset_id": DATASET_ID}
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "bitsandbytes"], check=False, timeout=600)

        tok = AutoTokenizer.from_pretrained(MODEL)
        qc = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16, bnb_4bit_quant_type="nf4")
        model = AutoModelForCausalLM.from_pretrained(MODEL, quantization_config=qc, device_map="auto")
        model.save_pretrained(OUTDIR)
        tok.save_pretrained(OUTDIR)

        files = [f for f in glob.glob(OUTDIR + "/**", recursive=True) if os.path.isfile(f)]
        out["files"] = len(files)
        out["saved_gb"] = round(sum(os.path.getsize(f) for f in files) / 1e9, 2)

        with open("/kaggle/working/dataset-metadata.json", "w", encoding="utf-8") as f:
            json.dump({"title": "qwen38-27b-nf4", "id": DATASET_ID, "licenses": [{"name": "Apache-2.0"}]}, f, indent=2)

        r = subprocess.run(["kaggle", "datasets", "create", "-p", "/kaggle/working"],
                           capture_output=True, text=True, timeout=3600)
        out["push_rc"] = r.returncode
        out["push_out"] = (r.stdout or r.stderr).strip()[-400:]
        out["ok"] = r.returncode == 0
    except Exception as e:
        out["error"] = repr(e)[:600]
    out["seconds"] = round(time.time() - t0, 1)
    return out


if __name__ == "__main__":
    print("__RECOURSE_RESULT__" + json.dumps(main()))

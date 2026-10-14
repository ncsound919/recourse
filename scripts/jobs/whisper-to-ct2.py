"""Convert a Whisper checkpoint (HF transformers format) to CTranslate2 for
faster-whisper, which is what AetherDesk's ASRService loads.

If a fine-tuned Whisper is attached at /kaggle/input it is used; otherwise the
base checkpoint named by A2_WHISPER is converted. Output: /kaggle/working/whisper-ct2.

Run:
  npx tsx scripts/kaggle-account2.ts --script scripts/jobs/whisper-to-ct2.py --slug a2-whisper-ct2 --gpu --hours 1
  # or attach a fine-tuned checkpoint:
  #   ... --dataset owner/whisper-ft
"""
import glob, json, os, subprocess, sys, time

MODEL = os.environ.get("A2_WHISPER", "openai/whisper-small")
OUT = "/kaggle/working/whisper-ct2"

out = {"ok": False, "default_source": MODEL}
t0 = time.time()

src = MODEL
for c in sorted(glob.glob("/kaggle/input/**/config.json", recursive=True)):
    try:
        cfg = json.load(open(c, encoding="utf-8"))
        if "whisper" in str(cfg.get("model_type", "")):
            src = os.path.dirname(c)
            break
    except Exception:
        continue
out["used_source"] = src

try:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "ctranslate2"], check=False, timeout=600)
    from ctranslate2.converters import TransformersConverter

    TransformersConverter(src).convert(OUT, quantization="int8", force=True)
    files = [f for f in glob.glob(OUT + "/**", recursive=True) if os.path.isfile(f)]
    out["files"] = sorted(os.path.relpath(f, OUT) for f in files)
    out["size_mb"] = round(sum(os.path.getsize(f) for f in files) / 1e6, 1)
    out["ok"] = True
except Exception as e:
    out["error"] = repr(e)[:600]

out["seconds"] = round(time.time() - t0, 1)
print("__RECOURSE_RESULT__" + json.dumps(out))

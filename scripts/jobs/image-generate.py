"""Lane 3 — content creation: text-to-image on the account-2 heavy lane.

Generates scene/commercial/thumbnail frames for the Content-Creation-Engine with
a diffusers pipeline that fits one T4. Default is SDXL-Turbo (1-4 steps, fast);
set A2_IMAGE_MODEL to a non-turbo SDXL/SD3 id and the script uses normal CFG/steps.

Writes PNGs to /kaggle/working/images/ (retrieved by the runner's artifact pass)
and returns a small base64 preview of the first image in the envelope.

Run:
  npx tsx scripts/kaggle-account2.ts --script scripts/jobs/image-generate.py --slug a2-imagegen --gpu --hours 1
"""
import base64, io, json, os, time

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")

import torch

MODEL = os.environ.get("A2_IMAGE_MODEL", "stabilityai/sdxl-turbo")
N = int(os.environ.get("A2_IMAGES", "6"))
OUT = "/kaggle/working/images"
IS_TURBO = "turbo" in MODEL.lower()
STEPS = int(os.environ.get("A2_IMAGE_STEPS", "4" if IS_TURBO else "28"))
GUIDANCE = float(os.environ.get("A2_IMAGE_GUIDANCE", "0.0" if IS_TURBO else "6.0"))

DEFAULT_PROMPTS = [
    "Hanna-Barbera style flat-colour cartoon frame, two hosts at a diner table, thick black outlines, warm palette, 16:9",
    "1990s TV commercial still, retro product on a pedestal, soft studio lighting, grainy VHS look",
    "flat vector podcast cover art, bold silhouettes, golden-hour skyline, high contrast, no text",
    "retro Saturday-morning cartoon establishing shot of a city block, bold shapes, limited palette",
    "neo-noir alley at night, rain, neon reflection, cinematic still",
    "bright product thumbnail, single object, clean gradient background, centred, studio",
]

# A caller (e.g. the Content-Creation-Engine bridge) can pass its own prompts as a
# JSON array of strings via A2_PROMPTS_JSON.
try:
    PROMPTS = json.loads(os.environ["A2_PROMPTS_JSON"]) if os.environ.get("A2_PROMPTS_JSON") else DEFAULT_PROMPTS
except Exception:
    PROMPTS = DEFAULT_PROMPTS


def main() -> dict:
    t0 = time.time()
    out = {"ok": False, "model": MODEL, "steps": STEPS, "guidance": GUIDANCE}
    try:
        from diffusers import AutoPipelineForText2Image

        out["cuda"] = bool(torch.cuda.is_available())
        try:
            pipe = AutoPipelineForText2Image.from_pretrained(MODEL, torch_dtype=torch.float16, variant="fp16")
        except Exception:
            pipe = AutoPipelineForText2Image.from_pretrained(MODEL, torch_dtype=torch.float16)
        pipe = pipe.to("cuda")
        if hasattr(pipe, "set_progress_bar_config"):
            pipe.set_progress_bar_config(disable=True)

        os.makedirs(OUT, exist_ok=True)
        files = []
        first = None
        for i, p in enumerate(PROMPTS[:max(1, N)]):
            img = pipe(prompt=p, num_inference_steps=STEPS, guidance_scale=GUIDANCE, height=512, width=512).images[0]
            fp = f"{OUT}/img_{i:02d}.png"
            img.save(fp)
            files.append(fp)
            if first is None:
                first = img

        prev = first.resize((256, 256))
        buf = io.BytesIO()
        prev.save(buf, format="JPEG", quality=70)
        out.update({
            "ok": True,
            "count": len(files),
            "files": files,
            "preview_jpeg_b64": base64.b64encode(buf.getvalue()).decode(),
        })
    except Exception as e:
        out["error"] = repr(e)[:600]
    out["seconds"] = round(time.time() - t0, 1)
    return out


if __name__ == "__main__":
    print("__RECOURSE_RESULT__" + json.dumps(main()))

"""Lane 2 — AetherDesk voice: Whisper domain fine-tune (account-2 heavy lane).

Fine-tunes openai/whisper-small on call-centre/telephony audio so the ASR is
adapted to dispatch/HOS vocabulary. AetherDesk serves faster-whisper (CTranslate2)
at 16 kHz; the fine-tuned HF checkpoint can be converted to CTranslate2 for that
runtime.

Data: if a dataset is attached with transcripts.jsonl (one {"audio": path,
"text": ...} per line) it is used; otherwise a small public set
(hf-internal-testing/librispeech_asr_dummy) proves the pipeline. The attached
path is the real use: point it at exported AetherDesk call transcripts.

Run:
  npx tsx scripts/kaggle-account2.ts --script scripts/jobs/whisper-finetune.py --slug a2-whisper-ft --gpu --hours 3
"""
import glob, json, os, time

# whisper-small fits one T4; pinning to a single device avoids the Trainer's
# DataParallel wrapper (which errored in forward on the 2x T4 box).
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")

from dataclasses import dataclass
from typing import Any

import numpy as np
import torch
from datasets import Audio, Dataset, DatasetDict, load_dataset

MODEL = os.environ.get("A2_WHISPER", "openai/whisper-small")
MAX_STEPS = int(os.environ.get("A2_STEPS", "60"))
OUT = "/kaggle/working/whisper-ft"


def build_dataset():
    jl = sorted(glob.glob("/kaggle/input/**/transcripts.jsonl", recursive=True))
    if jl:
        rows = [json.loads(l) for l in open(jl[0], encoding="utf-8") if l.strip()]
        d = Dataset.from_list(rows).cast_column("audio", Audio(sampling_rate=16000))
        n = len(d)
        return DatasetDict({"train": d, "test": d.select(range(min(16, n)))}), "attached:" + jl[0]
    ds = load_dataset("hf-internal-testing/librispeech_asr_dummy", "clean", split="validation")
    ds = ds.cast_column("audio", Audio(sampling_rate=16000))
    n = len(ds)
    return DatasetDict({"train": ds, "test": ds.select(range(min(16, n)))}), "librispeech_asr_dummy"


@dataclass
class Collator:
    processor: Any

    def __call__(self, features):
        input_features = [{"input_features": f["input_features"]} for f in features]
        batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")
        label_features = [{"input_ids": f["labels"]} for f in features]
        labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")
        labels = labels_batch["input_ids"].masked_fill(labels_batch.attention_mask.ne(1), -100)
        if (labels[:, 0] == self.processor.tokenizer.bos_token_id).all().cpu().item():
            labels = labels[:, 1:]
        batch["labels"] = labels
        return batch


def main() -> dict:
    t0 = time.time()
    out = {"ok": False, "base": MODEL}
    try:
        from transformers import (
            WhisperForConditionalGeneration, WhisperProcessor, Seq2SeqTrainer, Seq2SeqTrainingArguments,
        )

        out["torch"] = torch.__version__
        out["gpus"] = torch.cuda.device_count()

        proc = WhisperProcessor.from_pretrained(MODEL, language="english", task="transcribe")
        ds, src = build_dataset()
        out["dataset"] = src
        out["train_n"] = len(ds["train"])

        def prep(b):
            a = b["audio"]
            b["input_features"] = proc.feature_extractor(a["array"], sampling_rate=a["sampling_rate"]).input_features[0]
            b["labels"] = proc.tokenizer(b["text"]).input_ids
            return b

        ds = ds.map(prep, remove_columns=ds["train"].column_names)

        # fp32 master weights + Trainer fp16 autocast (loading fp16 weights makes
        # the GradScaler try to unscale fp16 grads and raise).
        model = WhisperForConditionalGeneration.from_pretrained(MODEL)
        model.config.forced_decoder_ids = None
        model.config.suppress_tokens = []
        if hasattr(model, "generation_config"):
            model.generation_config.language = "english"
            model.generation_config.task = "transcribe"
            model.generation_config.forced_decoder_ids = None

        args = Seq2SeqTrainingArguments(
            output_dir="/kaggle/working/ckpt",
            per_device_train_batch_size=8,
            gradient_accumulation_steps=1,
            max_steps=MAX_STEPS,
            fp16=True,
            logging_steps=10,
            save_strategy="no",
            report_to=[],
        )
        trainer = Seq2SeqTrainer(model=model, args=args, train_dataset=ds["train"], data_collator=Collator(proc))
        trainer.train()
        trainer.save_model(OUT)
        proc.save_pretrained(OUT)

        # Quick WER on the held-out subset (jiwer if available).
        out["wer"] = None
        try:
            import subprocess, sys
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "jiwer"], check=False, timeout=300)
            import jiwer
            model.eval()
            refs, hyps = [], []
            for ex in ds["test"]:
                feats = torch.tensor(ex["input_features"], dtype=torch.float32).unsqueeze(0).to(model.device)
                with torch.no_grad():
                    ids = model.generate(feats, max_new_tokens=128)
                hyps.append(proc.tokenizer.batch_decode(ids, skip_special_tokens=True)[0])
                refs.append(proc.tokenizer.decode(ex["labels"], skip_special_tokens=True))
            out["wer"] = round(float(jiwer.wer(refs, hyps)), 4)
            out["test_examples"] = [{"ref": refs[0], "hyp": hyps[0]}] if refs else []
        except Exception as e:
            out["wer_error"] = repr(e)[:200]

        out.update({"ok": True, "output_dir": OUT, "steps": MAX_STEPS})
    except Exception as e:
        out["error"] = repr(e)[:600]
    out["seconds"] = round(time.time() - t0, 1)
    return out


if __name__ == "__main__":
    print("__RECOURSE_RESULT__" + json.dumps(main()))

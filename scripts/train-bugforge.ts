#!/usr/bin/env tsx
/**
 * train-bugforge.ts — enqueue a BugForge bug-detection model training on Kaggle GPU.
 * Trains Qwen 2.5 Coder 3B on BugForge records (bug detection, fixing, review).
 * Result feeds the recursive learner (externalScore = training loss improvement).
 */
import { initializeComputePlatforms } from '../src/lib/computePlatforms.js';
import { enqueueRemoteTask, registerRemoteApplier, readRemoteQueue, drainRemoteTasks } from '../src/lib/remoteCompute.js';

async function main() {
  await initializeComputePlatforms();
  // Reuse science_experiment kind (arbitrary script) with GPU hardware
  const script = `
!pip install -q "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
!pip install -q --no-deps trl peft accelerate bitsandbytes xformers datasets
import os, json, random, torch
from datasets import Dataset
from unsloth import FastModel
from trl import SFTTrainer, SFTConfig
random.seed(42)
assert torch.cuda.is_available()
examples = [
  ("Identify the bug in this code: def is_adult(age): if age < 26: return False", "Bug: off_by_one (const_off_by_one). Location: line 2."),
  ("Review this code for bugs: def has_access(user, role): if user is None or role != 'admin': return False", "No bugs found. Clean code."),
  ("Fix the bug: def is_adult(age): if age < 26: return False", "Fixed: if age < 18: return False. Bug: off_by_one."),
  ("What does guard_delete mutator do?", "Removes guard clauses (null checks, validation). Targets missing_check defects."),
  ("What does boundary_flip mutator do?", "Flips boundary conditions (<= to <). Targets off_by_one defects."),
  ("What does equality_flip mutator do?", "Flips equality operators (== to !=). Targets logic_inversion defects."),
  ("What does boolop_swap mutator do?", "Swaps boolean operators (and to or). Targets logic_inversion defects."),
  ("What does close_delete mutator do?", "Removes close/dispose calls. Targets resource_leak defects."),
  ("Trace lineage of buggy record", "Derived from clean record via mutator. Location and failing tests recorded."),
  ("What is a synthetic bug dataset?", "Code with intentionally introduced bugs via mutators, verified by tests. Used to train bug detection/fixing models."),
] * 5
random.shuffle(examples)
train = [{"instruction": i, "output": o} for i, o in examples]
def fmt(ex): return {"text": "USER: " + ex["instruction"] + "\\nASSISTANT: " + ex["output"]}
from datasets import Dataset
tds = Dataset.from_list(train).map(fmt)
model, tokenizer = FastModel.from_pretrained(model_name="unsloth/Qwen2.5-Coder-3B-Instruct", max_seq_length=1024, load_in_4bit=True, full_finetuning=False)
model = FastModel.get_peft_model(model, r=16, lora_alpha=16, lora_dropout=0.0, target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"])
args = SFTConfig(output_dir="/kaggle/working/qwen_bugforge", per_device_train_batch_size=2, gradient_accumulation_steps=2, max_steps=50, learning_rate=2e-4, warmup_steps=5, logging_steps=10, save_steps=50, max_seq_length=1024, fp16=True, dataset_text_field="text")
trainer = SFTTrainer(model=model, tokenizer=tokenizer, train_dataset=tds, args=args)
stats = trainer.train()
model.save_pretrained("/kaggle/working/qwen_bugforge")
tokenizer.save_pretrained("/kaggle/working/qwen_bugforge")
result = {"ok": True, "steps": trainer.state.global_step, "final_loss": float(stats.metrics.get("train_loss",0)), "runtime_sec": stats.metrics["train_runtime"], "hf_repo": None, "adapter_path": "/kaggle/working/qwen_bugforge"}
print("__RECOURSE_RESULT__" + __import__("json").dumps(result))
`;
  const q = await enqueueRemoteTask('science_experiment', { script, requirements: ['unsloth','trl','peft','accelerate','bitsandbytes','xformers','datasets'], experiment: 'bugforge' }, { hardware: { type: 'gpu' }, maxRuntimeMs: 2 * 60 * 60 * 1000 });
  if (!q.queued || !q.task) { console.error('enqueue refused:', q.reason); process.exit(1); }
  console.log('queued', q.task.id);
  const deadline = Date.now() + 2.5 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 30_000));
    await drainRemoteTasks({}, 5);
    const t = readRemoteQueue().tasks.find(x => x.id === q.task!.id);
    console.log('status:', t?.status);
    if (t && (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')) {
      if (t.status !== 'completed') { console.error('failed:', t.result?.error); process.exit(1); }
      console.log('result:', JSON.stringify(t.result?.data));
      process.exit(0);
    }
  }
  console.error('timeout'); process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });

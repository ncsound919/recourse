"""Mixing training script — runs on Kaggle GPU (T4). Self-contained.
Prints __RECOURSE_RESULT__ {json} at the end.
"""
import os, json, random, urllib.request, torch, time
from pathlib import Path
from datasets import Dataset
from unsloth import FastModel
from trl import SFTTrainer, SFTConfig

random.seed(42)
t0 = time.time()
print("GPU:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NONE")
assert torch.cuda.is_available(), "GPU required"

# ---- deps (already installed by notebook requirements) ----

# ---- dataset builder (condensed) ----
GENRE_TEMPLATES = {
 "Pop": {"tempo":(100,130),"lufs":(-8,-6),"roles":{"Lead Vocal":{"gain":(-2,2),"hpf":(80,110),"air":(10000,12000),"air_db":(1.5,2.5),"comp_ratio":(4,4),"deess_freq":(5500,6500),"plate_decay":(1.0,1.3),"plate_mix":(0.10,0.16)},"Kick":{"gain":(2,5),"hpf":(25,35),"lf_boost":(60,70),"lf_db":(2,4)},"Snare":{"gain":(0,3),"hpf":(100,150),"reverb_decay":(0.9,1.2),"reverb_mix":(0.12,0.18)},"Hi-Hats":{"hpf":(220,300),"air_freq":(9000,11000),"air_db":(1.5,2.5)},"Bass":{"gain":(-2,2),"hpf":(25,35),"lf_db":(1.5,3),"sidechain_ratio":(4,6)},"Guitars":{"hpf":(70,90),"mid_cut_freq":(1400,1800),"mid_cut_db":(-3,-1),"sat_drive":(4,7)},"Keys":{"hpf":(100,140),"chorus_mix":(0.25,0.4)}}},
 "Boom Bap": {"tempo":(85,100),"lufs":(-9,-7),"roles":{"Lead Vocal":{"gain":(0,3),"hpf":(90,110),"hf_db":(0.5,1.5),"comp_ratio":(4,4),"plate_decay":(0.9,1.1),"plate_mix":(0.08,0.12)},"Kick":{"gain":(3,6),"hpf":(25,35),"lf_boost":(55,65),"lf_db":(3,5)},"Snare":{"gain":(0,3),"hpf":(130,170),"reverb_decay":(0.8,1.0),"reverb_mix":(0.15,0.22)},"Hi-Hats":{"hpf":(280,320),"air_freq":(9000,11000),"air_db":(1.5,2.5)},"Bass":{"gain":(0,4),"hpf":(25,35),"lf_db":(2,4),"sidechain_ratio":(5,7)},"Keys":{"chorus_mix":(0.3,0.4),"plate_decay":(1.2,1.6),"plate_mix":(0.12,0.16)},"Guitars":{"hpf":(90,110),"chorus_mix":(0.2,0.3)}}},
 "Trap": {"tempo":(130,160),"lufs":(-7,-5),"roles":{"Lead Vocal":{"gain":(0,2),"hpf":(100,120),"hf_db":(0.5,1.5),"comp_ratio":(4,4),"deess_freq":(6500,7500),"deess_db":(3,5),"hall_decay":(1.6,2.0),"hall_mix":(0.18,0.24)},"808":{"gain":(2,5),"hpf":(20,30),"lf_db":(3,5),"sat_drive":(6,10),"sat_mix":(0.3,0.4),"sidechain_ratio":(7,9),"sidechain_floor":(-10,-8)},"Kick":{"gain":(2,4),"hpf":(25,35),"lf_db":(2,4),"sat_drive":(5,7),"sat_mix":(0.25,0.35)},"Snare":{"gain":(0,3),"hpf":(100,140),"reverb_decay":(0.7,0.9),"reverb_mix":(0.14,0.18)},"Hi-Hats":{"hpf":(230,270),"air_freq":(10000,12000),"air_db":(2,4)},"Keys":{"hpf":(130,170),"chorus_mix":(0.35,0.45),"hall_decay":(2.0,2.4),"hall_mix":(0.16,0.20)}}},
 "House": {"tempo":(120,130),"lufs":(-8,-6),"roles":{"Kick":{"gain":(3,5),"hpf":(25,35),"lf_db":(3,5)},"Bass":{"gain":(1,4),"hpf":(25,35),"lf_db":(2,4),"sidechain_ratio":(3,5),"sidechain_floor":(-9,-7),"sat_drive":(3,5),"sat_mix":(0.25,0.35)},"Hi-Hats":{"hpf":(280,320),"air_freq":(8000,10000),"air_db":(2,4)},"Snare":{"gain":(0,2),"hpf":(180,220),"reverb_decay":(0.9,1.1),"reverb_mix":(0.13,0.17)},"Lead Vocal":{"gain":(0,2),"hpf":(90,110),"hf_db":(0.5,1.5),"comp_ratio":(4,4),"plate_decay":(1.1,1.3),"plate_mix":(0.12,0.16),"delay_division":(2,2)},"Keys":{"chorus_mix":(0.35,0.45),"sidechain_ratio":(3,5),"sidechain_floor":(-8,-6)}}},
 "R&B": {"tempo":(60,110),"lufs":(-10,-7),"roles":{"Lead Vocal":{"gain":(0,2),"hpf":(70,90),"lf_db":(0.5,1.5),"hf_db":(1.5,2.5),"comp_ratio":(4,4),"air_freq":(10000,12000),"air_db":(1.5,2.5),"plate_decay":(1.4,1.7),"plate_mix":(0.14,0.18),"delay_mix":(0.10,0.14)},"Harmony":{"gain":(-2,1),"hpf":(90,110),"width":(1.3,1.5),"plate_decay":(1.3,1.6),"plate_mix":(0.10,0.14)},"Kick":{"gain":(1,3),"hpf":(25,35),"lf_db":(1.5,2.5)},"Snare":{"gain":(0,2),"hpf":(130,170),"reverb_decay":(1.0,1.2),"reverb_mix":(0.16,0.20)},"Bass":{"gain":(0,3),"hpf":(25,35),"lf_db":(2,4),"mid_cut":(-2.5,-1.5),"sidechain_ratio":(3,5)},"Keys":{"hpf":(100,130),"chorus_mix":(0.25,0.35),"delay_mix":(0.08,0.12)}}},
 "Alt Rock": {"tempo":(100,160),"lufs":(-9,-7),"roles":{"Lead Vocal":{"gain":(0,3),"hpf":(90,110),"mid_db":(0.5,1.5),"hf_db":(0.5,1.5),"comp_ratio":(4,4),"deess_freq":(5500,6500),"slapback_ms":(90,110),"slapback_mix":(0.10,0.14),"plate_decay":(1.1,1.3),"plate_mix":(0.14,0.18)},"Guitars":{"gain":(-4,-1),"hpf":(70,90),"mid_boost_freq":(600,800),"mid_boost_db":(0.5,1.5),"high_mid_freq":(2800,3200),"high_mid_db":(1.5,2.5),"sat_drive":(5,7),"sat_mix":(0.3,0.4)},"Kick":{"gain":(2,4),"hpf":(25,35),"lf_db":(2,4),"parallel_blend":(0.3,0.4)},"Snare":{"gain":(0,3),"hpf":(100,140),"high_mid_freq":(4500,5500),"high_mid_db":(2,4),"reverb_decay":(1.0,1.2),"reverb_mix":(0.16,0.20)},"Hi-Hats":{"hpf":(280,320),"air_freq":(9000,11000),"air_db":(1.5,2.5)},"Bass":{"gain":(0,3),"hpf":(25,35),"lf_db":(1.5,2.5),"sat_drive":(4,6),"sat_mix":(0.25,0.35)}}},
}
INSTRUMENTS = {"Pop":["Lead Vocal","Kick","Snare","Hi-Hats","Bass","Guitars","Keys","Harmony"],"Boom Bap":["Lead Vocal","Kick","Snare","Hi-Hats","Bass","Keys","Guitars","Harmony"],"Trap":["Lead Vocal","808","Kick","Snare","Hi-Hats","Keys","Harmony"],"House":["Kick","Bass","Hi-Hats","Snare","Lead Vocal","Keys"],"R&B":["Lead Vocal","Harmony","Kick","Snare","Bass","Keys"],"Alt Rock":["Lead Vocal","Guitars","Kick","Snare","Hi-Hats","Bass"]}
REFS = {"Pop":"Flowers - Miley Cyrus","Boom Bap":"Nuthin' but a 'G' Thang - Dr. Dre ft. Snoop Dogg","Trap":"Sicko Mode - Travis Scott ft. Drake","House":"Show Me Love - Robin S. (StoneBridge Mix)","R&B":"Leave the Door Open - Silk Sonic","Alt Rock":"Smells Like Teen Spirit - Nirvana"}

def R(lo,hi): return round(random.uniform(lo,hi),2)

def synth_recipe(genre, role):
    t = GENRE_TEMPLATES[genre]; p = dict(t["roles"][role])
    for k,v in [("plate_mix",(0.10,0.16)),("hall_mix",(0.16,0.22)),("reverb_mix",(0.12,0.18)),("slapback_mix",(0.10,0.14)),("delay_mix",(0.10,0.16)),("sat_mix",(0.3,0.4)),("sidechain_floor",(-10,-8)),("deess_db",(2,4)),("hf_db",(0.5,1.5)),("lf_db",(1,3)),("air_db",(1.5,2.5)),("mid_cut",(-3,-1))]:
        p.setdefault(k,v)
    out = {"genre":genre,"role":role,"tempo":random.randint(*t["tempo"]),"lufs_target":R(*t["lufs"])}
    if "gain" in p and isinstance(p["gain"],tuple): out["gain_db"]=R(*p["gain"])
    if "hpf" in p: out["hpf_hz"]=R(*p["hpf"])
    if "lf_db" in p: out["lf_shelf_db"]=R(*p["lf_db"])
    if "lf_boost" in p: out["lf_boost"]={"freq_hz":random.choice([50,60,70,80]),"db":R(*p["lf_boost"])}
    if "air_freq" in p: out["air_shelf"]={"freq_hz":R(*p["air_freq"]),"db":R(*p["air_db"])}
    if "sat_drive" in p: out["saturation"]={"drive_db":R(*p["sat_drive"]),"mix":R(*p["sat_mix"])}
    if "sidechain_ratio" in p: out["sidechain"]={"ratio":R(*p["sidechain_ratio"]),"floor_db":R(*p["sidechain_floor"])}
    if "comp_ratio" in p: out["compression"]={"ratio":p["comp_ratio"][0],"attack_ms":random.choice([100,150,200,300]),"release_ms":random.choice([80,100,120,150])}
    if "plate_decay" in p: out["reverb"]={"type":"plate","decay_s":R(*p["plate_decay"]),"predelay_ms":random.choice([20,30,35,40]),"mix":R(*p["plate_mix"])}
    if "hall_decay" in p: out["reverb"]={"type":"hall","decay_s":R(*p["hall_decay"]),"predelay_ms":random.choice([10,15,20]),"mix":R(*p["hall_mix"])}
    if "reverb_decay" in p: out["reverb"]={"type":"room","decay_s":R(*p["reverb_decay"]),"mix":R(*p["reverb_mix"])}
    if "delay_division" in p or "delay_mix" in p: out["delay"]={"division":p.get("delay_division",(1,2))[0] if isinstance(p.get("delay_division"),tuple) else p.get("delay_division",1),"feedback":R(0.15,0.3),"mix":R(*p["delay_mix"])}
    if "slapback_ms" in p: out["delay"]={"time_ms":R(*p["slapback_ms"]),"feedback":0.0,"mix":R(*p["slapback_mix"])}
    if "chorus_mix" in p: out["chorus"]={"mix":R(*p["chorus_mix"])}
    if "mid_cut_freq" in p: out["mid_cut"]={"freq_hz":R(*p["mid_cut_freq"]),"db":R(*p["mid_cut_db"])}
    if "mid_boost_freq" in p: out["mid_boost"]={"freq_hz":R(*p["mid_boost_freq"]),"db":R(*p["mid_boost_db"])}
    if "high_mid_freq" in p: out["high_mid"]={"freq_hz":R(*p["high_mid_freq"]),"db":R(*p["high_mid_db"])}
    if "parallel_blend" in p: out["parallel_comp_blend"]=R(*p["parallel_blend"])
    if "deess_freq" in p: out["deesser"]={"freq_hz":R(*p["deess_freq"]),"amount_db":R(*p["deess_db"])}
    if "hf_db" in p: out["hf_shelf_db"]=R(*p["hf_db"])
    if "width" in p: out["stereo_width"]=R(*p["width"])
    if "mid_cut" in p and isinstance(p["mid_cut"],tuple) and "mid_cut_freq" not in p: out["mid_cut_db"]=R(*p["mid_cut"])
    return out

# ---- build dataset ----
print("Downloading MixParams...")
urllib.request.urlretrieve("https://huggingface.co/datasets/mclemcrew/MixParams/resolve/main/data/train-00000-of-00001.parquet","/kaggle/working/mixparams.parquet")
import pyarrow.parquet as pq
df = pq.read_table("/kaggle/working/mixparams.parquet").to_pandas()
gmap = {"POP":"Pop","POP ROCK":"Pop","ROCK":"Alt Rock","HARD ROCK":"Alt Rock","INDIE ROCK":"Alt Rock","FUNK":"R&B","SOUL":"R&B","COUNTRY":"Pop"}
examples = []
for _,row in df.iterrows():
    genre=str(row["genre"]).strip(); g=gmap.get(genre,genre); track=str(row["track_name"]).strip()
    inst_type=str(row["track_instrument_type"]).strip(); inst_sub=str(row["track_instrument_subtype"]).strip()
    lufs=float(row["track_audio_lufs"]); params=row["parameters"]
    ref=REFS.get(g,"")
    instr=(f"You are a mixing engineer. Reference track (A/B target): {ref}. Provide a mixing recipe (JSON) for a "
           f"{inst_sub.lower()} {inst_type.lower()} track ({track}) in a {genre.lower()} song at measured loudness {lufs:.1f} LUFS.")
    examples.append({"instruction":instr,"output":params if isinstance(params,str) else json.dumps(params),"genre":g,"instrument":inst_sub,"source":"mixparams"})

for genre,roles in INSTRUMENTS.items():
    for role in roles:
        if role not in GENRE_TEMPLATES[genre]["roles"]: continue
        for _ in range(40):
            recipe=synth_recipe(genre,role)
            ref=REFS.get(genre,"")
            instr=(f"You are a mixing engineer specializing in {genre}. Reference track (A/B target): {ref}. Provide a mixing recipe (JSON) for a {role.lower()} track in a {genre} song at {recipe['tempo']} BPM targeting {recipe['lufs_target']} LUFS.")
            examples.append({"instruction":instr,"output":json.dumps(recipe),"genre":genre,"instrument":role,"source":"synthetic"})

# mastering-chain examples
MASTERING = {
 "Pop": {"lufs":-7.0,"tp":-1.0,"width":1.15,"chain":["Multiband Comp (3-band)","Stereo Widener","M/S EQ","True Peak Limiter","Dither"]},
 "Trap": {"lufs":-6.0,"tp":-0.8,"width":1.0,"chain":["Multiband Comp","Saturation","M/S EQ","True Peak Limiter","Dither"]},
 "House": {"lufs":-7.0,"tp":-1.0,"width":1.2,"chain":["Bus Comp","Stereo Widener","M/S EQ","True Peak Limiter","Dither"]},
 "R&B": {"lufs":-8.5,"tp":-1.0,"width":1.25,"chain":["Bus Comp","Tape Sat","M/S EQ","True Peak Limiter","Dither"]},
 "Alt Rock": {"lufs":-8.0,"tp":-1.0,"width":1.1,"chain":["Bus Comp","Tape Sat","M/S EQ","True Peak Limiter","Dither"]},
 "Boom Bap": {"lufs":-8.5,"tp":-1.0,"width":1.0,"chain":["Bus Comp","Tape Sat","M/S EQ","True Peak Limiter","Dither"]},
}
for genre,mc in MASTERING.items():
    for _ in range(25):
        recipe = {"genre":genre,"task":"mastering","target_lufs":mc["lufs"],"true_peak_db":mc["tp"],"stereo_width":mc["width"],"chain":mc["chain"],"tempo":random.randint(*GENRE_TEMPLATES[genre]["tempo"])}
        ref=REFS.get(genre,"")
        instr=(f"You are a mastering engineer specializing in {genre}. Reference track (A/B target): {ref}. Provide a mastering chain (JSON) targeting {mc['lufs']} LUFS, true peak {mc['tp']} dBTP, stereo width {mc['width']}.")
        examples.append({"instruction":instr,"output":json.dumps(recipe),"genre":genre,"instrument":"Master Bus","source":"mastering"})

random.shuffle(examples)
n=len(examples); a=int(n*0.90); b=int(n*0.95)
train,val,test = examples[:a], examples[a:b], examples[b:]
print(f"total={n} train={len(train)} val={len(val)} test={len(test)}")

# ---- load model ----
model, tokenizer = FastModel.from_pretrained(model_name="unsloth/Qwen3.5-4B", max_seq_length=1024, load_in_4bit=True, full_finetuning=False)
model = FastModel.get_peft_model(model, r=32, lora_alpha=32, lora_dropout=0.05, target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"])
print("model loaded")

def fmt(ex): return {"text": "USER: " + ex["instruction"] + "\nASSISTANT: " + ex["output"]}
train_ds = Dataset.from_list(train).map(fmt)
val_ds = Dataset.from_list(val).map(fmt)

args = SFTConfig(output_dir="/kaggle/working/qwen_mix_adapter", per_device_train_batch_size=2, gradient_accumulation_steps=4, num_train_epochs=3, learning_rate=2e-4, warmup_ratio=0.05, lr_scheduler_type="cosine", logging_steps=25, save_steps=200, save_total_limit=3, eval_strategy="steps", eval_steps=200, max_seq_length=1024, fp16=True, dataset_text_field="text", push_to_hub=False)
trainer = SFTTrainer(model=model, tokenizer=tokenizer, train_dataset=train_ds, eval_dataset=val_ds, args=args)
stats = trainer.train()
final_loss = float(stats.metrics.get("train_loss", 0))
print("runtime sec:", stats.metrics["train_runtime"])
print("peak VRAM GB:", round(torch.cuda.max_memory_reserved()/1e9,2))

model.save_pretrained("/kaggle/working/qwen_mix_adapter")
tokenizer.save_pretrained("/kaggle/working/qwen_mix_adapter")
print("saved adapter")
hf_token = os.environ.get("HF_TOKEN","")
if hf_token:
    try:
        model.push_to_hub("tap919/qwen3.5-4b-audio-mix", token=hf_token)
        tokenizer.push_to_hub("tap919/qwen3.5-4b-audio-mix", token=hf_token)
        print("pushed to HF Hub")
    except Exception as e:
        print("HF push skipped/failed:", e)
else:
    print("HF_TOKEN not set; adapter saved locally only")

# ---- eval: JSON validity on held-out ----
FastModel.for_inference(model)
valid = 0; total = 0
for ex in test[:30]:
    total += 1
    prompt = "USER: " + ex["instruction"] + "\nASSISTANT: "
    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    out = model.generate(**inputs, max_new_tokens=400, temperature=0.3, do_sample=False)
    txt = tokenizer.decode(out[0], skip_special_tokens=True)
    # extract after ASSISTANT:
    gen = txt.split("ASSISTANT:")[-1].strip()
    try:
        obj = json.loads(gen)
        if isinstance(obj, dict) and ("genre" in obj or "task" in obj):
            valid += 1
    except Exception:
        pass
json_validity = round(valid / max(total,1), 3)
print("JSON validity:", json_validity, valid, "/", total)

result = {"ok": True, "final_loss": final_loss, "steps": trainer.state.global_step, "json_validity": json_validity, "train_examples": len(train), "val_examples": len(val), "test_examples": len(test), "genres": list(MASTERING.keys()), "adapter_path": "/kaggle/working/qwen_mix_adapter", "hf_repo": "tap919/qwen3.5-4b-audio-mix", "runtime_sec": stats.metrics["train_runtime"], "peak_vram_gb": round(torch.cuda.max_memory_reserved()/1e9,2)}
PYEOF
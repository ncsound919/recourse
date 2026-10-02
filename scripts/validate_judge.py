"""Validate the reward model before we rely on it: does it actually rank?"""
import time, torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL = "OpenAssistant/reward-model-deberta-v3-base"  # small, fast to validate
print(f"loading {MODEL} ...", flush=True)
t0 = time.time()
tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForSequenceClassification.from_pretrained(MODEL, num_labels=1, dtype=torch.float32)
model.eval()
print(f"loaded in {time.time()-t0:.1f}s\n")

def score(ctx, cands):
    with torch.no_grad():
        enc = tok([ctx]*len(cands), cands, padding=True, truncation=True,
                  max_length=512, return_tensors="pt")
        return [float(v) for v in model(**enc).logits.squeeze(-1).tolist()]

# Test 1: does it prefer the sorted output for a sorting task?
ctx1 = ("A list transform sorts the list in ascending order. "
        "Known: [5,4,3] -> [3,4,5].  Given input [3,1,2], choose the correct output.")
c1 = ["[1,2,3]", "[2,1,3]", "[3,2,1]"]
print("TEST 1  sorting: for [3,1,2]")
for c, s in zip(c1, score(ctx1, c1)):
    print(f"   {c:>10}  score={s:+.4f}{'   <-- argmax' if c == max(c1, key=lambda x: score(ctx1,c1)[c1.index(x)]) else ''}")
best1 = c1[max(range(3), key=lambda i: score(ctx1,c1)[i])]
print(f"   picked: {best1}   correct: [1,2,3]   -> {'PASS' if best1=='[1,2,3]' else 'FAIL'}\n")

# Test 2: dedupe
ctx2 = ("A list transform removes duplicate elements, keeping first occurrences. "
        "Known: [1,1,2] -> [1,2].  Given input [3,1,2,1], choose the correct output.")
c2 = ["[1,2,3]", "[3,1,2]", "[1,1,2,3]"]
sc2 = score(ctx2, c2)
best2 = c2[max(range(3), key=lambda i: sc2[i])]
print("TEST 2  dedupe: for [3,1,2,1]")
for c, s in zip(c2, sc2): print(f"   {c:>10}  score={s:+.4f}")
print(f"   picked: {best2}   correct: [1,2,3]   -> {'PASS' if best2=='[1,2,3]' else 'FAIL'}\n")

# Test 3: negative control - a nonsense context should NOT favour the same answer
ctx3 = "Describe the colour of the sky over a desert at midnight."
sc3 = score(ctx3, c1)
best3 = c1[max(range(3), key=lambda i: sc3[i])]
print("TEST 3  negative control (unrelated context)")
for c, s in zip(c1, sc3): print(f"   {c:>10}  score={s:+.4f}")
print(f"   picked: {best3}  (no correct answer exists — spread matters, not just a constant winner)")
print(f"   score spread test1={max(score(ctx1,c1))-min(score(ctx1,c1)):.4f}  test3={max(sc3)-min(sc3):.4f}\n")

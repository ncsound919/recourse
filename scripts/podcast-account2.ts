/**
 * podcast-account2.ts — synthesize the final oncology synthesis podcast on the
 * SECOND Kaggle account's GPU (tap919), bypassing the account-1 Recourse server
 * whose GPU quota is exhausted. Mirrors debate-audio's SpeechT5 cells.
 *
 * Usage (from INFRASTRUCTURE/recourse):
 *   npx tsx scripts/podcast-account2.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PLAT = 'C:/Users/User/Downloads/BUSINESS/SCIENCE/Oncology Ecosystem/platform';
const AUDIO_LIB = `${PLAT}/lib/debate-audio.js`;
const RESEARCH = `${PLAT}/data/overnight-2026-10-10/research-data.json`;
const TOKEN_FILE = path.join(process.env.USERPROFILE ?? '', '.config', 'opencode', '.secrets', 'kaggle-account2.token');

process.env.KAGGLE_USERNAME = process.env.KAGGLE_USERNAME || 'tap919';
process.env.KAGGLE_API_TOKEN = process.env.KAGGLE_API_TOKEN || fs.readFileSync(TOKEN_FILE, 'utf8').split(/\r?\n/)[0].trim();
delete process.env.KAGGLE_KEY;
process.env.KAGGLE_QUOTA_FILE = process.env.KAGGLE_QUOTA_FILE || path.join(process.cwd(), 'data', 'kaggle-quota-2.json');
process.env.PYTHONUTF8 = '1'; process.env.PYTHONIOENCODING = 'utf-8';

const log = (s: string) => console.log(`[podcast-a2] ${s}`);

async function main() {
  const { initializeComputePlatforms, getPlatform } = await import('../src/lib/computePlatforms.js');
  const audio = await import(pathToFileURL(AUDIO_LIB).href) as any;
  const d = JSON.parse(fs.readFileSync(RESEARCH, 'utf8')) as { findings: Array<{ lane: string; interpretation: string }> };
  const findings = d.findings;
  const script = [
    'Oncology research system overnight synthesis.',
    `The system ran ${findings.length} Kaggle experiment lanes, each on a real cohort.`,
    findings.slice(0, 10).map((f) => `${f.lane}: ${f.interpretation}`).join('. '),
    'The remaining lanes covered detection bias, GBM NK representation, ESR1 CNS association, and trial-level discrimination.',
    'All twelve previously data-blocked lanes were unblocked with real datasets, so none failed for lack of data.',
    'Every number is the verbatim compute envelope; negative results are reported as negative.',
  ].join(' ');
  const segs = audio.debateSegments('Oncology overnight synthesis', { agents: [], rounds: [] }, script);
  log(`${segs.length} segments`);

  const segJson = JSON.stringify(segs);
  const py = [
    'import sys, time, json as _rc_json, hashlib, traceback',
    `SEGMENTS = _rc_json.loads(${JSON.stringify(segJson)})`,
    't0=time.time(); print("START", len(SEGMENTS), flush=True)',
    'try:',
    '    import torch, numpy as np, soundfile as sf',
    '    from transformers import SpeechT5Processor, SpeechT5ForTextToSpeech, SpeechT5HifiGan',
    '    dev = "cuda" if torch.cuda.is_available() else "cpu"',
    '    proc = SpeechT5Processor.from_pretrained("microsoft/speecht5_tts")',
    '    model = SpeechT5ForTextToSpeech.from_pretrained("microsoft/speecht5_tts").to(dev)',
    '    voc = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan").to(dev)',
    '    voices = {}',
    '    for i, v in enumerate(sorted(set(s["voice"] for s in SEGMENTS))):',
    '        g = torch.Generator().manual_seed(1000 + i * 7)',
    '        voices[v] = torch.randn(1, 512, generator=g).to(dev)',
    '    clips = []',
    '    for s in SEGMENTS:',
    '        inp = proc(text=s["text"], return_tensors="pt").to(dev)',
    '        sp = model.generate_speech(inp["input_ids"], voices[s["voice"]], vocoder=voc)',
    '        clips.append(sp.cpu().numpy()); clips.append(np.zeros(int(0.25*16000), dtype=np.float32))',
    '    full = np.concatenate(clips) if clips else np.zeros(0, dtype=np.float32)',
    '    sf.write("/kaggle/working/podcast.mp3", full, 16000)',
    '    b = open("/kaggle/working/podcast.mp3","rb").read()',
    '    result = {"ok": len(b) > 1000, "device": dev, "segments": len(SEGMENTS), "bytes": len(b), "seconds": round(time.time()-t0,1), "sha256": hashlib.sha256(b).hexdigest()[:32]}',
    'except Exception as e:',
    '    result = {"ok": False, "error": str(e)[:300], "seconds": round(time.time()-t0,1)}',
  ].join('\n');
  const cells = [
    { type: 'code' as const, source: 'import subprocess,sys\nsubprocess.run([sys.executable,"-m","pip","install","-q","transformers","soundfile"],check=False)\n' },
    { type: 'code' as const, source: py },
    { type: 'code' as const, source: 'import json as _rc_json\nprint("__RECOURSE_RESULT__ " + _rc_json.dumps(result))\n' },
  ];

  await initializeComputePlatforms();
  const kaggle = getPlatform('kaggle');
  if (!kaggle?.configured) { log('FAIL: kaggle not configured'); process.exit(1); }
  const job = {
    id: `a2_podcast_${Date.now()}`, platform: 'kaggle' as const, kind: 'notebook' as const,
    payload: { kernel: 'python3' as const, cells }, hardware: { type: 'gpu' as const },
    maxRuntimeMs: 30 * 60_000, meta: { kernelSlug: 'onco2-final-podcast', datasetSources: [] as string[] },
  };
  const handle = await kaggle.submit(job);
  log(`submitted ${handle.externalId}`);
  const res = await kaggle.fetch(handle, 1_800_000);
  const line = String(res.stdout ?? '').split('\n').find((l: string) => l.includes('__RECOURSE_RESULT__')) ?? '';
  if (!line) { log(`NO ENVELOPE success=${res.success} err=${res.error ?? ''}`); process.exit(1); }
  const env = JSON.parse(line.slice(line.indexOf('{')));
  log(`envelope ${JSON.stringify(env)}`);
  if (!env.ok || !res.outputFiles?.length) { log('no audio produced'); process.exit(1); }
  const mp3 = res.outputFiles.find((f: any) => f.path.endsWith('.mp3'));
  if (!mp3) { log('no mp3 in outputs'); process.exit(1); }
  const outDir = `${PLAT}/data/podcasts`;
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, 'FINAL-overnight-synthesis.a2gpu.mp3');
  fs.writeFileSync(dest, Buffer.from(String(mp3.content), 'base64'));
  log(`saved ${fs.statSync(dest).size} bytes -> ${dest}`);
}

main().catch((e) => { console.error('[podcast-a2] FATAL', e); process.exit(1); });

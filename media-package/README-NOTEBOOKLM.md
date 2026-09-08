# NotebookLM Media Generation — Setup Guide

This package contains everything needed to generate **audio overviews, video overviews,
summaries, FAQs, and study guides** for Recourse + Overlay Oncology in Google
NotebookLM.

> Note: NotebookLM requires your logged-in Google session. There is no programmatic API
> for generating overviews, and no Google/NotebookLM credential exists in Recourse,
> AgentBrowser, or Keywire (the Gemini key previously in the ecosystem was removed by a
> security audit). The path below is: upload these sources to a NotebookLM notebook and
> click generate.

## Step 1 — What to upload

Create a NotebookLM notebook and upload **all** of these sources:

| Source | File | Why |
|---|---|---|
| System brief | `sources/recourse-oncology-system-brief.md` | The main explainer — the audio/video overview will be grounded in this |
| Marketing pulse | `assets/marketing-pulse.json` | Brand-voice enforcement examples |
| Strategist report | `assets/strategist-report.json` | Venture positioning + clustering evidence |
| Pipeline data | `assets/pipeline-full.json` (see below) | Real numbers the overview can cite |

Generate the pipeline data if you need a fresh copy:

```bash
# from the Recourse dir, with the server running:
Invoke-RestMethod -Uri "http://localhost:3050/api/recourse/kg/live/pipeline" -Method Post -Body '{}' | ConvertTo-Json -Depth 6 > media-package/assets/pipeline-full.json
```

## Step 2 — Generate the media

1. Open [notebooklm.google.com](https://notebooklm.google.com)
2. **New notebook** → name it e.g. "Recourse + Overlay Oncology"
3. **Add sources** → upload the files above
4. In the notebook:
   - **Audio Overview** → "Generate" → two AI hosts discuss the systems
   - **Video Overview** (where available) → narrated visual walkthrough
   - **Studio** → ask grounded questions ("What is closed-loop falsification?",
     "What does the evidence dossier prove?", "What is the differentiation vs Tempus?")
5. Export the audio/video files when done.

## Step 3 — Tips for good overviews

- The system brief is written to be self-contained and honest; NotebookLM will ground on
  it. Keep the "Honest scope" section — it prevents the overview from over-claiming.
- If an overview over-claims (e.g. says "cures cancer"), regenerate with the brief plus
  a short instruction note: *"Emphasize that this is in-silico research infrastructure,
  not a clinical device; negative verdicts are valid findings."*
- NotebookLM citation chips will link back to the brief sections — use those in the
  investor one-pager.

## Alternative: AgentBrowser-driven (requires Google-logged profile)

If you want this automated, start AgentBrowser with its real-profile mode
(`AGENTBROWSER_COMET_REAL_PROFILE=1`) so it drives a Chrome profile that is signed into
Google. Then the browser session can open NotebookLM, create the notebook, upload the
files, and click Generate. This is the only programmatic-ish path and it depends on the
profile being logged in.
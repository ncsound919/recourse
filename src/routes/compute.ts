/**
 * compute.ts — free-tier compute platform routes (Kaggle, Hugging Face, E2B, Local)
 *
 * Exposes platform status, job submission, and unified compute client.
 */
import { Router } from 'express';
import {
  createComputeClient,
  initializeComputePlatforms,
  selectPlatform,
  getPlatform,
  type ComputeJob,
  type ComputeJobHandle,
  type ComputePlatformId,
} from '../lib/computePlatforms.js';
import { ComputeHandleStore } from '../lib/computeHandles.js';
import { drainRemoteTasks, enqueueRemoteTask, remoteComputeSnapshot } from '../lib/remoteCompute.js';
import {
  enqueueForgePrecompute,
  enqueueLearnerStressEval,
  enqueueRepairDiagnose,
  enqueueSmallModelTraining,
  enqueueSurvivalTraining,
  enqueueMetaAnalysis,
} from '../lib/remoteComputeIntegrations.js';

export interface ComputeDeps {
  /** Provenance recording for job submissions */
  appendProvenanceEvent(type: string, data: Record<string, unknown>): void;
  /** Current generation counter */
  generation(): number;
}

export function createComputeRouter(deps: ComputeDeps): Router {
  const router = Router();
  const client = createComputeClient();

  // Remember the real handles returned by submit, so poll/result/cancel hit the
  // platform's actual external id (e.g. 'djoochie/kernel-slug') instead of the
  // caller's local job id. Keyed by job id AND external id for either lookup.
  // Durable: the store replays data/compute-handles.json on boot, so a gateway
  // restart keeps the kernel refs that are still running remotely. Unknown ids
  // fall back to a stub keyed by the caller's id (same behaviour as before).
  const jobHandles = new ComputeHandleStore();
  function rememberHandle(h: ComputeJobHandle) {
    jobHandles.remember(h);
  }
  /** Stored handle wins; fall back to a stub keyed by the caller's id. */
  function lookupHandle(id: string, platform: ComputePlatformId): ComputeJobHandle {
    return jobHandles.lookup(id) ?? { id, platform, externalId: id, submittedAt: Date.now(), status: 'pending' };
  }

  // Initialize platforms on first request (lazy) or at boot via initializeComputePlatforms()
  let initialized = false;
  async function ensureInit() {
    if (!initialized) {
      await initializeComputePlatforms();
      initialized = true;
    }
  }

  // --- Platform Status ---
  router.get('/compute/platforms', async (_req, res) => {
    await ensureInit();
    const status = client.status();
    res.json({ success: true, platforms: status });
  });

  router.get('/compute/platforms/:id', async (req, res) => {
    await ensureInit();
    const platform = getPlatform(req.params.id as ComputePlatformId);
    if (!platform) {
      return res.status(404).json({ success: false, error: `Platform ${req.params.id} not found` });
    }
    res.json({ success: true, platform: { id: platform.id, name: platform.name, description: platform.description, hardware: platform.hardware, quota: platform.quota, configured: platform.configured } });
  });

  // --- Platform Selection Advice ---
  router.post('/compute/select', async (req, res) => {
    await ensureInit();
    try {
      const job = req.body as ComputeJob;
      const preferences = req.body.preferences || {};
      const selection = selectPlatform(job, preferences);
      res.json({ success: true, selection });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  // --- Job Submission ---
  router.post('/compute/jobs', async (req, res) => {
    await ensureInit();
    try {
      const job = req.body as ComputeJob;
      const platformId = req.body.platform as ComputePlatformId | undefined;

      let handle: ComputeJobHandle;
      if (platformId) {
        handle = await client.submitTo(platformId, job);
      } else {
        handle = await client.submit(job);
      }
      rememberHandle(handle);

      deps.appendProvenanceEvent('compute_job_submitted', {
        jobId: handle.id,
        platform: handle.platform,
        externalId: handle.externalId,
        generation: deps.generation(),
        hardware: job.hardware,
        maxRuntimeMs: job.maxRuntimeMs,
      });

      res.json({ success: true, handle });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Job Polling ---
  router.get('/compute/jobs/:id', async (req, res) => {
    await ensureInit();
    try {
      // We need to know the platform to poll; include it in the handle or query param
      const platformId = req.query.platform as ComputePlatformId;
      if (!platformId) {
        return res.status(400).json({ success: false, error: 'platform query param required' });
      }
      const handle = lookupHandle(req.params.id, platformId);
      const status = await client.poll(handle);
      if (jobHandles.has(handle.id)) jobHandles.update(handle.id, { status: status.state });
      res.json({ success: true, status });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Job Result (wait for completion) ---
  router.get('/compute/jobs/:id/result', async (req, res) => {
    await ensureInit();
    try {
      const platformId = req.query.platform as ComputePlatformId;
      const timeoutMs = Number(req.query.timeoutMs) || 300000;
      if (!platformId) {
        return res.status(400).json({ success: false, error: 'platform query param required' });
      }
      const handle = lookupHandle(req.params.id, platformId);
      const result = await client.await(handle, timeoutMs);
      if (jobHandles.has(handle.id)) {
        jobHandles.update(handle.id, { status: result.success ? 'completed' : 'failed' });
      }
      deps.appendProvenanceEvent('compute_job_completed', {
        jobId: handle.id,
        platform: handle.platform,
        success: result.success,
        durationMs: result.durationMs,
        generation: deps.generation(),
      });
      res.json({ success: true, result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Job Cancellation ---
  router.delete('/compute/jobs/:id', async (req, res) => {
    await ensureInit();
    try {
      const platformId = req.query.platform as ComputePlatformId;
      if (!platformId) {
        return res.status(400).json({ success: false, error: 'platform query param required' });
      }
      const handle = lookupHandle(req.params.id, platformId);
      const cancelled = await client.cancel(handle);
      res.json({ success: true, cancelled });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Convenience: Submit notebook to Kaggle ---
  router.post('/compute/kaggle/notebook', async (req, res) => {
    await ensureInit();
    try {
      const { cells, kernel = 'python3', maxRuntimeMs = 12 * 3600000, metadata } = req.body;
      if (!cells || !Array.isArray(cells)) {
        return res.status(400).json({ success: false, error: 'cells array required' });
      }

      const job: ComputeJob = {
        id: `kaggle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        platform: 'kaggle',
        kind: 'notebook',
        payload: { cells, kernel, metadata },
        hardware: { type: 'gpu', spec: 'T4' },
        maxRuntimeMs: Math.min(maxRuntimeMs, 12 * 3600000), // Respect 12h session cap
      };

      const handle = await client.submitTo('kaggle', job);
      rememberHandle(handle);
      deps.appendProvenanceEvent('compute_kaggle_notebook_submitted', {
        jobId: handle.id,
        cellCount: cells.length,
        kernel,
        maxRuntimeMs,
        generation: deps.generation(),
      });

      res.json({ success: true, handle });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Convenience: Deploy static Space to Hugging Face ---
  router.post('/compute/huggingface/static', async (req, res) => {
    await ensureInit();
    try {
      const { html, repoId, title } = req.body;
      if (!html) {
        return res.status(400).json({ success: false, error: 'html content required' });
      }

      const jobId = `hf_static_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job: ComputeJob = {
        id: jobId,
        platform: 'huggingface',
        kind: 'space',
        payload: {
          repoId: repoId || `recourse/${jobId}`,
          sdk: 'static',
          title,
          files: [{ path: 'index.html', content: html, encoding: 'utf8' }],
        },
        maxRuntimeMs: 60000, // Static deploy is fast
      };

      const handle = await client.submitTo('huggingface', job);
      rememberHandle(handle);
      deps.appendProvenanceEvent('compute_hf_static_deployed', {
        jobId: handle.id,
        repoId: handle.externalId,
        generation: deps.generation(),
      });

      res.json({ success: true, handle, url: `https://huggingface.co/spaces/${handle.externalId}` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Convenience: Deploy ZeroGPU Space to Hugging Face ---
  router.post('/compute/huggingface/zerogpu', async (req, res) => {
    await ensureInit();
    try {
      const { code, repoId, sdk = 'gradio', requirements = [], entrypoint = 'app.py', maxRuntimeMs = 3.5 * 60000 } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, error: 'code required' });
      }

      const jobId = `hf_zg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job: ComputeJob = {
        id: jobId,
        platform: 'huggingface',
        kind: 'space',
        payload: {
          repoId: repoId || `recourse/${jobId}`,
          sdk,
          entrypoint,
          requirements,
          hardware: 'zero-gpu',
          files: [{ path: entrypoint, content: code, encoding: 'utf8' }],
        },
        hardware: { type: 'gpu', spec: 'ZeroGPU' },
        maxRuntimeMs: Math.min(maxRuntimeMs, 3.5 * 60000), // Respect 3.5min daily cap
      };

      const handle = await client.submitTo('huggingface', job);
      rememberHandle(handle);
      deps.appendProvenanceEvent('compute_hf_zerogpu_submitted', {
        jobId: handle.id,
        repoId: handle.externalId,
        sdk,
        maxRuntimeMs,
        generation: deps.generation(),
      });

      res.json({ success: true, handle, url: `https://huggingface.co/spaces/${handle.externalId}` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- Convenience: Submit script to E2B ---
  router.post('/compute/e2b/script', async (req, res) => {
    await ensureInit();
    try {
      const { code, language = 'python', packages = [], maxRuntimeMs = 300000 } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, error: 'code required' });
      }

      const job: ComputeJob = {
        id: `e2b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        platform: 'e2b',
        kind: 'script',
        payload: code,
        maxRuntimeMs,
        meta: { packages },
      };

      const handle = await client.submitTo('e2b', job);
      rememberHandle(handle);
      deps.appendProvenanceEvent('compute_e2b_script_submitted', {
        jobId: handle.id,
        language,
        packages,
        maxRuntimeMs,
        generation: deps.generation(),
      });

      res.json({ success: true, handle });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // -------------------------------------------------------------------------
  // Durable remote-compute queue + loop integrations
  // -------------------------------------------------------------------------

  // Queue + platform availability snapshot.
  router.get('/compute/remote', async (_req, res) => {
    await ensureInit();
    res.json({ success: true, remote: remoteComputeSnapshot() });
  });

  // Poll every active remote task once and apply finished results.
  router.post('/compute/remote/drain', async (req, res) => {
    await ensureInit();
    try {
      const limit = Math.max(1, Math.min(25, Number(req.body?.limit) || 5));
      const summary = await drainRemoteTasks({}, limit);
      deps.appendProvenanceEvent('compute_remote_drained', {
        polled: summary.polled,
        completed: summary.completed.length,
        failed: summary.failed.length,
        applied: summary.applied,
        generation: deps.generation(),
      });
      res.json({ success: true, summary: { ...summary, completed: summary.completed.length, failed: summary.failed.length } });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Small-model training on a remote GPU (Kaggle) — real sklearn training.
  router.post('/compute/remote/train/small-model', async (req, res) => {
    await ensureInit();
    try {
      const { rows, target, task, model, testFraction, platform, hardware, maxRuntimeMs } = req.body ?? {};
      const result = await enqueueSmallModelTraining(
        { rows, target, task, model, testFraction },
        { platform, hardware, maxRuntimeMs },
      );
      if (!result.queued) return res.status(409).json({ success: false, ...result });
      deps.appendProvenanceEvent('compute_remote_train_enqueued', { jobId: result.task!.id, platform: result.task!.platform, generation: deps.generation() });
      res.json({ success: true, task: result.task });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Batch forge candidate generation (locally re-verified before promotion).
  router.post('/compute/remote/forge/precompute', async (req, res) => {
    await ensureInit();
    try {
      const { specs, count, platform, hardware, maxRuntimeMs } = req.body ?? {};
      if (!Array.isArray(specs) || specs.length === 0) {
        return res.status(400).json({ success: false, error: 'specs array required' });
      }
      const result = await enqueueForgePrecompute(specs, { count, platform, hardware, maxRuntimeMs });
      if (!result.queued) return res.status(409).json({ success: false, ...result });
      deps.appendProvenanceEvent('compute_remote_forge_enqueued', { jobId: result.task!.id, specs: specs.length, platform: result.task!.platform, generation: deps.generation() });
      res.json({ success: true, task: result.task });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Heavy learner stress evaluation -> externalScore.
  router.post('/compute/remote/learner/stress', async (req, res) => {
    await ensureInit();
    try {
      const { script, requirements, platform, hardware, maxRuntimeMs } = req.body ?? {};
      if (!script) return res.status(400).json({ success: false, error: 'script required' });
      const result = await enqueueLearnerStressEval(script, requirements, { platform, hardware, maxRuntimeMs });
      if (!result.queued) return res.status(409).json({ success: false, ...result });
      deps.appendProvenanceEvent('compute_remote_learner_enqueued', { jobId: result.task!.id, platform: result.task!.platform, generation: deps.generation() });
      res.json({ success: true, task: result.task });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Remote reproduction/diagnosis for a stuck issue.
  router.post('/compute/remote/repair/diagnose', async (req, res) => {
    await ensureInit();
    try {
      const { script, issue, platform, hardware, maxRuntimeMs } = req.body ?? {};
      if (!script || !issue?.id) {
        return res.status(400).json({ success: false, error: 'script and issue {id,name,detail} required' });
      }
      const result = await enqueueRepairDiagnose(script, issue, { platform, hardware, maxRuntimeMs });
      if (!result.queued) return res.status(409).json({ success: false, ...result });
      deps.appendProvenanceEvent('compute_remote_repair_enqueued', { jobId: result.task!.id, issueId: issue.id, platform: result.task!.platform, generation: deps.generation() });
      res.json({ success: true, task: result.task });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Survival (Cox PH + C-index) on a remote box.
  router.post('/compute/remote/train/survival', async (req, res) => {
    await ensureInit();
    try {
      const { features, durations, events, platform, hardware, maxRuntimeMs } = req.body ?? {};
      if (!Array.isArray(features) || !Array.isArray(durations) || !Array.isArray(events)) {
        return res.status(400).json({ success: false, error: 'features, durations, events arrays required' });
      }
      const result = await enqueueSurvivalTraining({ features, durations, events }, { platform, hardware, maxRuntimeMs });
      if (!result.queued) return res.status(409).json({ success: false, ...result });
      deps.appendProvenanceEvent('compute_remote_survival_enqueued', { jobId: result.task!.id, platform: result.task!.platform, generation: deps.generation() });
      res.json({ success: true, task: result.task });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Meta-analysis (random-effects + bootstrap) on a remote box.
  router.post('/compute/remote/meta-analysis', async (req, res) => {
    await ensureInit();
    try {
      const { items, seed, boot, platform, hardware, maxRuntimeMs } = req.body ?? {};
      if (!Array.isArray(items) || items.length < 2) {
        return res.status(400).json({ success: false, error: 'items array (>=2) required' });
      }
      const result = await enqueueMetaAnalysis({ items, seed, boot }, { platform, hardware, maxRuntimeMs });
      if (!result.queued) return res.status(409).json({ success: false, ...result });
      deps.appendProvenanceEvent('compute_remote_meta_analysis_enqueued', { jobId: result.task!.id, k: items.length, platform: result.task!.platform, generation: deps.generation() });
      res.json({ success: true, task: result.task });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Generic enqueue (advanced): any supported remote task kind.
  router.post('/compute/remote/enqueue', async (req, res) => {
    await ensureInit();
    try {
      const { kind, payload, platform, hardware, maxRuntimeMs } = req.body ?? {};
      if (!kind || !payload || typeof payload !== 'object') {
        return res.status(400).json({ success: false, error: 'kind and payload required' });
      }
      const result = await enqueueRemoteTask(kind, payload, { platform, hardware, maxRuntimeMs });
      if (!result.queued) return res.status(409).json({ success: false, ...result });
      deps.appendProvenanceEvent('compute_remote_enqueued', { jobId: result.task!.id, kind, platform: result.task!.platform, generation: deps.generation() });
      res.json({ success: true, task: result.task });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}
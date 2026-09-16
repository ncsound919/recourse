/**
 * Product router — the extracted, stateless operators for the productized
 * surfaces: environment telemetry, the budgeted wallet, and audio/video
 * transcription. Extracted from the `server.ts` monolith following the same
 * `create*Router()` factory pattern as the other `src/routes/*` modules.
 *
 * All dependencies are injected (wallet, repo root, auth guard) so this module
 * is testable without booting the server and holds no hidden global state
 * except its own bounded telemetry history.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Wallet } from '../lib/wallet';
import { collectTelemetry, type TelemetrySnapshot } from '../lib/telemetry';
import { transcribeBytes, transcribeUrl, transcribeSidecarHealth } from '../lib/transcribeSidecarClient';

export interface ProductRouterDeps {
  wallet: Wallet;
  repoRoot: () => string;
  requireMutationAuth: (req: Request, res: Response) => boolean;
  /** Max telemetry snapshots retained (default 200). */
  historyLimit?: number;
}

export interface ProductRouter {
  router: Router;
  /** Collect a snapshot (or accept one) and append it to the bounded history. */
  recordTelemetry(existing?: TelemetrySnapshot): TelemetrySnapshot;
  telemetryHistory(): TelemetrySnapshot[];
}

export function createProductRouter(deps: ProductRouterDeps): ProductRouter {
  const router = Router();
  const history: TelemetrySnapshot[] = [];
  const limit = Math.max(1, deps.historyLimit ?? 200);

  const recordTelemetry = (existing?: TelemetrySnapshot): TelemetrySnapshot => {
    const snapshot = existing ?? collectTelemetry(deps.repoRoot());
    history.push(snapshot);
    if (history.length > limit) history.splice(0, history.length - limit);
    return snapshot;
  };

  router.get('/telemetry', (_req, res) => {
    try {
      res.json({ success: true, snapshot: collectTelemetry(deps.repoRoot()), history: history.slice(-20) });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get('/audio/status', async (_req, res) => {
    const health = await transcribeSidecarHealth();
    res.json({ success: true, health });
  });

  router.post('/audio/transcribe', async (req, res) => {
    try {
      const { url, dataBase64, filename, language, model } = req.body ?? {};
      if (typeof url === 'string' && url) {
        const result = await transcribeUrl(url, { language, model });
        return res.json({ success: result.ok, transcription: result });
      }
      if (typeof dataBase64 === 'string' && dataBase64) {
        const result = await transcribeBytes(dataBase64, { filename, language, model });
        return res.json({ success: result.ok, transcription: result });
      }
      return res.status(400).json({ success: false, error: 'provide either url or dataBase64' });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get('/wallet', (_req, res) => {
    const rec = deps.wallet.reconcile();
    res.json({ success: true, file: deps.wallet.file(), chainValid: rec.valid, brokenAt: rec.brokenAt, balances: rec.balances });
  });

  router.post('/wallet/budget', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const { token, capCents, description } = req.body ?? {};
      const entry = deps.wallet.setBudget(String(token), Number(capCents), description ? String(description) : undefined);
      res.json({ success: true, entry, balance: deps.wallet.balance(String(token)) });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message, code: e.code });
    }
  });

  router.post('/wallet/credit', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const { token, cents, description } = req.body ?? {};
      const entry = deps.wallet.credit(String(token), Number(cents), description ? String(description) : undefined);
      res.json({ success: true, entry, balance: deps.wallet.balance(String(token)) });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message, code: e.code });
    }
  });

  router.post('/wallet/spend', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const { token, cents, description } = req.body ?? {};
      const entry = deps.wallet.debit(String(token), Number(cents), description ? String(description) : undefined);
      res.json({ success: true, entry, balance: deps.wallet.balance(String(token)) });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message, code: e.code });
    }
  });

  return { router, recordTelemetry, telemetryHistory: () => history.slice() };
}

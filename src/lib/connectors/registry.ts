/**
 * connectors/registry.ts — a declarative registry for external connectors.
 * Duplicate ids are rejected loudly; the registry is the single place an
 * integration is declared and health-probed.
 */
import type { ConnectorHealth, ConnectorManifest } from './types';

export class ConnectorRegistry {
  private readonly items = new Map<string, ConnectorManifest>();

  register(manifest: ConnectorManifest): void {
    if (!manifest?.id) throw new Error('connector manifest requires an id');
    if (this.items.has(manifest.id)) throw new Error(`connector "${manifest.id}" is already registered`);
    this.items.set(manifest.id, { ...manifest });
  }

  get(id: string): ConnectorManifest | undefined {
    const m = this.items.get(id);
    return m ? { ...m } : undefined;
  }

  list(): ConnectorManifest[] {
    return [...this.items.values()].map((m) => ({ ...m })).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Probe a connector's health endpoint; honest failure when unreachable. */
  async health(
    id: string,
    opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
  ): Promise<ConnectorHealth> {
    const m = this.items.get(id);
    if (!m) return { id, ok: false, error: `unknown connector "${id}"` };
    if (!m.baseUrl) return { id, ok: false, error: 'connector has no baseUrl' };
    const doFetch = opts.fetchImpl ?? fetch;
    const timeoutMs = opts.timeoutMs ?? 3000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const url = `${m.baseUrl.replace(/\/$/, '')}${m.healthPath ?? '/health'}`;
      const res = await doFetch(url, { signal: controller.signal });
      return { id, ok: res.ok, status: res.status, latencyMs: Date.now() - started };
    } catch (err) {
      const message = err instanceof Error && err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : err instanceof Error ? err.message : String(err);
      return { id, ok: false, latencyMs: Date.now() - started, error: message };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const connectors = new ConnectorRegistry();

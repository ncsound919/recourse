// Shared authenticated fetch for Recourse's own API.
//
// The server enforces RECOURSE_API_SECRET on mutating routes only when that
// secret is configured (config-gated, see server.ts requireMutationAuthIfConfigured).
// When you run the server with a secret, the dashboard must present it too —
// supply it here via VITE_RECOURSE_API_SECRET (a window override is accepted so
// a deployed UI can be pointed at a runtime value without a rebuild).

function secretFromEnv(): string {
  const anyImportMeta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return (anyImportMeta.env?.VITE_RECOURSE_API_SECRET ?? '').trim();
}

let runtimeSecret: string | null = null;

/** Optionally set the secret at runtime (e.g. from a settings field). */
export function setRecourseApiSecret(secret: string): void {
  runtimeSecret = secret.trim() || null;
}

export function recourseApiSecret(): string {
  return runtimeSecret ?? secretFromEnv();
}

/** fetch a Recourse JSON route with Content-Type + (when configured) the secret. */
export async function recourseJson(path: string, init: RequestInit = {}): Promise<any> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  const secret = recourseApiSecret();
  if (secret) headers.set('x-api-secret', secret);
  const res = await fetch(path, { ...init, headers });
  try {
    return await res.json();
  } catch {
    return { success: false, error: `non-JSON response (HTTP ${res.status})` };
  }
}

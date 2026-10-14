/**
 * scienceLog.ts — log tool development as a science paper, via the LibreOffice
 * MCP (Streamable HTTP on :8140).
 *
 * WHY: a factory that ships capability without a record of HOW is unauditable.
 * Every deterministic build already carries its method (engine, intent, files,
 * verification) — this turns that into a rendered document (docx/pdf/odt/epub)
 * a human can read, archive, or cite. The writing is delegated to the ecosystem
 * writing lane (libreoffice `lo_write`), never hand-rolled.
 *
 * Fail-open with reasons: an offline LibreOffice returns `available:false`, it
 * never fabricates a document. The MCP handshake is done inline (initialize ->
 * tools/call) because the lane is stateless HTTP.
 */
const DEFAULT_URL = process.env.LIBREOFFICE_MCP_URL || 'http://127.0.0.1:8140/mcp';
const TIMEOUT_MS = Number(process.env.RECOURSE_SCIENCE_LOG_TIMEOUT_MS) || 180000;

async function rpc(url: string, method: string, params: unknown, id: number, sessionId?: string): Promise<{ status: number; json: unknown; sessionId?: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const sid = res.headers.get('mcp-session-id') ?? undefined;
  const text = await res.text();
  // Streamable HTTP may answer as SSE; take the last data: line as the payload.
  let json: unknown = null;
  try { json = JSON.parse(text); } catch {
    const dataLine = text.split('\n').filter((l) => l.startsWith('data:')).pop();
    if (dataLine) { try { json = JSON.parse(dataLine.slice(5).trim()); } catch { /* leave null */ } }
  }
  return { status: res.status, json, ...(sid ? { sessionId: sid } : {}) };
}

export interface ScienceLogResult {
  available: boolean;
  ok: boolean;
  path?: string | null;
  verified?: boolean | null;
  missing_terms?: string[];
  reason?: string;
}

/** Render a markdown paper to a document through the LibreOffice MCP lane. */
export async function writeScienceLog(
  { markdown, path: outPath }: { markdown: string; path: string },
  opts: { url?: string } = {},
): Promise<ScienceLogResult> {
  const url = opts.url || DEFAULT_URL;
  try {
    const init = await rpc(url, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'recourse-factory', version: '1' } }, 1);
    if (init.status >= 400) return { available: true, ok: false, reason: `libreoffice mcp initialize -> ${init.status}` };
    const call = await rpc(url, 'tools/call', { name: 'lo_write', arguments: { markdown, path: outPath } }, 2, init.sessionId);
    if (call.status >= 400) return { available: true, ok: false, reason: `libreoffice mcp tools/call -> ${call.status}` };
    const result = (call.json as { result?: { structuredContent?: Record<string, unknown>; content?: Array<{ text?: string }> } })?.result;
    const structured = result?.structuredContent ?? (() => {
      const t = result?.content?.[0]?.text;
      if (!t) return null;
      try { return JSON.parse(t) as Record<string, unknown>; } catch { return null; }
    })();
    if (!structured) return { available: true, ok: false, reason: 'libreoffice mcp returned no structured result' };
    return {
      available: true,
      ok: structured.ok === true,
      path: typeof structured.path === 'string' ? structured.path : (typeof structured.file === 'string' ? structured.file : null),
      verified: typeof structured.verified === 'boolean' ? structured.verified : null,
      missing_terms: Array.isArray(structured.missing_terms) ? (structured.missing_terms as unknown[]).map(String) : undefined,
      ...(structured.ok === true ? {} : { reason: String(structured.error ?? structured.reason ?? 'lo_write reported failure') }),
    };
  } catch (err) {
    return { available: false, ok: false, reason: `libreoffice unreachable: ${(err as Error)?.message || String(err)}` };
  }
}

/** Compose the development record for one factory artifact as markdown. */
export function buildArtifactPaper(artifact: {
  id: string; kind: string; command: string; args: string[]; at: number; cwd: string;
  files: string[]; engineOk: boolean;
  verification: { ran: boolean; ok: boolean | null; method: string; detail?: string } | null;
  requestedBy?: string;
}, meta: { engine?: string; toolchain?: string[] } = {}): string {
  const when = new Date(artifact.at).toISOString();
  const verified = artifact.verification?.ok === true ? 'verified' : artifact.verification?.ok === false ? 'FAILED verification' : 'not verified';
  return [
    `# Development Record — ${artifact.kind} \`${artifact.command}\``,
    '',
    '## Abstract',
    `This record documents the deterministic generation of a ${artifact.kind} artifact (\`${artifact.command} ${artifact.args.join(' ')}\`) by the Recourse software factory. The artifact was produced by a deterministic scaffolding engine with no language-model involvement, and is reported here with its exact file set and verification verdict (${verified}).`,
    '',
    '## Method',
    `- **Engine:** ${meta.engine ?? 'Cheetah 4 (deterministic React/TS scaffolding; byte-identical for the same spec)'}`,
    `- **Command:** \`${artifact.command} ${artifact.args.join(' ')}\``,
    `- **Target:** \`${artifact.cwd}\``,
    `- **Requested by:** ${artifact.requestedBy ?? 'operator'}`,
    `- **Timestamp:** ${when}`,
    '',
    '## Results',
    `The engine reported **${artifact.files.length} file(s)**:`,
    ...artifact.files.map((f) => `- \`${f}\``),
    '',
    '## Verification',
    artifact.verification
      ? `- **Method:** ${artifact.verification.method}\n- **Verdict:** ${verified}${artifact.verification.detail ? `\n- **Detail:** ${artifact.verification.detail}` : ''}`
      : '- Not requested for this artifact.',
    '',
    '## Provenance',
    `- Artifact id: \`${artifact.id}\``,
    `- Engine ok: ${artifact.engineOk}`,
    meta.toolchain?.length ? `- Ecosystem toolchain: ${meta.toolchain.join(' → ')}` : '',
    '',
    '## Reproducibility',
    'The build is deterministic: re-running the same command against the same target yields byte-identical output. The record is therefore a faithful account, not a sample.',
  ].filter((l) => l !== '').join('\n');
}

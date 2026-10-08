import 'dotenv/config';
const base = 'http://127.0.0.1:3050';
const secret = process.env.RECOURSE_API_SECRET || '';
async function j(method: string, p: string, body?: unknown, mut = false, timeoutMs = 60_000) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (mut) headers['x-api-secret'] = secret;
  try {
    const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    let d: any = null; try { d = await r.json(); } catch {}
    return { status: r.status, ok: r.ok, d };
  } catch (e) { return { status: 0, ok: false, d: { error: e instanceof Error ? e.message : String(e) } }; }
}
const start = (await j('GET', '/api/recourse/selfhosted')).d?.count ?? 0;
console.log('selfhosted start', start);
for (let i = 0; i < 14; i++) {
  const run = await j('POST', '/api/recourse/forge/run', { count: 1 }, true, 400_000);
  const r = (run.d?.results ?? [])[0] as any;
  if (!r) { console.log('iter', i, 'no result', JSON.stringify(run.d).slice(0, 160)); continue; }
  if (r.skipped) { console.log('iter', i, 'SKIPPED', r.reason); break; }
  console.log('iter', i, r.name, r.domain, 'status=' + r.status, 'attempts=' + r.attemptsUsed + '/' + r.maxTries, 'wallMs=' + r.wallMs);
  const now = (await j('GET', '/api/recourse/selfhosted')).d?.count ?? 0;
  if (now > start) { console.log('NEW TOOL registered: selfhosted', start, '->', now); break; }
}
const end = await j('GET', '/api/recourse/selfhosted');
console.log('selfhosted end', end.d?.count, '->', (end.d?.tools ?? []).map((t: any) => t.name).join(', ').slice(0, 400));
process.exit(0);

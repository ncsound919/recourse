export default function handler(req, res) {
  const url = (req && req.url) ? String(req.url).split('?')[0] : '/';
  if (req.method === 'GET' && (url === '/' || url === '/health' || url === '/api/health')) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ ok: true, service: 'recourse-shim', version: 'v1' }));
  }
  if (req.method === 'GET' && url === '/v1/status') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ success: true, api: 'v1', service: 'recourse-shim' }));
  }
  if (req.method === 'GET' && url.startsWith('/api/recourse/memory/recall')) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ success: true, query: '', hits: [] }));
  }
  if (req.method === 'GET' && url === '/api/recourse/fleet/ideas') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ success: true, ideas: [] }));
  }
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  return res.end(JSON.stringify({ error: 'not found', path: url }));
}
/**
 * corpus.ts — ecosystem research corpus + local cancer library (datasets, PDFs,
 * literature KG) routes extracted from the `server.ts` monolith.
 *
 * The corpus roots/artifacts/scan state and the literature-doc loader are
 * host-owned and injected. The literature-KG response cache is router-local
 * (per-process, 60s TTL) and stays here.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pdfExtractBytes } from '../lib/pdfSidecarClient.js';

interface CorpusRootLite { project: string; root: string }

export interface CorpusRouterDeps {
  snapshot(): any;
  digest(snap: any): string;
  scan(): Promise<any>;
  getArtifacts(): any[];
  getRoots(): CorpusRootLite[];
  setRoots(roots: CorpusRootLite[]): void;
  getLastScan(): number | null;
  loadLiteratureDocs(): Promise<Array<{ rel: string; text: string }>>;
}

export function createCorpusRouter(deps: CorpusRouterDeps): Router {
  const router = Router();

  const localCorpusRoot = (project: string) => deps.getRoots().find((r) => r.project === project);

  function guardRel(rel: string): string | null {
    const norm = String(rel || '').replace(/\\/g, '/');
    if (!norm || norm.startsWith('/') || norm.split('/').includes('..')) return null;
    return norm;
  }

  router.get('/corpus/status', (_req, res) => {
    const snap = deps.snapshot();
    res.json({ success: true, corpus: snap, digest: deps.digest(snap) });
  });

  router.post('/corpus/scan', async (req, res) => {
    try {
      const bodyRoots = req.body?.roots;
      if (Array.isArray(bodyRoots) && bodyRoots.length) {
        const clean: CorpusRootLite[] = bodyRoots
          .filter((r: any) => r && typeof r.project === 'string' && typeof r.root === 'string')
          .map((r: any) => ({ project: String(r.project).trim(), root: String(r.root).trim() }));
        if (clean.length) deps.setRoots(clean);
      }
      const result = await deps.scan();
      res.json({ success: true, ...result.snapshot, added: result.added });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Optional filters: ?project=hempforge&kind=research&q=protein */
  router.get('/corpus/artifacts', (req, res) => {
    const artifacts = deps.getArtifacts();
    const project = typeof req.query.project === 'string' ? req.query.project : '';
    const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
    const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
    const limit = Number(req.query.limit || 200);
    let items = artifacts;
    if (project) items = items.filter((a) => a.project === project);
    if (kind) items = items.filter((a) => a.kind === kind);
    if (q) items = items.filter((a) => a.name.toLowerCase().includes(q) || a.topics.includes(q) || a.excerpt.toLowerCase().includes(q));
    items = items.sort((a, b) => b.words - a.words).slice(0, limit);
    res.json({ success: true, artifacts: items, total: artifacts.length, filtered: items.length });
  });

  /** Read the actual content of one indexed artifact (path-traversal guarded).
   *  ?project=hempforge&rel=docs/foo.md */
  router.get('/corpus/artifact', async (req, res) => {
    try {
      const project = typeof req.query.project === 'string' ? req.query.project : '';
      const rel = typeof req.query.rel === 'string' ? req.query.rel : '';
      const root = deps.getRoots().find((r) => r.project === project);
      if (!root) return res.status(404).json({ success: false, error: `unknown project ${project}` });
      const resolvedRel = rel.replace(/\\/g, '/');
      if (!resolvedRel || resolvedRel.split('/').includes('..') || resolvedRel.startsWith('/')) {
        return res.status(400).json({ success: false, error: 'invalid rel path' });
      }
      const full = await fs.promises.readFile(path.join(root.root, ...resolvedRel.split('/')), 'utf-8');
      const cap = 60_000;
      const truncated = full.length > cap;
      res.json({ success: true, project, rel, truncated, text: full.slice(0, cap), bytes: full.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/corpus/digest', (_req, res) => {
    res.json({ success: true, markdown: deps.digest(deps.snapshot()), generatedAt: new Date().toISOString() });
  });

  // --- Local cancer library: datasets --------------------------------------
  /** List dataset archives with size + inner manifest (central directory only). */
  router.get('/local-corpus/datasets', async (_req, res) => {
    try {
      const root = localCorpusRoot('cancer-datasets');
      if (!root) return res.status(404).json({ success: false, error: 'cancer-datasets root not configured' });
      let files: string[] = [];
      try {
        files = await fs.promises.readdir(root.root);
      } catch (err: any) {
        return res.status(500).json({ success: false, error: `datasets dir unreadable: ${err?.message ?? err}` });
      }
      const zips = files.filter((f) => f.toLowerCase().endsWith('.zip')).sort();
      const out: any[] = [];
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      for (const z of zips) {
        const full = path.join(root.root, z);
        let size = 0;
        try {
          size = (await fs.promises.stat(full)).size;
        } catch { /* keep 0 */ }
        let inner: string[] = [];
        let innerTotal: number | null = null;
        let manifestError: string | null = null;
        try {
          const r = await execFileAsync('python', ['-c', "import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); n=z.namelist(); print(json.dumps({'total':len(n),'sample':n[:50]}))", full], { timeout: 30000 });
          const parsed = JSON.parse(String(r.stdout || '{}'));
          innerTotal = typeof parsed.total === 'number' ? parsed.total : null;
          inner = Array.isArray(parsed.sample) ? parsed.sample : [];
        } catch (err: any) {
          manifestError = `manifest unavailable (${err?.message ?? err})`;
        }
        out.push({ file: z, sizeBytes: size, innerTotal, innerSample: inner, manifestError });
      }
      res.json({ success: true, root: root.root, count: out.length, datasets: out });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Preview one inner CSV/text file (head lines only, capped). */
  router.get('/local-corpus/datasets/preview', async (req, res) => {
    try {
      const zip = typeof req.query.zip === 'string' ? req.query.zip : '';
      const inner = typeof req.query.inner === 'string' ? req.query.inner : '';
      const lines = Math.min(Math.max(Number(req.query.lines || 20), 1), 200);
      if (!zip.toLowerCase().endsWith('.zip') || zip.includes('..') || zip.includes('/') || zip.includes('\\')) {
        return res.status(400).json({ success: false, error: 'invalid zip name' });
      }
      if (!inner || inner.includes('..')) return res.status(400).json({ success: false, error: 'invalid inner path' });
      const root = localCorpusRoot('cancer-datasets');
      if (!root) return res.status(404).json({ success: false, error: 'cancer-datasets root not configured' });
      const full = path.join(root.root, zip);
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      try {
        const r = await execFileAsync('python', ['-c', "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); data=z.read(sys.argv[2]).decode('utf-8',errors='replace'); lines=data.splitlines(); import json; print(json.dumps({'inner':sys.argv[2],'totalLines':len(lines),'preview':lines[:int(sys.argv[3])]}))", full, inner, String(lines)], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
        res.json({ success: true, zip, ...JSON.parse(String(r.stdout || '{}')) });
      } catch (err: any) {
        res.status(500).json({ success: false, error: `preview failed: ${err?.message ?? err}` });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Local cancer library: PDFs ------------------------------------------
  /** Search the indexed local PDFs (filename/topic search over scanned artifacts). */
  router.get('/local-corpus/pdfs/search', (req, res) => {
    const artifacts = deps.getArtifacts();
    const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 500);
    let items = artifacts.filter((a) => a.project === 'cancer-pdfs');
    if (q) {
      items = items.filter((a) => a.name.toLowerCase().includes(q) || a.rel.toLowerCase().includes(q) || a.topics.some((t: string) => t.includes(q)));
    }
    items = [...items].sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, limit);
    res.json({ success: true, total: artifacts.filter((a) => a.project === 'cancer-pdfs').length, filtered: items.length, items, scannedAt: deps.getLastScan() });
  });

  /** Extract full text of one local PDF via the PyMuPDF sidecar (on demand). */
  router.post('/local-corpus/pdfs/extract', async (req, res) => {
    try {
      const rel = guardRel(String(req.body?.rel || ''));
      if (!rel) return res.status(400).json({ success: false, error: 'invalid rel path' });
      const maxPages = req.body?.max_pages ? Math.min(Math.max(Number(req.body.max_pages), 1), 400) : 50;
      const root = localCorpusRoot('cancer-pdfs');
      if (!root) return res.status(404).json({ success: false, error: 'cancer-pdfs root not configured' });
      const full = path.join(root.root, ...rel.split('/'));
      let buf: Buffer;
      try {
        buf = await fs.promises.readFile(full);
      } catch (err: any) {
        return res.status(404).json({ success: false, error: `pdf unreadable: ${err?.message ?? err}` });
      }
      if (buf.length > 60 * 1024 * 1024) return res.status(413).json({ success: false, error: 'pdf too large (60MB cap)' });
      const result = await pdfExtractBytes(buf.toString('base64'), { filename: path.basename(full), maxPages });
      res.json({ success: true, project: 'cancer-pdfs', rel, bytes: buf.length, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Literature-grounded KG ----------------------------------------------
  /**
   * Rebuilds the co-mention graph from the local full-text corpus and runs the
   * real NetworkX sidecar over it: centrality, literature support for canonical
   * assets, and (optional) bridges. Honest: every edge is a real co-occurrence
   * count; missing corpus/sidecar reports ok:false with the reason.
   */
  let literatureKgCache: { at: number; body: unknown } | null = null;
  router.get('/local-corpus/literature/kg', async (req, res) => {
    try {
      if (literatureKgCache && Date.now() - literatureKgCache.at < 60_000) {
        return res.json({ success: true, cached: true, ...(literatureKgCache.body as object) });
      }
      const { buildLiteratureKgGraph, literatureEvidence, CANONICAL_TARGET_MAP } = await import('../lib/literatureGrounding.js');
      const { kgCentrality, kgNeighborhood, kgBridges } = await import('../lib/kgSidecarClient.js');
      const corpusPath = path.join(process.cwd(), 'data', 'science-loop', 'seed-corpus-100.json');
      let raw: any[];
      try {
        raw = JSON.parse(await fs.promises.readFile(corpusPath, 'utf-8'));
      } catch (err: any) {
        return res.json({ success: false, ok: false, error: `literature corpus missing (${corpusPath}): ${err?.message ?? err}` });
      }
      const docs = raw
        .filter((c) => !c.scanned_only && !c.error && String(c.text || '').length > 500)
        .map((c) => ({ rel: c.rel, text: c.text, authors: c.authors ?? [], publishedAt: c.publishedAt }));

      const { payload, hits, edges } = await buildLiteratureKgGraph(docs);
      const centrality = await kgCentrality(payload);
      if (!centrality.ok) return res.json({ success: false, ok: false, error: `kg sidecar: ${centrality.error}` });

      const assetSupport: any[] = [];
      for (const asset of Object.keys(CANONICAL_TARGET_MAP)) {
        const term = CANONICAL_TARGET_MAP[asset];
        const tHits = hits.find((h) => h.termId === term);
        const nb = await kgNeighborhood(payload, asset);
        assetSupport.push({
          asset,
          targetTerm: term,
          targetTermDocs: tHits?.docs ?? 0,
          literatureNeighbors: (nb.ok ? (nb.neighbors ?? []) : []).filter((n) => n.id !== asset).map((n) => n.id),
        });
      }
      const bridgeFrom = typeof req.query.from === 'string' ? req.query.from : 'AKT';
      const bridgeTo = typeof req.query.to === 'string' ? req.query.to : 'sotorasib';
      const bridge = await kgBridges(payload, bridgeFrom, bridgeTo);

      const body = {
        corpus: { docs: docs.length, scannedOnly: raw.filter((c) => c.scanned_only).length },
        graph: { nodes: payload.nodes.length, edges: payload.edges.length, litCoMentionEdges: edges.length },
        centrality: {
          ok: centrality.ok,
          connected_components: centrality.connected_components,
          hubs: (centrality.ranked ?? []).slice(0, 12).map((r) => ({ id: r.id, degree: r.degree, betweenness: r.betweenness, pagerank: r.pagerank })),
        },
        topCoMentionEdges: edges.slice(0, 15),
        assetSupport,
        bridge: { from: bridgeFrom, to: bridgeTo, reached_proven: bridge.reached_proven, to_proven_hub: bridge.to_proven_hub, paths: (bridge.paths ?? []).slice(0, 4) },
        evidenceSample: {
          [bridgeFrom]: literatureEvidence(docs, bridgeFrom).slice(0, 5),
        },
        method: 'exact-string term matching over full extracted text; co-mention edge weights are real co-occurring paper counts; asset->target mappings from CANONICAL_ONCOLOGY_KG.targetProtein',
      };
      literatureKgCache = { at: Date.now(), body };
      res.json({ success: true, cached: false, ...body });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Score how well a claim is supported by the local literature corpus.
   * POST {claimText}. Real: tokens matched to the curated lexicon by exact
   * substring; presence = real doc counts; co-mention = real co-occurrence.
   */
  router.post('/local-corpus/literature/support', async (req, res) => {
    try {
      const claimText = typeof req.body?.claimText === 'string' ? req.body.claimText.trim() : '';
      if (!claimText) return res.status(400).json({ success: false, error: 'claimText required' });
      const { scoreClaimSupport } = await import('../lib/literatureGrounding.js');
      const docs = await deps.loadLiteratureDocs();
      if (!docs.length) {
        return res.json({ success: false, ok: false, error: 'literature corpus missing or empty (data/science-loop/seed-corpus-100.json)' });
      }
      const support = scoreClaimSupport(docs, claimText);
      res.json({ success: true, claimText, ...support, method: 'exact-string lexicon match; presence & co-mention are real corpus counts' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

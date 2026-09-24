/**
 * github.ts — GitHub research/ingestion routes extracted from `server.ts`:
 * GET /github/catalog, POST /github/import.
 *
 * Live GitHub search is a pure lib import. The import pipeline mutates host
 * registry/blueprint state, so it is injected as `importCandidate`.
 */
import { Router } from 'express';
import { searchGitHubRepositories } from '../lib/githubResearchEngine.js';
import type { ToolDomain } from '../types.js';

export interface GitHubRouterDeps {
  importCandidate(repo: string, filePath?: string, domain?: ToolDomain): Promise<unknown>;
}

export function createGitHubRouter(deps: GitHubRouterDeps): Router {
  const router = Router();

  /** Real GitHub repository search. */
  router.get('/github/catalog', async (req, res) => {
    const query = (req.query.q as string) || '';
    try {
      if (!query.trim()) return res.json({ success: true, repos: [], note: 'Type a search query to query the live GitHub API.' });
      const repos = await searchGitHubRepositories(query);
      res.json({ success: true, repos, note: 'Live GitHub search results. Choose a repository and click Import to fetch a real source file (never auto-promoted).' });
    } catch (err: any) {
      res.status(502).json({ success: false, error: err?.message || 'GitHub search failed' });
    }
  });

  /** Fetch and register a real file as an unverified pending candidate. */
  router.post('/github/import', async (req, res) => {
    const { repo, path, domain } = req.body ?? {};
    if (!repo || typeof repo !== 'string') {
      return res.status(400).json({ success: false, error: 'repo is required (owner/name or full GitHub URL)' });
    }
    try {
      const result = await deps.importCandidate(repo, typeof path === 'string' && path ? path : undefined, domain as ToolDomain);
      res.json({ success: true, result });
    } catch (err: any) {
      const status = err?.kind === 'not_found' ? 404 : err?.kind === 'no_code_file' ? 422 : 502;
      res.status(status).json({ success: false, error: err?.message || 'GitHub import failed', kind: err?.kind });
    }
  });

  return router;
}

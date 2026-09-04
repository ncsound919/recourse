import type { ExternalSignal, SourcePollResult } from './types';
import { makeSignal } from './util';
import { searchGitHubRepositories } from '../lib/githubResearchEngine';

/**
 * GitHub — real repo search via the existing live REST engine. Reuses the
 * same honest error semantics (rate limit / offline / not found are explicit).
 */
export async function pollGitHub(
  query: string,
  maxResults = 6,
): Promise<{ signals: ExternalSignal[]; result: SourcePollResult }> {
  try {
    const repos = await searchGitHubRepositories(query, maxResults);
    const signals = repos.map((r) =>
      makeSignal('github', r.htmlUrl, `${r.fullName}: ${r.description || 'no description'}`, r.description || '', [
        query,
        ...(r.language ? [r.language] : []),
        ...(r.license ? [r.license] : []),
      ]),
    );
    return { signals, result: { source: 'github', ok: true, count: signals.length } };
  } catch (err: any) {
    return { signals: [], result: { source: 'github', ok: false, count: 0, error: err?.message || 'github poll failed' } };
  }
}

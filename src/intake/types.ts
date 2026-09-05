/**
 * Intake layer — external signal types shared across fetchers, store, and the
 * grounding path. Real only: a Signal always carries the URL it came from; no
 * fabricated entries exist anywhere in this subsystem.
 */

import type { ToolDomain } from '../types';

/** Where a signal was fetched from. github reuses githubResearchEngine.
 *  agentbrowser = a web page downloaded through AgentBrowser.
 *  corpus = a local research artifact scanned from a sibling project. */
export type SourceKind = 'arxiv' | 'hackernews' | 'rss' | 'github' | 'agentbrowser' | 'corpus' | 'kaggle' | 'news';

export interface ExternalSignal {
  id: string;             // sha256(url + title), stable dedupe key
  source: SourceKind;
  url: string;
  title: string;
  summary: string;
  topics: string[];       // raw keyword hits, kept verbatim
  domain?: ToolDomain;    // classifier result (optional until grounded)
  publishedAt?: string;
  fetchedAt: number;
  consumed: boolean;      // true once fed into a dream / mutation
  consumedAt?: number;
  groundedTool?: string;  // name of the verified tool this signal produced
  error?: string;         // set only for failed fetch records (never fake content)
}

/** Per-source outcome for one poll pass. */
export interface SourcePollResult {
  source: SourceKind;
  ok: boolean;
  count: number;
  error?: string;
}

export interface IntakeSnapshot {
  total: number;
  unconsumed: number;
  consumed: number;
  bySource: Record<string, number>;
  lastPollAt: number | null;
  lastPollResults: SourcePollResult[];
  lastGroundAt: number | null;
  lastGroundSummary: string | null;
  groundedTools: string[];
}

export interface BenchmarkProblem {
  id: string;
  domain: ToolDomain;
  title: string;
  description: string;
  functionName: string;
  /** Hidden assert suite — evaluated against a candidate gene's real source. */
  hiddenSuite: string;
}

export interface BenchmarkRun {
  at: number;
  solved: number;
  total: number;
  solvedIds: string[];
}

export interface BenchmarkState {
  problems: BenchmarkProblem[];
  history: BenchmarkRun[];
  lastRunAt: number | null;
  lastRun: BenchmarkRun | null;
}

/**
 * Ecosystem Corpus — local research-ingestion types.
 *
 * Recourse ingests *research insights and papers* produced by sibling projects
 * in the Overlay365/Uplift fleet (HempForge, Hemp-OS, Overlay Oncology, bbtech,
 * Draymond). Each project root is scanned on disk for insight-bearing text
 * artifacts (whitepapers, research/synthesis docs, specs, knowledge JSON,
 * datasets, config). This subsystem is 100% real: every record is produced by
 * reading an actual file. No synthesized "insights" are ever fabricated here.
 */

/** Broad role of a single scanned document/data artifact. */
export type InsightKind =
  | 'paper'
  | 'whitepaper'
  | 'research'
  | 'spec'
  | 'knowledge'
  | 'data'
  | 'readme'
  | 'config'
  | 'other';

/** A configured corpus root: one sibling project on disk. */
export interface CorpusRoot {
  /** Stable short project id, e.g. 'overlay-oncology'. */
  project: string;
  /** Absolute path to the project folder to scan. */
  root: string;
}

/** One insight-bearing artifact discovered on disk (metadata + excerpt only). */
export interface CorpusArtifact {
  /** sha256 of the file bytes — the dedupe / change-detection key. */
  hash: string;
  /** Owning project id (matches CorpusRoot.project). */
  project: string;
  /** Path relative to the project root. */
  rel: string;
  /** File name with extension. */
  name: string;
  /** Lower-cased extension including dot, or '' when none. */
  ext: string;
  /** Classified role of the document. */
  kind: InsightKind;
  sizeBytes: number;
  /** Word count of the read content (0 if file exceeded the read cap). */
  words: number;
  /** Up to ~1200 chars of the real document head, single line. */
  excerpt: string;
  /** Real keyword topics detected in the content. */
  topics: string[];
  /** Filesystem mtime epoch ms. */
  mtime: number;
}

export interface CorpusScanError {
  root: string;
  error: string;
}

export interface CorpusScanResult {
  scannedAt: number;
  artifacts: CorpusArtifact[];
  errors: CorpusScanError[];
}

export interface CorpusSummary {
  total: number;
  byProject: Record<string, number>;
  byKind: Record<InsightKind, number>;
  /** Global topic frequency across scanned content. */
  topics: Record<string, number>;
}

/** Full state surfaced to the API/UI and persisted with the engine. */
export interface CorpusSnapshot {
  roots: CorpusRoot[];
  lastScanAt: number | null;
  artifacts: CorpusArtifact[];
  summary: CorpusSummary | null;
  errors: CorpusScanError[];
  /** How many artifacts were dispatched as grounding signals on the last scan. */
  dispatchedSignals: number;
}

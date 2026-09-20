/**
 * VariationStore — durable, append-only, hash-chained preference ledger for
 * arbitrary external variations.
 *
 * Record shape (one JSON object per line):
 *   { kind, seq, prevHash, hash, ...payload }
 *
 * `hash = H(prevHash + canonical(payload))`, so any edit to a past record
 * breaks every later link and is reported by `verify()` — never hidden.
 * Standings are recomputed from the choices on demand (see elo.ts); the file
 * stores only facts (variations, choices), never derived rankings.
 *
 * A corrupt line does not take down boot: loading keeps the valid prefix and
 * surfaces `verify().valid === false` with the offending sequence number.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chainHash, GENESIS_HASH, hashParams } from './hash.js';
import { computeStandings, type StandingsOptions } from './elo.js';
import type { DimensionTags, LedgerRecord, PairChoice, Standing, VariationDescriptor } from './types.js';

export function defaultRatingLedger(): string {
  return process.env.RECOURSE_RATING_LEDGER || path.join(process.cwd(), 'data', 'rating-ledger.jsonl');
}

export interface RegisterVariationInput {
  source: string;
  params: Record<string, unknown>;
  paramHash?: string;
  label?: string;
  seedId?: string;
  generation?: number;
  origin?: string;
  createdAt?: number;
}

export interface RecordPairInput {
  source: string;
  aHash: string;
  bHash: string;
  winner: 'A' | 'B';
  pairId?: string;
  sessionId?: string;
  confidence?: 1 | 2 | 3;
  dimensions?: DimensionTags;
  listenMsA?: number;
  listenMsB?: number;
  elapsedMs?: number;
  decidedAt?: number;
}

export interface VerifyResult {
  valid: boolean;
  records: number;
  head: string;
  brokenAt?: number;
  error?: string;
}

export interface NextPair {
  a: VariationDescriptor;
  b: VariationDescriptor;
}

export class RatingStore {
  private readonly file: string;
  private readonly variationsByHash = new Map<string, VariationDescriptor>();
  private readonly choicesList: PairChoice[] = [];
  private head = GENESIS_HASH;
  private seq = 0;
  private loadValid = true;
  private loadError: string | undefined;

  constructor(file: string = defaultRatingLedger()) {
    this.file = file;
    this.load();
  }

  /** Stable fingerprint of a parameter object (public so clients can match). */
  static hashParams(params: unknown): string {
    return hashParams(params);
  }

  registerVariation(input: RegisterVariationInput): VariationDescriptor {
    const paramHash = input.paramHash ?? hashParams(input.params);
    const existing = this.variationsByHash.get(paramHash);
    if (existing) return existing;
    const variation: VariationDescriptor = {
      paramHash,
      source: input.source,
      params: { ...input.params },
      label: input.label,
      seedId: input.seedId,
      generation: input.generation,
      origin: input.origin,
      createdAt: input.createdAt ?? Date.now(),
    };
    this.append('variation', { variation });
    this.variationsByHash.set(paramHash, variation);
    return variation;
  }

  recordPair(input: RecordPairInput): PairChoice {
    if (!this.variationsByHash.has(input.aHash)) {
      throw new Error(`unknown variation: ${input.aHash}`);
    }
    if (!this.variationsByHash.has(input.bHash)) {
      throw new Error(`unknown variation: ${input.bHash}`);
    }
    const choice = {
      pairId: input.pairId ?? crypto.randomUUID(),
      sessionId: input.sessionId,
      source: input.source,
      aHash: input.aHash,
      bHash: input.bHash,
      winner: input.winner,
      confidence: input.confidence,
      dimensions: input.dimensions,
      listenMsA: input.listenMsA,
      listenMsB: input.listenMsB,
      elapsedMs: input.elapsedMs,
      decidedAt: input.decidedAt ?? Date.now(),
    };
    this.append('pair', { choice });
    const stored: PairChoice = { ...choice, seq: this.seq - 1, prevHash: this.headBeforeLast, hash: this.head };
    this.choicesList.push(stored);
    return stored;
  }

  standings(opts: StandingsOptions = {}): Standing[] {
    return computeStandings([...this.variationsByHash.values()], this.choicesList, opts);
  }

  variations(opts: { source?: string } = {}): VariationDescriptor[] {
    const all = [...this.variationsByHash.values()];
    return opts.source ? all.filter((v) => v.source === opts.source) : all;
  }

  choices(): PairChoice[] {
    return [...this.choicesList];
  }

  /**
   * Deterministic next pair: the two least-played variations (source-filtered),
   * ties broken by paramHash so the same ledger state always yields the same
   * pair. Prefers a combination that has not been compared yet. Null when fewer
   * than two variations exist.
   */
  nextPair(opts: { source?: string } = {}): NextPair | null {
    const pool = this.variations(opts);
    if (pool.length < 2) return null;
    const matches = new Map<string, number>();
    for (const v of pool) matches.set(v.paramHash, 0);
    const playedAgainst = new Set<string>();
    for (const c of this.choicesList) {
      if (matches.has(c.aHash)) matches.set(c.aHash, (matches.get(c.aHash) ?? 0) + 1);
      if (matches.has(c.bHash)) matches.set(c.bHash, (matches.get(c.bHash) ?? 0) + 1);
      playedAgainst.add(pairKey(c.aHash, c.bHash));
    }
    const ordered = [...pool].sort(
      (x, y) =>
        (matches.get(x.paramHash) ?? 0) - (matches.get(y.paramHash) ?? 0) ||
        x.paramHash.localeCompare(y.paramHash),
    );
    const a = ordered[0];
    const fresh = ordered.slice(1).find((cand) => !playedAgainst.has(pairKey(a.paramHash, cand.paramHash)));
    const b = fresh ?? ordered[1];
    return { a, b };
  }

  verify(): VerifyResult {
    if (!this.loadValid) {
      return { valid: false, records: this.seq, head: this.head, brokenAt: this.seq, error: this.loadError };
    }
    return { valid: true, records: this.seq, head: this.head };
  }

  get count(): number {
    return this.seq;
  }

  get ledgerHead(): string {
    return this.head;
  }

  get filePath(): string {
    return this.file;
  }

  private headBeforeLast = GENESIS_HASH;

  private append(kind: LedgerRecord['kind'], payload: { variation: VariationDescriptor } | { choice: Omit<PairChoice, 'seq' | 'prevHash' | 'hash'> }): void {
    const body = { kind, ...payload };
    const prevHash = this.head;
    const hash = chainHash(prevHash, body);
    const record = { kind, seq: this.seq, prevHash, hash, ...payload } as LedgerRecord;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.appendFileSync(this.file, `${JSON.stringify(record)}\n`, 'utf-8');
    this.headBeforeLast = prevHash;
    this.head = hash;
    this.seq += 1;
  }

  private load(): void {
    if (!fs.existsSync(this.file)) return;
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, 'utf-8');
    } catch (err) {
      this.loadValid = false;
      this.loadError = `could not read ledger: ${(err as Error).message}`;
      return;
    }
    let head = GENESIS_HASH;
    let seq = 0;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let record: LedgerRecord;
      try {
        record = JSON.parse(trimmed) as LedgerRecord;
      } catch {
        this.loadValid = false;
        this.loadError = `malformed JSON at record ${seq}`;
        break;
      }
      const body =
        record.kind === 'variation'
          ? { kind: record.kind, variation: record.variation }
          : { kind: record.kind, choice: record.choice };
      const expected = chainHash(head, body);
      if (record.prevHash !== head || record.hash !== expected || record.seq !== seq) {
        this.loadValid = false;
        this.loadError = `hash-chain break at record ${seq}`;
        break;
      }
      if (record.kind === 'variation') {
        this.variationsByHash.set(record.variation.paramHash, record.variation);
      } else {
        const c = record.choice;
        const stored: PairChoice = { ...c, seq, prevHash: head, hash: record.hash };
        this.choicesList.push(stored);
      }
      head = record.hash;
      seq += 1;
    }
    this.head = head;
    this.seq = seq;
  }
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

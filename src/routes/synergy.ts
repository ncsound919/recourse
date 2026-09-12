// src/routes/synergy.ts
/**
 * Cross-domain synergy routes. Stateless handlers over synergy lib modules;
 * scan is deterministic, validates its body, and persists a manifest-hashed
 * map + ledger insight. All failures return structured JSON, never HTML.
 */
import { Router } from 'express';
import { listDomains, unverifiedDomains } from '../lib/synergy/domainRegistry.js';
import { readSynergyMap, writeSynergyMap } from '../lib/synergy/store.js';
import { buildSynergyMap, crossDomainSynergyFor } from '../lib/synergy/synergyMap.js';
import { discover } from '../lib/synergy/closedDiscovery.js';
import { extractMethods, type RawMethod } from '../lib/synergy/methodIndex.js';
import { extractProblems } from '../lib/synergy/problemIndex.js';
import { recordSynergyScan } from '../lib/synergy/ledger.js';
import { resolveTransfer, admit, applyTransferResult, recordTransferResult } from '../lib/synergy/resolver.js';
import type { RecourseProblem } from '../lib/problemArchive.js';
import type { TransferCandidate, TransferResult } from '../lib/synergy/types.js';

function isRawMethod(x: unknown): x is RawMethod {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.domain === 'string' &&
    typeof m.source === 'string' &&
    (m.primitives === undefined || Array.isArray(m.primitives))
  );
}

function isProblem(x: unknown): x is RecourseProblem {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.acceptanceTest === 'string';
}

function isTransferCandidate(x: unknown): x is TransferCandidate {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.fromDomain === 'string' &&
    typeof c.toDomain === 'string' &&
    typeof c.score === 'number'
  );
}

function readError(res: import('express').Response, err: unknown): void {
  const message = err instanceof Error ? err.message : 'synergy map unreadable';
  res.status(500).json({ success: false, error: message });
}

export function createSynergyRouter(): Router {
  const router = Router();

  router.get('/synergy/domains', (_req, res) => {
    res.json({ success: true, domains: listDomains(), unverified: unverifiedDomains().map((d) => d.id) });
  });

  router.get('/synergy/map', (_req, res) => {
    try {
      res.json({ success: true, map: readSynergyMap() });
    } catch (err) {
      readError(res, err);
    }
  });

  router.get('/synergy/candidates', (_req, res) => {
    try {
      const map = readSynergyMap();
      res.json({ success: true, count: map?.candidates.length ?? 0, candidates: map?.candidates ?? [] });
    } catch (err) {
      readError(res, err);
    }
  });

  router.get('/synergy/score/:domain', (req, res) => {
    try {
      const map = readSynergyMap();
      if (!map) return res.json({ success: true, domain: req.params.domain, value: 0, reason: 'no map' });
      res.json({ success: true, domain: req.params.domain, value: crossDomainSynergyFor(map, req.params.domain) });
    } catch (err) {
      readError(res, err);
    }
  });

  router.post('/synergy/scan', (req, res) => {
    const body = (req.body ?? {}) as { methods?: unknown; problems?: unknown; knownPairs?: unknown };
    if (!Array.isArray(body.methods) || !Array.isArray(body.problems)) {
      return res.status(400).json({ success: false, error: 'methods and problems arrays required' });
    }
    if (body.methods.length === 0 || body.problems.length === 0) {
      return res.status(400).json({ success: false, error: 'methods and problems must be non-empty' });
    }
    if (!body.methods.every(isRawMethod)) {
      return res.status(400).json({ success: false, error: 'invalid method element (requires id, name, domain, source)' });
    }
    if (!body.problems.every(isProblem)) {
      return res.status(400).json({ success: false, error: 'each problem requires string id and acceptanceTest' });
    }
    if (body.knownPairs !== undefined && !Array.isArray(body.knownPairs)) {
      return res.status(400).json({ success: false, error: 'knownPairs must be an array of strings' });
    }
    try {
      const { methods, rejected } = extractMethods(body.methods);
      const problems = extractProblems(body.problems);
      const { candidates, manifest } = discover(methods, problems, { knownPairs: (body.knownPairs as string[]) ?? [] });
      const map = buildSynergyMap(candidates, { generatedAtRun: `manifest:${manifest}` });
      writeSynergyMap(map);
      recordSynergyScan(map);
      res.json({
        success: true,
        rejectedMethods: rejected,
        methods: methods.length,
        problems: problems.length,
        manifest,
        ...map,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'synergy scan failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/synergy/resolve', (req, res) => {
    const body = (req.body ?? {}) as { candidate?: unknown; acceptanceTest?: unknown; sourceCode?: unknown; adaptedBy?: unknown };
    const candidate = body.candidate;
    if (!isTransferCandidate(candidate) || typeof body.acceptanceTest !== 'string' || typeof body.sourceCode !== 'string') {
      return res.status(400).json({ success: false, error: 'candidate (id/fromDomain/toDomain/score), acceptanceTest, sourceCode required' });
    }
    const adaptedBy = body.adaptedBy as TransferResult['adaptedBy'] | undefined;
    if (adaptedBy !== undefined && adaptedBy !== 'none' && adaptedBy !== 'operator_ladder' && adaptedBy !== 'model') {
      return res.status(400).json({ success: false, error: 'adaptedBy must be none|operator_ladder|model' });
    }
    try {
      const result = resolveTransfer(candidate, body.acceptanceTest, body.sourceCode, adaptedBy ?? 'operator_ladder');
      const decision = admit(result);
      const map = readSynergyMap();
      const next = map ? applyTransferResult(map, result, candidate) : null;
      if (next) writeSynergyMap(next);
      recordTransferResult(result, next?.manifestHash ?? candidate.id);
      res.json({ success: true, result, decision, map: next });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'synergy resolve failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}

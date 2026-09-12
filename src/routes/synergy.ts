// src/routes/synergy.ts
/**
 * Cross-domain synergy routes. Stateless handlers over synergy lib modules;
 * scan is deterministic and persists a manifest-hashed map + ledger insight.
 */
import { Router } from 'express';
import { listDomains, unverifiedDomains } from '../lib/synergy/domainRegistry.js';
import { readSynergyMap, writeSynergyMap } from '../lib/synergy/store.js';
import { buildSynergyMap, crossDomainSynergyFor } from '../lib/synergy/synergyMap.js';
import { discover } from '../lib/synergy/closedDiscovery.js';
import { extractMethods, type RawMethod } from '../lib/synergy/methodIndex.js';
import { extractProblems } from '../lib/synergy/problemIndex.js';
import { recordSynergyScan } from '../lib/synergy/ledger.js';
import type { RecourseProblem } from '../lib/problemArchive.js';

export function createSynergyRouter(): Router {
  const router = Router();

  router.get('/synergy/domains', (_req, res) => {
    res.json({
      success: true,
      domains: listDomains(),
      unverified: unverifiedDomains().map((d) => d.id),
    });
  });

  router.get('/synergy/map', (_req, res) => {
    res.json({ success: true, map: readSynergyMap() });
  });

  router.get('/synergy/candidates', (_req, res) => {
    const map = readSynergyMap();
    res.json({ success: true, count: map?.candidates.length ?? 0, candidates: map?.candidates ?? [] });
  });

  router.get('/synergy/score/:domain', (req, res) => {
    const map = readSynergyMap();
    if (!map) return res.json({ success: true, domain: req.params.domain, value: 0, reason: 'no map' });
    res.json({ success: true, domain: req.params.domain, value: crossDomainSynergyFor(map, req.params.domain) });
  });

  router.post('/synergy/scan', (req, res) => {
    const body = (req.body ?? {}) as {
      methods?: RawMethod[];
      problems?: RecourseProblem[];
      knownPairs?: string[];
    };
    if (!Array.isArray(body.methods) || !Array.isArray(body.problems)) {
      return res.status(400).json({ success: false, error: 'methods and problems arrays required' });
    }
    const { methods, rejected } = extractMethods(body.methods);
    const invalidProblem = body.problems.find(
      (p) => !p || typeof p.id !== 'string' || typeof p.acceptanceTest !== 'string',
    );
    if (invalidProblem) {
      return res.status(400).json({ success: false, error: 'each problem requires string id and acceptanceTest' });
    }
    const problems = extractProblems(body.problems);
    const { candidates, manifest } = discover(methods, problems, { knownPairs: body.knownPairs ?? [] });
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
  });

  return router;
}

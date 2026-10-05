/**
 * skills.ts — the skill-library catalog/read surface plus the Phase-4 skill
 * distribution (export verified tools / import foreign SKILL.md), extracted from
 * the `server.ts` monolith.
 *
 * Catalog/root/export state stays host-owned (persisted with the main state) and
 * is injected. Imports stay fail-closed: only embedded code+suite that passes
 * the real domain gate + lint (and quality gate) can reach the registry.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { searchSkills, skillDigest } from '../skills/index.js';
import { exportSkillFiles, candidateFromSkillText, currentToolVersion, isVerifiableVersion } from '../skills/exporter.js';
import { buildExportableResponse } from '../lib/exportableHygiene.js';
import {
  verifyCodingCode,
  verifySystemicCode,
  verifyNeuroSymbolicCode,
  verifyCyberDefenseCode,
  verifyQuantumSimCode,
} from '../lib/verifiers.js';
import { assessForgeCandidate } from '../lib/forgeQuality.js';
import { requireMutationAuth } from '../lib/mutationAuth.js';
import type { SkillRoot, SkillDef, SkillSnapshot } from '../skills/types.js';
import type { ToolEntry, ToolVersion, ToolDomain, VerifierResult } from '../types.js';
import type { LintReport } from '../lib/lintGate.js';

export interface SkillImportRecord {
  name: string;
  domain: string;
  originRoot: string;
  originRel: string;
  runnable: boolean;
  outcome: string;
  importedAt: number;
  reason?: string;
}

export interface SkillsRouterDeps {
  snapshot(): SkillSnapshot;
  scan(): Promise<SkillSnapshot>;
  getRoots(): SkillRoot[];
  setRoots(roots: SkillRoot[]): void;
  getCatalog(): SkillDef[];
  getRegistry(): ToolEntry[];
  bumpUpgrades(): void;
  getExportRoot(): string;
  incExports(): number;
  incImports(): number;
  getPending(): SkillImportRecord[];
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
  gateWithLint(source: string): { allowed: boolean; lint: LintReport };
  lintVerdictNote(lint: LintReport): string;
}

/** Run the real domain gate for a code-bearing skill import; null when the
 *  domain is not a plain source+suite code domain (math/biotech differ). */
function verifyImportedCode(domain: ToolDomain, source: string, suite: string): VerifierResult | null {
  switch (domain) {
    case 'coding': return verifyCodingCode(source, suite);
    case 'systemic': return verifySystemicCode(source, suite);
    case 'neuro_symbolic': return verifyNeuroSymbolicCode(source, suite);
    case 'cyber_defense': return verifyCyberDefenseCode(source, suite);
    case 'quantum_sim': return verifyQuantumSimCode(source, suite);
    default: return null;
  }
}

export function createSkillsRouter(deps: SkillsRouterDeps): Router {
  const router = Router();

  /** Register a verified imported tool into the registry (mirrors evolve). */
  function registerImportedTool(
    name: string,
    domain: ToolDomain,
    source: string,
    suite: string | undefined,
    verifier: VerifierResult,
    origin: { rootId: string; rel: string },
  ): { tool: ToolEntry; version: ToolVersion } {
    const registry = deps.getRegistry();
    const versionHash = crypto.createHash('sha256').update(source).digest('hex').substring(0, 16);
    const version = '1.0.0';
    const versionObj: ToolVersion = {
      version,
      hash: versionHash,
      created_at: Date.now(),
      passed_verifier: verifier.passed,
      score: verifier.score,
      promoted: true,
      verifier_notes: `${verifier.summary} | imported from ${origin.rootId}:${origin.rel}`,
      source_code: source,
      test_suite_code: suite,
    };
    let toolEntry = registry.find((r) => r.name === name);
    if (!toolEntry) {
      toolEntry = {
        name,
        domain,
        entrypoint: `src/tools/${name.replace(/[^a-zA-Z0-9_]/g, '_')}.ts`,
        description: '',
        versions: [],
        pendingVersions: [],
        healthStatus: 'healthy',
        anomalyCount: 0,
      };
      registry.push(toolEntry);
    }
    toolEntry.versions.push(versionObj);
    toolEntry.currentVersion = version;
    toolEntry.healthStatus = 'healthy';
    deps.bumpUpgrades();
    return { tool: toolEntry, version: versionObj };
  }

  router.get('/skills/status', (_req, res) => {
    res.json({ success: true, skills: deps.snapshot(), digest: skillDigest(deps.snapshot()) });
  });

  router.post('/skills/rescan', async (req, res) => {
    try {
      const bodyRoots = req.body?.roots;
      if (Array.isArray(bodyRoots) && bodyRoots.length) {
        const clean: SkillRoot[] = bodyRoots
          .filter((r: any) => r && typeof r.id === 'string' && typeof r.root === 'string')
          .map((r: any) => ({ id: String(r.id).trim(), root: String(r.root).trim() }));
        if (clean.length) deps.setRoots(clean);
      }
      const snap = await deps.scan();
      res.json({ success: true, skills: snap, digest: skillDigest(snap) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/skills', (req, res) => {
    const catalog = deps.getCatalog();
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const rootId = typeof req.query.rootId === 'string' ? req.query.rootId : '';
    const limit = Number(req.query.limit || 200);
    let items = q ? searchSkills(catalog, q, limit) : catalog;
    if (rootId) items = items.filter((s) => s.rootId === rootId);
    res.json({ success: true, total: catalog.length, filtered: items.length, skills: items.slice(0, limit) });
  });

  /** Read the full SKILL.md (and list its supporting files) for one skill.
   *  ?rootId=ecc&dir=skills/accessibility */
  router.get('/skills/skill', async (req, res) => {
    try {
      const rootId = typeof req.query.rootId === 'string' ? req.query.rootId : '';
      const dir = typeof req.query.dir === 'string' ? req.query.dir : '';
      const root = deps.getRoots().find((r) => r.id === rootId);
      if (!root) return res.status(404).json({ success: false, error: `unknown skill library ${rootId}` });
      const rel = dir.replace(/\\/g, '/');
      if (!rel || rel.split('/').includes('..') || rel.startsWith('/')) {
        return res.status(400).json({ success: false, error: 'invalid dir path' });
      }
      const skill = deps.getCatalog().find((s) => s.rootId === rootId && s.dir === rel);
      const skillDirAbs = path.join(root.root, ...rel.split('/'));
      const md = path.join(skillDirAbs, 'SKILL.md');
      const text = await fs.promises.readFile(md, 'utf-8');
      const cap = 100_000;
      const truncated = text.length > cap;
      res.json({ success: true, skill: skill ?? null, files: skill?.files ?? [], text: text.slice(0, cap), truncated, bytes: text.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/skills/digest', (_req, res) => {
    res.json({ success: true, markdown: skillDigest(deps.snapshot()), generatedAt: new Date().toISOString() });
  });

  /**
   * List which registry tools are exportable (they carry verified source).
   *
   * `?raw=1` returns the pre-hygiene list. Without it the response is de-duped
   * and degraded tools pruned, and the `hygiene` block reports how many were
   * removed — previously this route returned every registered tool (~5,771) of
   * which ~28 were worth adopting, with nothing saying so.
   */
  router.get('/skills/exportable', (req, res) => {
    const registry = deps.getRegistry()
      .filter((t) => isVerifiableVersion(currentToolVersion(t)))
      .map((t) => {
        const v = currentToolVersion(t)!;
        return { name: t.name, domain: t.domain, version: v.version, score: v.score, passed: v.passed_verifier, description: t.description };
      });
    if (String(req.query.raw ?? '') === '1') {
      res.json({ success: true, exportRoot: deps.getExportRoot(), count: registry.length, tools: registry });
      return;
    }
    const { count, tools, hygiene } = buildExportableResponse(registry);
    res.json({ success: true, exportRoot: deps.getExportRoot(), count, tools, hygiene });
  });

  /** Export a verified registry tool as a SKILL.md folder. */
  router.post('/skills/export', async (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    try {
      const { toolName } = req.body ?? {};
      const outRoot = typeof req.body?.outRoot === 'string' ? req.body.outRoot : deps.getExportRoot();
      if (!toolName || typeof toolName !== 'string') {
        return res.status(400).json({ success: false, error: 'toolName is required' });
      }
      const tool = deps.getRegistry().find((r) => r.name === toolName);
      if (!tool) return res.status(404).json({ success: false, error: `no tool named ${toolName}` });
      const version = currentToolVersion(tool);
      if (!isVerifiableVersion(version)) {
        return res.status(409).json({
          success: false,
          error: `${toolName} has no verified source in its active version — nothing honest to export. Verify a real implementation first.`,
        });
      }
      const result = await exportSkillFiles(tool, version, outRoot);
      if (!result.ok) {
        return res.status(500).json({ success: false, error: result.error || 'export failed' });
      }
      const total = deps.incExports();
      deps.appendProvenance('skill_exported', {
        tool: toolName,
        version: version.version,
        hash: version.hash,
        outRoot,
        dir: result.dir,
        files: result.files.length,
      });
      deps.saveState();
      res.json({ success: true, ...result, totalExports: total });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  /** Ingest a foreign SKILL.md from a configured skill library as an UNVERIFIED
   *  candidate. Body: { rootId, rel, domain? }. Code+suite in a code domain runs
   *  the real gate; otherwise it is recorded as a pending, unverified candidate. */
  router.post('/skills/import', async (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    try {
      const { rootId, rel, domain = 'coding' } = req.body ?? {};
      const allowed = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];
      if (!allowed.includes(domain)) return res.status(400).json({ success: false, error: 'unknown domain: ' + domain });
      if (typeof rootId !== 'string' || typeof rel !== 'string') {
        return res.status(400).json({ success: false, error: 'rootId and rel are required' });
      }
      const root = deps.getRoots().find((r) => r.id === rootId);
      if (!root) return res.status(404).json({ success: false, error: `unknown skill library ${rootId}` });
      const cleanRel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!cleanRel || cleanRel.split('/').includes('..')) {
        return res.status(400).json({ success: false, error: 'invalid rel path' });
      }
      const mdRel = /SKILL\.md$/i.test(cleanRel) ? cleanRel : `${cleanRel}/SKILL.md`;
      const mdAbs = path.join(root.root, ...mdRel.replace(/^\.\//, '').split('/'));
      const relCheck = path.relative(root.root, mdAbs);
      if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
        return res.status(400).json({ success: false, error: 'path escapes skill library root' });
      }
      let text: string;
      try {
        text = await fs.promises.readFile(mdAbs, 'utf-8');
      } catch (err: any) {
        return res.status(404).json({ success: false, error: `cannot read ${mdRel}: ${err?.message ?? err}` });
      }
      const cand = candidateFromSkillText(text, { rootId, rel: mdRel }, domain as ToolDomain);
      const domainT = domain as ToolDomain;

      let outcome = 'pending';
      let reason = cand.reason;
      let registered: { tool: ToolEntry; version: ToolVersion } | null = null;

      if (cand.runnable && cand.source && cand.suite) {
        const verifier = verifyImportedCode(domainT, cand.source, cand.suite);
        if (verifier) {
          const gate = deps.gateWithLint(cand.source);
          let passed = verifier.passed && gate.allowed;
          let qualityNote = '';
          if (passed) {
            const quality = assessForgeCandidate({ name: cand.name, refSuite: cand.suite }, cand.source);
            if (!quality.gate.ok) {
              passed = false;
              qualityNote = ` | quality: ${quality.gate.reasons.join('; ')}`;
            }
          }
          if (passed) {
            registered = registerImportedTool(cand.name, domainT, cand.source, cand.suite, verifier, { rootId, rel: mdRel });
            outcome = 'promoted';
            reason = `verified imported code (score ${verifier.score.toFixed(2)}) ${gate.allowed ? '' : deps.lintVerdictNote(gate.lint)}`;
          } else {
            outcome = 'rejected';
            reason = `${verifier.summary}${gate.allowed ? '' : ' | ' + deps.lintVerdictNote(gate.lint)}${qualityNote}`;
          }
        } else {
          reason = `${domain} import needs structured extras (math funcName/testCases, biotech claim) — held as unverified pending.`;
        }
      } else if (cand.runnable && !cand.suite) {
        reason = `${reason} No test suite embedded — cannot pass the promotion gate.`;
      }

      const total = deps.incImports();
      const pending = deps.getPending();
      pending.unshift({
        name: cand.name,
        domain: domainT,
        originRoot: rootId,
        originRel: mdRel,
        runnable: cand.runnable,
        outcome,
        importedAt: Date.now(),
        reason,
      });
      if (pending.length > 200) pending.length = 200;
      deps.appendProvenance('skill_imported', {
        skill: cand.name,
        originRoot: rootId,
        originRel: mdRel,
        domain: domainT,
        runnable: cand.runnable,
        outcome,
        reason,
        registeredTool: registered ? registered.tool.name : undefined,
      });
      deps.saveState();
      res.json({
        success: true,
        outcome,
        candidate: {
          name: cand.name,
          description: cand.description,
          domain: domainT,
          runnable: cand.runnable,
          license: cand.license,
          origin: cand.origin,
        },
        reason,
        registeredTool: registered ? { name: registered.tool.name, version: registered.version.version, score: registered.version.score } : null,
        totalImports: total,
        recent: pending.slice(0, 20),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  return router;
}

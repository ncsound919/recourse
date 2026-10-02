/**
 * v5.ts — Recourse routes exposing the NextGenCoder v5 no-LLM synthesizer.
 *
 * These let Recourse's autonomous loops generate, verify, and benchmark
 * tools WITHOUT an LLM:
 *   POST /v5/synthesize  — examples (+ optional reference) → verified code
 *   POST /v5/benchmark   — run the 20-task benchmark, attest the result
 *   POST /v5/goal        — operator-supplied plan → kernel disposal report
 *   POST /v5/generate    — Skilltech generators (BigBack / OG-Glass), untrusted
 *   GET  /v5/status      — tool availability (cvc5, egglog, Skilltech fleet)
 *
 * Every synthesis is recorded in the provenance chain; every benchmark run
 * is attested — no fabricated scores. Skilltech MCPs are untrusted
 * proposers/verifiers/generators: the kernel disposes of their output.
 */

import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { runOracleLoop } from '../lib/v5/oracleRun';
import { LIST_GRAMMAR } from '../lib/v5/enumerate';
import { makeReferenceOracle, makeReferenceConfirmer, runBenchmark, BENCHMARK_TASKS } from '../lib/v5/benchmark';
import { termToModule, examplesToTestSuite } from '../lib/v5/codegen';
import { executeTestSuite } from '../lib/executionSandbox.js';
import { runGoal } from '../lib/v5/planner';
import { JevDecider } from '../lib/v5/deciders';
import type { LLMChat } from '../lib/v5/intake';
import {
  SkilltechDecider,
  HONEST_SKIPS,
  type GateResult,
  type SkilltechBridge,
} from '../lib/v5/skilltechBridge';

const execFileAsync = promisify(execFile);

export interface V5RouterDeps {
  registryRef(): any[];
  promoteTool(entry: any, opts: { origin: string; gate?: boolean; push?: boolean }): boolean;
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
  cvc5Path(): string;
  egglogPath(): string;
  /** Skilltech MCP fleet bridge; null/absent → honestly reported as not wired. */
  skilltech?: () => SkilltechBridge | null;
}

export function createV5Router(deps: V5RouterDeps): Router {
  const router = Router();
  const skilltech = (): SkilltechBridge | null => {
    try {
      return deps.skilltech?.() ?? null;
    } catch {
      return null;
    }
  };

  // Tool availability — honest, never fabricated
  router.get('/v5/status', async (_req, res) => {
    const check = async (bin: string): Promise<{ available: boolean; version?: string }> => {
      try {
        const r = await execFileAsync(bin, ['--version'], { timeout: 5000 });
        return { available: true, version: r.stdout.split('\n')[0].trim() };
      } catch {
        return { available: false };
      }
    };
    const [cvc5, egglog] = await Promise.all([check(deps.cvc5Path()), check(deps.egglogPath())]);
    const st = skilltech();
    const skilltechStatus = st
      ? await st.status()
      : { wired: false, disabled: false, reason: 'bridge not wired', skips: HONEST_SKIPS };
    res.json({
      success: true,
      tools: { cvc5, egglog },
      skilltech: skilltechStatus,
      grammar: { primitives: Object.keys(LIST_GRAMMAR.unary), hasNil: LIST_GRAMMAR.hasNil },
    });
  });

  // Synthesize a tool from examples (no LLM)
  router.post('/v5/synthesize', async (req, res) => {
    try {
      const {
        name = `tool_${crypto.randomBytes(3).toString('hex')}`,
        examples = [],
        reference,
        maxDepth = 3,
        maxQuestions = 10,
      } = req.body ?? {};

      if (!Array.isArray(examples) || examples.length < 2) {
        return res.status(400).json({ success: false, error: 'At least 2 examples required' });
      }

      // Normalize examples
      const normalized = examples.map((e: any) => ({
        input: Array.isArray(e.input) ? e.input.map(Number) : [],
        output: Array.isArray(e.output) ? e.output.map(Number) : [],
      }));

      // If a reference is supplied, it answers questions + confirms; otherwise
      // the loop converges only if the examples are complete (honest ambiguity).
      const askUser = reference
        ? makeReferenceOracle(reference, 0)
        : async (q: { options: string[] }) => q.options[0];
      const confirmUser = reference ? makeReferenceConfirmer(reference) : undefined;

      const result = await runOracleLoop({
        taskId: name,
        examples: normalized,
        maxDepth: Number(maxDepth) || 3,
        maxQuestions: Number(maxQuestions) || 10,
        askUser,
        confirmUser,
      });

      if (!result.success || !result.code) {
        deps.appendProvenance('v5_synthesis_failed', {
          name, status: result.status, error: result.error,
          questions: result.answerLog.length,
        });
        return res.status(422).json({
          success: false,
          status: result.status,
          error: result.error,
          rivals: result.rivals,
          certificate: result.certificate,
        });
      }

      const term = result.code;
      const sourceCode = termToModule(term, name);
      const testSuiteCode = examplesToTestSuite(term, name, normalized);

      // Verify the generated module actually runs in the real sandbox.
      let verifierResult: any = null;
      try {
        verifierResult = executeTestSuite(sourceCode, testSuiteCode);
      } catch (e: any) {
        verifierResult = { passed: false, testDetails: [String(e?.message || e)] };
      }

      if (!verifierResult?.passed) {
        deps.appendProvenance('v5_synthesis_unverified', {
          name, program: term, testDetails: verifierResult?.testDetails,
        });
        return res.status(422).json({
          success: false,
          error: 'Synthesized code failed its real sandbox test suite — nothing registered',
          program: term,
          verifierResult,
        });
      }

      const st = skilltech();
      const gates: GateResult[] = st
        ? await st.runSynthesisGates({ name, program: term, source: sourceCode })
        : [];
      const blocking = gates.filter((g) => !g.ok && !g.skipped && !g.advisory);
      if (blocking.length) {
        deps.appendProvenance('v5_synthesis_unverified', {
          name, program: term, error: 'Skilltech verification gate blocked promotion', gates,
        });
        return res.status(422).json({
          success: false,
          error: 'Skilltech verification gate blocked promotion — nothing registered',
          program: term,
          gates,
        });
      }

      // Register the verified tool
      const versionHash = crypto.createHash('sha256').update(sourceCode).digest('hex').substring(0, 16);
      const registry = deps.registryRef();
      const existing = registry.find((t: any) => t.name === name);
      const newVersion = {
        version: '1.0.0-v5-no-llm',
        hash: versionHash,
        created_at: Date.now(),
        passed_verifier: true,
        score: 1.0,
        promoted: true,
        verifier_notes: `v5 no-LLM synthesis: program ${term}; sandbox suite green; ${result.answerLog.length} question(s); tier ${result.certificate?.trustTier}`,
        source_code: sourceCode,
        test_suite_code: testSuiteCode,
      };

      if (existing) {
        existing.versions.push(newVersion);
        existing.currentVersion = newVersion.version;
        existing.healthStatus = 'healthy';
      } else {
        deps.promoteTool(
          {
            name,
            domain: 'coding',
            entrypoint: `src/tools/${name}.ts`,
            description: `v5 no-LLM synthesized tool (${term})`,
            versions: [newVersion],
            currentVersion: newVersion.version,
            healthStatus: 'healthy',
            anomalyCount: 0,
          },
          { origin: 'v5-no-llm' }
        );
      }

      deps.appendProvenance('v5_synthesis_succeeded', {
        name, program: term, hash: versionHash,
        questions: result.answerLog.length,
        trustTier: result.certificate?.trustTier,
        certificateHash: result.certificate?.hash,
        gates: gates.map((g) => ({ gate: g.gate, ok: g.ok, advisory: g.advisory, skipped: g.skipped, reason: g.reason })),
        skilltech: st ? 'wired' : 'not-wired',
      });
      deps.saveState();

      res.json({
        success: true,
        name,
        program: term,
        sourceCode,
        certificate: result.certificate,
        verifierResult,
        gates,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  // Run the benchmark and attest the result
  router.post('/v5/benchmark', async (req, res) => {
    try {
      const { maxDepth = 3, maxQuestions = 10, noiseRate = 0, confirm = true } = req.body ?? {};
      const started = Date.now();
      const results = await runBenchmark(BENCHMARK_TASKS, {
        maxDepth: Number(maxDepth) || 3,
        maxQuestions: Number(maxQuestions) || 10,
        noiseRate: Number(noiseRate) || 0,
        confirm: Boolean(confirm),
      });

      const solved = results.filter((r) => r.status === 'converged' && r.equivalence === 1).length;
      const converged = results.filter((r) => r.status === 'converged').length;
      const silentWrong = results.filter((r) => r.status === 'converged' && r.equivalence < 1).length;
      const avgQuestions = converged > 0 ? results.reduce((s, r) => s + r.questionsAsked, 0) / converged : 0;
      const summary = {
        total: results.length,
        solved,
        converged,
        silentWrong,
        ambiguous: results.filter((r) => r.status === 'ambiguous').length,
        contradictions: results.filter((r) => r.status === 'contradiction').length,
        avgQuestions,
        elapsedMs: Date.now() - started,
      };

      deps.appendProvenance('v5_benchmark_run', summary);
      res.json({ success: true, summary, results });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  // Goal → plan → kernel disposal. No LLM: the plan is operator-supplied (or
  // absent, which honestly yields an empty report). Skilltech joins the
  // decision chain as one more untrusted proposer.
  router.post('/v5/goal', async (req, res) => {
    try {
      const { goal, plan, maxDepth = 3, maxQuestions = 10, advisor = 'none' } = req.body ?? {};
      if (!goal || typeof goal !== 'string') {
        return res.status(400).json({ success: false, error: 'goal (string) required' });
      }
      if (plan !== undefined && plan !== null) {
        if (typeof plan !== 'object' || !Array.isArray(plan.tasks)) {
          return res.status(400).json({
            success: false,
            error: 'plan must be {tasks:[{intent, examples:[{input,output}], program?}]}',
          });
        }
      }

      const chat: LLMChat = plan
        ? async () => ({ status: 'online', text: JSON.stringify(plan), engine: 'operator-supplied' })
        : async () => ({ status: 'offline', text: '' });

      const st = skilltech();
      const deciders = [new JevDecider(), ...(st ? [new SkilltechDecider(st)] : [])];
      const report = await runGoal(goal, {
        chat,
        maxDepth: Number(maxDepth) || 3,
        maxQuestions: Number(maxQuestions) || 10,
        deciders,
        advisor: advisor === 'devbrain' ? undefined : null,
      });

      deps.appendProvenance('v5_goal_run', {
        goal,
        total: report.summary.total,
        agreed: report.summary.agreed,
        corrected: report.summary.corrected,
        refused: report.summary.refused,
        answerSources: report.tasks.map((t) => `${t.taskId}:${t.answerSources ?? 'none'}`),
        disagreements: report.tasks.flatMap((t) => t.disagreements ?? []),
        skilltech: st ? 'wired' : 'not-wired',
        notes: report.notes,
      });

      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  // Skilltech generators. Output is an UNTRUSTED artifact (untrusted: true);
  // it is provenance-logged and never auto-promoted into the registry.
  router.post('/v5/generate', async (req, res) => {
    try {
      const st = skilltech();
      if (!st) {
        return res.status(503).json({ success: false, error: 'skilltech bridge not wired' });
      }
      const generator = req.body?.generator;
      if (generator !== 'bigback' && generator !== 'og_glass') {
        return res.status(400).json({ success: false, error: 'generator must be "bigback" or "og_glass"' });
      }
      const result = await st.generate(req.body);
      deps.appendProvenance('v5_generation', {
        generator,
        ok: result.ok,
        via: result.via,
        ms: result.ms,
        untrusted: true,
        ...(result.error ? { error: result.error } : {}),
      });
      res.status(result.ok ? 200 : 502).json({ success: result.ok, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  return router;
}

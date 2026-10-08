/**
 * The full Recourse tool catalog.
 *
 * One entry per tool, mirroring the `mcp-recourse` bridge this plugin replaces.
 * Behavioural parity is the contract: same endpoint, same argument names, same
 * context-economy projection. The only intended difference is naming --
 * `recourse.status` becomes `recourse_status`, because DeepSeek's function-name
 * contract allows only `[A-Za-z0-9_-]` and the bridge had to mangle every dot
 * into `mcp__recourse__<name>_<12-hex-hash>`.
 *
 * Projections are deliberately hand-written rather than `whole(body)`: upstream
 * payloads run to hundreds of KB (the registry alone carries 1253 tools), and
 * dumping one unfiltered into a model context is a real cost. Where a tool does
 * forward the whole body it is because the bridge did too and the payload is
 * already small.
 */

import type { Json } from './api.js';
import { arrayAt, at, compact, pick, recordAt, whole } from './json.js';
import type { ArgReader } from './params.js';
import type { ToolSpec } from './spec.js';

/** Tool domains the mutator accepts (mirrors `api/recourse/mutate/[action].ts`). */
const VALID_DOMAINS = [
  'coding',
  'math',
  'biotech',
  'systemic',
  'neuro_symbolic',
  'cyber_defense',
  'quantum_sim',
] as const;

/** Axiom accepts a different order of the same domain set. */
const AXIOM_DOMAINS = [
  'math',
  'coding',
  'biotech',
  'systemic',
  'neuro_symbolic',
  'cyber_defense',
  'quantum_sim',
] as const;

const STYLES = ['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane'] as const;
const LOOP_BARS = [4, 8, 16] as const;
const THERAPY_MODES = [
  'continuous_mtd',
  'adaptive_pulsed',
  'metronomic',
  'awaken_senescence',
] as const;

/** Shared footer for every tool that mutates guarded Recourse state. */
const MUTATES = ' Mutating: requires RECOURSE_API_SECRET.';

/** Encode a query string, omitting absent optionals. */
function query(pairs: readonly (readonly [string, string | number | undefined])[]): string {
  const search = new URLSearchParams();
  for (const [key, value] of pairs) {
    if (value !== undefined) search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered.length === 0 ? '' : `?${rendered}`;
}

/** One registry row projected the way `recourse.registry` does. */
function projectRegistryRow(entry: Json): Json {
  const tool = recordAt(entry) ?? {};
  const versions = arrayAt(tool, 'versions') ?? [];
  const current = versions.find((candidate) => recordAt(candidate)?.version === tool.currentVersion);
  const version = recordAt(current) ?? {};
  return compact({
    name: tool.name,
    domain: tool.domain,
    version: tool.currentVersion,
    score: version.score,
    passed: version.passed_verifier === true,
    selfHosted: typeof tool.entrypoint === 'string' && tool.entrypoint.includes('.selfhosted/'),
    health: tool.healthStatus,
  });
}

/** Every tool this plugin can register, in a stable order. */
export const TOOL_SPECS: readonly ToolSpec[] = [
  // ---- system state -------------------------------------------------------
  {
    name: 'recourse_status',
    title: 'Recourse status',
    description:
      'Live Recourse system status: generation counter, readiness score, registered tool count, ' +
      'verifier pass rate, total upgrades, active model, and self-repair totals. Start here when ' +
      'you need to know whether the recursive engine is healthy before acting on it.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/status',
    project: (body) => {
      const s = recordAt(body, 'status') ?? {};
      return compact({
        generation: s.generation,
        readiness: s.readinessScore,
        tools: s.registeredToolsCount,
        verifierPassRate: s.verifierPassRate,
        totalUpgrades: s.totalUpgrades,
        model: at(body, 'status', 'providerStatus', 'model'),
        modelOnline: at(body, 'status', 'providerStatus', 'online'),
        // Self-repair is reported as a quadruple on purpose. The bridge projected
        // `healed` alone, which reads as "97 problems fixed" when the honest
        // reading is "97 problems touched, 0 independently confirmed".
        // `verifiedRepairs` and `unverifiableRepairs` are what make the heal count
        // mean anything, so they travel with it rather than one lookup away.
        selfRepairHealed: at(body, 'status', 'selfRepair', 'totalHealedCount'),
        selfRepairVerified: at(body, 'status', 'selfRepair', 'verifiedRepairs'),
        selfRepairUnverifiable: at(body, 'status', 'selfRepair', 'unverifiableRepairs'),
        selfRepairSuccessRate: at(body, 'status', 'selfRepair', 'repairSuccessRate'),
        selfRepairActiveAnomalies: at(body, 'status', 'selfRepair', 'activeAnomaliesCount'),
      });
    },
  },
  {
    name: 'recourse_upgrade_report',
    title: 'Recourse upgrade delta',
    description: 'How the upgraded system differs from the boot baseline.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/system/upgrade-report',
    project: (body) => {
      const d = recordAt(body, 'diff') ?? {};
      return compact({
        added: arrayAt(d, 'addedTools')?.length,
        removed: arrayAt(d, 'removedTools')?.length,
        upgraded: arrayAt(d, 'upgradedTools')?.length,
        healthChanged: arrayAt(d, 'healthChangedTools')?.length,
        capabilityChanges: d.capabilityChanges,
        benchmarkSolvedDelta: d.benchmarkSolvedDelta,
        selfhostedDelta: d.selfhostedDelta,
        totals: d.totals,
      });
    },
  },
  {
    name: 'recourse_nightly_report',
    title: 'Recourse nightly self-improvement report',
    description:
      'The latest self-attested nightly upgrade report (dream -> forge -> benchmark delta) with ' +
      'its verdict line. Empty until the first nightly cycle has run, which is reported rather ' +
      'than hidden.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/self-improvement/report',
    notFound: () => ({
      ok: true,
      empty: true,
      note: 'No nightly self-improvement run has been recorded yet. Run recourse_run_forge to produce the first one.',
    }),
    project: (body) => {
      const markdown = at(body, 'reportMarkdown');
      const lines = typeof markdown === 'string' ? markdown.split('\n') : [];
      const verdict = lines.find((line) => line.startsWith('**Verdict'));
      return compact({
        empty: false,
        key: at(body, 'key'),
        finishedAt: at(body, 'finishedAt'),
        steps: at(body, 'steps'),
        verdict,
      });
    },
  },
  {
    name: 'recourse_self_mod_status',
    title: 'Recourse self-modification status',
    description:
      'Harness self-modification status: last nightly run, pending approvals, applied/reverted ' +
      'patches, and the protected-path policy.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/self-improvement/status',
    project: (body) =>
      compact({
        nightly: at(body, 'nightly'),
        pendingApprovals: at(body, 'approvals', 'pending'),
        patches: at(body, 'patches'),
        protected: arrayAt(body, 'policy', 'safety')?.map((rule) => recordAt(rule)?.id ?? null),
      }),
  },
  {
    name: 'recourse_telemetry',
    title: 'Environment telemetry',
    description:
      'Machine load/memory and git state, plus the work-window decision used to schedule heavy ' +
      'jobs. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/telemetry',
    project: (body) => at(body, 'snapshot') ?? body,
  },
  {
    name: 'recourse_wallet',
    title: 'Budgeted action wallet status',
    description:
      'Per-token spend budgets, remaining balances, and whether the hash-chained ledger is ' +
      'intact. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/wallet',
    project: (body) =>
      compact({
        chainValid: at(body, 'chainValid'),
        brokenAt: at(body, 'brokenAt'),
        balances: at(body, 'balances'),
      }),
  },
  {
    name: 'recourse_traces',
    title: 'Recent distributed traces',
    description:
      'Recently finished spans with W3C trace context (name, ids, status, duration). Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: (args: ArgReader) => `/api/recourse/ops/traces${query([['limit', args.optInt('limit')]])}`,
    params: {
      limit: { type: 'integer', min: 1, max: 500, description: 'Max spans (default 100).' },
    },
    project: (body) => compact({ count: at(body, 'count'), spans: at(body, 'spans') }),
  },
  {
    name: 'recourse_tracing_status',
    title: 'Tracing / OTLP status',
    description:
      'Whether an OTLP exporter is configured, the service name, and the buffered span count. ' +
      'Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/ops/tracing/status',
    project: whole,
  },

  // ---- registry / genes ---------------------------------------------------
  {
    name: 'recourse_registry',
    title: 'Recourse gene registry',
    description:
      'List the tools Recourse has registered, with each tool’s domain, current version, ' +
      'benchmark score, whether its verifier passed, whether it is self-hosted, and its health. ' +
      'Use this to find a capability before proposing a new one.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/registry',
    project: (body) => (arrayAt(body, 'registry') ?? []).map(projectRegistryRow),
  },
  {
    name: 'recourse_inspect_gene',
    title: 'Inspect one registry gene',
    description:
      'Read the full record for a named registry tool: domain, health, current version, score, ' +
      'pass state, verifier notes, entrypoint, and pending version count.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/registry',
    params: { name: { type: 'string', required: true, description: 'Exact registry tool/gene name.' } },
    project: (body, args) => {
      const wanted = args.str('name');
      const tool = (arrayAt(body, 'registry') ?? []).find((entry) => recordAt(entry)?.name === wanted);
      const record = recordAt(tool);
      if (record === undefined) {
        // The bridge answered with a sentence rather than a failure; a structured
        // miss is easier for the model to branch on and equally honest.
        return { found: false, name: wanted, note: `No registry tool named "${wanted}".` };
      }
      const current = (arrayAt(record, 'versions') ?? []).find(
        (candidate) => recordAt(candidate)?.version === record.currentVersion,
      );
      const version = recordAt(current) ?? {};
      // No `found` marker on the success path: the bridge returns exactly these
      // keys, and an extra one is a needless difference. The miss path returns a
      // marked object instead, which is what the bridge's plain-text note
      // degrades to.
      return compact({
        name: record.name,
        domain: record.domain,
        health: record.healthStatus,
        currentVersion: record.currentVersion,
        score: version.score,
        passedVerifier: version.passed_verifier,
        verifierNotes: version.verifier_notes,
        entrypoint: record.entrypoint,
        // The bridge wrote `(pendingVersions ?? []).length`, so the key is
        // always present -- 0 when there are none. `?? 0` reproduces that;
        // letting it be undefined would drop the key and change the shape.
        pending: arrayAt(record, 'pendingVersions')?.length ?? 0,
      });
    },
  },
  {
    name: 'recourse_capabilities',
    title: 'Recourse capability adoption',
    description:
      'Which self-hosted tools Recourse adopted to back its own internal operations (dogfood).',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/capabilities',
    project: (body) => compact({ adoptions: at(body, 'adoptions'), served: at(body, 'served') }),
  },
  {
    name: 'recourse_selfhosted',
    title: 'Recourse self-hosted artifacts',
    description: 'List live self-hosted tools/artifacts and their kinds (function/cli/api/mcp/a2a/loop).',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/selfhosted',
    project: (body) =>
      (arrayAt(body, 'tools') ?? []).map((entry) => {
        const tool = recordAt(entry) ?? {};
        return compact({
          name: tool.name,
          kind: tool.artifactKind ?? 'function',
          templateId: tool.templateId,
          verified: at(tool, 'lastVerified', 'passed') === true,
          file: tool.file,
        });
      }),
  },
  {
    name: 'recourse_problems',
    title: 'Hard/unsolved problem bank',
    description: 'The curated hard-math problem bank with acceptance tests and tier.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/math/problems',
    project: (body) =>
      compact({ count: at(body, 'count'), total: at(body, 'total'), problems: at(body, 'problems') }),
  },
  {
    name: 'recourse_validate_plugin',
    readOnly: true,
    title: 'Validate a plugin manifest',
    description:
      'Validate a plugin manifest (schema + default-deny capabilities) and report its signature ' +
      'status. Read-only.',
    kind: 'fetch',
    method: 'POST',
    path: '/api/recourse/ecosystem/plugins/validate',
    params: { manifest: { type: 'object', required: true, description: 'The plugin manifest object.' } },
    project: whole,
  },

  // ---- skills distribution ------------------------------------------------
  {
    name: 'recourse_exportable',
    title: 'Tools that can be exported as skills',
    description:
      'List verified registry tools that carry real source + suite and can therefore be exported ' +
      'as SKILL.md folders.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/skills/exportable',
    project: (body) =>
      compact({ exportRoot: at(body, 'exportRoot'), count: at(body, 'count'), tools: at(body, 'tools') }),
  },
  {
    name: 'recourse_export_skill',
    title: 'Export a verified tool as a SKILL.md folder',
    description:
      'Write a verified registry tool into the configured export root as an open SKILL.md folder ' +
      '(source + test suite embedded).' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/skills/export',
    mutating: true,
    needsSecret: true,
    params: {
      toolName: { type: 'string', required: true, description: 'Name of the verified registry tool.' },
      outRoot: { type: 'string', description: 'Optional override directory for the export.' },
    },
    project: (body) =>
      compact({
        ok: true,
        toolName: at(body, 'toolName'),
        version: at(body, 'version'),
        dir: at(body, 'dir'),
        files: at(body, 'files'),
      }),
  },
  {
    name: 'recourse_import_skill',
    title: 'Ingest a foreign SKILL.md as an UNVERIFIED candidate',
    description:
      'Import a skill from a configured skill library (rootId + rel) through the promotion gate. ' +
      'Code+suite skills are verified for real; prose-only skills are recorded as pending and ' +
      'never fabricated into the registry.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/skills/import',
    mutating: true,
    needsSecret: true,
    params: {
      rootId: { type: 'string', required: true, description: 'Configured skill library id (e.g. ecc).' },
      rel: { type: 'string', required: true, description: 'Path of the SKILL.md relative to the library root.' },
      domain: { type: 'string', description: 'Tool domain to verify under (default coding).' },
    },
    project: (body) =>
      compact({
        outcome: at(body, 'outcome'),
        candidate: at(body, 'candidate'),
        reason: at(body, 'reason'),
        registeredTool: at(body, 'registeredTool'),
      }),
  },
  {
    name: 'recourse_skills',
    title: 'Published skills',
    description:
      'The signed, versioned skill registry (id, version, license, author, signature presence). ' +
      'Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/ecosystem/skills',
    project: (body) => compact({ count: at(body, 'count'), skills: at(body, 'skills') }),
  },
  {
    name: 'recourse_publish_skill',
    title: 'Publish a signed skill',
    description:
      'Publish a versioned skill to the registry (signed with the local skill secret when ' +
      'configured).' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/ecosystem/skills/publish',
    mutating: true,
    needsSecret: true,
    params: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      version: { type: 'string', required: true, description: 'semver, e.g. 1.0.0' },
      description: { type: 'string' },
      domain: { type: 'string' },
      license: { type: 'string' },
      author: { type: 'string' },
      source: { type: 'string' },
    },
    project: (body) => compact({ ok: true, signed: at(body, 'signed'), skill: at(body, 'skill') }),
  },
  {
    name: 'recourse_connectors',
    title: 'Connectors and health',
    description: 'Registered external connectors and their live health probes. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/ecosystem/connectors',
    project: (body) =>
      compact({
        count: at(body, 'count'),
        connectors: at(body, 'connectors'),
        health: at(body, 'health'),
      }),
  },

  // ---- the recursive loop (mutating) --------------------------------------
  {
    name: 'recourse_evolve',
    title: 'Recourse: evolve a new tool',
    description:
      'Ask Recourse’s mutator to propose a new capability in a domain, or to mutate an existing ' +
      'tool. A proposal only becomes real when its generated code passes Recourse’s actual ' +
      'sandbox + lint verifier, so a "promoted" outcome is evidence and "rejected" is a normal, ' +
      'useful answer.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/mutate/evolve',
    mutating: true,
    needsSecret: true,
    long: true,
    params: {
      domain: { type: 'string', required: true, enum: VALID_DOMAINS, description: 'Tool domain to evolve in.' },
      instructions: { type: 'string', required: true, description: 'What capability to build, or how to mutate.' },
      targetToolName: { type: 'string', description: 'Optional existing tool name to target a mutation.' },
    },
    project: (body) => {
      const verifier = recordAt(body, 'verifierResult') ?? {};
      return compact({
        ok: at(body, 'success'),
        outcome: at(body, 'outcome'),
        toolName: at(body, 'toolName'),
        version: at(body, 'version'),
        engine: at(body, 'engine'),
        generation: at(body, 'generation'),
        versionHash: at(body, 'versionHash'),
        verifierPassed: verifier.verified,
        verifierSummary: verifier.summary,
        error: at(body, 'error'),
      });
    },
  },
  {
    name: 'recourse_promote',
    title: 'Recourse: promote a pending gene',
    description:
      'Approve a pending gene by id through Recourse’s promotion gate. Only genes the verifier ' +
      'already accepted are promotable; check `recourse_status` for the pending approval count ' +
      'before asking the user to decide.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/mutate/approve',
    mutating: true,
    needsSecret: true,
    params: {
      geneId: { type: 'string', required: true, description: 'Id of the pending gene to promote.' },
    },
    project: (body) => {
      const gene = recordAt(body, 'gene') ?? {};
      return compact({
        ok: at(body, 'success'),
        name: gene.name,
        domain: gene.domain,
        status: gene.status,
        version: gene.version,
      });
    },
  },
  {
    name: 'recourse_run_forge',
    title: 'Recourse: run the capability forge',
    description:
      'Run Recourse’s self-improvement forge loop end to end: agenda, model implementation, ' +
      'sandbox verification, then promotion. Promotions land only on a genuinely green suite. ' +
      'This is the one call that advances the recursive loop, so prefer it over many small ' +
      'evolve calls when the goal is "make the system better".' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/forge/run',
    mutating: true,
    needsSecret: true,
    long: true,
    params: {
      count: { type: 'integer', min: 1, max: 3, description: 'Forge cycles to run (default 1).' },
    },
    project: (body) => compact({ ok: at(body, 'success'), results: at(body, 'results'), forge: at(body, 'forge') }),
  },
  {
    name: 'recourse_revert',
    title: 'Revert an applied fleet patch',
    description: 'Revert an applied patch by its revert token (as recorded in provenance).' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/develop/revert',
    mutating: true,
    needsSecret: true,
    params: {
      token: { type: 'string', required: true, description: 'Revert token of the applied patch.' },
    },
    project: (body, args) => compact({ ok: true, file: at(body, 'file'), token: args.str('token') }),
  },
  {
    name: 'recourse_learned',
    title: 'Composer learner state',
    description:
      'Read per-style learned quality biases, episodes, and leaderboard so you can see how ' +
      'ratings are shaping composition.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/compose/learned',
    project: (body) =>
      compact({
        styles: at(body, 'styles'),
        leaderboard: at(body, 'leaderboard'),
        adjustments: at(body, 'adjustments'),
      }),
  },
  {
    name: 'recourse_inspect_learner',
    title: 'Inspect the recursive learner',
    description: 'Learner status: episodes, gene beliefs, directives, and last report.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/learn/status',
    project: whole,
  },

  // ---- memory -------------------------------------------------------------
  {
    name: 'recourse_memory_tiered',
    title: 'Tiered memory status',
    description:
      'Durable episodic + semantic memory backend (SQLite/memory), DB path, episode count, fact ' +
      'count.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/memory/tiered',
    project: whole,
  },
  {
    name: 'recourse_recall_memory',
    title: 'Recall from Recourse memory',
    description: 'Semantic recall over Recourse vector memory for a query. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: (args: ArgReader) =>
      `/api/recourse/memory/recall${query([
        ['q', args.str('q')],
        ['kind', args.optStr('kind')],
        ['topK', args.optInt('topK')],
      ])}`,
    params: {
      q: { type: 'string', required: true, description: 'Query text.' },
      kind: { type: 'string', description: 'Optional memory kind filter.' },
      topK: { type: 'integer', min: 1, max: 20, description: 'Number of hits (default 5).' },
    },
    project: whole,
  },
  {
    name: 'recourse_consolidate_memory',
    title: 'Consolidate tiered memory',
    description: 'Fold episode clusters into durable semantic facts (idempotent).' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/memory/consolidate',
    mutating: true,
    needsSecret: true,
    params: {
      minClusterSize: { type: 'integer', min: 1, max: 50, description: 'Minimum loss episodes per cluster (default 2).' },
    },
    project: (body) =>
      compact({
        ok: true,
        created: at(body, 'created'),
        episodes: at(body, 'episodes'),
        facts: at(body, 'facts'),
        factsCreated: at(body, 'facts_created') ?? undefined,
        driver: at(body, 'kind'),
      }),
  },
  {
    name: 'recourse_promote_skills',
    title: 'Promote generalist genes to exportable skills',
    description:
      'Run the skill auto-promotion pass: generalist genes -> backing tool re-verified in the ' +
      'sandbox -> lint gate -> SKILL.md export. Rejected/skipped outcomes are reported ' +
      'honestly.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/memory/promote-skills',
    mutating: true,
    needsSecret: true,
    long: true,
    params: {
      minDistinctProblemWins: { type: 'integer', min: 1, max: 20, description: 'Distinct-problem wins required (default 2).' },
      maxPerRun: { type: 'integer', min: 1, max: 10, description: 'Max candidates per pass (default 3).' },
    },
    project: (body) =>
      compact({
        ok: true,
        candidates: at(body, 'candidates'),
        outRoot: at(body, 'outRoot'),
        outcomes: at(body, 'outcomes'),
      }),
  },

  // ---- composition --------------------------------------------------------
  {
    name: 'recourse_compose',
    title: 'Compose an original track',
    description:
      'Generate an original "in the vein of" track (steely-dan | jasper-ballad | dangelo-glasper ' +
      '| airplane). Loop mode (default): a deterministic 4/8/16-bar loop -> .mid + a SoundLab ' +
      '.seq pocket. Mode "arr": a non-looping written-out arc -> .mid only.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/compose',
    mutating: true,
    needsSecret: true,
    params: {
      style: { type: 'string', required: true, enum: STYLES, description: 'Studied style lexicon to compose from.' },
      key: { type: 'number', min: 0, max: 11, description: 'Tonic pitch class 0-11 (C=0).' },
      major: { type: 'boolean', description: 'Major (true) or minor-ish tonic color.' },
      bpm: { type: 'integer', min: 30, max: 200, description: 'Beats per minute override.' },
      bars: { type: 'integer', enum: LOOP_BARS, description: 'Loop length in bars.' },
      seed: { type: 'integer', description: 'Deterministic seed.' },
      title: { type: 'string', description: 'Track title (affects output filename).' },
      mode: { type: 'string', enum: ['loop', 'arr'], description: 'loop (default) or arr.' },
    },
    project: (body) =>
      compact({
        ok: true,
        mode: at(body, 'mode') ?? 'loop',
        style: at(body, 'style'),
        key: at(body, 'key'),
        bpm: at(body, 'bpm'),
        bars: at(body, 'bars'),
        seed: at(body, 'seed'),
        chords: at(body, 'chords'),
        events: at(body, 'events'),
        sections: at(body, 'sections'),
        files: at(body, 'files'),
        summary: at(body, 'summary'),
      }),
  },
  {
    name: 'recourse_rate_track',
    title: 'Rate a composed track (feeds the learner)',
    description:
      'Record your 1-5 rating for a reproducible composition so the composer learns to steer ' +
      'toward what you like. Same style+seed+rating updates the episode.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/compose/rate',
    mutating: true,
    needsSecret: true,
    params: {
      style: { type: 'string', required: true, enum: STYLES },
      seed: { type: 'integer', required: true },
      rating: { type: 'number', min: 1, max: 5, required: true },
      bars: { type: 'integer', enum: LOOP_BARS },
      tags: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
    },
    project: (body) => {
      const ep = recordAt(body, 'episode') ?? {};
      return compact({
        ok: true,
        id: ep.id,
        style: ep.style,
        seed: at(ep, 'brief', 'seed'),
        rating: ep.rating,
        chords: ep.chords,
        rootMoves: ep.rootMoves,
      });
    },
  },
  {
    name: 'recourse_compose_soundlab',
    title: 'Emit a piece for SoundLab playback',
    description:
      'Compose a style-driven piece and emit the SoundLab bridge contract. Feed the returned ' +
      'JSON to a running SoundLab via window.__recourse.load(piece), then __recourse.play().' +
      MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/compose/soundlab',
    mutating: true,
    needsSecret: true,
    params: {
      style: { type: 'string', required: true, enum: STYLES },
      key: { type: 'number', min: 0, max: 11 },
      bpm: { type: 'integer', min: 30, max: 200 },
      seed: { type: 'integer' },
      title: { type: 'string' },
    },
    project: (body) => {
      const valid = at(body, 'valid') === true;
      return compact({
        ok: valid,
        valid,
        problems: at(body, 'problems'),
        style: at(body, 'style'),
        headChord: at(body, 'piece', 'headChord'),
        layers: arrayAt(body, 'piece', 'layers')?.map((layer) => {
          const entry = recordAt(layer) ?? {};
          return `${String(entry.id)}:${String(entry.role)}`;
        }),
        file: at(body, 'file'),
        note:
          'Feed piece JSON to SoundLab: window.__recourse.load(piece); window.__recourse.play();  ' +
          '(audio needs a user gesture/click).',
      });
    },
  },
  {
    name: 'recourse_benchmark',
    title: 'Objective composer benchmark',
    description:
      'Grade the composer on computed metrics (integrity, harmony, loop closure, style ' +
      'root-motion adherence, voice-leading, richness, nuance) across all styles. Does NOT ' +
      'grade taste/timbre — that needs your ears plus recourse_rate_track.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/compose/benchmark',
    project: (body) =>
      compact({
        aggregate: at(body, 'aggregate'),
        grade: at(body, 'grade'),
        markdown: at(body, 'markdown'),
        styles: at(body, 'styles'),
      }),
  },
  {
    name: 'recourse_benchmark_leaderboard',
    title: 'Benchmark leaderboard',
    description:
      'The hash-chained record of every external benchmark run, ranked by solved count, with ' +
      'per-run deltas and registry attestations. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/benchmark/leaderboard',
    project: (body) => compact({ count: at(body, 'count'), entries: at(body, 'entries') }),
  },
  {
    name: 'recourse_benchmark_ledger',
    title: 'Benchmark ledger (chain validity)',
    description:
      'Recent self-attested benchmark records and whether the hash chain is intact. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/benchmark/ledger',
    project: (body) => compact({ chain: at(body, 'chain'), records: at(body, 'records') }),
  },

  // ---- sidecars and sandboxes --------------------------------------------
  {
    name: 'recourse_audio_status',
    title: 'Transcription sidecar status',
    description:
      'Whether the audio/video transcription sidecar is reachable and its ASR backend is ' +
      'available. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/audio/status',
    project: (body) => at(body, 'health') ?? body,
  },
  {
    name: 'recourse_sandbox_status',
    title: 'Capability sandbox status',
    description:
      'Whether the WASM capability sandbox runtime (QuickJS) is live, the warm guest-context ' +
      'count, and the effective default execution path.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/selfhosted/sandbox',
    project: whole,
  },
  {
    name: 'recourse_execute_selfhosted',
    title: 'Execute a self-hosted tool (through the sandbox)',
    description:
      'Call a self-hosted tool method. Execution goes through the WASM capability sandbox by ' +
      'default (default-deny grants); the response reports which mode actually ran.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: (args: ArgReader) =>
      `/api/recourse/selfhosted/${encodeURIComponent(args.str('name'))}/execute`,
    mutating: true,
    needsSecret: true,
    params: {
      name: { type: 'string', required: true, description: 'Self-hosted tool name.' },
      method: { type: 'string', required: true, description: "Method from the tool's declared whitelist." },
      args: { type: 'array', description: 'Method arguments.' },
      mode: { type: 'string', enum: ['auto', 'sandbox', 'direct'], description: 'Execution path (default auto).' },
    },
    project: (body) =>
      compact({
        ok: true,
        tool: at(body, 'tool'),
        method: at(body, 'method'),
        mode: at(body, 'mode'),
        grantUse: at(body, 'grantUse'),
        result: at(body, 'result'),
        executionTimeMs: at(body, 'executionTimeMs'),
      }),
  },

  // ---- fleet development (Axiom) -----------------------------------------
  {
    name: 'recourse_axiom_status',
    title: 'Axiom Agent harness status',
    description: 'Probe Axiom harness reachability and capability grid from Recourse.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/axiom/status',
    project: whole,
  },
  {
    name: 'recourse_axiom_build',
    title: 'Build and self-host a tool via Axiom Agent',
    description:
      'Delegate tool synthesis to Axiom Agent harness, verify with Recourse executionSandbox, ' +
      'and materialize into a .selfhosted/ manifest.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/axiom/build-tool',
    mutating: true,
    needsSecret: true,
    long: true,
    params: {
      name: { type: 'string', required: true, description: 'Function/tool name to create.' },
      domain: { type: 'string', required: true, enum: AXIOM_DOMAINS, description: 'Tool domain.' },
      prompt: { type: 'string', required: true, description: 'Detailed prompt / contract for the tool.' },
      refSuite: { type: 'string', required: true, description: 'Assertion suite code for real verification.' },
    },
    project: whole,
  },

  // ---- oncology evidence layer -------------------------------------------
  {
    name: 'recourse_kg_live_status',
    title: 'Live evidence provider status',
    description: 'Probe Open Targets Platform and PubTator 3.0 availability for the live oncology evidence layer.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/kg/live/status',
    project: whole,
  },
  {
    name: 'recourse_kg_live_graph',
    readOnly: true,
    title: 'Build the live oncology knowledge graph',
    description:
      'Query Open Targets + PubTator 3.0 and merge with the canonical curated KG into a ' +
      'grounded, provenance-tagged graph. Providers that are down are reported ok:false and ' +
      'contribute nothing.',
    kind: 'fetch',
    method: 'POST',
    path: '/api/recourse/kg/live/graph',
    params: {
      diseases: { type: 'array', items: { type: 'string' }, description: 'Override MONDO/EFO disease ids.' },
      topics: { type: 'array', items: { type: 'string' }, description: 'Override PubTator search topics.' },
    },
    project: (body) =>
      compact({
        ok: at(body, 'success'),
        counts: at(body, 'counts'),
        providers: at(body, 'providers'),
        nodeTotal: arrayAt(body, 'payload', 'nodes')?.length,
        edgeTotal: arrayAt(body, 'payload', 'edges')?.length,
        generatedAt: at(body, 'generatedAt'),
      }),
  },
  {
    name: 'recourse_ode_synthesize',
    readOnly: true,
    title: 'Synthesize evidence-to-ODE kinetic parameters',
    description:
      'Build the live graph and map Open Targets + PubTator evidence into a concrete ' +
      'OdeSimulationParams bundle with per-parameter provenance, labeled evidence-derived / ' +
      'literature-prior / canonical / calibrated.',
    kind: 'fetch',
    method: 'POST',
    path: '/api/recourse/kg/live/ode-params',
    params: { diseaseId: { type: 'string', description: 'MONDO/EFO disease id to anchor evidence to.' } },
    project: (body) =>
      compact({
        ok: at(body, 'success'),
        params: at(body, 'params'),
        provenance: arrayAt(body, 'provenance')?.map((entry) => {
          const p = recordAt(entry) ?? {};
          return compact({ key: p.key, value: p.value, origin: p.origin, confidence: p.confidence, evidence: p.evidence });
        }),
        synthesisNote: at(body, 'synthesisNote'),
        providers: at(body, 'providers'),
      }),
  },
  {
    name: 'recourse_dosing_optimize',
    readOnly: true,
    title: 'Combinatorial adaptive dosing optimizer',
    description:
      'Synthesize evidence-to-ODE params then sweep therapy modes x dose levels, computing ' +
      'per-arm cure-reachability and a seeded subclone-extinction probability. Arms are real ' +
      'deterministic ODE runs; extinctionProbability is an ensemble fraction, not a fitted ' +
      'clinical statistic.',
    kind: 'fetch',
    method: 'POST',
    path: '/api/recourse/kg/live/optimize',
    params: {
      diseaseId: { type: 'string', description: 'MONDO/EFO disease id.' },
      doses: { type: 'array', items: { type: 'number' }, description: 'Dose levels to sweep (uM).' },
      modes: { type: 'array', items: { type: 'string', enum: THERAPY_MODES }, description: 'Therapy modes to sweep.' },
    },
    project: (body) =>
      compact({
        ok: at(body, 'success'),
        bestArmKey: at(body, 'bestArmKey'),
        rankedArms: at(body, 'rankedArms'),
        extinctionProbability: at(body, 'extinction', 'extinctionProbability'),
        extinctionRuns: `${String(at(body, 'extinction', 'extinctRuns'))}/${String(at(body, 'extinction', 'nRuns'))}`,
        arms: arrayAt(body, 'arms')?.map((entry) => {
          const arm = recordAt(entry) ?? {};
          return compact({
            arm: `${String(arm.therapyMode)}@${String(arm.drugDose)}`,
            finalVolume: arm.finalVolume_mm3,
            resistantFraction: arm.finalResistantFraction,
            minHealthy: arm.minHealthy,
            reachable: at(arm, 'reachability', 'isReachable'),
            failureReason: at(arm, 'reachability', 'failureReason'),
            stable: arm.stable,
          });
        }),
        note: at(body, 'note'),
      }),
  },
  {
    name: 'recourse_pipeline_dossier',
    readOnly: true,
    title: 'Full evidence pipeline -> cryptographic dossier',
    description:
      'One call: live graph -> ODE params -> dosing optimization -> SBML Level 3 + PhysiCell ' +
      'XML exports, then hash-chain every stage into a verifiable evidence dossier.',
    kind: 'fetch',
    method: 'POST',
    path: '/api/recourse/kg/live/pipeline',
    params: { diseaseId: { type: 'string', description: 'MONDO/EFO disease id.' } },
    project: (body) =>
      compact({
        ok: at(body, 'success'),
        dossierHash: at(body, 'dossier', 'hash'),
        stages: arrayAt(body, 'dossier', 'stages')?.map((entry) => {
          const stage = recordAt(entry) ?? {};
          return compact({
            stage: stage.stage,
            hash: typeof stage.hash === 'string' ? stage.hash.slice(0, 16) : undefined,
            prev: typeof stage.prevHash === 'string' ? stage.prevHash.slice(0, 16) : undefined,
          });
        }),
        provenanceSources: arrayAt(body, 'dossier', 'provenanceSources')?.length,
        sbml: at(body, 'sbml'),
        physicell: at(body, 'physicell'),
        bestArmKey: at(body, 'optimization', 'bestArmKey'),
        extinctionProbability: at(body, 'optimization', 'extinction', 'extinctionProbability'),
        params: at(body, 'params'),
      }),
  },

  // ---- SlopCodeBench (iterative spec refinement benchmark) ---------------
  {
    name: 'recourse_slopbench_status',
    title: 'SlopCodeBench status',
    description:
      'Probe SlopCodeBench availability: CLI on PATH, Docker daemon, uv, and configured agent/model. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/slopbench/status',
    project: whole,
  },
  {
    name: 'recourse_slopbench_run',
    title: 'Run SlopCodeBench benchmark',
    description:
      'Run a SlopCodeBench iterative specification refinement benchmark. The agent implements a spec, ' +
      'then extends its own code as the spec changes — measuring code erosion, verbosity, and ' +
      'structural degradation across checkpoints. Requires Docker and an API key.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/slopbench/run',
    mutating: true,
    needsSecret: true,
    long: true,
    params: {
      problems: { type: 'array', items: { type: 'string' }, description: 'Problem names to benchmark (default: file_backup, execution_server).' },
      agent: { type: 'string', description: 'Agent runner (default: claude_code).' },
      model: { type: 'string', description: 'Model identifier (default: anthropic/opus-4.5).' },
      environment: { type: 'string', description: 'Environment config path.' },
      prompt: { type: 'string', description: 'Prompt template path.' },
    },
    project: (body) =>
      compact({
        ok: at(body, 'success'),
        runDir: at(body, 'runDir'),
        problems: at(body, 'problems'),
        agent: at(body, 'agent'),
        model: at(body, 'model'),
        durationMs: at(body, 'durationMs'),
        error: at(body, 'error'),
      }),
  },
  {
    name: 'recourse_slopbench_eval',
    title: 'Evaluate a SlopCodeBench run',
    description:
      'Evaluate a completed SlopCodeBench run directory by running `slop-code eval` for real; ' +
      'returns its stdout, exit code, and any error. The run directory must be inside the ' +
      'SlopCodeBench checkout.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/slopbench/eval',
    mutating: true,
    needsSecret: true,
    long: true,
    params: {
      runDir: { type: 'string', required: true, description: 'Path to the run directory (inside the SlopCodeBench checkout).' },
    },
    project: (body) =>
      compact({
        ok: at(body, 'success'),
        runDir: at(body, 'runDir'),
        exitCode: at(body, 'exitCode'),
        durationMs: at(body, 'durationMs'),
        stdout: at(body, 'stdout'),
        stderr: at(body, 'stderr'),
        error: at(body, 'error'),
      }),
  },
  {
    name: 'recourse_slopbench_metrics',
    title: 'SlopCodeBench quality metrics',
    description:
      'Compute static quality metrics (verbosity, erosion, LOC, cyclomatic complexity, ' +
      'maintainability) by running `slop-code metrics static` for real; returns its stdout, exit ' +
      'code, and any error. Defaults to the checkout outputs directory.' + MUTATES,
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/slopbench/metrics',
    mutating: true,
    needsSecret: true,
    long: true,
    params: {
      target: { type: 'string', description: 'Run directory or code path inside the SlopCodeBench checkout. Omit for the outputs directory.' },
    },
    project: (body) =>
      compact({
        ok: at(body, 'success'),
        target: at(body, 'target'),
        exitCode: at(body, 'exitCode'),
        durationMs: at(body, 'durationMs'),
        stdout: at(body, 'stdout'),
        stderr: at(body, 'stderr'),
        error: at(body, 'error'),
      }),
  },
  {
    name: 'recourse_slopbench_list_runs',
    title: 'List SlopCodeBench runs',
    description:
      'List completed SlopCodeBench run directories with their problem sets, agents, and timestamps. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/slopbench/runs',
    project: (body) =>
      compact({
        count: at(body, 'count'),
        runs: at(body, 'runs'),
      }),
  },

  // ---- coding pipeline discovery (opencode/deepseek/axiom/settlement) ------
  {
    name: 'recourse_coding_pipelines',
    title: 'Coding pipelines',
    description:
      'Discover every registered coding pipeline with its live availability and benchmark standing. ' +
      'Pipelines with mode "standalone" (SlopCodeBench) are listed but excluded from worktree ' +
      'head-to-head runs. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/coding-pipelines',
    project: whole,
  },
  {
    name: 'recourse_coding_pipelines_ledger',
    title: 'Coding pipeline benchmark ledger',
    description:
      'Hash-chained history of coding-pipeline benchmark runs with per-pipeline standings and chain ' +
      'integrity. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/coding-pipelines/ledger',
    project: whole,
  },

  // --- Research grounding ---------------------------------------------------
  // Recourse gathers external literature before the forge writes a tool, so
  // grounding a capability is a real capability. `preview` is a POST because it
  // takes a request body, but it mutates nothing here and is flagged readOnly
  // so the parity harness can drive it without changing Recourse state.

  {
    name: 'recourse_research_ground',
    title: 'Ground a capability in external research',
    description:
      'Gather real external literature for a tool idea before writing it, and return exactly what ' +
      'would be injected into the forge prompt. Only "retrieved" sources are quotable; others are ' +
      'returned as leads with their trust level. Reports honestly when a research service is down. ' +
      'Read-only.',
    kind: 'fetch',
    method: 'POST',
    path: '/api/recourse/grounding/preview',
    params: {
      idea: { type: 'string', required: true, description: 'The tool idea or contract, in a sentence or two' },
      domain: {
        type: 'string',
        enum: ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'],
        description: 'Tool domain, used only to pick a fallback subject when the title is too thin to search',
      },
      minRelevance: {
        type: 'number',
        min: 0,
        max: 1,
        description: 'Query-term overlap a source must reach to be quoted (default 0.34)',
      },
    },
    project: (body) =>
      compact({
        query: at(body, 'query'),
        summary: at(body, 'summary'),
        degraded: at(body, 'degraded'),
        degradedReasons: at(body, 'degradedReasons'),
        // The point of the call: the exact text the generator would read.
        promptSection: at(body, 'promptSection'),
        quotable: arrayAt(body, 'quotable'),
      }),
    readOnly: true,
  },
  {
    name: 'recourse_grounding_status',
    title: 'Research grounding status',
    description:
      'Grounding configuration, the trust registry (which providers may be quoted and why), and ' +
      'live reachability of both research services. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/grounding',
    project: (body) =>
      pick(
        body,
        'enabled',
        'services',
        'trustRegistry',
      ),
  },
  {
    name: 'recourse_grounding_ledger',
    title: 'Research grounding record',
    description:
      'The hash-chained record of what grounded a build: query, source ids with trust levels, and ' +
      'chain integrity. Answers "what was this tool actually built from?" Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/grounding/ledger',
    project: whole,
  },

  // --- DSH bundle generation -----------------------------------------------
  // Recourse can now generate cordis bundles like this one. Render is a POST
  // that writes nothing, so it is flagged readOnly; `scaffold` genuinely creates
  // files and is guarded.

  {
    name: 'recourse_dsh_plugins',
    title: 'Scaffolded DSH bundles',
    description:
      'DeepSeek Harness cordis bundles generated by Recourse, each with its manifest signature state, ' +
      'plus the profiles the harness has. Read-only.',
    kind: 'fetch',
    method: 'GET',
    path: '/api/recourse/dsh-plugins',
    project: (body) =>
      pick(body, 'scaffoldRoot', 'dshHome', 'profiles', 'bundles', 'signatureFailures'),
  },
  {
    name: 'recourse_dsh_scaffold_render',
    title: 'Render a DSH plugin bundle',
    description:
      'Generate a DeepSeek Harness cordis bundle from a declarative spec and return the file list ' +
      'plus the signed manifest WITHOUT writing to disk. Use this to see what would be created. ' +
      'Read-only.',
    kind: 'fetch',
    method: 'POST',
    path: '/api/recourse/dsh-plugins/render',
    params: {
      spec: { type: 'object', required: true, description: 'The plugin spec: id, packageName, description, tools[]' },
    },
    project: (body) =>
      compact({
        dir: at(body, 'dir'),
        files: arrayAt(body, 'files'),
        manifest: at(body, 'manifest'),
        signature: at(body, 'signature'),
        unsignedReason: at(body, 'unsignedReason'),
      }),
    readOnly: true,
  },
  {
    name: 'recourse_dsh_scaffold',
    title: 'Write a DSH harness plugin bundle',
    description:
      'Generate a DeepSeek Harness cordis bundle from a declarative spec and write it to disk under ' +
      'DSH_BUNDLE_ROOT. Mutating: requires RECOURSE_API_SECRET. Run the bundle\'s own ' +
      '`pnpm install && pnpm build` afterwards before any profile can load it.',
    kind: 'execute',
    method: 'POST',
    path: '/api/recourse/dsh-plugins/scaffold',
    params: {
      spec: { type: 'object', required: true, description: 'The plugin spec: id, packageName, description, tools[]' },
      overwrite: { type: 'boolean', description: 'Replace an existing bundle (refused by default)' },
    },
    project: (body) =>
      compact({
        dir: at(body, 'dir'),
        files: arrayAt(body, 'files'),
        signature: at(body, 'signature'),
        nextSteps: arrayAt(body, 'nextSteps'),
      }),
    mutating: true,
    needsSecret: true,
  },
];

/** Tool names this plugin registers, for the model-facing usage section. */
export function toolNames(): string[] {
  return TOOL_SPECS.map((spec) => spec.name);
}

/** True when the catalog declares the given tool name. */
export function hasTool(name: string): boolean {
  return TOOL_SPECS.some((spec) => spec.name === name);
}

export { pick };
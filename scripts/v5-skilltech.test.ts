// v5-skilltech.test.ts — Skilltech fleet wired into the no-LLM pipeline.
//
// Properties under test:
//   1. An unwired/disabled bridge reports honest skips — never a fake pass.
//   2. The footgun gate is advisory (matches recorded, promotion not blocked);
//      an unreachable server or unknown shape is an honest skip.
//   3. The UI gate issues a verdict: valid=false blocks, unavailable skips.
//   4. The Skilltech decider answers only through real tools and abstains
//      honestly; consultChain still enforces option containment.
//   5. BigBack generation prefers the Middle-Man gateway, falls back to the
//      direct URL, and reports BOTH failures when both are down.
//   6. Every call/gate/generation lands in the provenance event stream.

import {
  createSkilltechBridge,
  SkilltechDecider,
  HONEST_SKIPS,
  type McpLike,
  type GateResult,
} from '../src/lib/v5/skilltechBridge';
import { consultChain } from '../src/lib/v5/deciders';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

function fakeMcp(handlers: Record<string, (args: any) => any>, servers?: () => any[]): McpLike {
  const mc: McpLike = {
    async call(name, args) {
      const h = handlers[name];
      if (!h) return { ok: false, error: `unknown MCP tool "${name}"` };
      try { return { ok: true, result: await h(args) }; }
      catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
    },
  };
  if (servers) (mc as any).servers = servers;
  return mc;
}

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const blocking = (gates: GateResult[]) => gates.filter((g) => !g.ok && !g.skipped && !g.advisory);

async function main() {
  console.log('=== Skilltech bridge ===\n');

  console.log('1. Unwired/disabled = honest skips');
  {
    const events: Array<{ e: string; d: any }> = [];
    const unwired = createSkilltechBridge({ onEvent: (e, d) => events.push({ e, d }) });
    const s = await unwired.status();
    assert(s.wired === false, 'unwired status reports wired=false');
    assert(s.reason === 'mcp registry not wired', 'unwired status carries its reason');
    assert(s.skips.length === HONEST_SKIPS.length, 'honest skips reported even when unwired');
    const g = await unwired.footgunGate('x');
    assert(g.skipped && !g.ok, 'footgun gate on unwired bridge is an honest skip, not a pass');
    const disabled = createSkilltechBridge({ disabled: true, mcp: fakeMcp({}) });
    const sd = await disabled.status();
    assert(sd.disabled === true && sd.wired === false, 'disabled bridge reports disabled');
    assert(events.some((x) => x.e === 'v5_gate_run'), 'gate runs reach the provenance stream');
  }

  console.log('2. Footgun gate: advisory, never a silent pass');
  {
    const events: Array<{ e: string; d: any }> = [];
    const mk = (handler: (args: any) => any) =>
      createSkilltechBridge({ mcp: fakeMcp({ business_logic_mcp__check_plan_footguns: handler }), onEvent: (e, d) => events.push({ e, d }) });

    const clean = await mk(() => ({ matches: [] })).footgunGate('const x = 1;');
    assert(clean.ok && !clean.skipped && clean.advisory, 'clean scan passes and is advisory');

    const hit = await mk(() => ({ matches: [{ keyword: 'delete', severity: 'high' }] })).footgunGate('delete everything');
    assert(!hit.ok && hit.advisory && !hit.skipped, 'footgun match fails the gate but stays advisory');
    assert(blocking([hit]).length === 0, 'advisory failure never blocks promotion');

    const bad = await mk(() => { throw new Error('store not loaded'); }).footgunGate('x');
    assert(bad.skipped && !bad.ok && bad.reason === 'store not loaded', 'tool error → honest skip with reason');

    const weird = await mk(() => 'not json shaped').footgunGate('x');
    assert(weird.skipped && !weird.ok, 'unrecognized shape → honest skip, never a pass');

    assert(events.filter((x) => x.e === 'skilltech_call').length === 4, 'every footgun call is provenance-logged');
  }

  console.log('3. UI gate issues a verdict');
  {
    const mk = (handler: (args: any) => any) =>
      createSkilltechBridge({ mcp: fakeMcp({ og_glass__validate_ui: handler }) });

    const bad = await mk(() => ({ valid: false, score: 42, issues: [{ severity: 'error', rule: 'x' }] })).uiGate('code');
    assert(!bad.ok && !bad.skipped && !bad.advisory, 'valid=false is a blocking failure');
    assert(blocking([bad]).length === 1, 'blocking filter catches it');

    const good = await mk(() => ({ valid: true, score: 98, issues: [] })).uiGate('code');
    assert(good.ok && !good.skipped, 'valid=true passes');

    const noPreset = await mk(() => { throw new Error('No active preset'); }).uiGate('code');
    assert(noPreset.skipped && !noPreset.ok, 'missing preset → honest skip (tool needs active preset)');
  }

  console.log('4. Skilltech decider: real tools only, honest abstention');
  {
    const bridge = createSkilltechBridge({
      mcp: fakeMcp({
        business_logic_mcp__list_decision_tables: () => ({ tables: [{ id: 'pricing_rules' }] }),
        business_logic_mcp__evaluate_realtime_decision: () => ({ output: '[1,2,3]' }),
        og_glass__decide_design_direction: () => ({ chosen: 'Glassmorphic' }),
      }),
    });
    const d = new SkilltechDecider(bridge);

    const domain = await d.answer(
      { input: [2, 1], options: ['[1,2,3]', '[9,9,9]'] },
      { intent: 'apply pricing rules', examples: [], candidates: [] },
    );
    assert(domain === '[1,2,3]', 'decision-table output answers when it maps the intent');

    const noTable = await d.answer(
      { input: [2, 1], options: ['[1,2]', '[3,4]'] },
      { intent: 'totally unrelated thing', examples: [], candidates: [] },
    );
    assert(noTable === null, 'no matching decision table → abstain, never a guess');

    const design = await d.answer(
      { input: [0], options: ['Glassmorphic', 'Brutalist'] },
      { intent: 'choose a design style for the dashboard', examples: [], candidates: [] },
    );
    assert(design === 'Glassmorphic', 'design intent routes to OG-Glass decide_design_direction');

    const outcome = await consultChain(
      { input: [1], options: ['A', 'B'] },
      { intent: 'smuggle', examples: [], candidates: [], proposalAnswer: null },
      [{ name: 'skilltech', async answer() { return 'C'; } }],
    );
    assert(outcome.answer === null && outcome.rejected.includes('skilltech'), 'consultChain still rejects non-option answers');

    const unwiredD = new SkilltechDecider(createSkilltechBridge({}));
    const abstain = await unwiredD.answer({ input: [1], options: ['A', 'B'] }, { intent: 'sort a list', examples: [], candidates: [] });
    assert(abstain === null, 'unwired bridge → decider abstains');
  }

  console.log('5. BigBack: gateway first, direct fallback, honest double-failure');
  {
    const seen: string[] = [];
    const relayUp = createSkilltechBridge({
      fetchImpl: async (input: any) => {
        const url = String(input);
        seen.push(url);
        if (url.includes('/api/mcp-registry/relay')) return okJson({ ok: true, status: 200, data: { ok: true, files: [] } });
        return okJson({ ok: false }, 500);
      },
    });
    const viaGateway = await relayUp.generate({ generator: 'bigback', spec: { framework: 'fastapi' } });
    assert(viaGateway.ok && viaGateway.via === 'middleman', 'gateway relay preferred when healthy');
    assert(viaGateway.untrusted === true, 'generated artifact is flagged untrusted');

    const relayDown = createSkilltechBridge({
      fetchImpl: async (input: any) => {
        const url = String(input);
        seen.push(url);
        if (url.includes('/api/mcp-registry/relay')) throw new Error('ECONNREFUSED');
        if (url.includes('/generator/plan')) return okJson({ ok: true, files: [{ path: 'main.py' }] });
        return okJson({ ok: false }, 500);
      },
    });
    const direct = await relayDown.generate({ generator: 'bigback', spec: {} });
    assert(direct.ok && direct.via === 'direct', 'direct BigBack fallback when gateway is down');

    const bothDown = createSkilltechBridge({
      fetchImpl: async (input: any) => {
        const url = String(input);
        if (url.includes('/api/mcp-registry/relay')) throw new Error('gateway down');
        throw new Error('direct down');
      },
    });
    const dead = await bothDown.generate({ generator: 'bigback', spec: {} });
    assert(!dead.ok && String(dead.error).includes('gateway') && String(dead.error).includes('direct'), 'both failures reported honestly, never a fabricated result');

    const unknown = createSkilltechBridge({ fetchImpl: async () => okJson({}) });
    const bogus = await unknown.generate({ generator: 'nope' } as any);
    assert(!bogus.ok, 'unknown generator rejected');
  }

  console.log('6. OG-Glass generation validates its inputs');
  {
    const bridge = createSkilltechBridge({
      mcp: fakeMcp({
        og_glass__design_brief: () => ({ ok: true, chosen: 'Glassmorphic' }),
        og_glass__export_design_markdown: () => { throw new Error('Preset not found'); },
      }),
    });
    const brief = await bridge.generate({ generator: 'og_glass', goal: 'dashboard' });
    assert(brief.ok && brief.via === 'stdio', 'design_brief generates over stdio');

    const missing = await bridge.generate({ generator: 'og_glass', tool: 'design_brief' });
    assert(!missing.ok && String(missing.error).includes('requires goal'), 'missing goal rejected before any call');

    const badTool = await bridge.generate({ generator: 'og_glass', tool: 'rm_rf' });
    assert(!badTool.ok, 'unknown og_glass tool rejected');

    const presetFail = await bridge.generate({ generator: 'og_glass', tool: 'export_design_markdown', preset_id: 'ghost' });
    assert(!presetFail.ok, 'tool failure surfaces as failure, not a fabricated artifact');
  }

  console.log('7. Status reports the fleet honestly');
  {
    const bridge = createSkilltechBridge({
      mcp: fakeMcp({}, () => [
        { id: 'business-logic-mcp', connected: true, tools: 37 },
        { id: 'og-glass', connected: false, lastError: 'spawn failed', tools: 0 },
      ]),
      fetchImpl: async () => okJson({ ok: true, services: [{ name: 'bigback' }] }),
    });
    const s = await bridge.status();
    assert(s.wired === true, 'wired bridge reports wired=true');
    assert(s.gateway?.ok === true && s.gateway.services.includes('bigback'), 'gateway health + registered services reported');
    assert(s.stdio?.length === 2 && s.stdio?.[0].tools === 37, 'stdio server status surfaces tool counts');
    assert(s.stdio?.[1].connected === false && s.stdio?.[1].lastError === 'spawn failed', 'failed server reports its error, not a fake connection');

    const gwDown = createSkilltechBridge({
      mcp: fakeMcp({}),
      fetchImpl: async () => { throw new Error('connect ETIMEDOUT'); },
    });
    const s2 = await gwDown.status();
    assert(s2.gateway?.ok === false && String(s2.gateway?.error).includes('ETIMEDOUT'), 'gateway down → honest error');
    assert(s2.skips.length === 4, 'skip list always present');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

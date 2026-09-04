import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildComponentFromTemplate,
  getComponentTemplate
} from '../src/lib/componentTemplates';
import {
  writeSelfHostedTool,
  verifySelfHostedEntry,
  executeSelfHostedTool,
  getSelfHostedEntry,
  listSelfHostedEntries
} from '../src/lib/selfHosting';
import {
  isWebCategory,
  htmlFromResult,
  pickRenderMethod
} from '../src/lib/webArtifact';
import type { ToolDomain, ArtifactKind } from '../src/types';

const roots: string[] = [];
function freshRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webrev-test-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const r of roots.splice(0)) {
    try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function materialize(templateId: string, name: string, params: Record<string, any> = {}, opts: { withSelfHealing?: boolean } = {}) {
  const tpl = getComponentTemplate(templateId);
  if (!tpl) throw new Error(`template ${templateId} missing`);
  const result = buildComponentFromTemplate(templateId, params, {
    withSelfHealing: opts.withSelfHealing ?? true,
    componentName: name
  });
  if (!result.success) throw new Error(result.error || `build failed for ${templateId}`);
  if (!tpl.selfHost) throw new Error(`template ${templateId} has no selfHost descriptor`);
  const root = freshRoot();
  const write = writeSelfHostedTool({
    name,
    templateId,
    domain: tpl.domain as ToolDomain,
    entrypointName: result.entrypointName,
    params,
    sourceCode: result.synthesizedCode,
    testSuiteCode: result.testSuiteCode,
    summary: tpl.name,
    selfHost: tpl.selfHost,
    artifactKind: tpl.artifactKind as ArtifactKind | undefined
  }, root);
  if (write.success === false) throw new Error(`self-host write failed for ${templateId}: ${write.error}`);
  return { tpl, result, root, entry: write.entry };
}

const LANDS: Array<[string, string]> = [
  ['tpl_landing_page', 'LandingGenT'],
  ['tpl_invoice_renderer', 'InvoiceGenT'],
  ['tpl_saas_ltv', 'LtvEngineT']
];

describe('web & revenue template lane', () => {
  it('registers the three web/revenue templates with the right categories', () => {
    const landing = getComponentTemplate('tpl_landing_page');
    const invoice = getComponentTemplate('tpl_invoice_renderer');
    const ltv = getComponentTemplate('tpl_saas_ltv');
    expect(landing?.category).toBe('web');
    expect(invoice?.category).toBe('revenue');
    expect(ltv?.category).toBe('revenue');
    expect(landing?.selfHost).toBeTruthy();
    expect(landing?.artifactKind).toBe('api');
    expect(ltv?.selfHost).toBeTruthy();
  });

  it('every template builds green and self-hosts into a live, re-verifiable module', async () => {
    for (const [id, name] of LANDS) {
      const { tpl, entry, root } = materialize(id, name);
      const verdict = await verifySelfHostedEntry(entry, root);
      expect(verdict.passed, `${id}: ${verdict.detail}`).toBe(true);
      expect(getSelfHostedEntry(name, root)?.name).toBe(name);
      expect(listSelfHostedEntries(root).length).toBeGreaterThanOrEqual(1);
      void tpl;
    }
  });
});

describe('landing page generator (web)', () => {
  it('render() returns a real, valid, servable HTML document', async () => {
    const { entry, root } = materialize('tpl_landing_page', 'LandingGenT', {
      productName: 'Recourse Studio', headline: 'Ship verified tools', price: '$49/mo', cta: 'Start building'
    });
    const run = await executeSelfHostedTool(entry.name, { method: 'render' }, root);
    expect(run.success).toBe(true);
    const html = (run as { success: true; result: unknown }).result as string;
    expect(html).toBeTypeOf('string');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Recourse Studio');
    expect(html).toContain('Ship verified tools');
    expect(html).toContain('$49/mo');
    expect(html).toContain('Start building');
    expect(html).not.toContain('<script>');
    // The web-artifact decision layer accepts it as a real page.
    const decision = htmlFromResult(html);
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.html).toBe(html);
  });

  it('isWebCategory + htmlFromResult gate what may be served as a page', () => {
    expect(isWebCategory('web')).toBe(true);
    expect(isWebCategory('revenue')).toBe(false);
    expect(isWebCategory(undefined)).toBe(false);

    const good = htmlFromResult('<!doctype html><html></html>');
    expect(good.ok).toBe(true);

    const obj = htmlFromResult({ html: '<html>' });
    expect(obj.ok).toBe(false); // an object is never a page

    const text = htmlFromResult('hello world');
    expect(text.ok).toBe(false); // not markup

    const empty = htmlFromResult('');
    expect(empty.ok).toBe(false);
  });

  it('pickRenderMethod prefers render over the first method', () => {
    expect(pickRenderMethod([{ method: 'render' }, { method: 'echo' }])?.method).toBe('render');
    expect(pickRenderMethod([{ method: 'echo' }])?.method).toBe('echo');
    expect(pickRenderMethod([])).toBeNull();
    expect(pickRenderMethod(undefined)).toBeNull();
  });
});

describe('invoice renderer (revenue)', () => {
  const items = [
    { desc: 'Verified tool build', price: 250, qty: 2 },
    { desc: 'Web artifact', price: 120, qty: 1 }
  ];

  it('computeTotals does real arithmetic', async () => {
    const { entry, root } = materialize('tpl_invoice_renderer', 'InvoiceGenT');
    const run = await executeSelfHostedTool(entry.name, { method: 'computeTotals', args: [items, 8] }, root);
    expect(run.success).toBe(true);
    const t = (run as { success: true; result: { subtotal: number; tax: number; total: number; itemCount: number } }).result;
    expect(t.subtotal).toBe(620);
    expect(t.tax).toBe(49.6);
    expect(t.total).toBe(669.6);
    expect(t.itemCount).toBe(2);
  });

  it('renderHtml escapes hostile input and exports CSV with a formula-injection guard', async () => {
    const { entry, root } = materialize('tpl_invoice_renderer', 'InvoiceGenT');
    const hostile = await executeSelfHostedTool(entry.name, { method: 'renderHtml', args: [{ items: [{ desc: '<script>alert(1)</script>', price: 1, qty: 1 }] }] }, root);
    const html = (hostile as { success: true; result: unknown }).result as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');

    const csvRun = await executeSelfHostedTool(entry.name, { method: 'toCsv', args: [[{ desc: '=SUM(A1:A9)', price: 1, qty: 1 }]] }, root);
    const csv = (csvRun as { success: true; result: unknown }).result as string;
    expect(csv).toContain("'=SUM");
    // Every row cell is quoted (text-safe).
    expect(csv.split('\n').length).toBe(2);
  });
});

describe('saas unit-economics engine (revenue)', () => {
  it('evaluates healthy and weak scenarios with real numbers', async () => {
    const { entry, root } = materialize('tpl_saas_ltv', 'LtvEngineT');
    const good = await executeSelfHostedTool(entry.name, { method: 'evaluate', args: [{ arpu: 100, marginPct: 80, churnMonthlyPct: 5, cac: 300 }] }, root);
    const g = (good as { success: true; result: { grossProfitPerMonth: number; ltv: number; paybackMonths: number; healthy: boolean; reason: string } }).result;
    expect(g.grossProfitPerMonth).toBe(80);
    expect(g.ltv).toBe(1600);
    expect(g.paybackMonths).toBe(3.75);
    expect(g.healthy).toBe(true);

    const weak = await executeSelfHostedTool(entry.name, { method: 'evaluate', args: [{ arpu: 100, marginPct: 20, churnMonthlyPct: 10, cac: 2000 }] }, root);
    const w = (weak as { success: true; result: { healthy: boolean; ltv: number } }).result;
    expect(w.ltv).toBe(200);
    expect(w.healthy).toBe(false);
  });

  it('clamps zero/negative churn so LTV never explodes to Infinity', async () => {
    const { entry, root } = materialize('tpl_saas_ltv', 'LtvEngineT');
    const run = await executeSelfHostedTool(entry.name, { method: 'evaluate', args: [{ arpu: 100, marginPct: 80, churnMonthlyPct: 0, cac: 300 }] }, root);
    const r = (run as { success: true; result: { ltv: number | null; reason: string } }).result;
    expect(r.ltv).toBeNull();
    expect(r.reason).toMatch(/no churn/);
  });
});

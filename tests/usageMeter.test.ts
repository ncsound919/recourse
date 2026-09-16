import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  openUsageMeter,
  readUsage,
  summarizeUsage,
  groupUsage,
  priceForModel,
  tokenCostCents,
  estimateTokensFromText,
  roundCents,
  centsToUsd,
  DEFAULT_MODEL_PRICES,
} from '../src/lib/usageMeter';

const dirs: string[] = [];
function freshFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-usage-'));
  dirs.push(dir);
  return path.join(dir, 'usage-ledger.jsonl');
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  delete process.env.RECOURSE_MODEL_PRICES_JSON;
});

describe('usage meter', () => {
  it('computes token cost from a price table', () => {
    const price = { inputCentsPerMTok: 100, outputCentsPerMTok: 200 };
    // 1M input tokens at 100c/M = 100c; 500k output at 200c/M = 100c.
    expect(tokenCostCents(price, 1_000_000, 500_000)).toBe(200);
    expect(tokenCostCents(price, 0, 0)).toBe(0);
    expect(tokenCostCents(price, -5, -5)).toBe(0);
  });

  it('preserves sub-cent costs rather than rounding them away', () => {
    const price = { inputCentsPerMTok: 14, outputCentsPerMTok: 28 };
    const cents = tokenCostCents(price, 1000, 1000);
    expect(cents).toBeGreaterThan(0);
    expect(cents).toBeLessThan(0.1);
    expect(roundCents(cents)).toBe(cents);
  });

  it('resolves prices with env overrides and falls back to default', () => {
    expect(priceForModel('deepseek-v4-flash-0731')).toEqual(DEFAULT_MODEL_PRICES['deepseek-v4-flash-0731']);
    expect(priceForModel('some-unknown-model')).toEqual(DEFAULT_MODEL_PRICES.default);
    process.env.RECOURSE_MODEL_PRICES_JSON = JSON.stringify({ 'some-unknown-model': { inputCentsPerMTok: 5, outputCentsPerMTok: 7 } });
    expect(priceForModel('some-unknown-model')).toEqual({ inputCentsPerMTok: 5, outputCentsPerMTok: 7 });
  });

  it('ignores a malformed price table', () => {
    process.env.RECOURSE_MODEL_PRICES_JSON = '{not json';
    expect(priceForModel('x')).toEqual(DEFAULT_MODEL_PRICES.default);
  });

  it('estimates tokens from text (~4 chars/token)', () => {
    expect(estimateTokensFromText('')).toBe(0);
    expect(estimateTokensFromText(null)).toBe(0);
    expect(estimateTokensFromText('abcd')).toBe(1);
    expect(estimateTokensFromText('a'.repeat(400))).toBe(100);
  });

  it('records events and aggregates them with filters', () => {
    const file = freshFile();
    const meter = openUsageMeter(file);
    meter.record({ tenantId: 't1', kind: 'model_call', model: 'm', inputTokens: 100, outputTokens: 50, cents: 0.5, at: 10 });
    meter.record({ tenantId: 't1', kind: 'api_request', at: 20 });
    meter.record({ tenantId: 't2', kind: 'model_call', model: 'm', inputTokens: 10, outputTokens: 5, cents: 0.25, at: 30 });

    expect(meter.events()).toHaveLength(3);
    expect(meter.events({ tenantId: 't1' })).toHaveLength(2);

    const t1 = meter.summary({ tenantId: 't1' });
    expect(t1.events).toBe(2);
    expect(t1.requests).toBe(1);
    expect(t1.inputTokens).toBe(100);
    expect(t1.outputTokens).toBe(50);
    expect(t1.totalTokens).toBe(150);
    expect(t1.cents).toBe(0.5);

    const byTenant = meter.byTenant();
    expect(byTenant.map((b) => b.key)).toEqual(['t1', 't2']);
    expect(byTenant[0].summary.totalTokens).toBe(150);

    const byKind = meter.byKind();
    expect(byKind.find((b) => b.key === 'api_request')!.summary.requests).toBe(1);

    expect(meter.totalCents({ since: 15 })).toBe(0.25);
  });

  it('clamps negative token/cost input and never throws on corrupt lines', () => {
    const file = freshFile();
    const meter = openUsageMeter(file);
    const e = meter.record({ tenantId: 't', kind: 'tool_call', inputTokens: -3, outputTokens: -1, cents: -2 });
    expect(e.inputTokens).toBe(0);
    expect(e.outputTokens).toBe(0);
    expect(e.cents).toBe(0);
    fs.appendFileSync(file, '{ this is not json }\n', 'utf-8');
    expect(readUsage(file)).toHaveLength(1);
  });

  it('summarizeUsage is pure over supplied events', () => {
    const events = [
      { id: '1', at: 1, tenantId: 'a', kind: 'api_request' as const, inputTokens: 0, outputTokens: 0, totalTokens: 0, cents: 0, estimated: false },
      { id: '2', at: 2, tenantId: 'b', kind: 'model_call' as const, inputTokens: 5, outputTokens: 5, totalTokens: 10, cents: 1, estimated: true },
    ];
    const s = summarizeUsage(events, { tenantId: 'b' });
    expect(s.events).toBe(1);
    expect(s.totalTokens).toBe(10);
    expect(s.estimatedEvents).toBe(1);
    expect(s.firstAt).toBe(2);
    expect(s.lastAt).toBe(2);
    expect(groupUsage(events, (e) => e.tenantId)).toHaveLength(2);
  });

  it('converts cents to usd', () => {
    expect(centsToUsd(123)).toBe(1.23);
  });
});

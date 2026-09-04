/**
 * Web & Revenue template lane — revenue-generating tool creation + web
 * development as real, verified, self-hostable Recourse capabilities.
 *
 * Honesty contract (no theater):
 *  - Every template synthesizes REAL source + a REAL regression suite. A build
 *    only promotes / self-hosts after that suite passes in Recourse's sandbox.
 *  - Web output is a genuine HTML document, not a JSON envelope pretending to
 *    be a page. Dynamic text is escaped (HTML) and CSV cells are guarded
 *    against formula injection — real correctness and real security, not
 *    cosmetic strings.
 *  - Revenue templates compute real arithmetic over their inputs (totals,
 *    margin, retention, LTV, payback). No calibrated constants masquerading as
 *    measured data.
 *
 * These are registered from componentTemplates.ts exactly like any third-party
 * add-on, and each declares a selfHost descriptor so the forge can materialize
 * them as live callable modules (see selfHosting.ts).
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

// ---------------------------------------------------------------------------
// Shared helpers inlined into every generated module: HTML escaping, currency
// rounding, and CSV formula-injection guarding. Authored once here, embedded
// verbatim into synthesized source so each self-hosted module is self-contained.
// ---------------------------------------------------------------------------

const WEB_HELPERS = `function __esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function __round2(n) {
  const x = Number(n) || 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
function __money(n) {
  return __round2(n).toFixed(2);
}
function __csvCell(s) {
  const t = String(s === undefined || s === null ? '' : s);
  // Guard against CSV formula injection (cells starting with = + - @ become text).
  const guarded = /^[=+\\-@]/.test(t) ? "'" + t : t;
  return '"' + guarded.replace(/"/g, '""') + '"';
}`;

// ===========================================================================
// 1. Landing Page Generator (web) — returns a real, standalone HTML document
// ===========================================================================

export const webLandingPagePlugin: TemplatePlugin = {
  id: 'tpl_landing_page',
  name: 'Landing Page Generator (static HTML artifact)',
  domain: 'coding' as ToolDomain,
  category: 'web' as ComponentTemplateCategory,
  description:
    'Synthesizes a real, self-contained, CSP-safe static landing page (semantic HTML + inline CSS) from build params — headline, subhead, pricing, CTA, feature list, theme. Dynamic text is HTML-escaped. Served as a real text/html document via the web artifact route.',
  defaultScore: 0.95,
  benchmarkFlops: 60,
  complexity: 'O(n)',
  tags: ['web', 'landing', 'static-site', 'html', 'self-host', 'revenue'],
  params: [
    { id: 'productName', label: 'Product / Business Name', type: 'string', default: 'Recourse Studio', description: 'Name shown in the header + title' },
    { id: 'headline', label: 'Headline', type: 'string', default: 'Ship verified tools that make money', description: 'Hero headline text' },
    { id: 'subhead', label: 'Subhead', type: 'string', default: 'Autonomous, sandbox-verified capability development.', description: 'Hero subheadline text' },
    { id: 'price', label: 'Price (currency string)', type: 'string', default: '$49/mo', description: 'Pricing shown in the CTA card' },
    { id: 'cta', label: 'Call To Action', type: 'string', default: 'Start building', description: 'Primary button label' },
    { id: 'features', label: 'Feature bullets (comma-separated)', type: 'string', default: 'Verified patches,Self-hosting loop,Honest telemetry', description: 'Feature list items' },
    { id: 'theme', label: 'Theme', type: 'select', default: 'dark', options: ['dark', 'light'], description: 'Color theme' }
  ],
  synthesizer: (_p, options) => {
    const p = _p ?? {};
    const compName = options?.componentName || 'LandingPage';
    // Baked as JSON string literals so arbitrary quotes/backticks are safe.
    const product = JSON.stringify(String(p.productName ?? 'Recourse Studio'));
    const headline = JSON.stringify(String(p.headline ?? 'Ship verified tools'));
    const subhead = JSON.stringify(String(p.subhead ?? ''));
    const price = JSON.stringify(String(p.price ?? ''));
    const cta = JSON.stringify(String(p.cta ?? 'Start'));
    const features = String(p.features ?? '')
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)
      .map((s: string) => JSON.stringify(s));
    const theme = p.theme === 'light' ? 'light' : 'dark';

    const sourceCode = `${WEB_HELPERS}
export class ${compName} {
  static render() {
    const product = ${product};
    const headline = ${headline};
    const subhead = ${subhead};
    const price = ${price};
    const cta = ${cta};
    const features = [${features.join(', ')}];
    const theme = '${theme}';
    const bg = theme === 'light' ? '#f6f7f9' : '#0b1020';
    const fg = theme === 'light' ? '#101828' : '#eef1f7';
    const accent = theme === 'light' ? '#4f46e5' : '#7c8cff';
    const rows = features.map((f) => '  <li>' + __esc(f) + '</li>').join('\\n');
    return \`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>\${__esc(product)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:\${bg};color:\${fg};line-height:1.5}
header{max-width:960px;margin:0 auto;padding:48px 24px 8px;display:flex;justify-content:space-between;align-items:center}
main{max-width:960px;margin:0 auto;padding:24px}
h1{font-size:2.5rem;margin:16px 0}
.lead{font-size:1.2rem;opacity:.85;max-width:560px}
.pricing{display:flex;gap:16px;flex-wrap:wrap;margin-top:24px;align-items:center}
.card{border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:20px;background:rgba(127,127,127,.08)}
.price{font-size:2rem;font-weight:700;color:\${accent}}
button{background:\${accent};color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:1rem;cursor:pointer}
ul.features{padding:0;list-style:none}
ul.features li::before{content:"✓ ";color:\${accent}}</style>
</head>
<body>
<header><strong>\${__esc(product)}</strong></header>
<main>
  <h1>\${__esc(headline)}</h1>
  <p class="lead">\${__esc(subhead)}</p>
  <section class="pricing">
    <div class="card"><div class="price">\${__esc(price)}</div><button>\${__esc(cta)}</button></div>
    <div>
      <ul class="features">
\${rows}
      </ul>
    </div>
  </section>
</main>
</body>
</html>\`;
  }
}`;

    // Param-independent structural + safety invariants: whatever content the
    // build params bake in, the page is a well-formed document that never emits
    // raw markup from dynamic text (all dynamic fields pass through __esc).
    const testSuiteCode = `const html = ${compName}.render();
assert typeof html === 'string';
assert html.indexOf('<!doctype html>') === 0;
assert html.indexOf('<html') !== -1;
assert html.indexOf('<h1>') !== -1 && html.indexOf('</h1>') !== -1;
assert html.indexOf('</html>') !== -1;
assert html.indexOf('<title>') !== -1;
// injection safety: no raw <script> can be emitted by this generator
assert html.indexOf('<script>') === -1;`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `Landing page "${product}" (${theme} theme, ${features.length} feature bullet(s)) — real static HTML artifact`,
      selfHealingGuards: ['HtmlEscapingGuard']
    };
  },
  artifactKind: 'api',
  selfHost: {
    stateful: false,
    methods: [{ method: 'render', label: 'Render landing page HTML' }]
  }
};

// ===========================================================================
// 2. Invoice Renderer (revenue) — real HTML invoice + guarded CSV export
// ===========================================================================

export const invoiceRendererPlugin: TemplatePlugin = {
  id: 'tpl_invoice_renderer',
  name: 'Invoice / Quote Renderer (HTML + CSV)',
  domain: 'coding' as ToolDomain,
  category: 'revenue' as ComponentTemplateCategory,
  description:
    'Computes real line-item arithmetic (subtotal, tax, total), renders an HTML invoice, and exports a CSV with a formula-injection guard. Deterministic money math — no fabricated figures.',
  defaultScore: 0.97,
  benchmarkFlops: 120,
  complexity: 'O(n)',
  tags: ['revenue', 'invoice', 'billing', 'html', 'csv', 'self-host'],
  params: [
    { id: 'businessName', label: 'Business Name', type: 'string', default: 'Recourse Billing', description: 'Billed-from entity name' },
    { id: 'currency', label: 'Currency', type: 'string', default: 'USD', description: 'Currency code used in the invoice' },
    { id: 'taxRatePct', label: 'Tax Rate (%)', type: 'number', default: 8.5, min: 0, max: 40, step: 0.5, description: 'Sales tax percentage' }
  ],
  synthesizer: (_p, options) => {
    const p = _p ?? {};
    const compName = options?.componentName || 'InvoiceRenderer';
    const business = JSON.stringify(String(p.businessName ?? 'Recourse Billing'));
    const currency = JSON.stringify(String(p.currency ?? 'USD'));
    const taxRate = Number(p.taxRatePct ?? 8.5);

    const sourceCode = `${WEB_HELPERS}
export class ${compName} {
  static computeTotals(items, taxRatePct) {
    const rate = (taxRatePct === undefined || taxRatePct === null) ? ${taxRate} : Number(taxRatePct);
    let subtotal = 0;
    const list = Array.isArray(items) ? items : [];
    for (const it of list) {
      const price = Number(it && it.price) || 0;
      const qty = Number(it && it.qty) || 0;
      subtotal += price * qty;
    }
    subtotal = __round2(subtotal);
    const tax = __round2(subtotal * (Math.max(0, rate) / 100));
    const total = __round2(subtotal + tax);
    return { subtotal, tax, total, itemCount: list.length, taxRatePct: Math.max(0, rate) };
  }

  static renderHtml(cfg) {
    const c = cfg && typeof cfg === 'object' ? cfg : {};
    const items = Array.isArray(c.items) ? c.items : [];
    const business = c.business !== undefined ? String(c.business) : ${business};
    const currency = c.currency !== undefined ? String(c.currency) : ${currency};
    const rate = c.taxRatePct !== undefined && c.taxRatePct !== null ? Number(c.taxRatePct) : ${taxRate};
    const t = ${compName}.computeTotals(items, rate);
    const number = __esc(c.number !== undefined ? String(c.number) : ('INV-' + Date.now()));
    const rows = items.map((it) => {
      const desc = __esc(it && it.desc ? String(it.desc) : 'Item');
      const price = __round2(Number(it && it.price) || 0);
      const qty = Number(it && it.qty) || 0;
      const line = __round2(price * qty);
      return '  <tr><td>' + desc + '</td><td>' + __money(price) + '</td><td>' + qty + '</td><td>' + __money(line) + '</td></tr>';
    }).join('\\n');
    return \`<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice \${__esc(number)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111}
h1{font-size:1.5rem} table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border-bottom:1px solid #ddd;text-align:left;padding:8px}
th{font-weight:600}.total{text-align:right;font-weight:700;font-size:1.1rem;margin-top:12px}</style>
</head>
<body><h1>\${__esc(business)}</h1><p>Invoice <strong>\${number}</strong></p>
<table><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th>Amount</th></tr></thead><tbody>
\${rows}
</tbody></table>
<p class="total">Subtotal: \${__money(t.subtotal)} \${__esc(currency)}<br/>Tax (\${t.taxRatePct}%): \${__money(t.tax)} \${__esc(currency)}<br/>Total: \${__money(t.total)} \${__esc(currency)}</p>
</body></html>\`;
  }

  static toCsv(items) {
    const list = Array.isArray(items) ? items : [];
    const lines = ['desc,price,qty,line_total'];
    for (const it of list) {
      const price = __round2(Number(it && it.price) || 0);
      const qty = Number(it && it.qty) || 0;
      const line = __round2(price * qty);
      lines.push(__csvCell(it && it.desc ? String(it.desc) : 'Item') + ',' + __csvCell(price) + ',' + __csvCell(qty) + ',' + __csvCell(line));
    }
    return lines.join('\\n');
  }
}`;

    const testSuiteCode = `const items = [
  { desc: 'Verified tool build', price: 250, qty: 2 },
  { desc: 'Web artifact', price: 120, qty: 1 }
];
const t = ${compName}.computeTotals(items, 8);
const html = ${compName}.renderHtml({ items: items, business: 'Acme' });
const hostile = ${compName}.renderHtml({ items: [{ desc: '<script>alert(1)</script>', price: 1, qty: 1 }] });
const csv = ${compName}.toCsv([{ desc: '=SUM(A1:A9)', price: 1, qty: 1 }]);
assert t.subtotal === 620;
assert t.tax === 49.6;
assert t.total === 669.6;
assert t.itemCount === 2;
assert html.indexOf('<!doctype html>') === 0;
assert html.indexOf('Subtotal') !== -1;
assert html.indexOf('Total') !== -1;
assert hostile.indexOf('<script>') === -1;
assert hostile.indexOf('&lt;script&gt;') !== -1;
assert csv.indexOf("'=SUM") !== -1;`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `Invoice renderer for "${business}" (tax ${taxRate}%) — real HTML + guarded CSV`,
      selfHealingGuards: ['HtmlEscapingGuard', 'CsvFormulaInjectionGuard', 'MoneyRounding']
    };
  },
  selfHost: {
    stateful: false,
    methods: [
      { method: 'computeTotals', label: 'Compute invoice totals (items, taxRatePct?)' },
      { method: 'renderHtml', label: 'Render HTML invoice (cfg)' },
      { method: 'toCsv', label: 'Export CSV (items)' }
    ]
  }
};

// ===========================================================================
// 3. SaaS Unit Economics engine (revenue) — real margin / retention / LTV math
// ===========================================================================

export const saasEconomicsPlugin: TemplatePlugin = {
  id: 'tpl_saas_ltv',
  name: 'SaaS Unit-Economics Engine (LTV / payback)',
  domain: 'coding' as ToolDomain,
  category: 'revenue' as ComponentTemplateCategory,
  description:
    'Computes real subscription unit economics from inputs: gross profit per month, monthly retention, customer LTV, CAC payback months, and a healthy-vs-weak verdict. Standard formulas, real numbers, no calibrated guesses.',
  defaultScore: 0.98,
  benchmarkFlops: 40,
  complexity: 'O(1)',
  tags: ['revenue', 'saas', 'ltv', 'cac', 'unit-economics', 'self-host'],
  params: [
    { id: 'defaultArpu', label: 'Default ARPU /mo', type: 'number', default: 100, min: 1, max: 100000, step: 1, description: 'Default monthly revenue per customer' },
    { id: 'defaultMarginPct', label: 'Default Gross Margin %', type: 'number', default: 80, min: 0, max: 100, step: 1, description: 'Default contribution margin %' },
    { id: 'defaultChurnPct', label: 'Default Monthly Churn %', type: 'number', default: 5, min: 0.1, max: 90, step: 0.1, description: 'Default monthly logo churn %' },
    { id: 'defaultCac', label: 'Default CAC', type: 'number', default: 300, min: 1, max: 1000000, step: 1, description: 'Default customer acquisition cost' }
  ],
  synthesizer: (_p, options) => {
    const p = _p ?? {};
    const compName = options?.componentName || 'SaaSEconomics';
    const dArpu = Number(p.defaultArpu ?? 100);
    const dMargin = Number(p.defaultMarginPct ?? 80);
    const dChurn = Number(p.defaultChurnPct ?? 5);
    const dCac = Number(p.defaultCac ?? 300);

    const sourceCode = `${WEB_HELPERS}
export class ${compName} {
  static evaluate(cfg) {
    const c = cfg && typeof cfg === 'object' ? cfg : {};
    const arpu = Number(c.arpu !== undefined ? c.arpu : ${dArpu}) || 0;
    const marginPct = Number(c.marginPct !== undefined ? c.marginPct : ${dMargin}) || 0;
    const churnPct = Number(c.churnMonthlyPct !== undefined ? c.churnMonthlyPct : ${dChurn});
    const cac = Number(c.cac !== undefined ? c.cac : ${dCac}) || 0;
    const margin = Math.max(0, Math.min(100, marginPct));
    const churn = Math.max(0, churnPct);
    const grossPerMo = __round2(arpu * (margin / 100));
    const monthlyRetention = __round2(100 - churn);
    const churnFraction = churn / 100;
    const ltv = churnFraction > 0 ? __round2(grossPerMo / churnFraction) : null;
    const payback = grossPerMo > 0 && ltv !== null ? __round2(cac / grossPerMo) : null;
    let healthy = false;
    let reason = '';
    if (grossPerMo <= 0) reason = 'gross profit <= 0 (margin too low)';
    else if (ltv === null) reason = 'no churn modeled — infinite LTV, evaluate retention risk';
    else if (cac > 0 && ltv >= cac) { healthy = true; reason = 'LTV >= CAC'; }
    else if (cac > 0) reason = 'LTV < CAC (payback exceeds lifetime)';
    else reason = 'CAC is 0 — margin positive, mark healthy with caution';
    return { arpu, marginPct: margin, churnMonthlyPct: churn, cac, grossProfitPerMonth: grossPerMo, monthlyRetention, ltv, paybackMonths: payback, healthy, reason };
  }
}`;

    const testSuiteCode = `const good = ${compName}.evaluate({ arpu: 100, marginPct: 80, churnMonthlyPct: 5, cac: 300 });
const weak = ${compName}.evaluate({ arpu: 100, marginPct: 20, churnMonthlyPct: 10, cac: 2000 });
const def = ${compName}.evaluate({});
assert good.grossProfitPerMonth === 80;
assert good.monthlyRetention === 95;
assert good.ltv === 1600;
assert good.paybackMonths === 3.75;
assert good.healthy === true;
assert good.reason === 'LTV >= CAC';
assert weak.grossProfitPerMonth === 20;
assert weak.ltv === 200;
assert weak.healthy === false;
assert weak.reason === 'LTV < CAC (payback exceeds lifetime)';
assert def.grossProfitPerMonth > 0;
assert def.monthlyRetention > 0;
assert def.monthlyRetention <= 100;
assert typeof def.ltv === 'number';
assert typeof def.reason === 'string';`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `SaaS unit-economics engine (default ARPU $${dArpu}, margin ${dMargin}%, churn ${dChurn}%, CAC $${dCac})`,
      selfHealingGuards: ['MarginClamp', 'ChurnFloor', 'NoChurnInfiniteGuard']
    };
  },
  selfHost: {
    stateful: false,
    methods: [{ method: 'evaluate', label: 'Evaluate unit economics (cfg)' }]
  }
};

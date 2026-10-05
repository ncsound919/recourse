/**
 * ingest-lessons — fold a `_schema.md` lesson folder into Recourse's durable
 * vector memory as `kind: 'lesson'` documents.
 *
 * Why this exists: `POST /api/recourse/fleet/memory` is the only ingress that
 * accepts externally-authored lessons (src/lib/fleetMemory.ts:15 lists 'lesson'
 * as a valid kind), but nothing on disk fed it. The episode tier is a forge
 * win/loss log keyed on `outcome`/`geneIds`/`score`, so lessons cannot be
 * expressed there, and `consolidate_memory` only clusters those episodes.
 *
 * Two write modes:
 *   --post        production path. Goes through the guarded HTTP route, so it
 *                 exercises exactly what another agent would call, and needs
 *                 RECOURSE_API_SECRET. Preferred when the server is running,
 *                 because the server holds the LanceDB directory open and two
 *                 processes writing it concurrently is asking for trouble.
 *   --out <dir>   direct `openVectorMemory` write. No server, no secret. Use
 *                 for a cold store or an offline run.
 *
 * `text` is the retrieval surface and is capped at FLEET_MEMORY_MAX_TEXT (10k).
 * `data` carries the structured frontmatter and is capped at
 * FLEET_MEMORY_MAX_DATA_CHARS (20k). The body prose is deliberately NOT shipped:
 * the whole point of the schema is that frontmatter + claim lines are the
 * machine-readable distillation, and a truncated 26KB body would crowd out the
 * signal and blow the cap.
 *
 * Usage:
 *   npx tsx scripts/ingest-lessons.mts --dry-run
 *   npx tsx scripts/ingest-lessons.mts --out data/recourse-memory
 *   npx tsx scripts/ingest-lessons.mts --post http://127.0.0.1:3050
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const DEFAULT_LESSONS_DIR = 'C:\\Users\\User\\Downloads\\BUSINESS\\Coding lessons';
const FLEET_MEMORY_MAX_TEXT = 10_000;
const FLEET_MEMORY_MAX_DATA_CHARS = 20_000;

interface Args {
  lessonsDir: string;
  out?: string;
  post?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { lessonsDir: DEFAULT_LESSONS_DIR, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--lessons-dir') a.lessonsDir = argv[++i];
    else if (t === '--out') a.out = argv[++i];
    else if (t === '--post') a.post = argv[++i] ?? 'http://127.0.0.1:3050';
    else if (t === '--dry-run') a.dryRun = true;
  }
  return a;
}

/** Split leading YAML frontmatter from the body. Tolerant: returns nulls, never throws. */
function splitFront(raw: string): { fm: Record<string, any> | null; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { fm: null, body: raw };
  let fm: Record<string, any> | null = null;
  try {
    fm = (YAML.parse(m[1]) as Record<string, any>) ?? null;
  } catch {
    fm = null;
  }
  return { fm, body: raw.slice(m[0].length) };
}

/**
 * The `- **claim:**` lines from the Findings section — the falsifiable core.
 *
 * Claims are hard-wrapped across several markdown lines, so a naive per-line
 * regex keeps only the first fragment ("...1.42.1 made") and throws away the
 * predicate that makes the claim falsifiable. Join continuation lines up to the
 * next `- **key:**` bullet or heading.
 */
function extractClaims(body: string): string[] {
  const out: string[] = [];
  const lines = body.split(/\r?\n/);
  const START = /^\s*[-*]\s+\*\*claim:\*\*\s*(.+)$/i;
  const NEW_BULLET = /^\s*[-*]\s+\*\*/;
  const HEADING = /^\s*#{1,6}\s/;
  for (let i = 0; i < lines.length; i++) {
    const m = START.exec(lines[i]);
    if (!m) continue;
    let text = m[1].trim();
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (NEW_BULLET.test(l) || HEADING.test(l) || !l.trim()) break;
      text += ' ' + l.trim();
    }
    out.push(text.replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** Findings whose `- **kind:**` is bug/risk — what an agent most needs to recall. */
function extractBugKinds(body: string): string[] {
  const out: string[] = [];
  const re = /###\s*F\d+\s*[—-]\s*([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const start = m.index;
    const next = body.indexOf('\n###', start + 3);
    const block = body.slice(start, next === -1 ? undefined : next);
    const kind = /\*\*kind:\*\*\s*(fact|bug|risk|gap)/i.exec(block)?.[1];
    if (kind && kind.toLowerCase() !== 'fact') out.push(`${kind}: ${m[1].trim()}`);
  }
  return out;
}

function clip(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  return { text: s.slice(0, max), truncated: true };
}

/** Build the recall surface + structured payload for one lesson. */
function distil(fm: Record<string, any>, body: string) {
  const id = String(fm.id ?? '').trim();
  const title = String(fm.title ?? '').trim();
  const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
  const affects = Array.isArray(fm.affects)
    ? fm.affects.map((a: any) => String(a?.path ?? '')).filter(Boolean)
    : [];
  const decisions = Array.isArray(fm.decisions) ? fm.decisions : [];
  const rejected = decisions
    .map((d: any) => (d?.rejected ? `${d.chose ?? ''} | rejected: ${d.rejected} | because: ${d.because ?? ''}` : ''))
    .filter(Boolean);
  const openQs = Array.isArray(fm.open_questions) ? fm.open_questions.map(String) : [];
  const claims = extractClaims(body);
  const bugRisks = extractBugKinds(body);

  const lines: string[] = [];
  lines.push(`title: ${title}`);
  lines.push(`entry_type: ${fm.entry_type ?? '?'} | system: ${fm.system ?? '?'} | severity: ${fm.severity ?? '?'} | status: ${fm.status ?? '?'} | confidence: ${fm.confidence ?? '?'}`);
  if (tags.length) lines.push(`tags: ${tags.join(', ')}`);
  if (affects.length) lines.push(`affects: ${affects.join(', ')}`);
  for (const c of claims) lines.push(`finding: ${c}`);
  for (const b of bugRisks) lines.push(`finding: ${b}`);
  for (const r of rejected) lines.push(`decision: ${r}`);
  for (const q of openQs) lines.push(`open_question: ${q}`);

  const built = lines.join('\n');
  const text = clip(built, FLEET_MEMORY_MAX_TEXT);

  const data = {
    schema_version: fm.schema_version ?? null,
    date: fm.date ?? null,
    entry_type: fm.entry_type ?? null,
    system: fm.system ?? null,
    repo_path: fm.repo_path ?? null,
    status: fm.status ?? null,
    severity: fm.severity ?? null,
    confidence: fm.confidence ?? null,
    tags,
    affects: Array.isArray(fm.affects) ? fm.affects : [],
    decisions: decisions.map((d: any) => ({
      id: d?.id ?? null, chose: d?.chose ?? null, rejected: d?.rejected ?? null, because: d?.because ?? null,
    })),
    open_questions: openQs,
    claims,
    supersedes: Array.isArray(fm.supersedes) ? fm.supersedes : [],
    superseded_by: fm.superseded_by ?? null,
  };
  let serialized = JSON.stringify(data);
  if (serialized.length > FLEET_MEMORY_MAX_DATA_CHARS) {
    serialized = JSON.stringify({ truncated: true, bytes: serialized.length });
  }

  return {
    ok: Boolean(id),
    id,
    text: text.text,
    textTruncated: text.truncated,
    data,
    dataJson: serialized,
    title,
  };
}

function readSecret(): string {
  if (process.env.RECOURSE_API_SECRET) return process.env.RECOURSE_API_SECRET;
  try {
    const raw = fs.readFileSync(path.resolve('.env'), 'utf8');
    const m = /^\s*RECOURSE_API_SECRET\s*=\s*"?([^"\n]*)"?\s*$/m.exec(raw);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.lessonsDir)) {
    console.error(`lessons dir not found: ${args.lessonsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(args.lessonsDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-.*\.md$/.test(f))
    .sort();

  if (!files.length) {
    console.error(`no YYYY-MM-DD-*.md lessons found in ${args.lessonsDir}`);
    process.exit(1);
  }

  const built: Array<ReturnType<typeof distil>> = [];
  const skipped: string[] = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(args.lessonsDir, f), 'utf8');
    const { fm, body } = splitFront(raw);
    if (!fm) { skipped.push(`${f} (no/unparseable frontmatter)`); continue; }
    const d = distil(fm, body);
    if (!d.ok) { skipped.push(`${f} (frontmatter has no id)`); continue; }
    built.push(d);
  }

  const textLens = built.map((b) => b.text.length);
  console.log(`parsed ${built.length} lesson(s) from ${files.length} file(s)` +
    (skipped.length ? `; skipped ${skipped.length}: ${skipped.join(', ')}` : ''));
  console.log(`text length min/median/max: ${Math.min(...textLens)}/${textLens.slice().sort((a, b) => a - b)[Math.floor(textLens.length / 2)]}/${Math.max(...textLens)} (cap ${FLEET_MEMORY_MAX_TEXT})`);
  console.log(`text truncated: ${built.filter((b) => b.textTruncated).length}; data over cap: ${built.filter((b) => b.dataJson.length > FLEET_MEMORY_MAX_DATA_CHARS).length}`);

  if (args.dryRun) {
    console.log('\n--- sample distilled text (first lesson) ---');
    console.log(built[0].text.slice(0, 900));
    console.log('\nDRY RUN: nothing written.');
    return;
  }

  if (args.post) {
    const secret = readSecret();
    if (!secret) {
      console.error('RECOURSE_API_SECRET not set (env or .env) — /fleet/memory is fail-closed and will 503.');
      process.exit(1);
    }
    let ok = 0, fail = 0;
    for (const b of built) {
      const res = await fetch(`${args.post.replace(/\/+$/, '')}/api/recourse/fleet/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ source: 'coding-lessons', kind: 'lesson', id: `lesson:${b.id}`, text: b.text, data: b.data }),
      });
      if (res.ok) { ok++; process.stdout.write('.'); }
      else { fail++; console.error(`\nFAILED ${b.id}: HTTP ${res.status} ${await res.text()}`); }
    }
    console.log(`\nPOST -> ${ok} indexed, ${fail} failed`);
    if (fail) process.exit(1);
    return;
  }

  const dir = args.out ?? 'data/recourse-memory';
  const { openVectorMemory } = await import('../src/lib/vectorMemory.js');
  const mem = await openVectorMemory({ dir });
  const before = await mem.status();
  for (const b of built) await mem.remember('lesson', `lesson:${b.id}`, b.text, { source: 'coding-lessons', ...b.data });
  const after = await mem.status();
  console.log(`\nwrote ${built.length} lesson(s)`);
  console.log(`store: ${after.store} | embedder: ${after.embedder} | docs: ${before.docs} -> ${after.docs}`);
  await mem.close();
}

main().catch((e) => { console.error('FAILED:', e?.message ?? e); process.exit(1); });
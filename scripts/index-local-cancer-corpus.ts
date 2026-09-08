/**
 * Index the on-hand local cancer library (Desktop PDFs + Datasets) through
 * Recourse's real corpus scanner — no network, no model, no extraction.
 *
 * - PDFs (.pdf): indexed by filename/size/mtime only (kind=paper).
 *   Full text is extracted on demand via the PyMuPDF sidecar.
 * - Archives (.zip): indexed by name/size only (kind=data). Manifests and
 *   CSV previews are served on demand without extracting the archive
 *   (the 1.6GB prostate-MRI set and 546MB lung-MRI set stay zipped).
 *
 * Output: data/science-loop/local-corpus-index.json (real counts + samples)
 * plus a console summary the operator can paste into research planning.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { scanCorpus } from '../src/intake/corpus/scanner.js';
import { summarize } from '../src/intake/corpus/index.js';

const PDF_ROOT = 'C:\\Users\\User\\Desktop\\cancer research pdfs';
const DATA_ROOT = 'C:\\Users\\User\\Desktop\\Datasets';

async function main() {
  const res = await scanCorpus([
    { project: 'cancer-pdfs', root: PDF_ROOT },
    { project: 'cancer-datasets', root: DATA_ROOT },
  ]);
  const summary = summarize(res.artifacts);
  const pdfs = res.artifacts.filter((a) => a.project === 'cancer-pdfs');
  const zips = res.artifacts.filter((a) => a.project === 'cancer-datasets');
  const totalBytes = res.artifacts.reduce((n, a) => n + (a.sizeBytes || 0), 0);

  const out = {
    generatedAt: new Date().toISOString(),
    roots: { 'cancer-pdfs': PDF_ROOT, 'cancer-datasets': DATA_ROOT },
    totals: {
      artifacts: res.artifacts.length,
      pdfs: pdfs.length,
      datasetArchives: zips.length,
      totalBytes,
      errors: res.errors.length,
    },
    summary,
    errors: res.errors.slice(0, 20),
    datasetArchives: zips.map((z) => ({ file: z.name, sizeBytes: z.sizeBytes, topics: z.topics })),
    // Small filename sample so research planners see naming patterns
    // (e.g. 021_40s2.xlsx-style supplements, LIDC-XML, METABRIC).
    pdfSample: pdfs.slice(0, 30).map((p) => p.name),
  };

  const dest = path.join(process.cwd(), 'data', 'science-loop', 'local-corpus-index.json');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, JSON.stringify(out, null, 2), 'utf-8');

  console.log(`artifacts=${res.artifacts.length} pdfs=${pdfs.length} archives=${zips.length} bytes=${totalBytes} errors=${res.errors.length}`);
  console.log(`wrote ${dest}`);
  for (const z of zips) console.log(`- ${z.name} (${(z.sizeBytes / 1048576).toFixed(1)} MB)`);
  if (res.errors.length) console.log('ERRORS:', JSON.stringify(res.errors.slice(0, 5), null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });

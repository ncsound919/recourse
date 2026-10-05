import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'orphan-check.mts');
const ALLOWLIST = path.join(ROOT, 'scripts', 'orphan-allowlist.json');

interface OrphanFile {
  file: string;
  exports: number;
  allowlisted: string | null;
}
interface Report {
  orphans: OrphanFile[];
  failures: OrphanFile[];
  skipped: Array<{ file: string; why: string }>;
}

function run(): Report {
  // Same no-shell pattern as preMergeGate: `npx` is a .cmd on win32 and cannot be
  // execFileSync'd, so tsx's real CLI entry is run with process.execPath and the
  // script path passed as an opaque argv.
  const cli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  expect(fs.existsSync(cli)).toBe(true);
  const out = execFileSync(process.execPath, [cli, SCRIPT, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(out) as Report;
}

describe('orphan-check gate', () => {
  it('exits 0 on this repository and every allowlist entry carries a reason', () => {
    const report = run();
    expect(report.failures.map((f) => f.file)).toEqual([]);
    for (const orphan of report.orphans) {
      if (orphan.allowlisted === null) continue;
      // An allowlist entry with no reason is the failure mode this file exists
      // to prevent, so it is asserted on rather than assumed.
      expect(orphan.allowlisted.trim().length).toBeGreaterThan(20);
    }
  });

  it('every allowlist key corresponds to a real orphan (no stale suppressions)', () => {
    const report = run();
    const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8')) as Record<string, string>;
    const keys = Object.keys(allowlist).filter((k) => !k.startsWith('_'));
    for (const key of keys) {
      expect(report.orphans.map((o) => o.file)).toContain(key);
    }
  });

  it('does not count tests, barrels or the generated client as orphans', () => {
    const report = run();
    const files = report.orphans.map((o) => o.file);
    expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
    // A barrel re-exports children that are checked individually.
    expect(files).not.toContain('src/lib/wasmSandbox/index.ts');
    expect(files).not.toContain('src/lib/openEnded/index.ts');
    expect(files).not.toContain('src/lib/connectors/index.ts');
    // Committed codegen artefact: written by scripts/gen-v1-client.ts and
    // asserted byte-identical to the generator by tests/openapiV1.test.ts.
    expect(files).not.toContain('src/lib/v1Client.generated.ts');
    // Ambient declarations are never imported by design.
    expect(files.some((f) => f.endsWith('.d.ts'))).toBe(false);
  });

  it('names the modules this audit wired, so a regression is visible by name', () => {
    const report = run();
    const files = report.orphans.map((o) => o.file);
    for (const wired of [
      'src/lib/multiFileForge.ts',
      'src/autopilot/qualityTier.ts',
      'src/dream/ast-genes.ts',
      'src/lib/langfuseIntegration.ts',
      'src/lib/tracingOss.ts',
      'src/lib/metricsOss.ts',
      'src/lib/codeSafetyOss.ts',
      'src/lib/kagSidecarClient.ts',
      'src/lib/unstructuredSidecarClient.ts',
      'src/lib/inspectSidecarClient.ts',
      'src/lib/inspectExport.ts',
      'src/lib/literatureGrounding.ts',
      'src/lib/problemGenerator.ts',
      'src/lib/repairAst.ts',
      'src/lib/astRelExtract.ts',
      'src/lib/synergy/aiAdapter.ts',
      'src/lib/exportableHygiene.ts',
      'src/lib/incoherence.ts',
      'src/lib/e2bSandbox.ts',
      'src/autopilot/research.ts',
    ]) {
      expect(files).not.toContain(wired);
    }
  });

  it('is wired into CI so a new orphan cannot land silently', () => {
    const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toContain('npm run orphan-check');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['orphan-check']).toContain('orphan-check.mts');
  });
});

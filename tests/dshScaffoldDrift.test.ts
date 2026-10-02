import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateDshPluginSpec } from '../src/lib/dshPlugins/spec';
import { renderDshBundle } from '../src/lib/dshPlugins/template';

/**
 * The generator and the reference plugin must not drift.
 *
 * `dsh-recourse` is the hand-written bundle the generator is modelled on, and it
 * runs on a real profile. If it learns something the generator does not encode —
 * a constraint the harness actually enforces — this test fails, because the two
 * have stopped agreeing.
 *
 * It is a skip-when-absent test on purpose: this repository must not require a
 * checkout of a sibling repo to run its own tests.
 */

const REPO = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const REFERENCE = path.resolve(
  REPO,
  '..',
  'dsh-recourse',
);
const available = fs.existsSync(path.join(REFERENCE, 'package.json'));

const describeIfPresent = available ? describe : describe.skip;

function generatedFiles(): Map<string, string> {
  const spec = validateDshPluginSpec({
    id: 'probe',
    packageName: 'dsh-probe',
    description: 'Drift probe. Never mounted.',
    tools: [{ name: 'probe_status', title: 'Probe', description: 'Probe.', method: 'GET', path: '/api/probe' }],
  });
  if (!spec.ok) throw new Error(spec.errors.join('\n'));
  return renderDshBundle(spec.spec!);
}

describeIfPresent('scaffolder agrees with dsh-recourse', () => {
  it('declares the same zero-runtime-dependency shape', () => {
    const ref = JSON.parse(fs.readFileSync(path.join(REFERENCE, 'package.json'), 'utf-8'));
    const gen = JSON.parse(generatedFiles().get('package.json')!);

    // The invariant, not the exact value: dsh-recourse has no `dependencies`.
    expect(ref.dependencies).toBeUndefined();
    expect(gen.dependencies).toBeUndefined();

    // Same bundle wiring, or a generated bundle never loads.
    expect(ref.dsh.bundle.patch).toBe('./cordis.patch.yml');
    expect(gen.dsh.bundle.patch).toBe(ref.dsh.bundle.patch);
    expect(gen.dsh.client).toBeUndefined(); // no client inject unless a panel is generated
    expect(ref.dsh.client.inject).toBeDefined(); // the reference does ship a panel
  });

  it('requires nothing in apply, on both sides', () => {
    const ref = fs.readFileSync(path.join(REFERENCE, 'src', 'index.ts'), 'utf-8');
    const gen = generatedFiles().get('src/index.ts')!;
    // A hard service requirement fails the profile layer on a host that lacks it.
    expect(ref).toContain('export const inject: string[] = [];');
    expect(gen).toContain('export const inject: string[] = [];');
    expect(gen).toContain("ctx.inject(['tools']");
    expect(ref).toContain("ctx.inject(['tools']");
  });

  it('keeps every host import type-only, on both sides', () => {
    const check = (name: string, body: string) => {
      for (const line of body.split('\n')) {
        if (!line.includes("from '@deepseek-ai/")) continue;
        expect(line, `${name}: ${line}`).toMatch(/^import type /);
      }
    };
    const gen = generatedFiles();
    for (const [name, body] of gen) check(`generated ${name}`, body);
    for (const name of fs.readdirSync(path.join(REFERENCE, 'src'))) {
      if (!name.endsWith('.ts')) continue;
      check(`dsh-recourse ${name}`, fs.readFileSync(path.join(REFERENCE, 'src', name), 'utf-8'));
    }
  });

  it('names the secret rather than inlining it, on both sides', () => {
    const ref = fs.readFileSync(path.join(REFERENCE, 'cordis.patch.yml'), 'utf-8');
    const gen = generatedFiles().get('cordis.patch.yml')!;
    expect(ref).toContain('apiSecretEnvVar');
    expect(gen).toContain('apiSecretEnvVar');
    // `!!js process.env...` is how a patch row reads the environment at boot.
    expect(gen).toContain('!!js process.env.RECOURSE_API_URL');
  });

  it('carries the same two-timeout contract', () => {
    const ref = fs.readFileSync(path.join(REFERENCE, 'cordis.patch.yml'), 'utf-8');
    const gen = generatedFiles().get('cordis.patch.yml')!;
    for (const row of [ref, gen]) {
      expect(row).toContain('defaultTimeoutMs: 15000');
      // The stdio bridge's blanket 30s cap is exactly what this replaces.
      expect(row).toContain('longTimeoutMs: 600000');
    }
  });

  it('gitignores the generated lib/, because a profile links to it', () => {
    const gen = generatedFiles().get('.gitignore')!;
    expect(gen).toContain('lib/');
    expect(gen).toContain('node_modules/');
    // The reference keeps the same two entries; it has a client bundle too.
    const ref = fs.readFileSync(path.join(REFERENCE, '.gitignore'), 'utf-8');
    expect(ref).toContain('lib/');
  });
});
/**
 * factory.test.ts — the scaffold-lane contract.
 *
 * What must never break: a compact intent maps to a correct Cheetah argv; an
 * invalid name or field dialect is refused with a reason (never guessed); and
 * the artifact summary reports only what the engine actually returned.
 */
import { describe, it, expect } from 'vitest';
import {
  FACTORY_CAPABILITIES, buildScaffoldRequest, parseFieldsDialect, artifactId, summarizeScaffoldResult,
  type ScaffoldKind,
} from './factory.js';

describe('capability catalogue', () => {
  it('covers the full-stack primitives and marks which are multi-file', () => {
    const kinds = FACTORY_CAPABILITIES.map((c) => c.kind);
    for (const k of ['project', 'component', 'hook', 'context', 'page', 'service', 'feature', 'batch', 'doc']) {
      expect(kinds).toContain(k);
    }
    expect(FACTORY_CAPABILITIES.find((c) => c.kind === 'feature')?.multiFile).toBe(true);
    expect(FACTORY_CAPABILITIES.find((c) => c.kind === 'doc')?.multiFile).toBe(false);
  });
});

describe('buildScaffoldRequest', () => {
  it('builds a component request', () => {
    const r = buildScaffoldRequest({ kind: 'component', name: 'PlayerCard' });
    expect(r).toEqual({ ok: true, request: { command: 'component', args: ['PlayerCard'] } });
  });

  it('builds the full-stack feature request with a validated field dialect', () => {
    const r = buildScaffoldRequest({ kind: 'feature', recipe: 'crud', name: 'Player', fields: 'name:string, hp:number, admin:boolean?' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.request.command).toBe('feature');
      expect(r.request.args[0]).toBe('crud');
      expect(r.request.args).toContain('--fields');
      expect(r.request.args.join(' ')).toContain('admin:boolean?');
    }
  });

  it('refuses a bad name, a bad recipe, and a bad field dialect with reasons', () => {
    const badName = buildScaffoldRequest({ kind: 'component', name: '1 bad name!' });
    expect(badName.ok).toBe(false);
    if (!badName.ok) expect(badName.reason).toMatch(/invalid name/);

    const badRecipe = buildScaffoldRequest({ kind: 'feature', name: 'X', recipe: 'wizard' as never, fields: 'a:string' });
    expect(badRecipe.ok).toBe(false);
    if (!badRecipe.ok) expect(badRecipe.reason).toMatch(/recipe/);

    const badFields = buildScaffoldRequest({ kind: 'feature', recipe: 'form', name: 'X', fields: 'name:stringy' });
    expect(badFields.ok).toBe(false);
    if (!badFields.ok) expect(badFields.reason).toMatch(/invalid field/);
  });

  it('builds batch and doc requests, refusing when the required input is missing', () => {
    expect(buildScaffoldRequest({ kind: 'batch', spec: 'spec.yaml' })).toEqual({ ok: true, request: { command: 'scaffold', args: ['spec.yaml'] } });
    expect(buildScaffoldRequest({ kind: 'batch' }).ok).toBe(false);
    expect(buildScaffoldRequest({ kind: 'doc', docCommand: 'prd', name: 'MyApp' })).toEqual({ ok: true, request: { command: 'prd', args: ['MyApp'] } });
    expect(buildScaffoldRequest({ kind: 'doc', docCommand: 'nope' as never }).ok).toBe(false);
  });

  it('passes extra args through verbatim (e.g. --force)', () => {
    const r = buildScaffoldRequest({ kind: 'hook', name: 'useDebounce', args: ['--force'] });
    expect(r).toEqual({ ok: true, request: { command: 'hook', args: ['useDebounce', '--force'] } });
  });

  it('rejects an unknown kind', () => {
    const r = buildScaffoldRequest({ kind: 'microservice' as ScaffoldKind, name: 'X' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unknown factory kind/);
  });
});

describe('parseFieldsDialect', () => {
  it('accepts the documented dialect and rejects malformed entries', () => {
    expect(parseFieldsDialect('name:string, hp:number, admin:boolean?').ok).toBe(true);
    expect(parseFieldsDialect('').ok).toBe(false);
    expect(parseFieldsDialect('name:stringy').ok).toBe(false);
    expect(parseFieldsDialect('1bad:string').ok).toBe(false);
  });
});

describe('summarizeScaffoldResult', () => {
  it('reports only what the engine returned and keeps a stable id', () => {
    const rec = summarizeScaffoldResult('component', { command: 'component', args: ['PlayerCard'] }, '/tmp/proj', {
      ok: true, files: ['src/components/PlayerCard.tsx', 'src/components/PlayerCard.test.tsx'],
    }, { requestedBy: 'sieve:idea:operator-x' });
    expect(rec.id).toBe(artifactId('component', 'component', 'PlayerCard'));
    expect(rec.files).toHaveLength(2);
    expect(rec.engineOk).toBe(true);
    expect(rec.verification).toBeNull();
    expect(rec.requestedBy).toBe('sieve:idea:operator-x');
  });

  it('an engine failure is recorded as such, not hidden', () => {
    const rec = summarizeScaffoldResult('component', { command: 'component', args: ['X'] }, '/tmp', { ok: false, reason: 'outside allowed roots' });
    expect(rec.engineOk).toBe(false);
    expect(rec.files).toEqual([]);
  });
});

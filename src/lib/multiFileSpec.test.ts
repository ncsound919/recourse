import { describe, it, expect } from 'vitest';
import { validateMultiFileSpec, describeSpec, type MultiFileSpec } from './multiFileSpec';

function validSpec(overrides: Partial<MultiFileSpec> = {}): MultiFileSpec {
  return {
    id: 'forge_multi_kv',
    name: 'KeyValueStore',
    domain: 'systemic',
    title: 'Multi-file key/value store',
    kind: 'class',
    prompt: 'Implement a small key/value store split across files.',
    refSuite: 'import { KeyValueStore } from "./store"; assert new KeyValueStore() !== null;',
    files: [
      { rel: 'store.js', role: 'entrypoint', prompt: 'Export the KeyValueStore class.' },
      { rel: 'lib/lru.js', role: 'helper' },
    ],
    ...overrides,
  };
}

const codes = (result: ReturnType<typeof validateMultiFileSpec>) => result.errors.map((e) => e.code);

describe('validateMultiFileSpec', () => {
  it('accepts a well-formed multi-file spec', () => {
    const result = validateMultiFileSpec(validSpec());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects non-object specs', () => {
    expect(codes(validateMultiFileSpec(null))).toEqual(['invalid_spec']);
    expect(codes(validateMultiFileSpec('nope'))).toEqual(['invalid_spec']);
  });

  it('requires at least one file', () => {
    expect(codes(validateMultiFileSpec(validSpec({ files: [] })))).toEqual(['no_files']);
  });

  it('requires a reference suite', () => {
    expect(codes(validateMultiFileSpec(validSpec({ refSuite: '' })))).toEqual(['refsuite_missing']);
    expect(codes(validateMultiFileSpec(validSpec({ refSuite: '   ' })))).toEqual(['refsuite_missing']);
  });

  it('rejects duplicate rel paths, case-insensitively', () => {
    const exact = validSpec({ files: [{ rel: 'a.js', role: 'r' }, { rel: 'a.js', role: 'r' }] });
    expect(codes(validateMultiFileSpec(exact))).toEqual(['duplicate_path']);

    const cased = validSpec({ files: [{ rel: 'a.js', role: 'r' }, { rel: 'A.JS', role: 'r' }] });
    expect(codes(validateMultiFileSpec(cased))).toEqual(['duplicate_path']);
  });

  it('rejects absolute paths', () => {
    const cases = ['/etc/passwd', 'C:\\windows\\system32', '\\\\server\\share\\file.js'];
    for (const rel of cases) {
      const result = validateMultiFileSpec(validSpec({ files: [{ rel, role: 'r' }] }));
      expect(codes(result)).toEqual(['absolute_path']);
    }
  });

  it('rejects paths that escape the spec root', () => {
    const cases = ['../secret.js', 'lib/../../x.js', '..'];
    for (const rel of cases) {
      const result = validateMultiFileSpec(validSpec({ files: [{ rel, role: 'r' }] }));
      expect(codes(result)).toEqual(['escaping_path']);
    }
  });

  it('rejects empty and non-object file entries', () => {
    expect(codes(validateMultiFileSpec(validSpec({ files: [{ rel: '   ', role: 'r' }] })))).toEqual([
      'empty_path',
    ]);
    const bad = validSpec({ files: [null as unknown as MultiFileSpec['files'][number]] });
    expect(codes(validateMultiFileSpec(bad))).toEqual(['invalid_file']);
  });

  it('reports every problem at once', () => {
    const broken = validSpec({
      refSuite: '',
      files: [{ rel: '../x.js', role: 'r' }, { rel: 'dup.js', role: 'r' }, { rel: 'dup.js', role: 'r' }],
    });
    expect(codes(validateMultiFileSpec(broken)).sort()).toEqual(
      ['refsuite_missing', 'escaping_path', 'duplicate_path'].sort(),
    );
  });
});

describe('describeSpec', () => {
  it('renders deterministically', () => {
    const spec = validSpec();
    expect(describeSpec(spec)).toBe(describeSpec(spec));
  });

  it('renders the contract, manifest and reference suite in order', () => {
    const rendered = describeSpec(validSpec());
    expect(rendered).toContain('# Multi-file key/value store');
    expect(rendered).toContain('1. store.js [entrypoint]');
    expect(rendered).toContain('Export the KeyValueStore class.');
    expect(rendered).toContain('2. lib/lru.js [helper]');
    expect(rendered).toContain('## Reference suite');
    expect(rendered.indexOf('store.js')).toBeLessThan(rendered.indexOf('lib/lru.js'));
  });
});

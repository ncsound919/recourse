/**
 * Premier-Connection data validators — an integration template plugin.
 *
 * Faithful re-expression of the dependency-free validation core shipped in the
 * Premier-Connection-System monorepo (`packages/core-logic/src/validators.ts`):
 * FASTA parser/state machine, ISRC (ISO 3901) format check, and tensor-shape
 * sufficiency check. Pure string/number logic, no imports, deterministic — so
 * it transfers cleanly to a sandbox gene + self-hosted module. Registered with
 * a single `registerComponentTemplatePlugin(...)` call from componentTemplates.ts.
 *
 * Honesty note: these validate *format* only (character sets, layout, size
 * sufficiency). FASTA validation cannot fact-check a biological sequence, and
 * tensor-shape checks count bytes, not scientific correctness.
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

const params: ComponentTemplateParam[] = [
  {
    id: 'defaultDepth',
    label: 'Default tensor depth (n)',
    type: 'number',
    default: 6,
    min: 1,
    max: 64,
    step: 1,
    description: 'Third dimension used by validateTensorShape when none is supplied'
  }
];

export const premierValidatorsPlugin: TemplatePlugin = {
  id: 'tpl_premier_validators',
  name: 'FASTA / ISRC / Tensor Validators',
  domain: 'biotech' as ToolDomain,
  category: 'biotech' as ComponentTemplateCategory,
  description:
    'Format validators ported from the Premier-Connection core-logic package: a FASTA sequence parser/state machine, an ISRC (ISO 3901) recording-code check, and a tensor-shape sufficiency check.',
  benchmarkFlops: 60,
  complexity: 'O(n)',
  defaultScore: 0.92,
  tags: ['validator', 'fasta', 'isrc', 'tensor', 'parser'],
  params,
  synthesizer: (userParams, options) => {
    const defaultDepth = Math.max(1, Math.floor(Number(userParams.defaultDepth) || 6));
    const compName = options?.componentName || 'DataValidators';

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_premier_validators — ported from Premier-Connection @premier/core-logic (validators.ts).
 */
export class ${compName} {
  static validateFASTA(content) {
    const result = { isValid: true, sequences: 0, errors: [], warnings: [] };
    const lines = String(content || '').split('\\n').map((line) => line.trim());
    let currentSequence = '';
    let inSequence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === '') continue;
      if (line.charAt(0) === '>') {
        if (inSequence && currentSequence === '') {
          result.warnings.push('Line ' + (i + 1) + ': Empty sequence before new header');
        }
        result.sequences++;
        currentSequence = '';
        inSequence = true;
        continue;
      }
      if (inSequence) {
        if (!/^[ACDEFGHIKLMNPQRSTVWYX*-]+$/i.test(line)) {
          result.errors.push('Line ' + (i + 1) + ': Invalid characters in sequence');
          result.isValid = false;
        }
        currentSequence += line;
      } else {
        result.errors.push('Line ' + (i + 1) + ': Sequence data before header');
        result.isValid = false;
      }
    }
    if (result.sequences === 0) {
      result.errors.push('No sequences found in file');
      result.isValid = false;
    }
    return result;
  }

  static validateISRC(isrc) {
    const clean = String(isrc || '').replace(/-/g, '').toUpperCase();
    return /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(clean);
  }

  static validateTensorShape(dataSize, expectedShape) {
    const d = typeof dataSize === 'number' ? dataSize : Number(dataSize) || 0;
    const shape = Array.isArray(expectedShape) && expectedShape.length === 3
      ? expectedShape
      : [100, 221, ${defaultDepth}];
    const requiredSize = shape[0] * shape[1] * shape[2];
    const isValid = d >= requiredSize;
    return {
      isValid,
      expectedShape: [shape[0], shape[1], shape[2]],
      actualSize: d,
      requiredSize,
      error: isValid
        ? undefined
        : 'Data size ' + d + ' is insufficient for tensor shape ' + shape.join('x') +
          ' (requires ' + requiredSize + ')'
    };
  }
}`;

    const testSuiteCode = `const good = ${compName}.validateFASTA('>seqA\\nACDEFGHIK\\n>seqB\\nACD');
assert good.isValid === true;
assert good.sequences === 2;
assert good.errors.length === 0;
const bad = ${compName}.validateFASTA('>seq1\\nACDZ');
assert bad.isValid === false;
assert bad.errors.length >= 1;
assert ${compName}.validateISRC('US-PR3-20-00125') === true;
assert ${compName}.validateISRC('nope') === false;
const need = 100 * 221 * ${defaultDepth};
const okT = ${compName}.validateTensorShape(need);
assert okT.isValid === true;
assert okT.requiredSize === need;
const noT = ${compName}.validateTensorShape(10);
assert noT.isValid === false;`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: 'FASTA parser, ISRC (ISO 3901) check, and tensor-shape sufficiency validator',
      selfHealingGuards: ['MissingInputCoerce', 'ExpectedShapeClamp']
    };
  },
  selfHost: {
    stateful: false,
    methods: [
      { method: 'validateFASTA', label: 'Validate a FASTA document' },
      { method: 'validateISRC', label: 'Validate an ISRC recording code' },
      { method: 'validateTensorShape', label: 'Check tensor-shape sufficiency' }
    ]
  }
};

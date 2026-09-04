/**
 * ocr-it image pre-processing — an integration template plugin.
 *
 * Faithful re-expression of the pure, canvas-free pixel math from the ocr-it
 * browser-extension repo (`src/ocr/preprocess.js`, functions `enhanceFactor`
 * and `stretchGrayscale`). That module is already decoupled from DOM/canvas and
 * runs the real production preprocessing, so its semantics transfer 1:1 to a
 * Recourse sandbox gene + self-hosted module. Registered with a single
 * `registerComponentTemplatePlugin(...)` call from componentTemplates.ts.
 *
 * Honesty note (no theater): this is an image ENHANCEMENT pre/post-processor,
 * NOT an OCR engine. Text recognition in ocr-it is delegated to Tesseract.wasm
 * (browser/worker-bound) and is NOT ported here. `stretchGrayscaleRgba` is a
 * JSON-transport wrapper because Recourse's self-host adapter cannot carry a
 * native typed-array field inside an object across the wire.
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

const params: ComponentTemplateParam[] = [
  {
    id: 'minRange',
    label: 'Minimum contrast range',
    type: 'number',
    default: 24,
    min: 1,
    max: 128,
    step: 1,
    description: 'Below this hi-lo luminance gap a near-flat image is left untouched'
  }
];

export const ocrPreprocessPlugin: TemplatePlugin = {
  id: 'tpl_ocr_preprocess',
  name: 'OCR Image Preprocessor (grayscale stretch)',
  domain: 'coding' as ToolDomain,
  category: 'algorithmic' as ComponentTemplateCategory,
  description:
    'Pixel-buffer preprocessor ported from the ocr-it extension: upscale-factor estimation and 2nd-98th percentile luminance contrast-stretch + grayscale over raw RGBA buffers. Purely array math; no canvas/DOM.',
  benchmarkFlops: 40,
  complexity: 'O(pixels)',
  defaultScore: 0.9,
  tags: ['image', 'grayscale', 'contrast', 'preprocessing', 'pixel'],
  params,
  synthesizer: (userParams, options) => {
    const minRange = Math.max(1, Math.floor(Number(userParams.minRange) || 24));
    const compName = options?.componentName || 'ImagePreprocess';

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_ocr_preprocess — ported from ocr-it (src/ocr/preprocess.js).
 * Pure pixel-buffer math. NOT an OCR engine (recognition is Tesseract.wasm/browser-bound).
 */
export class ${compName} {
  static enhanceFactor(scale) {
    return Math.min(3, Math.max(1, 2 / scale));
  }

  static stretchGrayscale(imageData) {
    const d = imageData && imageData.data ? imageData.data : null;
    if (!d) return imageData;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      d[i] = d[i + 1] = d[i + 2] = y;
      hist[y | 0]++;
    }
    const total = (d.length / 4) | 0;
    const cut = Math.max(1, Math.floor(total * 0.02));
    let lo = 0;
    let hi = 255;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= cut) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= cut) { hi = v; break; } }
    if (hi - lo < ${minRange}) return imageData;
    const scale = 255 / (hi - lo);
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.min(255, Math.max(0, (v - lo) * scale));
    for (let i = 0; i < d.length; i += 4) {
      const y = lut[d[i]];
      d[i] = d[i + 1] = d[i + 2] = y;
    }
    return imageData;
  }

  static stretchGrayscaleRgba(rgba, width) {
    const src = Array.isArray(rgba) ? rgba : (rgba && rgba.data ? Array.from(rgba.data) : []);
    const w = (typeof width === 'number' && width > 0) ? width : Math.max(1, Math.round(src.length / 4));
    const arr = new Uint8ClampedArray(src.length);
    for (let i = 0; i < src.length; i++) arr[i] = src[i];
    const img = { data: arr, width: w, height: Math.max(1, Math.round(src.length / 4 / w)) };
    const res = ${compName}.stretchGrayscale(img);
    const out = new Array(res.data.length);
    for (let i = 0; i < res.data.length; i++) out[i] = res.data[i];
    return out;
  }
}`;

    const testSuiteCode = `assert ${compName}.enhanceFactor(0.5) === 3;
assert ${compName}.enhanceFactor(1) === 2;
assert ${compName}.enhanceFactor(4) === 1;
const px = 100;
const data = new Uint8ClampedArray(px * 4);
for (let i = 0; i < px; i++) { const v = Math.round((i / (px - 1)) * 255); data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
${compName}.stretchGrayscale({ data: data, width: px, height: 1 });
assert data[0] === 0;
assert data[(px - 1) * 4] === 255;
const mid = 50 * 4;
assert data[mid] === data[mid + 1];
assert data[mid] === data[mid + 2];
const colorIn = [];
for (let i = 0; i < px; i++) { colorIn.push(i * 2); colorIn.push(255 - i); colorIn.push(128); colorIn.push(255); }
const out = ${compName}.stretchGrayscaleRgba(colorIn, px);
assert out.length === colorIn.length;
assert out[1] === out[0];
assert out[2] === out[0];`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: 'Grayscale + 2nd-98th percentile contrast stretch over RGBA pixel buffers (pre-OCR enhancement)',
      selfHealingGuards: ['BufferShapeGuard', 'FlatImageShortCircuit']
    };
  },
  selfHost: {
    stateful: false,
    methods: [
      { method: 'enhanceFactor', label: 'Estimate upscale factor' },
      { method: 'stretchGrayscaleRgba', label: 'Grayscale + contrast-stretch an RGBA byte array' }
    ]
  }
};

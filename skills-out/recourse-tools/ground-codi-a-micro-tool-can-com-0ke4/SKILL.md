---
name: ground_codi_a_micro_tool_can_com_0ke4
description: Grounded from arxiv: Compile by Training: Turning Natural-Language Specifications into Local Neural Functions
---

# ground_codi_a_micro_tool_can_com_0ke4

Recourse self-developing-OS tool — **coding** domain.

Grounded from arxiv: Compile by Training: Turning Natural-Language Specifications into Local Neural Functions

## Provenance

- Version: 1.0.0
- Verifier: PASSED
- Score: 1.00
- Hash: 62e12c783f2525e3

- Notes: GENESIS RE-VERIFIED: PASSED (100% of 5 assertions executed green in 33.51ms)

## Source

```ts
export function compileSpec(spec, examples) { const stopwords = new Set(['the','a','an','and','or','but','if','then','else','for','with','on','in','at','by','from','of','to','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','can','could','should','may','might','must','this','that','these','those','it','its','as','so','such','not','no','nor','only','own','same','too','very','just','about','into','over','after','before','between','under','again','further','once','here','there','when','where','why','how','all','any','both','each','few','more','most','other','some','such','than','also','because','until','while','of','at','by','for','with','about','against','between','into','through','during','before','after','above','below','to','from','up','down','in','out','on','off','over','under','again','further','then','once','here','there','when','where','why','how','all','any','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','s','t','can','will','just','don','should','now','d','ll','m','o','re','ve','y','ain','aren','couldn','didn','doesn','hadn','hasn','haven','isn','ma','mightn','mustn','needn','shan','shouldn','wasn','weren','won','wouldn']); const words = spec.toLowerCase().match(/[a-z]+/g) || []; const keywords = [...new Set(words.filter(w => w.length > 2 && !stopwords.has(w)))]; const posExamples = examples.filter(e => e.output === true); const negExamples = examples.filter(e => e.output === false); const posTotal = posExamples.length; const negTotal = negExamples.length; const weights = {}; for (const kw of keywords) { let posCount = 0; let negCount = 0; for (const ex of posExamples) { const exWords = new Set(ex.input.toLowerCase().match(/[a-z]+/g) || []); if (exWords.has(kw)) posCount++; } for (const ex of negExamples) { const exWords = new Set(ex.input.toLowerCase().match(/[a-z]+/g) || []); if (exWords.has(kw)) negCount++; } const posRatio = posTotal > 0 ? posCount / posTotal : 0; const negRatio = negTotal > 0 ? negCount / negTotal : 0; weights[kw] = posRatio - negRatio; } return function(text) { const textWords = new Set(text.toLowerCase().match(/[a-z]+/g) || []); let sum = 0; for (const kw of keywords) { if (textWords.has(kw)) sum += weights[kw]; } return sum > 0; }; }
```

## Test suite

```ts
const fn = compileSpec('detect if the text mentions the word urgent', [{input: 'this is urgent', output: true}, {input: 'this is normal', output: false}]);
assert(fn('urgent') === true);
assert(fn('normal') === false);
assert(fn('this is urgent') === true);
assert(fn('this is normal') === false);
const fn2 = compileSpec('check for presence of cat', [{input: 'a cat is here', output: true}, {input: 'no dog', output: false}]);
assert(fn2('cat') === true);
assert(fn2('dog') === false);
```

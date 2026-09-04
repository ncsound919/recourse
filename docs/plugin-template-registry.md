# Plugin Template Registry — contribution path

**Phase 4 · roadmap item 15.** The plugin-template registry is Recourse's
first-class extension point: every runnable micro-component (a coded, verifiable
tool a host can build and self-host) is a *template plugin*. There is already a
real, seeded registry behind it — this doc is the written contribution contract.

## What already exists

- Registry + API live in `src/lib/templatePlugin.ts` (`TemplatePlugin`,
  `COMPONENT_TEMPLATES`, `registerComponentTemplatePlugin`,
  `countRegisteredTemplates`, `isTemplateRegistered`,
  `listComponentTemplates(domain?, category?)`, `getComponentTemplate(id)`).
- The single import site / registration facade is `src/lib/componentTemplates.ts`,
  which also holds a 10-template built-in library and registers 7 add-on plugins.
- HTTP surface: `GET /api/recourse/templates`, `GET /api/recourse/templates/:id`,
  `POST /api/recourse/templates/build`, `POST /api/recourse/templates/benchmark`.
- UI: the ArchitectForge view (`src/components/ArchitectForgeView.tsx`) catalogs,
  parametrizes, builds, and self-hosts these templates.

## The extension point

A template is a `TemplatePlugin` exported from `src/lib/templatePlugins/<name>.ts`.
The canonical reference is `src/lib/templatePlugins/bloomFilter.ts`.

```ts
export const myPlugin: TemplatePlugin = {
  id: 'tpl_my_thing',          // /^[a-zA-Z_][a-zA-Z0-9_-]*$/ — must be unique
  name: 'Human Readable Name',
  domain: 'coding',            // one of ToolDomain
  category: 'algorithmic',     // one of ComponentTemplateCategory
  description: 'One sentence.',
  params: [ /* ComponentTemplateParam[] */ ],
  defaultScore: 0.9,
  benchmarkFlops: 500,
  complexity: 'O(n)',
  tags: ['a', 'b'],
  synthesizer: (userParams, options) => ({
    sourceCode: '...',          // runnable, deterministic JS/TS, no imports
    testSuiteCode: '...',       // assertions that fail if the code is wrong
    entrypointName: 'main',
    summary: 'what this builds',
  }),
  selfHost: { /* optional — makes it self-hostable as a live module */ },
};
```

## How to add one (the contribution path)

1. Create `src/lib/templatePlugins/<name>.ts` exporting a `TemplatePlugin` literal.
   Follow `bloomFilter.ts` for shape and honesty (a real `synthesizer` that emits
   an actual runnable function plus an honest test suite — not a stub).
2. Import + register it in `src/lib/componentTemplates.ts`:
   ```ts
   import { myPlugin } from './templatePlugins/myPlugin';
   registerComponentTemplatePlugin(myPlugin);
   ```
   `registerComponentTemplatePlugin` **throws** on a bad or duplicate id — it
   never silently overwrites another template (covered by
   `tests/templateRegistry.test.ts`).
3. It now appears in `GET /api/recourse/templates` and the ArchitectForge UI.
4. Add or extend a test in `tests/templateRegistry.test.ts` asserting your id is
   registered and its `synthesizer` emits non-empty `sourceCode` + `testSuiteCode`.

## Honesty rules

- Every template's `synthesizer` returns code that is genuinely verifiable — a
  template that emits a cosmetic shell with no working logic is rejected.
- The registry is countable and unique: seed count and id uniqueness are asserted
  in tests so the "10+ verified templates" claim stays checkable, not marketing.
- Templates only become *live self-hosted tools* after `POST /templates/build`
  runs them through the real sandbox + lint gate (see `server.ts`).

/**
 * Artifact-kind example templates — one small, genuinely functional self-host
 * template per runtime transport (cli / api / mcp / a2a / loop). Registered the
 * same additive way as any third-party add-on (see bloomFilter.ts). Each is a
 * normal class whose methods are whitelisted; the `artifactKind` field selects
 * the transport the artifact host serves it over.
 */

import { TemplatePlugin, registerComponentTemplatePlugin } from '../templatePlugin';
import type { ArtifactKind, ComponentTemplateParam, ToolDomain } from '../../types';

function makeKindTemplate(opts: {
  id: string;
  name: string;
  domain: ToolDomain;
  category: any;
  artifactKind: ArtifactKind;
  classBody: string;
  entrypointName: string;
  method: string;
  tests: string;
  params?: ComponentTemplateParam[];
}): TemplatePlugin {
  const params = opts.params ?? [];
  return {
    id: opts.id,
    name: opts.name,
    domain: opts.domain,
    category: opts.category,
    description: `${opts.name} — self-hosted as a ${opts.artifactKind} artifact.`,
    params,
    defaultScore: 0.9,
    benchmarkFlops: 10,
    complexity: 'O(1)',
    tags: [opts.artifactKind, 'self-host', 'dogfood'],
    artifactKind: opts.artifactKind,
    synthesizer: (_p, options) => {
      const compName = options?.componentName || opts.entrypointName;
      const sourceCode = `export class ${compName} {\n${opts.classBody}\n}`;
      // The suite runs against the REAL class name (compName), never a fixed
      // entrypoint literal — the live module class is always compName.
      const testSuiteCode = opts.tests.split(opts.entrypointName).join(compName);
      return {
        sourceCode,
        testSuiteCode,
        entrypointName: compName,
        summary: `${opts.name} (${opts.artifactKind})`,
        selfHealingGuards: [],
      };
    },
    selfHost: {
      stateful: opts.artifactKind === 'loop',
      methods: [{ method: opts.method, label: `${opts.name} ${opts.method}` }],
    },
  };
}

registerComponentTemplatePlugin(
  makeKindTemplate({
    id: 'tpl_art_cli',
    name: 'Sysinfo CLI',
    domain: 'coding',
    category: 'infrastructure',
    artifactKind: 'cli',
    entrypointName: 'SysinfoCmd',
    method: 'hello',
    classBody: `  static hello(name) {
    return { message: 'hello ' + (name || 'world'), pid: typeof process !== 'undefined' ? process.pid : null };
  }`,
    tests: `const out = SysinfoCmd.hello('recourse');
assert out.message === 'hello recourse';
assert typeof out.message === 'string';`,
  })
);

registerComponentTemplatePlugin(
  makeKindTemplate({
    id: 'tpl_art_api',
    name: 'Echo API',
    domain: 'coding',
    category: 'infrastructure',
    artifactKind: 'api',
    entrypointName: 'EchoApi',
    method: 'echo',
    classBody: `  static echo(payload) {
    return { echoed: payload, at: Date.now() };
  }`,
    tests: `const out = EchoApi.echo({ hello: 'world' });
assert out.echoed.hello === 'world';
assert out.at > 0;`,
  })
);

registerComponentTemplateMaker([
  makeKindTemplate({
    id: 'tpl_art_mcp',
    name: 'Math MCP',
    domain: 'math',
    category: 'mathematical',
    artifactKind: 'mcp',
    entrypointName: 'MathMcp',
    method: 'add',
    classBody: `  static add(a, b) {
    const x = Number(a) || 0; const y = Number(b) || 0;
    return x + y;
  }`,
    tests: `assert MathMcp.add(2, 3) === 5;`,
  }),
  makeKindTemplate({
    id: 'tpl_art_a2a',
    name: 'Greeter A2A',
    domain: 'systemic',
    category: 'infrastructure',
    artifactKind: 'a2a',
    entrypointName: 'GreeterAgent',
    method: 'respond',
    classBody: `  static respond(query) {
    return { role: 'assistant', content: 'ack: ' + String(query || '') };
  }`,
    tests: `const out = GreeterAgent.respond('ping');
assert out.content.indexOf('ack') === 0;`,
  }),
  makeKindTemplate({
    id: 'tpl_art_loop',
    name: 'Tick Loop',
    domain: 'systemic',
    category: 'infrastructure',
    artifactKind: 'loop',
    entrypointName: 'TickLoop',
    method: 'tick',
    classBody: `  constructor() { this.n = 0; }
  tick() { this.n += 1; return { cycle: this.n, at: Date.now() }; }`,
    tests: `const l = new TickLoop();
const a = l.tick(); const b = l.tick();
assert b.cycle === 2;`,
  }),
]);

function registerComponentTemplateMaker(list: TemplatePlugin[]): void {
  for (const p of list) registerComponentTemplatePlugin(p);
}

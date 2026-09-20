/**
 * skillTools — exposes Recourse's on-disk skill libraries (Draymond agents/skills,
 * ECC, …) to a model's native function calling, the Agent-Skills way:
 *
 *   skills_list   discover/search skills (name, description, root, hasScripts)
 *   skills_read   read a skill's SKILL.md (progressive disclosure)
 *   skills_file   read one supporting file (reference.md, schema, …)
 *   skills_run    execute a bundled script (python/node/ps1) in the skill dir
 *
 * Everything is read from real files discovered by the existing scanner; no
 * skill content is synthesized. `skills_run` runs a bounded subprocess (timeout
 * + output caps, no shell) and returns the real exit code/stdout/stderr. It is
 * enabled by default and can be turned off with AGENT_SKILLS_EXEC=0.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { SkillDef, SkillRoot } from '../skills/types.js';
import { searchSkills } from '../skills/index.js';

export interface SkillToolSpec {
  /** Bare name; the registry exposes it as `skills_<name>`. */
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  target: string;
}

export interface SkillRunResult {
  ok: boolean;
  script?: string;
  interpreter?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  error?: string;
}

export interface SkillInvokeResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface SkillToolProvider {
  list(): Promise<SkillToolSpec[]>;
  invoke(target: string, args: Record<string, unknown>): Promise<SkillInvokeResult>;
}

export interface RunScriptInput {
  interpreter: string;
  scriptAbs: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}

export interface SkillToolsDeps {
  /** Return the live catalog, scanning on first use if needed. */
  ensureCatalog: () => Promise<SkillDef[]>;
  getRoots: () => SkillRoot[];
  /** Script execution switch (default: env AGENT_SKILLS_EXEC !== '0'). */
  execEnabled?: boolean;
  execTimeoutMs?: number;
  maxReadBytes?: number;
  maxOutputChars?: number;
  /** Injectable runner (tests). */
  runScript?: (input: RunScriptInput) => Promise<SkillRunResult>;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_SKILLS_TIMEOUT_MS || 60000);
const MAX_TIMEOUT_MS = 300000;
const DEFAULT_MAX_READ = 120000;
const DEFAULT_MAX_OUTPUT = 12000;

const LOCATOR_PROPS = {
  name: { type: 'string', description: 'Skill name from SKILL.md frontmatter (preferred).' },
  dir: { type: 'string', description: 'Skill directory relative to its root (alternative to name).' },
  rootId: { type: 'string', description: 'Restrict the lookup to one skill library id.' },
};

function normalizeRel(p: string): string {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function safeJoinWithin(baseDir: string, rel: string): string | null {
  const target = path.resolve(baseDir, ...normalizeRel(rel).split('/'));
  const base = path.resolve(baseDir);
  if (target === base || target.startsWith(base + path.sep)) return target;
  return null;
}

/** Re-check containment after resolving symlinks (a listed file can be a link
 *  that points outside the skill directory). */
function realWithin(baseDir: string, abs: string): boolean {
  try {
    const base = fs.realpathSync(baseDir);
    const real = fs.realpathSync(abs);
    return real === base || real.startsWith(base + path.sep);
  } catch {
    return false;
  }
}

function skillDirAbs(root: SkillRoot, skill: SkillDef): string {
  return path.join(root.root, ...skill.dir.split('/'));
}

function interpreterFor(script: string): { cmd: string; kind: string } | { error: string } {
  const ext = path.extname(script).toLowerCase();
  if (ext === '.py') return { cmd: process.env.RECOURSE_PYTHON || 'python', kind: 'python' };
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return { cmd: process.execPath, kind: 'node' };
  if (ext === '.ps1') return { cmd: 'powershell.exe', kind: 'powershell' };
  return { error: `unsupported script type "${ext || script}" (supported: .py, .js, .mjs, .cjs, .ps1)` };
}

function defaultRunScript(input: RunScriptInput): Promise<SkillRunResult> {
  return new Promise((resolve) => {
    execFile(
      input.interpreter,
      [input.scriptAbs, ...input.args],
      { cwd: input.cwd, timeout: input.timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err: any, stdout: string, stderr: string) => {
        const timedOut = Boolean(err?.killed);
        const code = typeof err?.code === 'number' ? err.code : err ? 1 : 0;
        if (err && err.code === 'ENOENT') {
          return resolve({ ok: false, error: `interpreter not found: ${input.interpreter}` });
        }
        resolve({
          ok: !err && !timedOut,
          exitCode: code,
          stdout,
          stderr: timedOut ? `${stderr}\n[timed out after ${input.timeoutMs}ms]` : stderr,
          timedOut,
          error: timedOut ? `script timed out after ${input.timeoutMs}ms` : err ? `script exited with code ${code}` : undefined,
        });
      },
    );
  });
}

export function createSkillToolProvider(deps: SkillToolsDeps): SkillToolProvider {
  const execEnabled = deps.execEnabled ?? process.env.AGENT_SKILLS_EXEC !== '0';
  const execTimeoutMs = Math.min(deps.execTimeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const maxRead = deps.maxReadBytes ?? DEFAULT_MAX_READ;
  const maxOutput = deps.maxOutputChars ?? DEFAULT_MAX_OUTPUT;
  const runner = deps.runScript ?? defaultRunScript;

  const specs: SkillToolSpec[] = [
    {
      name: 'list',
      target: 'list',
      description: 'List/search the on-disk skill libraries. Returns skill names, descriptions, roots, and whether each ships runnable scripts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional search text (name/description/topics).' },
          limit: { type: 'number', description: 'Max results (default 40).' },
          withScripts: { type: 'boolean', description: 'Only skills that ship runnable scripts.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'read',
      target: 'read',
      description: 'Read a skill\'s SKILL.md (its instructions), plus its supporting file list. Use this to actually follow a skill.',
      parameters: { type: 'object', properties: { ...LOCATOR_PROPS }, required: [], additionalProperties: false },
    },
    {
      name: 'file',
      target: 'file',
      description: 'Read one supporting file from a skill (reference.md, schema, template, …).',
      parameters: {
        type: 'object',
        properties: { ...LOCATOR_PROPS, file: { type: 'string', description: 'Supporting file path relative to the skill dir.' } },
        required: ['file'],
        additionalProperties: false,
      },
    },
    {
      name: 'run',
      target: 'run',
      description: 'Execute a bundled skill script (.py/.js/.mjs/.cjs/.ps1) in the skill directory and return its real stdout/stderr/exit code.',
      parameters: {
        type: 'object',
        properties: {
          ...LOCATOR_PROPS,
          script: { type: 'string', description: 'Script path relative to the skill dir (must be a listed supporting file).' },
          args: { type: 'array', items: { type: 'string' }, description: 'CLI arguments.' },
          timeoutMs: { type: 'number', description: `Timeout in ms (default ${execTimeoutMs}, max ${MAX_TIMEOUT_MS}).` },
        },
        required: ['script'],
        additionalProperties: false,
      },
    },
  ];

  async function locate(args: Record<string, unknown>): Promise<{ skill: SkillDef; root: SkillRoot } | { error: string }> {
    const catalog = await deps.ensureCatalog();
    const roots = deps.getRoots();
    const name = typeof args.name === 'string' ? args.name.trim().toLowerCase() : '';
    const dir = typeof args.dir === 'string' ? normalizeRel(args.dir).toLowerCase() : '';
    const rootId = typeof args.rootId === 'string' ? args.rootId.trim() : '';
    if (!name && !dir) return { error: 'provide a skill "name" or "dir"' };
    const matches = catalog.filter((s) => {
      if (rootId && s.rootId !== rootId) return false;
      if (dir && normalizeRel(s.dir).toLowerCase() !== dir) return false;
      if (name && s.name.toLowerCase() !== name) return false;
      return true;
    });
    if (!matches.length) return { error: `no skill matched ${name ? `name "${name}"` : `dir "${dir}"`}${rootId ? ` in root "${rootId}"` : ''}` };
    const skill = matches[0];
    const root = roots.find((r) => r.id === skill.rootId);
    if (!root) return { error: `skill "${skill.name}" has no configured root "${skill.rootId}"` };
    return { skill, root };
  }

  return {
    async list() {
      return specs;
    },

    async invoke(target, args) {
      if (target === 'list') {
        const catalog = await deps.ensureCatalog();
        const query = typeof args.query === 'string' ? args.query : '';
        const limit = Math.min(Math.max(1, Number(args.limit) || 40), 200);
        let items = query ? searchSkills(catalog, query, 200) : catalog;
        if (args.withScripts === true) items = items.filter((s) => s.hasScripts);
        return {
          ok: true,
          result: {
            total: catalog.length,
            returned: Math.min(items.length, limit),
            skills: items.slice(0, limit).map((s) => ({
              name: s.name, description: s.description, rootId: s.rootId, dir: s.dir, hasScripts: s.hasScripts,
            })),
          },
        };
      }

      const found = await locate(args);
      if ('error' in found) return { ok: false, error: found.error };
      const { skill, root } = found;
      const baseDir = skillDirAbs(root, skill);

      if (target === 'read') {
        const mdPath = path.join(baseDir, 'SKILL.md');
        let text: string;
        try {
          text = await fs.promises.readFile(mdPath, 'utf-8');
        } catch (err: any) {
          return { ok: false, error: `cannot read SKILL.md for "${skill.name}": ${err?.message || err}` };
        }
        const truncated = text.length > maxRead;
        return {
          ok: true,
          result: {
            name: skill.name, description: skill.description, rootId: skill.rootId, dir: skill.dir,
            hasScripts: skill.hasScripts, files: skill.files,
            text: text.slice(0, maxRead), truncated, bytes: text.length,
          },
        };
      }

      if (target === 'file') {
        const file = normalizeRel(typeof args.file === 'string' ? args.file : '');
        if (!file || file.split('/').includes('..')) return { ok: false, error: 'invalid file path' };
        if (!skill.files.includes(file)) {
          return { ok: false, error: `"${file}" is not a listed supporting file of "${skill.name}"`, available: skill.files };
        }
        const abs = safeJoinWithin(baseDir, file);
        if (!abs) return { ok: false, error: 'file path escapes the skill directory' };
        if (!realWithin(baseDir, abs)) return { ok: false, error: 'file resolves outside the skill directory (symlink)' };
        try {
          const text = await fs.promises.readFile(abs, 'utf-8');
          const truncated = text.length > maxRead;
          return { ok: true, result: { skill: skill.name, file, text: text.slice(0, maxRead), truncated, bytes: text.length } };
        } catch (err: any) {
          return { ok: false, error: `cannot read "${file}": ${err?.message || err}` };
        }
      }

      if (target === 'run') {
        if (!execEnabled) {
          return { ok: false, error: 'skill script execution is disabled (AGENT_SKILLS_EXEC=0)' };
        }
        const script = normalizeRel(typeof args.script === 'string' ? args.script : '');
        if (!script || script.split('/').includes('..')) return { ok: false, error: 'invalid script path' };
        if (!skill.files.includes(script)) {
          return { ok: false, error: `"${script}" is not a listed supporting file of "${skill.name}"`, available: skill.files };
        }
        const abs = safeJoinWithin(baseDir, script);
        if (!abs) return { ok: false, error: 'script path escapes the skill directory' };
        if (!fs.existsSync(abs)) return { ok: false, error: `script not found: ${script}` };
        if (!realWithin(baseDir, abs)) return { ok: false, error: 'script resolves outside the skill directory (symlink)' };
        const interp = interpreterFor(script);
        if ('error' in interp) return { ok: false, error: interp.error };

        const cliArgs = Array.isArray(args.args) ? args.args.map((a) => String(a)) : [];
        const timeoutMs = Math.min(Math.max(1000, Number(args.timeoutMs) || execTimeoutMs), MAX_TIMEOUT_MS);
        const run = await runner({ interpreter: interp.cmd, scriptAbs: abs, args: cliArgs, cwd: baseDir, timeoutMs });
        const clip = (s: string | undefined) => {
          const v = s ?? '';
          return v.length > maxOutput ? `${v.slice(0, maxOutput)}…[truncated ${v.length - maxOutput} chars]` : v;
        };
        return {
          ok: run.ok,
          error: run.error,
          result: {
            skill: skill.name, script, interpreter: interp.kind,
            exitCode: run.exitCode ?? null, timedOut: run.timedOut === true,
            stdout: clip(run.stdout), stderr: clip(run.stderr),
          },
        };
      }

      return { ok: false, error: `unknown skills tool "${target}"` };
    },
  };
}

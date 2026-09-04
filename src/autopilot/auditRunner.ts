import fs from 'node:fs';
import path from 'node:path';
import {
  AUDITOR_IDS,
  AuditStatement,
  type AuditorIdT,
  type AuditorResults,
  type AuditorSectionT,
  type AuditStatementT,
  STATEMENT_SCHEMA,
} from './loopTypes';
import {
  isKillSwitchActive,
  repoBinding,
  type BusinessProfileT,
  type RepoBindingT,
} from './businessProfile';

export interface AuditorServiceConfig {
  url: string;
  apiKey: string;
  repoUrl: string;
  localPath: string;
  secret: string;
  targetUrl: string;
}

export type AuditAdapter = (cfg: AuditorServiceConfig) => Promise<AuditorSectionT>;

export interface AuditAdapters {
  grader?: AuditAdapter;
  reporank?: AuditAdapter;
  deep?: AuditAdapter;
  codegang?: AuditAdapter;
  olympics?: AuditAdapter;
}

export interface RunAuditOptions {
  profile: BusinessProfileT;
  adapters?: AuditAdapters;
  auditDir?: string;
  env?: Record<string, string>;
}

type EnvLike = Readonly<Record<string, string | undefined>>;

function envGet(env: EnvLike, key: string): string | undefined {
  const value = env[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

const DEFAULT_URLS: Record<AuditorIdT, string> = {
  grader: 'http://localhost:3201',
  reporank: 'http://localhost:3200',
  deep: 'http://localhost:3100',
  codegang: 'http://localhost:3204',
  olympics: '',
};

function readServiceEnv(name: AuditorIdT, env: EnvLike): AuditorServiceConfig | null {
  switch (name) {
    case 'grader': {
      const apiKey = envGet(env, 'GRADER_API_KEY');
      if (!apiKey) return null;
      return {
        url: envGet(env, 'GRADER_URL') ?? DEFAULT_URLS.grader,
        apiKey,
        repoUrl: '',
        localPath: '',
        secret: '',
        targetUrl: '',
      };
    }
    case 'reporank': {
      const apiKey = envGet(env, 'REPORANK_API_KEY');
      if (!apiKey) return null;
      return {
        url: envGet(env, 'REPORANK_URL') ?? DEFAULT_URLS.reporank,
        apiKey,
        repoUrl: '',
        localPath: '',
        secret: '',
        targetUrl: '',
      };
    }
    case 'deep': {
      return {
        url: envGet(env, 'DEEP_URL') ?? DEFAULT_URLS.deep,
        apiKey: envGet(env, 'DEEP_TOKEN') ?? '',
        repoUrl: '',
        localPath: '',
        secret: '',
        targetUrl: '',
      };
    }
    case 'codegang': {
      const apiKey = envGet(env, 'CODEGANG_API_KEY');
      if (!apiKey) return null;
      return {
        url: envGet(env, 'CODEGANG_URL') ?? DEFAULT_URLS.codegang,
        apiKey,
        repoUrl: '',
        localPath: '',
        secret: apiKey,
        targetUrl: '',
      };
    }
    case 'olympics': {
      const targetUrl = envGet(env, 'OLYMPICS_TARGET_URL');
      if (!targetUrl) return null;
      return {
        url: '',
        apiKey: '',
        repoUrl: '',
        localPath: '',
        secret: '',
        targetUrl,
      };
    }
  }
}

export const AUDITOR_SERVICE_ENV: Record<AuditorIdT, () => AuditorServiceConfig | null> = {
  grader: () => readServiceEnv('grader', process.env),
  reporank: () => readServiceEnv('reporank', process.env),
  deep: () => readServiceEnv('deep', process.env),
  codegang: () => readServiceEnv('codegang', process.env),
  olympics: () => readServiceEnv('olympics', process.env),
};

function adapterConfig(name: AuditorIdT, repo: RepoBindingT, env: EnvLike): AuditorServiceConfig {
  const service = readServiceEnv(name, env);
  const repoUrl = repo.githubUrl || repo.localPath;
  const localPath = repo.localPath;
  switch (name) {
    case 'grader':
    case 'reporank':
      return {
        url: service?.url ?? DEFAULT_URLS[name],
        apiKey: service?.apiKey ?? '',
        repoUrl,
        localPath,
        secret: '',
        targetUrl: '',
      };
    case 'deep':
      return {
        url: service?.url ?? DEFAULT_URLS.deep,
        apiKey: service?.apiKey ?? '',
        repoUrl: '',
        localPath,
        secret: '',
        targetUrl: '',
      };
    case 'codegang':
      return {
        url: service?.url ?? DEFAULT_URLS.codegang,
        apiKey: service?.apiKey ?? '',
        repoUrl: '',
        localPath,
        secret: service?.secret ?? '',
        targetUrl: '',
      };
    case 'olympics':
      return {
        url: '',
        apiKey: '',
        repoUrl: '',
        localPath: '',
        secret: '',
        targetUrl: service?.targetUrl ?? repoUrl,
      };
  }
}

export function handleResult(
  settled: PromiseSettledResult<AuditorSectionT>,
  fallbackReason: string,
): AuditorSectionT {
  if (settled.status === 'rejected') {
    const message =
      settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
    return { included: false, reason: `adapter threw: ${message || fallbackReason}` };
  }
  const section = settled.value;
  if (section && typeof section === 'object' && typeof section.included === 'boolean') {
    return section;
  }
  return { included: false, reason: fallbackReason };
}

export function buildDisclosures(auditors: AuditorResults): AuditStatementT['disclosures'] {
  const aiGenerated: string[] = [];
  const deterministic: string[] = [];
  const measured: string[] = [];
  const excluded: AuditStatementT['disclosures']['excluded'] = [];
  for (const [auditor, section] of Object.entries(auditors)) {
    if (!section) continue;
    if (!section.included) {
      excluded.push({ auditor, reason: section.reason ?? 'excluded auditor gave no reason' });
      continue;
    }
    const basis = section.meta?.basis;
    if (basis === 'ai') aiGenerated.push(auditor);
    else if (basis === 'deterministic') deterministic.push(auditor);
    else if (basis === 'measured') measured.push(auditor);
  }
  return { aiGenerated, deterministic, measured, excluded };
}

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function persistAudit(
  statement: AuditStatementT,
  profileSlug: string,
  auditDir: string,
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(auditDir, profileSlug, 'audits');
  const filePath = path.join(dir, `audit-${timestamp}.json`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(statement, null, 2), 'utf8');
  return filePath;
}

export function loadLatestAudit(slug: string, auditDir: string): AuditStatementT | null {
  const dir = path.join(auditDir, slug, 'audits');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((file) => /^audit-.*\.json$/.test(file))
    .sort();
  for (let i = files.length - 1; i >= 0; i -= 1) {
    try {
      const raw = fs.readFileSync(path.join(dir, files[i]), 'utf8');
      const parsed = AuditStatement.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // skip corrupt audit files
    }
  }
  return null;
}

export async function runAudit(options: RunAuditOptions): Promise<AuditStatementT> {
  if (isKillSwitchActive()) {
    throw new Error('RECOURSE_AUTOPILOT_DISABLED is set');
  }
  const binding = repoBinding(options.profile);
  if (!binding) {
    throw new Error(
      `Business profile "${options.profile.business.name}" has no repo.localPath binding: ` +
        'add data/business-profiles/<slug>.yaml repo.localPath before auditing.',
    );
  }
  const env: EnvLike = options.env ? { ...process.env, ...options.env } : process.env;
  const adapters = (options.adapters ?? {}) as Partial<Record<AuditorIdT, AuditAdapter>>;

  const results: Record<AuditorIdT, AuditorSectionT> = {
    grader: { included: false, reason: 'grader adapter not provided' },
    reporank: { included: false, reason: 'reporank adapter not provided' },
    deep: { included: false, reason: 'deep adapter not provided' },
    codegang: { included: false, reason: 'codegang adapter not provided' },
    olympics: { included: false, reason: 'olympics adapter not provided' },
  };

  const jobs: { name: AuditorIdT; adapter: AuditAdapter; config: AuditorServiceConfig }[] = [];
  for (const name of AUDITOR_IDS) {
    const adapter = adapters[name];
    if (typeof adapter === 'function') {
      jobs.push({ name, adapter, config: adapterConfig(name, binding, env) });
    }
  }

  const settled = await Promise.allSettled(jobs.map((job) => job.adapter(job.config)));
  jobs.forEach((job, index) => {
    results[job.name] = handleResult(settled[index], `${job.name} adapter produced no section`);
  });

  const hasIncluded = Object.values(results).some((section) => section.included === true);
  if (!hasIncluded) {
    throw new Error(
      `All auditors failed or were excluded: no auditor produced an included section ` +
        `for "${options.profile.business.name}".`,
    );
  }

  const statement = AuditStatement.parse({
    schema: STATEMENT_SCHEMA,
    repo: options.profile.business.name,
    targetUrl: binding.githubUrl || binding.localPath,
    generatedAt: new Date().toISOString(),
    generator: { package: 'recourse-autopilot', version: '1.0.0' },
    auditors: results,
    disclosures: buildDisclosures(results),
  });

  if (options.auditDir) {
    persistAudit(statement, slugify(options.profile.business.name), options.auditDir);
  }
  return statement;
}

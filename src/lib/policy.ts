/**
 * policy.ts — a unified policy engine for autonomous actions.
 *
 * Wave 2: authorization was fragmented across `mutationAuth`, wasm grants, the
 * wallet, and per-feature env flags, with no single decision point. This module
 * is that point: a deterministic rule set evaluated over an action descriptor,
 * returning allow / require_approval / deny with a reason.
 *
 * Precedence is fail-safe: the most restrictive matching rule wins
 * (deny > require_approval > allow), and an action matched by no rule is DENIED.
 * Rules are durable JSON, so policy is reviewable and versionable.
 */
import { readJsonFile, writeJsonFile } from './durableJson';
import path from 'node:path';

export type PolicyEffect = 'allow' | 'deny' | 'require_approval';

export interface PolicyAction {
  /** Action family, e.g. `deploy.run`, `wallet.spend`, `selfhosted.execute`. */
  kind: string;
  target?: string;
  mutating?: boolean;
  cents?: number;
  tenant?: string;
}

export interface PolicyRule {
  id: string;
  effect: PolicyEffect;
  match: {
    /** One or more glob patterns (`*` wildcard) over the action kind. */
    kind?: string | string[];
    /** Glob over the action target. */
    target?: string;
    tenant?: string;
    minCents?: number;
    maxCents?: number;
  };
  reason?: string;
}

export interface PolicyDecision {
  effect: PolicyEffect;
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  ruleId?: string;
}

const SEVERITY: Record<PolicyEffect, number> = { allow: 1, require_approval: 2, deny: 3 };

/** Simple glob match where `*` matches any run of characters. */
export function globMatch(pattern: string, value: string): boolean {
  const p = String(pattern ?? '');
  const v = String(value ?? '');
  if (p === '*') return true;
  if (!p.includes('*')) return p === v;
  const rx = p
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${rx}$`).test(v);
}

function ruleMatches(action: PolicyAction, rule: PolicyRule): boolean {
  const m = rule.match ?? {};
  if (m.kind !== undefined) {
    const kinds = Array.isArray(m.kind) ? m.kind : [m.kind];
    if (!kinds.some((k) => globMatch(k, action.kind))) return false;
  }
  if (m.target !== undefined && !globMatch(m.target, action.target ?? '')) return false;
  if (m.tenant !== undefined && m.tenant !== action.tenant) return false;
  const cents = action.cents ?? 0;
  if (m.minCents !== undefined && cents < m.minCents) return false;
  if (m.maxCents !== undefined && cents > m.maxCents) return false;
  return true;
}

/** Evaluate an action against a rule set. Most-restrictive match wins. */
export function evaluatePolicy(action: PolicyAction, rules: PolicyRule[]): PolicyDecision {
  let best: { rule: PolicyRule; sev: number } | null = null;
  for (const rule of rules) {
    if (!ruleMatches(action, rule)) continue;
    const sev = SEVERITY[rule.effect] ?? 3;
    if (!best || sev > best.sev) best = { rule, sev };
  }
  if (!best) {
    return {
      effect: 'deny',
      allowed: false,
      requiresApproval: false,
      reason: `no policy rule allows action "${action.kind}" (default deny)`,
    };
  }
  const { rule } = best;
  return {
    effect: rule.effect,
    allowed: rule.effect === 'allow',
    requiresApproval: rule.effect === 'require_approval',
    reason: rule.reason ?? `matched rule ${rule.id} (${rule.effect})`,
    ruleId: rule.id,
  };
}

/** Sensible built-in rules: reads allowed, deployments approved, big spend denied. */
export function defaultPolicyRules(): PolicyRule[] {
  return [
    { id: 'deny-huge-spend', effect: 'deny', match: { kind: '*spend*', minCents: 100_000 }, reason: 'spend above hard ceiling' },
    { id: 'approve-deploy', effect: 'require_approval', match: { kind: ['deploy.*', 'deploy'] }, reason: 'deployments require approval' },
    { id: 'approve-large-spend', effect: 'require_approval', match: { kind: '*spend*', minCents: 1_000 }, reason: 'large spend requires approval' },
    { id: 'approve-merge', effect: 'require_approval', match: { kind: ['autopilot.merge', 'repo.merge'] }, reason: 'autonomous merges require approval' },
    { id: 'allow-writes', effect: 'allow', match: { kind: ['memory.*', 'selfhosted.execute', 'forge.run', 'skill.*'] } },
    { id: 'allow-reads', effect: 'allow', match: { kind: ['read', 'status', 'registry', 'telemetry', 'recall'] } },
  ];
}

export function policyRulesFile(): string {
  return process.env.RECOURSE_POLICY_FILE || path.join(process.cwd(), 'data', 'policy.json');
}

export interface PolicyEngine {
  rules(): PolicyRule[];
  evaluate(action: PolicyAction): PolicyDecision;
  setRules(rules: PolicyRule[]): void;
  /** Reset to the built-in defaults. */
  reset(): void;
}

/** Open the durable policy engine (defaults if the file is missing/corrupt). */
export function openPolicyEngine(file = policyRulesFile()): PolicyEngine {
  let current: PolicyRule[] = readJsonFile<PolicyRule[]>(file, []);
  if (!Array.isArray(current) || current.length === 0) current = defaultPolicyRules();

  return {
    rules: () => current.map((r) => ({ ...r, match: { ...r.match } })),
    evaluate: (action) => evaluatePolicy(action, current),
    setRules(rules) {
      current = Array.isArray(rules) ? rules : [];
      writeJsonFile(file, current);
    },
    reset() {
      current = defaultPolicyRules();
      writeJsonFile(file, current);
    },
  };
}

/**
 * Fleet Dashboard — one markdown file that tells the operator everything:
 *   1. Identity (level, XP, streak, badges earned)
 *   2. Agenda status (per-milestone met / on_track / at_risk / overdue)
 *   3. Domain progress (oncology issues + math problems)
 *   4. Last cycles (what ran, what was novel, what engines fired)
 *   5. Honesty line (data sources, what's verified vs aspirational)
 *
 * Always derived from real persisted state. No placeholders, no aspirational
 * XP, no fake milestones. The dashboard is the operator's one-screen view.
 */

import fs from 'fs';
import path from 'path';
import {
  computeIssueProgress,
  type IssueRecord,
} from './issueTracker.js';
import { renderAndPersistAgenda, type MilestoneStatusReport } from './breakthroughAgenda.js';
import {
  computeGameProfile,
  type GameProfile,
  leaderboard,
  BADGES,
} from './gamification.js';
import { recentCycles, recentFindings, getConductorStatus } from './scienceConductor.js';
import { recentMathCycles, recentMathFindings, mathConductorStatus } from './mathConductor.js';
import { keywireHealth } from './keywireBridge.js';
import { verifyLedgerChain } from './trendLedger.js';
import { getMathAttempts } from './goalLedger.js';
import { HARD_MATH_PROBLEMS } from './hardMathProblems.js';

const REPORTS_DIR = path.join(process.cwd(), 'data', 'reports');

function reportsDir(): string {
  return process.env.REPORTS_DIR || REPORTS_DIR;
}

// --- Status icons ------------------------------------------------------------

const STATUS_ICONS: Record<string, string> = {
  met: '✅',
  on_track: '🟢',
  at_risk: '🟡',
  overdue: '🔴',
  open: '⚪',
  in_progress: '🔵',
  stalled: '🟠',
  solved: '✅',
  bounded: '🔍',
  open_tier: '🌌',
};

function bar(value: number, target: number, width = 16): string {
  if (target <= 0) return '—';
  const ratio = Math.max(0, Math.min(1, value / target));
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled) + ` ${(ratio * 100).toFixed(0)}%`;
}

// --- Section renderers -------------------------------------------------------

function renderHeader(profile: GameProfile, mathConductor: { running: boolean; cyclesRun: number }, sciConductor: { running: boolean; cyclesRun: number }): string[] {
  const lines: string[] = [];
  lines.push('# Recourse Fleet Dashboard');
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');
  lines.push('## Identity & Gamification');
  lines.push('');
  lines.push(`- **Level:** ${profile.level.name.toUpperCase()} — ${profile.level.description}`);
  lines.push(`- **Total XP:** ${profile.totalXp} (math: ${profile.mathXp} + oncology: ${profile.oncologyXp} + streak: ${profile.streak * 50})`);
  if (profile.nextLevel) {
    lines.push(`- **Next level:** ${profile.nextLevel.name} (${profile.xpToNextLevel} XP to go)`);
  } else {
    lines.push(`- **Next level:** — (max level reached)`);
  }
  lines.push(`- **Streak:** ${profile.streak} consecutive day(s) of novel findings`);
  lines.push(`- **Badges earned (${profile.badges.length}/${Object.keys(BADGES).length}):** ${profile.badges.map((b) => b.icon).join(' ')}`);
  if (profile.badges.length > 0) {
    lines.push('');
    lines.push('  | badge | name | description |');
    lines.push('  |---|---|---|');
    for (const b of profile.badges) {
      lines.push(`  | ${b.icon} | ${b.name} | ${b.description} |`);
    }
  }
  lines.push('');
  lines.push(`### Per-domain leaderboard`);
  lines.push('');
  lines.push('| domain | XP | detail |');
  lines.push('|---|---|---|');
  for (const row of leaderboard()) {
    if (row.domain === 'math') {
      lines.push(`| math | ${row.xp} | ${row.solves ?? 0} passing attempts |`);
    } else {
      lines.push(`| oncology | ${row.xp} | ${row.findings ?? 0} novel findings |`);
    }
  }
  lines.push('');
  lines.push('### Conductor status');
  lines.push('');
  lines.push(`- **Science conductor:** ${sciConductor.running ? 'RUNNING' : 'STOPPED'} (${sciConductor.cyclesRun} cycles)`);
  lines.push(`- **Math conductor:** ${mathConductor.running ? 'RUNNING' : 'STOPPED'} (${mathConductor.cyclesRun} cycles)`);
  lines.push('');
  return lines;
}

function renderAgendaSection(reports: MilestoneStatusReport[]): string[] {
  const lines: string[] = [];
  lines.push('## Breakthrough Agenda');
  lines.push('');

  // Group by status for the summary.
  const byStatus = {
    met: reports.filter((r) => r.status === 'met'),
    on_track: reports.filter((r) => r.status === 'on_track'),
    at_risk: reports.filter((r) => r.status === 'at_risk'),
    overdue: reports.filter((r) => r.status === 'overdue'),
  };
  lines.push(`- ✅ Met: **${byStatus.met.length}**`);
  lines.push(`- 🟢 On track: **${byStatus.on_track.length}**`);
  lines.push(`- 🟡 At risk: **${byStatus.at_risk.length}**`);
  lines.push(`- 🔴 Overdue: **${byStatus.overdue.length}**`);
  lines.push('');

  lines.push('### Math milestones');
  lines.push('');
  lines.push('| status | milestone | target date | days left | progress | reason |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of reports.filter((r) => r.milestone.domain === 'math')) {
    const icon = STATUS_ICONS[r.status] ?? '?';
    lines.push(
      `| ${icon} | ${r.milestone.title} | ${r.milestone.targetDate} | ${r.daysRemaining.toFixed(1)} | ${bar(r.verification.currentValue, r.verification.targetValue)} | ${r.reason} |`,
    );
  }
  lines.push('');

  lines.push('### Oncology milestones');
  lines.push('');
  lines.push('| status | milestone | target date | days left | progress | reason |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of reports.filter((r) => r.milestone.domain === 'oncology')) {
    const icon = STATUS_ICONS[r.status] ?? '?';
    lines.push(
      `| ${icon} | ${r.milestone.title} | ${r.milestone.targetDate} | ${r.daysRemaining.toFixed(1)} | ${bar(r.verification.currentValue, r.verification.targetValue)} | ${r.reason} |`,
    );
  }
  lines.push('');
  return lines;
}

function renderOncologySection(records: IssueRecord[]): string[] {
  const lines: string[] = [];
  lines.push('## Oncology — Grant-Engine Issues');
  lines.push('');
  lines.push('| issue | status | progress | gaps | findings | trend |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of records) {
    const icon = STATUS_ICONS[r.status] ?? '?';
    lines.push(
      `| \`${r.issueId}\` | ${icon} ${r.status} | ${bar(r.progressScore, 1.0)} | ${r.gapCount} | ${r.findingsCount} | ${r.trendInsights} |`,
    );
  }
  lines.push('');
  return lines;
}

function renderMathSection(): string[] {
  const lines: string[] = [];
  const attempts = getMathAttempts();
  lines.push('## Mathematics — Hard-Problem Bank');
  lines.push('');
  lines.push('| problem | tier | attempts | passes | best score |');
  lines.push('|---|---|---|---|---|');
  for (const p of HARD_MATH_PROBLEMS) {
    const pAttempts = attempts.filter((a) => a.problemId === p.id);
    const passes = pAttempts.filter((a) => a.passed).length;
    const best = pAttempts.reduce((m, a) => Math.max(m, a.score), 0);
    const tierIcon = p.tier === 'solvable' ? '🥇' : p.tier === 'bounded' ? '🔍' : '🌌';
    lines.push(`| ${p.title} | ${tierIcon} ${p.tier} | ${pAttempts.length} | ${passes} | ${best.toFixed(2)} |`);
  }
  lines.push('');
  return lines;
}

function renderRecentCycles(): string[] {
  const lines: string[] = [];
  lines.push('## Recent Cycles');
  lines.push('');

  // Science conductor
  const sciCycles = recentCycles(5);
  lines.push('### Science (oncology)');
  lines.push('');
  if (sciCycles.length === 0) {
    lines.push('_No science cycles yet._');
  } else {
    lines.push('| # | problem | mode | novel | engines | skipped |');
    lines.push('|---|---|---|---|---|---|');
    for (const c of sciCycles) {
      lines.push(
        `| ${c.cycle} | ${c.problemId} | ${c.experimentMode} | ${c.novelCount} | ${c.enginesUsed.join(', ')} | ${c.skipped.length} |`,
      );
    }
  }
  lines.push('');

  // Math conductor
  const mathCycles = recentMathCycles(5);
  lines.push('### Math');
  lines.push('');
  if (mathCycles.length === 0) {
    lines.push('_No math cycles yet._');
  } else {
    lines.push('| # | problem | tier | passed | score | gen | engines |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const c of mathCycles) {
      const passed = c.attemptPassed ? '✅' : '❌';
      lines.push(
        `| ${c.cycle} | ${c.problemId} | ${c.problemTier} | ${passed} | ${c.attemptScore.toFixed(2)} | ${c.attemptGeneration} | ${c.enginesUsed.join(', ')} |`,
      );
    }
  }
  lines.push('');
  return lines;
}

function renderHonestyFooter(): string[] {
  const lines: string[] = [];
  lines.push('## Honesty Contract');
  lines.push('');
  lines.push(
    'Every counter on this dashboard is derived from persisted state under `data/` and `recourse_goals.json`:',
  );
  lines.push('');
  lines.push('- **Issues progress** ← `data/issues/records.json` (recomputed from grant registry + science-loop + trend-ledger + goal ledger)');
  lines.push('- **Math attempts/passes** ← `recourse_goals.json#mathAttempts[]` (real recorded outcomes)');
  lines.push('- **Novel findings** ← `data/science-loop/cycles.jsonl` + `data/math-loop/cycles.jsonl` (cycle-level counts)');
  lines.push('- **Agenda status** ← live verification functions (`verifyMathSolved`, `verifyMathBounds`, `verifyOncologyGrant`) — never guess');
  lines.push('- **XP / level / badges** ← derived from the same ledgers; no phantom points');
  lines.push('- **Axiom/Keywire status** ← real health-check calls (offline = explicitly `offline`, never silently faked)');
  lines.push('');
  lines.push(
    '_Offline services and unmet criteria are reported as zero. We do not interpolate, we do not pad._',
  );
  lines.push('');
  return lines;
}

// --- Public entry points -----------------------------------------------------

export interface DashboardSections {
  agenda: MilestoneStatusReport[];
  issues: IssueRecord[];
  profile: GameProfile;
  mathConductor: { running: boolean; cyclesRun: number };
  sciConductor: { running: boolean; cyclesRun: number };
  trendLedgerValid: boolean;
  keywireOk: boolean;
}

export async function computeDashboardSections(): Promise<DashboardSections> {
  const agenda = renderAndPersistAgenda();
  const issues = computeIssueProgress();
  const profile = computeGameProfile();
  const trend = verifyLedgerChain();
  const kw = await keywireHealth().catch(() => ({ ok: false }));
  return {
    agenda: agenda.milestones,
    issues,
    profile,
    mathConductor: mathConductorStatus(),
    sciConductor: getConductorStatus(),
    trendLedgerValid: trend.valid,
    keywireOk: !!kw?.ok,
  };
}

export async function renderDashboard(): Promise<{ file: string; sections: DashboardSections }> {
  const sections = await computeDashboardSections();
  const lines: string[] = [];
  lines.push(...renderHeader(sections.profile, sections.mathConductor, sections.sciConductor));
  lines.push(...renderAgendaSection(sections.agenda));
  lines.push(...renderOncologySection(sections.issues));
  lines.push(...renderMathSection());
  lines.push(...renderRecentCycles());
  lines.push(`- **Trend ledger chain:** ${sections.trendLedgerValid ? 'VALID' : 'BROKEN'}`);
  lines.push(`- **Keywire fleet:** ${sections.keywireOk ? 'online' : 'offline'}`);
  lines.push('');
  lines.push(...renderHonestyFooter());

  fs.mkdirSync(reportsDir(), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(reportsDir(), `fleet-${date}.md`);
  fs.writeFileSync(file, lines.join('\n'), 'utf-8');
  const latest = path.join(reportsDir(), 'latest.md');
  fs.writeFileSync(latest, lines.join('\n'), 'utf-8');
  return { file, sections };
}

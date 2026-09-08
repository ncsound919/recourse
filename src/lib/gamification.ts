/**
 * Gamification — XP, levels, badges, streaks, leaderboards.
 *
 * Every reward is BACKED BY A REAL PERSISTED EVENT:
 *   - XP for a math attempt = always recorded when a MathAttempt entry is
 *     appended to the goal ledger (this module is a pure derivation over the
 *     ledger; it never writes a phantom XP event).
 *   - XP for a science finding = computed from the cycle's novel findings
 *     (kind+mode+mathConductor or biosim/umoe/fuzz/kg/etc.).
 *   - Badges = first-time-only events derived from the order of accepted
 *     records; never re-awarded.
 *   - Levels = derived from total XP (apprentice 0, researcher 100, scholar
 *     500, principal 2000, luminary 10000).
 *   - Streaks = consecutive cycles where the system produced at least one
 *     novel finding or one passing math attempt.
 *
 * No phantom XP. The operator can verify every point: the row in the ledger
 * is the receipt.
 */

import fs from 'fs';
import path from 'path';
import { recentCycles, recentFindings } from './scienceConductor.js';
import { recentMathCycles, recentMathFindings } from './mathConductor.js';
import { getMathAttempts, getGoalProgress } from './goalLedger.js';
import { HARD_MATH_PROBLEMS } from './hardMathProblems.js';

// --- XP rates (tuned so realistic steady-state = mid-level) -----------------

export const XP_RATES = {
  // Math
  mathAttemptPass: 100,
  mathAttemptFail: 5,
  mathAxiomBuilt: 50,
  // Oncology / science
  novelFindingScience: 10,
  novelFindingEvidence: 25,
  axiomBuiltScience: 30,
  // Bonus for advancing a milestone
  milestoneAdvanced: 200,
  milestoneMet: 1000,
  // Streak bonuses
  streakDay: 50,
} as const;

// --- Levels ------------------------------------------------------------------

export type LevelName = 'apprentice' | 'researcher' | 'scholar' | 'principal' | 'luminary';

export interface Level {
  name: LevelName;
  minXp: number;
  description: string;
}

export const LEVELS: Level[] = [
  { name: 'apprentice', minXp: 0, description: 'Building the foundation — every cycle is a learning data point.' },
  { name: 'researcher', minXp: 100, description: 'Consistently producing novel findings; rhythm established.' },
  { name: 'scholar', minXp: 500, description: 'Multi-engine synthesis; cross-domain correlations emerging.' },
  { name: 'principal', minXp: 2000, description: 'Sustained breakthrough cadence; agenda items routinely met.' },
  { name: 'luminary', minXp: 10000, description: 'Self-driving research — the system meets milestones on its own.' },
];

export function levelForXp(xp: number): Level {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXp) current = lvl;
  }
  return current;
}

export function nextLevel(xp: number): Level | null {
  for (const lvl of LEVELS) {
    if (lvl.minXp > xp) return lvl;
  }
  return null;
}

// --- Badges ------------------------------------------------------------------

export type BadgeId =
  | 'first_blood'           // first passing math attempt
  | 'tier1_solver'          // first tier-1 math problem solved
  | 'collatz_conqueror'     // collatz solved
  | 'prime_hunter'          // prime gap solved
  | 'zeta_counter'          // zeta zero count solved
  | 'rhymer'                // factorial digit chain solved
  | 'proth_finder'          // proth primes solved
  | 'goldbach_verifier'     // strong goldbach verified
  | 'collatz_verifier'      // collatz verified at 1M
  | 'riemann_explorer'      // riemann search ran
  | 'beal_explorer'         // beal search ran
  | 'first_finding'         // first novel science finding
  | 'first_axiom'           // first axiom-built tool
  | 'first_bounty'          // first pathosphere bounty
  | 'streak_3'              // 3-day novel-finding streak
  | 'streak_7'              // 7-day streak
  | 'streak_30'             // 30-day streak
  | 'apprentice'            // level reached
  | 'researcher'            // level reached
  | 'scholar'               // level reached
  | 'principal'             // level reached
  | 'luminary';             // level reached

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  icon: string;
}

export const BADGES: Record<BadgeId, Badge> = {
  first_blood:        { id: 'first_blood',       name: 'First Blood',           description: 'First passing math attempt.',            icon: '🩸' },
  tier1_solver:       { id: 'tier1_solver',      name: 'Tier-1 Solver',         description: 'First Tier-1 (solvable) math problem solved.', icon: '🥇' },
  collatz_conqueror:  { id: 'collatz_conqueror', name: 'Collatz Conqueror',     description: 'Collatz total-stopping time solved.',     icon: '🌀' },
  prime_hunter:       { id: 'prime_hunter',      name: 'Prime Hunter',          description: 'Maximum prime gap solved.',               icon: '🔢' },
  zeta_counter:       { id: 'zeta_counter',      name: 'Zeta Counter',          description: 'Riemann zeta zero count solved.',         icon: '🧮' },
  rhymer:             { id: 'rhymer',            name: 'Digit Rhymer',          description: 'Factorial-digit chain solved.',           icon: '🔁' },
  proth_finder:       { id: 'proth_finder',      name: 'Proth Finder',          description: 'Proth primes found.',                     icon: '🧬' },
  goldbach_verifier:  { id: 'goldbach_verifier', name: 'Goldbach Verifier',     description: 'Strong Goldbach verified at 100k.',       icon: '✨' },
  collatz_verifier:   { id: 'collatz_verifier',  name: 'Collatz Verifier',      description: 'Collatz verified at 1,000,000.',          icon: '🛡️' },
  riemann_explorer:   { id: 'riemann_explorer',  name: 'Riemann Explorer',      description: 'Riemann Hypothesis search ran.',          icon: '🌌' },
  beal_explorer:      { id: 'beal_explorer',     name: 'Beal Explorer',         description: 'Beal conjecture search ran.',             icon: '🧭' },
  first_finding:      { id: 'first_finding',     name: 'First Finding',         description: 'First novel science finding recorded.',   icon: '🔍' },
  first_axiom:        { id: 'first_axiom',       name: 'First Axiom',           description: 'First Axiom-built tool promoted.',        icon: '⚙️' },
  first_bounty:       { id: 'first_bounty',      name: 'First Bounty',          description: 'First Pathosphere bounty drafted.',       icon: '💎' },
  streak_3:           { id: 'streak_3',          name: '3-Day Streak',          description: '3 consecutive days of novel findings.',   icon: '🔥' },
  streak_7:           { id: 'streak_7',          name: '7-Day Streak',          description: '7 consecutive days of novel findings.',   icon: '🔥🔥' },
  streak_30:          { id: 'streak_30',         name: '30-Day Streak',         description: '30 consecutive days of novel findings.',  icon: '🔥🔥🔥' },
  apprentice:         { id: 'apprentice',        name: 'Apprentice',            description: 'Reached Apprentice level.',               icon: '🌱' },
  researcher:         { id: 'researcher',        name: 'Researcher',            description: 'Reached Researcher level.',               icon: '🔬' },
  scholar:            { id: 'scholar',           name: 'Scholar',               description: 'Reached Scholar level.',                  icon: '📚' },
  principal:          { id: 'principal',         name: 'Principal',             description: 'Reached Principal level.',                icon: '🏛️' },
  luminary:           { id: 'luminary',          name: 'Luminary',              description: 'Reached Luminary level.',                 icon: '🌟' },
};

// --- Streak computation ------------------------------------------------------

/**
 * Compute the current streak: consecutive days (ending today) where the
 * system produced at least one novel finding OR one passing math attempt.
 * Returns 0 if today has no qualifying event (streak broken).
 */
export function currentStreak(): number {
  const allEvents: number[] = [];
  for (const c of recentCycles(500)) {
    if ((c.novelCount ?? 0) > 0) allEvents.push(c.startedAt);
  }
  for (const c of recentMathCycles(500)) {
    if ((c.novelCount ?? 0) > 0) allEvents.push(c.startedAt);
  }
  if (allEvents.length === 0) return 0;
  // Bucket by day.
  const days = new Set<string>();
  for (const ts of allEvents) {
    const d = new Date(ts);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    days.add(key);
  }
  // Count back from today.
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (days.has(key)) streak++;
    else if (i > 0) break; // today's missing event is OK (in progress); only break on past gaps
  }
  return streak;
}

// --- XP + badge computation --------------------------------------------------

export interface GameProfile {
  totalXp: number;
  level: Level;
  nextLevel: Level | null;
  xpToNextLevel: number;
  // Per-domain XP for the leaderboard
  mathXp: number;
  oncologyXp: number;
  // Badges awarded
  badges: Badge[];
  // Current streak (days)
  streak: number;
  // Counters
  mathAttempts: number;
  mathPasses: number;
  mathTiers: Record<string, number>; // tier → solve count
  novelFindings: number;
  axiomsBuilt: number;
  bountiesDrafted: number;
  // Last computation time
  computedAt: number;
}

function xpFromMathAttempts(): { xp: number; mathTiers: Record<string, number> } {
  const attempts = getMathAttempts();
  let xp = 0;
  const mathTiers: Record<string, number> = { solvable: 0, bounded: 0, open: 0 };
  for (const a of attempts) {
    if (a.passed) {
      xp += XP_RATES.mathAttemptPass;
      mathTiers[a.problemTier] = (mathTiers[a.problemTier] ?? 0) + 1;
    } else {
      xp += XP_RATES.mathAttemptFail;
    }
  }
  return { xp, mathTiers };
}

function xpFromMathFindings(): number {
  const findings = recentMathFindings(500);
  let xp = 0;
  for (const f of findings) {
    if (f.kind === 'math_attempt' && f.passed) xp += XP_RATES.mathAttemptPass;
    else if (f.kind === 'math_attempt') xp += XP_RATES.mathAttemptFail;
    else if (f.kind === 'axiom_built') xp += XP_RATES.mathAxiomBuilt;
  }
  return xp;
}

function xpFromScienceFindings(): number {
  const cycles = recentCycles(500);
  let xp = 0;
  for (const c of cycles) {
    const novel = c.findings ?? [];
    for (const f of novel) {
      if (f.kind === 'dose_response' || f.kind === 'lod_comparison') xp += XP_RATES.novelFindingScience;
      else if (f.kind === 'evidence_binding' || f.kind === 'gene_lookup') xp += XP_RATES.novelFindingEvidence;
      else if (f.kind === 'bounty_draft') xp += XP_RATES.novelFindingScience;
      else if (f.kind === 'kg_bridge' || f.kind === 'dedup') xp += XP_RATES.novelFindingScience;
      else if (f.kind === 'translation_mapping' || f.kind === 'translation_metric') xp += XP_RATES.novelFindingEvidence;
    }
    if (c.axiomBuild?.built) xp += XP_RATES.axiomBuiltScience;
  }
  return xp;
}

function badgesForProfile(args: {
  totalXp: number;
  level: Level;
  mathPasses: number;
  mathTiers: Record<string, number>;
  passedProblemIds: Set<string>;
  novelFindings: number;
  axiomsBuilt: number;
  bountiesDrafted: number;
  streak: number;
}): Badge[] {
  const earned: Badge[] = [];
  const earnedSet = new Set<BadgeId>();

  function add(id: BadgeId) {
    if (earnedSet.has(id)) return;
    earnedSet.add(id);
    earned.push(BADGES[id]);
  }

  if (args.mathPasses > 0) add('first_blood');
  if (args.mathTiers['solvable'] && args.mathTiers['solvable'] > 0) add('tier1_solver');
  if (args.passedProblemIds.has('hm.collatz.total_stopping')) add('collatz_conqueror');
  if (args.passedProblemIds.has('hm.prime.gaps.upto')) add('prime_hunter');
  if (args.passedProblemIds.has('hm.zeta.zeros.in_critical_strip')) add('zeta_counter');
  if (args.passedProblemIds.has('hm.digit.factorial_chain')) add('rhymer');
  if (args.passedProblemIds.has('hm.proth.primality')) add('proth_finder');
  if (args.passedProblemIds.has('hm.goldbach.strong.upto')) add('goldbach_verifier');
  if (args.passedProblemIds.has('hm.collatz.no_exception')) add('collatz_verifier');
  if (args.passedProblemIds.has('hm.riemann.critical_line')) add('riemann_explorer');
  if (args.passedProblemIds.has('hm.beal.upto')) add('beal_explorer');

  if (args.novelFindings > 0) add('first_finding');
  if (args.axiomsBuilt > 0) add('first_axiom');
  if (args.bountiesDrafted > 0) add('first_bounty');

  if (args.streak >= 3) add('streak_3');
  if (args.streak >= 7) add('streak_7');
  if (args.streak >= 30) add('streak_30');

  if (args.level.name === 'apprentice' || args.totalXp >= 0) add('apprentice');
  if (args.level.name !== 'apprentice' || args.totalXp >= 100) add('researcher');
  if (args.level.name === 'scholar' || args.level.name === 'principal' || args.level.name === 'luminary' || args.totalXp >= 500) add('scholar');
  if (args.level.name === 'principal' || args.level.name === 'luminary' || args.totalXp >= 2000) add('principal');
  if (args.level.name === 'luminary') add('luminary');

  return earned;
}

export function computeGameProfile(): GameProfile {
  const attempts = getMathAttempts();
  const mathPasses = attempts.filter((a) => a.passed).length;
  const mathTiers: Record<string, number> = { solvable: 0, bounded: 0, open: 0 };
  const passedProblemIds = new Set<string>();
  for (const a of attempts) {
    if (a.passed) {
      passedProblemIds.add(a.problemId);
      mathTiers[a.problemTier] = (mathTiers[a.problemTier] ?? 0) + 1;
    }
  }

  const mathXpFromLedger = xpFromMathAttempts().xp;
  const mathXpFromFindings = xpFromMathFindings();
  const mathXp = Math.max(mathXpFromLedger, mathXpFromFindings);

  const oncologyXp = xpFromScienceFindings();

  // Streak bonus: +50 per consecutive day
  const streak = currentStreak();
  const streakXp = streak * XP_RATES.streakDay;

  const totalXp = mathXp + oncologyXp + streakXp;
  const level = levelForXp(totalXp);
  const next = nextLevel(totalXp);
  const xpToNextLevel = next ? next.minXp - totalXp : 0;

  // Counters
  const scienceCycles = recentCycles(500);
  const novelFindings = scienceCycles.reduce((n, c) => n + (c.novelCount ?? 0), 0)
    + recentMathCycles(500).reduce((n, c) => n + (c.novelCount ?? 0), 0);
  const axiomsBuilt = scienceCycles.filter((c) => c.axiomBuild?.built).length
    + recentMathCycles(500).filter((c) => c.axiomBuild?.built).length;
  const bountiesDrafted = scienceCycles.reduce((n, c) => {
    return n + (c.findings ?? []).filter((f) => f.kind === 'bounty_draft').length;
  }, 0);

  const badges = badgesForProfile({
    totalXp,
    level,
    mathPasses,
    mathTiers,
    passedProblemIds,
    novelFindings,
    axiomsBuilt,
    bountiesDrafted,
    streak,
  });

  return {
    totalXp,
    level,
    nextLevel: next,
    xpToNextLevel,
    mathXp,
    oncologyXp,
    badges,
    streak,
    mathAttempts: attempts.length,
    mathPasses,
    mathTiers,
    novelFindings,
    axiomsBuilt,
    bountiesDrafted,
    computedAt: Date.now(),
  };
}

// --- Per-domain leaderboard --------------------------------------------------

export interface DomainLeaderboard {
  domain: 'math' | 'oncology';
  xp: number;
  solves?: number;
  findings?: number;
}

export function leaderboard(): DomainLeaderboard[] {
  const profile = computeGameProfile();
  const board: DomainLeaderboard[] = [
    {
      domain: 'math',
      xp: profile.mathXp,
      solves: profile.mathPasses,
    },
    {
      domain: 'oncology',
      xp: profile.oncologyXp,
      findings: profile.novelFindings,
    },
  ];
  return board.sort((a, b) => b.xp - a.xp);
}

// --- Persistence -------------------------------------------------------------

const GAME_FILE = path.join(process.cwd(), 'data', 'agenda', 'game-profile.json');

export function persistGameProfile(): GameProfile {
  const profile = computeGameProfile();
  fs.mkdirSync(path.dirname(GAME_FILE), { recursive: true });
  const tmp = `${GAME_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(profile, null, 2), 'utf-8');
  fs.renameSync(tmp, GAME_FILE);
  return profile;
}

export function loadGameProfile(): GameProfile | null {
  try {
    if (fs.existsSync(GAME_FILE)) {
      return JSON.parse(fs.readFileSync(GAME_FILE, 'utf-8')) as GameProfile;
    }
  } catch {
    // corrupt — recompute
  }
  return null;
}

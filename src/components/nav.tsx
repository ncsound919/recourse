import React from 'react';
import {
  Activity,
  Atom,
  BarChart3,
  Binary,
  Box,
  Brain,
  Cpu,
  Download,
  FileText,
  FolderSearch,
  Gamepad2,
  GitBranch,
  GitCommit,
  Globe,
  Layers,
  Library,
  Mic,
  Moon,
  Music,
  Network,
  Newspaper,
  Puzzle,
  Server,
  Settings,
  SlidersHorizontal,
  Target,
  Terminal,
  Users,
  Waves,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { SystemStatus } from '../types';

export type TabKey =
  | 'overview'
  | 'lego'
  | 'provider'
  | 'music-therapy'
  | 'music'
  | 'rating'
  | 'recursive-math'
  | 'recursive-learner'
  | 'decision'
  | 'dreaming'
  | 'forge'
  | 'github'
  | 'subagents'
  | 'self-repair'
  | 'benchmark'
  | 'provenance'
  | 'registry'
  | 'verifier'
  | 'reports'
  | 'reporter'
  | 'intake-growth'
  | 'corpus'
  | 'skills'
  | 'web'
  | 'visualizer'
  | 'dataviz'
  | 'ghidra'
  | 'gamepad'
  | 'voice-clone'
  | 'fleet-voice'
  | 'slopbench'
  | 'llama'
  | 'settings';

export interface NavBadge {
  text: string;
  tone: 'muted' | 'warn' | 'bad';
}

export interface NavItem {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  /** Short description shown in the command palette. */
  hint?: string;
  /** Only real, actionable counts. No decorative labels. */
  badge?: (status: SystemStatus) => NavBadge | null;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ key: 'overview', label: 'Overview', icon: Activity, hint: 'System health, metrics and recent provenance' }],
  },
  {
    label: 'Evolution',
    items: [
      { key: 'forge', label: 'Forge', icon: Cpu, hint: 'Capability forge, templates and self-hosted tools' },
      {
        key: 'self-repair',
        label: 'Self-repair',
        icon: Wrench,
        hint: 'Anomalies, healing and chaos tests',
        badge: (s) => {
          const n = s.selfRepair?.activeAnomaliesCount ?? 0;
          return n > 0 ? { text: String(n), tone: 'bad' } : null;
        },
      },
      { key: 'decision', label: 'Growth decisions', icon: SlidersHorizontal, hint: 'Deterministic growth utility ranking' },
      { key: 'recursive-math', label: 'Recursive loop', icon: Atom, hint: 'Five-formula learning loop' },
      { key: 'recursive-learner', label: 'Learner', icon: Brain, hint: 'Beta-posterior learner' },
      { key: 'dreaming', label: 'Dreaming', icon: Moon, hint: 'Dream engine and crystallization' },
      { key: 'lego', label: 'Lego assembly', icon: Puzzle, hint: 'Composable ML assembly' },
      { key: 'subagents', label: 'Subagents', icon: Users, hint: 'Swarm teams and task queue' },
    ],
  },
  {
    label: 'Quality',
    items: [
      {
        key: 'benchmark',
        label: 'Benchmark',
        icon: Target,
        hint: 'Hidden-suite benchmark results',
        badge: (s) => {
          const rp = s.realProgress;
          return rp && rp.benchmarkTotal > 0 ? { text: `${rp.benchmarkSolved}/${rp.benchmarkTotal}`, tone: 'muted' } : null;
        },
      },
      { key: 'verifier', label: 'Verifier', icon: Terminal, hint: 'Run code against verifier suites' },
      {
        key: 'registry',
        label: 'Genes',
        icon: Layers,
        hint: 'Tool registry and pending approvals',
        badge: (s) => (s.pendingApprovalsCount > 0 ? { text: String(s.pendingApprovalsCount), tone: 'warn' } : null),
      },
      { key: 'provenance', label: 'Provenance', icon: GitCommit, hint: 'Hash-chained event log' },
    ],
  },
  {
    label: 'Research',
    items: [
      { key: 'intake-growth', label: 'Intake & growth', icon: Globe, hint: 'External signals and grounding' },
      { key: 'github', label: 'GitHub research', icon: GitBranch, hint: 'Repository blueprints' },
      { key: 'corpus', label: 'Corpus', icon: FolderSearch, hint: 'Indexed local research corpus' },
      { key: 'skills', label: 'Skills', icon: Library, hint: 'Skill catalog and exports' },
      { key: 'web', label: 'Web download', icon: Download, hint: 'Fetch pages into intake' },
      { key: 'ghidra', label: 'Ghidra', icon: Binary, hint: 'Binary reverse engineering' },
      { key: 'dataviz', label: 'Data viz', icon: BarChart3, hint: 'Python visualization sidecar' },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { key: 'reports', label: 'Hourly reports', icon: FileText, hint: 'Generated digests' },
      { key: 'reporter', label: 'Self reporter', icon: Newspaper, hint: 'Articles written about the system' },
      { key: 'fleet-voice', label: 'Fleet voice', icon: Network, hint: 'Axiom and OpenHub summaries' },
      { key: 'slopbench', label: 'SlopCodeBench', icon: Activity, hint: 'Iterative refinement benchmark' },
      { key: 'voice-clone', label: 'Voice clone', icon: Mic, hint: 'Voice profiles and synthesis' },
    ],
  },
  {
    label: 'Audio',
    items: [
      { key: 'music', label: 'Soundlab', icon: Music, hint: 'Chord progressions and composer' },
      { key: 'rating', label: 'A/B rating', icon: Waves, hint: 'Pairwise audio rating loop' },
      { key: 'music-therapy', label: 'Music therapy', icon: Activity, hint: 'Evidence review' },
    ],
  },
  {
    label: 'System',
    items: [
      { key: 'provider', label: 'AI provider', icon: Server, hint: 'Model provider and routing' },
      { key: 'llama', label: 'Local model', icon: Cpu, hint: 'llama.cpp server status, models and chat' },
      { key: 'visualizer', label: '3D visualizer', icon: Box, hint: 'Live system graph' },
      { key: 'gamepad', label: 'Gamepad', icon: Gamepad2, hint: 'Controller input' },
      { key: 'settings', label: 'Settings', icon: Settings, hint: 'Configuration' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function navItem(key: TabKey): NavItem {
  return NAV_ITEMS.find((i) => i.key === key) ?? NAV_ITEMS[0];
}

export function navGroupOf(key: TabKey): string {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.key === key))?.label ?? '';
}

export const BADGE_TONE: Record<NavBadge['tone'], string> = {
  muted: 'text-ink-400',
  warn: 'bg-warn-500/15 text-warn-300',
  bad: 'bg-bad-500/15 text-bad-300',
};

export function NavBadgePill({ badge }: { badge: NavBadge }) {
  return (
    <span className={`ml-auto rounded px-1.5 py-px text-[11px] font-medium tabular-nums ${BADGE_TONE[badge.tone]}`}>
      {badge.text}
    </span>
  );
}

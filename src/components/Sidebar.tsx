import React from 'react';
import { Search } from 'lucide-react';
import type { SystemStatus } from '../types';
import { NAV_GROUPS, NavBadgePill, type TabKey } from './nav';

interface SidebarProps {
  active: TabKey;
  status: SystemStatus;
  onSelect: (key: TabKey) => void;
  onOpenPalette: () => void;
  /** Mobile drawer state; the sidebar is always visible at lg and up. */
  open: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ active, status, onSelect, onOpenPalette, open, onClose }) => {
  const select = (key: TabKey) => {
    onSelect(key);
    onClose();
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink-950/70 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-ink-800 bg-ink-950 transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Primary"
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-ink-800 px-4">
          <img src="/overlay-recourse-logo.png" alt="" className="h-7 w-7 rounded-md object-cover" />
          <span className="text-[15px] font-semibold tracking-tight text-ink-50">Recourse</span>
          <span className="ml-auto text-xs text-ink-500 tabular-nums">Gen {status.generation ?? 0}</span>
        </div>

        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={onOpenPalette}
            className="flex w-full items-center gap-2 rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1.5 text-sm text-ink-400 transition-colors hover:border-ink-700 hover:text-ink-200"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Jump to</span>
            <kbd className="ml-auto rounded border border-ink-700 px-1 text-[10px] text-ink-500">Ctrl K</kbd>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mt-4 first:mt-2">
              {group.items.length > 1 && (
                <div className="px-2 pb-1 text-[11px] font-medium text-ink-500">{group.label}</div>
              )}
              <ul className="space-y-px">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === active;
                  const badge = item.badge?.(status) ?? null;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        data-nav-key={item.key}
                        onClick={() => select(item.key)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-ink-800 text-ink-50'
                            : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent-400' : 'text-ink-500 group-hover:text-ink-300'}`}
                          strokeWidth={1.75}
                        />
                        <span className="truncate">{item.label}</span>
                        {badge && <NavBadgePill badge={badge} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
};

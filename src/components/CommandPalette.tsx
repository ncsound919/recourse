import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { NAV_GROUPS, type TabKey } from './nav';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (key: TabKey) => void;
}

/** Ctrl/Cmd+K jump list over every view. Keyboard: type, arrows, Enter, Esc. */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, onSelect }) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
    if (!q) return all;
    return all.filter((i) => `${i.label} ${i.group} ${i.hint ?? ''}`.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  if (!open) return null;

  const choose = (key: TabKey) => {
    onSelect(key);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter' && results[cursor]) {
      choose(results[cursor].key);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/70 px-4 pt-[12vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Jump to view"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-ink-800 px-3">
          <Search className="h-4 w-4 text-ink-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search views"
            className="h-11 flex-1 bg-transparent font-sans text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none"
          />
          <kbd className="rounded border border-ink-700 px-1 text-[10px] text-ink-500">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-500">No view matches "{query}".</li>}
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(r.key)}
                  className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left ${i === cursor ? 'bg-ink-800' : ''}`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.75} />
                  <span className="text-sm text-ink-100">{r.label}</span>
                  <span className="truncate text-xs text-ink-500">{r.hint}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-600">{r.group}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

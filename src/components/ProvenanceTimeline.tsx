import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Search, Code } from 'lucide-react';
import { ProvenanceEvent, ChainVerificationResult } from '../types';

interface ProvenanceTimelineProps {
  events: ProvenanceEvent[];
  integrity: ChainVerificationResult;
  /** Overview mode: no filters, short list, link to the full log. */
  compact?: boolean;
  onViewAll?: () => void;
}

export const ProvenanceTimeline: React.FC<ProvenanceTimelineProps> = ({ events, integrity, compact, onViewAll }) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<ProvenanceEvent | null>(null);

  const filteredEvents = events.filter(e => {
    const matchesSearch =
      JSON.stringify(e).toLowerCase().includes(search.toLowerCase()) ||
      e.hash.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || e.type === filterType;
    return matchesSearch && matchesType;
  });

  const EVENT_LABEL: Partial<Record<ProvenanceEvent['type'], { text: string; cls: string }>> = {
    tool_promoted: { text: 'Promoted', cls: 'text-ok-300' },
    tool_human_approved: { text: 'Approved', cls: 'text-ok-300' },
    tool_rejected: { text: 'Rejected', cls: 'text-bad-300' },
    tool_held_back: { text: 'Held back', cls: 'text-warn-300' },
    tool_pending_approval: { text: 'Pending', cls: 'text-warn-300' },
    report_generated: { text: 'Report', cls: 'text-ink-300' },
    tool_verification: { text: 'Verified', cls: 'text-ink-300' },
  };
  const getEventBadge = (type: ProvenanceEvent['type']) => {
    const raw = String(type).replace(/_/g, ' ');
    const l = EVENT_LABEL[type] ?? { text: raw.charAt(0).toUpperCase() + raw.slice(1), cls: 'text-ink-400' };
    return <span className={`w-36 shrink-0 truncate text-xs ${l.cls}`} title={l.text}>{l.text}</span>;
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900/60 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink-50">Provenance log</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-400">
            {integrity.valid ? <ShieldCheck className="h-3.5 w-3.5 text-ok-400" /> : <ShieldAlert className="h-3.5 w-3.5 text-bad-400" />}
            <span>
              {integrity.valid ? 'Hash chain verified' : 'Hash chain broken'}, {integrity.length} events
            </span>
          </p>
        </div>
        {compact && onViewAll && (
          <button onClick={onViewAll} className="self-start text-sm text-accent-300 hover:text-accent-200">
            View full log
          </button>
        )}
      </div>

      {!compact && (
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by hash, tool or details"
              aria-label="Search provenance events"
              className="w-full rounded-md border border-ink-800 bg-ink-950 py-2 pl-9 pr-3 text-sm text-ink-200 placeholder:text-ink-600 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Event type"
            className="rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-ink-300 focus:border-accent-500 focus:outline-none"
          >
            <option value="all">All events</option>
            <option value="tool_verification">Verifications</option>
            <option value="tool_promoted">Promotions</option>
            <option value="tool_rejected">Rejections</option>
            <option value="tool_pending_approval">Pending approvals</option>
            <option value="tool_human_approved">Human approved</option>
            <option value="report_generated">Reports</option>
          </select>
        </div>
      )}

      <ul className={`mt-4 divide-y divide-ink-800/70 ${compact ? '' : 'max-h-[640px] overflow-y-auto pr-1'}`}>
        {filteredEvents.length === 0 ? (
          <li className="py-10 text-center text-sm text-ink-500">No events match these filters.</li>
        ) : (
          filteredEvents.map((event, idx) => {
            const subject = event.data.tool || event.data.action || event.data.reportId || event.type;
            const detail = event.data.summary || event.data.reason || event.data.verifier_notes || '';
            return (
              <li key={event.hash + idx}>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(event)}
                  className="flex w-full items-center gap-3 py-2 text-left hover:bg-ink-900/60"
                >
                  {getEventBadge(event.type)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[13px] text-ink-100">
                      {subject}
                      {event.data.version && <span className="ml-1.5 text-ink-500">{event.data.version}</span>}
                    </span>
                    {detail && <span className="block truncate text-xs text-ink-500">{String(detail)}</span>}
                  </span>
                  <span className="hidden shrink-0 font-mono text-[11px] text-ink-600 sm:block">{event.hash.substring(0, 8)}</span>
                  <span className="w-16 shrink-0 text-right text-xs text-ink-500">{formatDate(event.ts)}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      {/* Selected Event Payload Inspector Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 max-w-2xl w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-ink-800">
              <div className="flex items-center space-x-2">
                <Code className="w-4 h-4 text-accent-400" />
                <h3 className="text-sm font-semibold text-white">
                  Provenance Entry Inspector
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-ink-400 hover:text-white text-xs px-2 py-1 rounded bg-ink-800 hover:bg-ink-700 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <span className="text-ink-400">Event Type:</span>{' '}
                <span className="text-accent-400 font-semibold">{selectedEvent.type}</span>
              </div>
              <div>
                <span className="text-ink-400">Timestamp:</span>{' '}
                <span className="text-ink-200">{new Date(selectedEvent.ts).toISOString()}</span>
              </div>
              <div>
                <span className="text-ink-400">Previous Entry Hash (prev):</span>
                <p className="p-2 bg-ink-950 rounded border border-ink-800 text-ink-300 break-all text-[11px]">
                  {selectedEvent.prev}
                </p>
              </div>
              <div>
                <span className="text-ink-400">Current Entry SHA-256 Hash:</span>
                <p className="p-2 bg-ink-950 rounded border border-ink-800 text-ok-400 break-all text-[11px]">
                  {selectedEvent.hash}
                </p>
              </div>
              <div>
                <span className="text-ink-400">Payload Data:</span>
                <pre className="p-3 bg-ink-950 rounded border border-ink-800 text-accent-300 overflow-x-auto text-[11px] mt-1 max-h-60 scrollbar-thin">
                  {JSON.stringify(selectedEvent.data, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
};

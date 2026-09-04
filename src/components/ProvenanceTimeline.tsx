import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, GitCommit, Search, Code, CheckCircle, XCircle, Clock, AlertCircle, Sparkles } from 'lucide-react';
import { ProvenanceEvent, ChainVerificationResult } from '../types';

interface ProvenanceTimelineProps {
  events: ProvenanceEvent[];
  integrity: ChainVerificationResult;
}

export const ProvenanceTimeline: React.FC<ProvenanceTimelineProps> = ({ events, integrity }) => {
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

  const getEventBadge = (type: ProvenanceEvent['type']) => {
    switch (type) {
      case 'tool_promoted':
      case 'tool_human_approved':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PROMOTED</span>;
      case 'tool_rejected':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">REJECTED</span>;
      case 'tool_held_back':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">HELD BACK</span>;
      case 'tool_pending_approval':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">PENDING</span>;
      case 'report_generated':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">REPORT</span>;
      case 'tool_verification':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">VERIFIED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">EVENT</span>;
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
      
      {/* Header & Verification Badge */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <GitCommit className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-mono font-bold text-white">Immutable Provenance Audit Log</h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Cryptographic SHA-256 linear hash chain verifying all autonomous adjustments, code verifications, and approvals.
          </p>
        </div>

        {/* Verification Card */}
        <div className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg border font-mono text-xs ${
          integrity.valid
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {integrity.valid ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className="w-4 h-4 text-rose-400" />}
          <div>
            <div className="font-bold uppercase tracking-wider">
              {integrity.valid ? 'SHA-256 Chain Verified' : 'Tamper Alert Detected'}
            </div>
            <div className="text-[10px] text-slate-400">
              {integrity.length} events • Last Hash: {integrity.lastHash.substring(0, 12)}...
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 my-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by hash, tool name, or event details..."
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-slate-950 border border-slate-800 text-slate-300 text-xs font-mono rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
        >
          <option value="all">All Event Types</option>
          <option value="tool_verification">Verification Events</option>
          <option value="tool_promoted">Promotions</option>
          <option value="tool_rejected">Rejections</option>
          <option value="tool_pending_approval">Pending Approvals</option>
          <option value="tool_human_approved">Human Approved</option>
          <option value="report_generated">Hourly Reports</option>
        </select>
      </div>

      {/* Timeline Stream */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-10 text-slate-500 font-mono text-xs">
            No provenance events match the selected filters.
          </div>
        ) : (
          filteredEvents.map((event, idx) => (
            <div
              key={event.hash + idx}
              onClick={() => setSelectedEvent(event)}
              className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-lg p-3.5 transition-all cursor-pointer group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                
                {/* Event Type & Target */}
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  {getEventBadge(event.type)}
                  <span className="font-mono text-xs font-bold text-slate-200 group-hover:text-indigo-300">
                    {event.data.tool || event.data.action || event.data.reportId || event.type}
                  </span>
                  {event.data.version && (
                    <span className="text-xs font-mono text-slate-400">v{event.data.version}</span>
                  )}
                </div>

                {/* Time & Hash */}
                <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {formatDate(event.ts)}
                  </span>
                  <span className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-400 font-mono text-[10px]">
                    #{event.hash.substring(0, 10)}
                  </span>
                </div>
              </div>

              {/* Event Description Summary */}
              <div className="mt-2 text-xs font-mono text-slate-300 flex items-center justify-between">
                <span>
                  {event.data.summary || event.data.reason || event.data.verifier_notes || JSON.stringify(event.data)}
                </span>
                <span className="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Inspect Cryptographic Payload →
                </span>
              </div>

              {/* SHA-256 Link Indicator */}
              <div className="mt-2 pt-2 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>prev: {event.prev.substring(0, 16)}...</span>
                <span>hash: {event.hash.substring(0, 16)}...</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected Event Payload Inspector Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-2xl w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Code className="w-4 h-4 text-indigo-400" />
                <h3 className="font-mono text-sm font-bold text-white">
                  Provenance Entry Inspector
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-white font-mono text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 font-mono text-xs">
              <div>
                <span className="text-slate-400">Event Type:</span>{' '}
                <span className="text-indigo-400 font-bold">{selectedEvent.type}</span>
              </div>
              <div>
                <span className="text-slate-400">Timestamp:</span>{' '}
                <span className="text-slate-200">{new Date(selectedEvent.ts).toISOString()}</span>
              </div>
              <div>
                <span className="text-slate-400">Previous Entry Hash (prev):</span>
                <p className="p-2 bg-slate-950 rounded border border-slate-800 text-slate-300 break-all text-[11px]">
                  {selectedEvent.prev}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Current Entry SHA-256 Hash:</span>
                <p className="p-2 bg-slate-950 rounded border border-slate-800 text-emerald-400 break-all text-[11px]">
                  {selectedEvent.hash}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Payload Data:</span>
                <pre className="p-3 bg-slate-950 rounded border border-slate-800 text-indigo-300 overflow-x-auto text-[11px] mt-1 max-h-60 scrollbar-thin">
                  {JSON.stringify(selectedEvent.data, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

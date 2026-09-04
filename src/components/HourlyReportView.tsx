import React from 'react';
import { FileText, Clock, Sparkles, CheckCircle2, ShieldCheck, ChevronRight, RefreshCw } from 'lucide-react';
import { HourlyReport } from '../types';

interface HourlyReportViewProps {
  reports: HourlyReport[];
  onGenerateReport: () => void;
  isGenerating: boolean;
}

export const HourlyReportView: React.FC<HourlyReportViewProps> = ({
  reports,
  onGenerateReport,
  isGenerating
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-mono font-bold text-white">Hourly Self-Upgrade Digest & Changelog</h2>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Automated hourly reports documenting autonomous architectural adjustments, verification rates, and hash chain diffs.
          </p>
        </div>

        <button
          onClick={onGenerateReport}
          disabled={isGenerating}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'GENERATING REPORT...' : 'GENERATE HOURLY REPORT NOW'}</span>
        </button>
      </div>

      {/* Reports Feed */}
      <div className="mt-5 space-y-4">
        {reports.length === 0 ? (
          <div className="text-center py-10 text-slate-500 font-mono text-xs">
            No hourly reports generated yet. Click above to trigger the first report digest.
          </div>
        ) : (
          reports.map(report => (
            <div
              key={report.id}
              className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl p-5 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded font-mono text-xs font-bold">
                    {report.id}
                  </span>
                  <span className="text-xs font-mono text-slate-300 font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    {report.dateFormatted}
                  </span>
                </div>

                <div className="flex items-center space-x-3 text-xs font-mono">
                  <span className="text-emerald-400 font-bold">{report.promotedCount} Promoted</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-400 font-bold">{report.pendingCount} Pending</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-rose-400 font-bold">{report.rejectedCount} Rejected</span>
                </div>
              </div>

              {/* Markdown Content */}
              <div className="mt-4 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-900/50 p-4 rounded-lg border border-slate-800/80">
                {report.summaryMarkdown}
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span className="flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" /> Immutable Chain Linked ({report.eventsCount} events)
                </span>
                <span>Timestamp: {report.timestamp}</span>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};

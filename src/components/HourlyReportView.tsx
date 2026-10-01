import React from 'react';
import { FileText, Clock, ShieldCheck, RefreshCw } from 'lucide-react';
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
    <div className="bg-ink-900/90 border border-ink-800 rounded-xl p-5">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-ink-800">
        <div>
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-accent-400" />
            <h2 className="text-lg font-semibold text-white">Hourly Self-Upgrade Digest & Changelog</h2>
          </div>
          <p className="text-xs text-ink-400 mt-0.5">
            Automated hourly reports documenting autonomous architectural adjustments, verification rates, and hash chain diffs.
          </p>
        </div>

        <button
          onClick={onGenerateReport}
          disabled={isGenerating}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold transition-all shadow-md disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Generating report...' : 'Generate hourly report now'}</span>
        </button>
      </div>

      {/* Reports Feed */}
      <div className="mt-5 space-y-4">
        {reports.length === 0 ? (
          <div className="text-center py-10 text-ink-500 text-xs">
            No hourly reports generated yet. Click above to trigger the first report digest.
          </div>
        ) : (
          reports.map(report => (
            <article key={report.id} className="rounded-lg border border-ink-800 bg-ink-950/60 p-5">
              <header className="flex flex-col gap-2 border-b border-ink-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-3.5 w-3.5 text-ink-500" />
                  <span className="font-medium text-ink-100">{report.dateFormatted}</span>
                  <span className="font-mono text-[11px] text-ink-600">{report.id}</span>
                </div>
                <dl className="flex items-center gap-4 text-xs">
                  <div className="flex gap-1"><dd className="text-ink-100">{report.promotedCount}</dd><dt className="text-ink-500">promoted</dt></div>
                  <div className="flex gap-1"><dd className={report.pendingCount ? 'text-warn-300' : 'text-ink-100'}>{report.pendingCount}</dd><dt className="text-ink-500">pending</dt></div>
                  <div className="flex gap-1"><dd className={report.rejectedCount ? 'text-bad-300' : 'text-ink-100'}>{report.rejectedCount}</dd><dt className="text-ink-500">rejected</dt></div>
                </dl>
              </header>
              <pre className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-300">
                {/* Older stored reports carry a mis-decoded em-dash. */}
                {String(report.summaryMarkdown ?? '').replace(/\u00e2\u20ac\u201d/g, '-')}
              </pre>
              <footer className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
                <ShieldCheck className="h-3.5 w-3.5 text-ok-400" />
                <span>Linked in the provenance chain, {report.eventsCount} events</span>
              </footer>
            </article>
          ))
        )}
      </div>

    </div>
  );
};

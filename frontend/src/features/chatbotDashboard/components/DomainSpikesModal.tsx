import { createPortal } from 'react-dom';
import { useState, useMemo } from 'react';
import { X, TrendingUp } from 'lucide-react';
import { DOMAINS } from '@/components/MetaData';
import { Spinner } from '@/components/atoms/spinner';
import { useDomainSpikes } from '../hooks/useDomainSpikes';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DomainSpikeEntry {
  domain: string;
  date: string;       // ISO date string YYYY-MM-DD
  count: number;
  baseline: number;
  spikePct: number;
  location?: string;
}

interface DomainSpikesModalProps {
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DomainSpikesModal({ onClose }: DomainSpikesModalProps) {
  const { data: spikes = [], isLoading, isError } = useDomainSpikes(true, 60);

  const today = new Date();
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(today.getDate() - 60);

  const [startDate, setStartDate] = useState<string>(
    sixtyDaysAgo.toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(today.toISOString().slice(0, 10));
  const [selectedDomain, setSelectedDomain] = useState<string>('all');

  const filtered = useMemo(() => {
    return spikes.filter((s) => {
      if (selectedDomain !== 'all' && s.domain !== selectedDomain) return false;
      if (startDate && s.date < startDate) return false;
      if (endDate && s.date > endDate) return false;
      return true;
    });
  }, [spikes, selectedDomain, startDate, endDate]);

  const severityClass = (pct: number) => {
    if (pct >= 100) return 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400';
    if (pct >= 50) return 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400';
    return 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400';
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#2a2a2a] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-red-500" />
              Domain Query Spikes
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Domains with abnormally high query volume on a given date
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-[#2a2a2a] flex flex-wrap gap-3 items-end shrink-0">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Domain
            </label>
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="text-xs rounded-md border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#111] text-gray-800 dark:text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3AAA5A] min-w-[220px]"
            >
              <option value="all">All Domains</option>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              From
            </label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs rounded-md border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#111] text-gray-800 dark:text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3AAA5A]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              To
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs rounded-md border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#111] text-gray-800 dark:text-gray-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3AAA5A]"
            />
          </div>

          <button
            onClick={() => {
              setSelectedDomain('all');
              setStartDate(sixtyDaysAgo.toISOString().slice(0, 10));
              setEndDate(today.toISOString().slice(0, 10));
            }}
            className="text-xs text-[#3AAA5A] hover:underline pb-1.5"
          >
            Reset
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Spinner text="Loading domain spikes..." fullScreen={false} />
            </div>
          )}

          {isError && (
            <div className="flex items-center justify-center py-20 text-sm text-red-500">
              Failed to load domain spikes. Please try again.
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400 dark:text-gray-500">
              {spikes.length > 0
                ? 'No spikes match your filters.'
                : 'No domain spikes detected in this period.'}
            </div>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-[#1f1f1f] border-b border-gray-200 dark:border-[#2a2a2a]">
                <tr>
                  {['#', 'Domain', 'Date', 'Queries', 'Baseline', 'Spike', 'Location'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap ${
                        i === 0 || i === 5 ? 'text-center' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                {filtered.map((row, idx) => (
                  <tr
                    key={`${row.domain}-${row.date}-${idx}`}
                    className="hover:bg-gray-50 dark:hover:bg-[#1f1f1f] transition-colors"
                  >
                    <td className="px-4 py-3 text-center text-xs text-gray-400 dark:text-gray-500 w-8">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 max-w-[200px]">
                      {row.domain}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {fmtDate(row.date)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                      {row.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {row.baseline.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${severityClass(row.spikePct)}`}>
                        <TrendingUp className="w-3 h-3" />
                        +{row.spikePct}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {row.location ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!isLoading && (
          <div className="px-6 py-3 border-t border-gray-100 dark:border-[#2a2a2a] flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 shrink-0">
            <span>
              {filtered.length !== spikes.length
                ? `${filtered.length} of ${spikes.length} spikes`
                : `${spikes.length} spike${spikes.length !== 1 ? 's' : ''} detected`}
            </span>
            {filtered.length !== spikes.length && (
              <button
                onClick={() => {
                  setSelectedDomain('all');
                  setStartDate(sixtyDaysAgo.toISOString().slice(0, 10));
                  setEndDate(today.toISOString().slice(0, 10));
                }}
                className="text-[#3AAA5A] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

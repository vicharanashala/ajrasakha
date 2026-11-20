import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { WeeklyDigestItem } from '../types';
import { 
  FileText, 
  AlertOctagon, 
  TrendingDown, 
  MapPin, 
  Download, 
  RotateCw,
  Sparkles,
  Layers,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { BackendOfflineError } from './BackendOfflineError';

export const WeeklyDigestView: React.FC = () => {
  const [digest, setDigest] = useState<WeeklyDigestItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadDigest = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const data = await api.getWeeklyDigest();
      setDigest(data);
    } catch (e) {
      console.error('Failed to load digest:', e);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDigest();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (hasError) {
    return (
      <BackendOfflineError 
        onRetry={loadDigest}
        title="Weekly Agri Digest Unavailable"
        message="Unable to fetch the weekly intelligence report from the backend API (/api/digest/weekly)."
      />
    );
  }

  if (isLoading && !digest) {
    return (
      <div className="text-center py-20 px-4">
        <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981] pulse-dot-online mx-auto mb-4" />
        <h3 className="text-slate-400 font-medium">Compiling Weekly Agricultural Intelligence Digest...</h3>
      </div>
    );
  }

  if (!digest) {
    return (
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-12 text-center max-w-lg mx-auto my-12">
        <FileText size={48} className="text-slate-400 mx-auto mb-3 opacity-50" />
        <h3 className="text-lg font-bold text-white mb-2">No Digest Generated Yet</h3>
        <button 
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
          onClick={loadDigest}
        >
          Generate Weekly Digest
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Digest Header Panel */}
      <div className="bg-gradient-to-br from-emerald-500/10 via-slate-900/80 to-sky-500/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold text-xs">
                {digest.digest_id}
              </span>
              {digest.reporting_period && (
                <span className="text-xs text-sky-400 bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded font-medium">
                  {digest.reporting_period}
                </span>
              )}
              <span className="text-xs text-slate-400">
                Generated: {new Date(digest.generated_at).toLocaleString()}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-['Outfit'] text-white">
              Weekly Agri Intelligence & Knowledge Quality Digest
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Automated briefing for Agronomy Scientific Advisory Council (ANNAM.AI / IIT Ropar)
            </p>
          </div>

          <div className="flex gap-2.5">
            <button 
              className="bg-white/5 hover:bg-white/10 text-white font-medium text-xs sm:text-sm px-3.5 py-2 rounded-lg border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
              onClick={loadDigest} 
              title="Re-compile Digest"
            >
              <RotateCw size={14} className={isLoading ? 'spin-anim' : ''} />
              <span>Refresh</span>
            </button>
            <button 
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
              onClick={handlePrint}
            >
              <Download size={14} />
              <span>Export / Print</span>
            </button>
          </div>
        </div>

        {/* Snapshot KPIs from summary or snapshot */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-white/10">
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Evaluations Captured</div>
            <div className="text-2xl font-extrabold font-['Outfit'] text-white mt-0.5">
              {digest.summary?.total_feedback ?? digest.metrics_snapshot?.total_evaluations ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Helpfulness Index</div>
            <div className="text-2xl font-extrabold font-['Outfit'] text-emerald-400 mt-0.5">
              {digest.summary?.overall_helpful_pct !== undefined 
                ? `${digest.summary.overall_helpful_pct}%` 
                : digest.metrics_snapshot?.system_wide_helpfulness 
                ? `${(digest.metrics_snapshot.system_wide_helpfulness * 100).toFixed(1)}%` 
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Voice Notes Analyzed</div>
            <div className="text-2xl font-extrabold font-['Outfit'] text-purple-400 mt-0.5">
              {digest.summary?.voice_notes_count ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Flagged for Revision</div>
            <div className="text-2xl font-extrabold font-['Outfit'] text-rose-400 mt-0.5">
              {digest.summary?.flagged_entries_count ?? digest.metrics_snapshot?.flagged_in_pipeline ?? '—'}
            </div>
          </div>
        </div>

        {digest.summary?.status_headline && (
          <div className="mt-4 bg-white/5 border border-white/10 p-3 rounded-xl flex items-center gap-2 text-xs">
            <Sparkles size={15} className="text-amber-400 shrink-0" />
            <span className="text-slate-300 font-medium">Status Headline: </span>
            <span className="text-amber-300 font-bold">{digest.summary.status_headline}</span>
          </div>
        )}
      </div>

      {/* Critical Action Items */}
      {digest.critical_action_items && digest.critical_action_items.length > 0 && (
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertOctagon size={18} className="text-rose-400" />
            <div>
              <h3 className="font-bold text-base text-white">Critical Action Items Requiring Expert Intervention</h3>
              <p className="text-xs text-slate-400">Immediate revisions prioritized based on feedback severity</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {digest.critical_action_items.map((item, i) => {
              if (typeof item === 'string') {
                return (
                  <div 
                    key={i}
                    className="bg-rose-500/10 border border-rose-500/25 rounded-xl p-3.5 flex items-start gap-3"
                  >
                    <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs px-2 py-0.5 rounded font-bold shrink-0 mt-0.5">
                      #{i + 1}
                    </span>
                    <span className="text-xs sm:text-sm text-rose-200 leading-relaxed font-medium">
                      {item}
                    </span>
                  </div>
                );
              }

              return (
                <div 
                  key={i}
                  className="bg-rose-500/5 border border-rose-500/25 rounded-xl p-4 flex justify-between items-center flex-wrap gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-xs bg-white/10 text-white px-2 py-0.5 rounded">
                        {item.gdb_id}
                      </span>
                      {item.crop && (
                        <span className="text-xs font-semibold bg-white/10 px-2 py-0.5 rounded">
                          {item.crop}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-rose-300">
                      {item.issue}
                    </div>
                    {item.recommended_action && (
                      <div className="text-xs text-slate-400 mt-1">
                        <strong className="text-slate-300">Remediation:</strong> {item.recommended_action}
                      </div>
                    )}
                  </div>

                  {item.helpful_percentage !== undefined && (
                    <span className="text-xs font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 rounded-lg">
                      {item.helpful_percentage.toFixed(1)}% Helpful
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two Columns: Lowest Performing Entries & Regional Hotspots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* Lowest Performing GDB Entries */}
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown size={18} className="text-amber-400" />
            <div>
              <h3 className="font-bold text-base text-white">Lowest Performing Q&A Entries</h3>
              <p className="text-xs text-slate-400">Knowledge entries with high rejection rates</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {digest.lowest_performing_gdb_entries && digest.lowest_performing_gdb_entries.length > 0 ? (
              digest.lowest_performing_gdb_entries.map((entry) => (
                <div 
                  key={entry.gdb_id}
                  className="bg-white/5 border border-white/5 p-3.5 rounded-xl"
                >
                  <div className="flex justify-between items-center mb-1.5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-white bg-white/10 px-1.5 py-0.5 rounded">{entry.gdb_id}</span>
                      <span className="text-xs text-emerald-400 font-semibold">{entry.crop}</span>
                      {entry.domain && (
                        <span className="text-xs text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">{entry.domain}</span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                      {(entry.helpful_percentage ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm text-slate-200 mb-2 leading-relaxed">
                    {entry.question || entry.question_hi || '—'}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <ThumbsUp size={11} /> {entry.upvotes ?? 0}
                    </span>
                    <span className="text-rose-400 flex items-center gap-1 font-medium">
                      <ThumbsDown size={11} /> {entry.downvotes ?? 0}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      ({entry.total_responses ?? 0} total)
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 py-4 text-center">No entries listed.</div>
            )}
          </div>
        </div>

        {/* Regional Hotspots / State Breakdown */}
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-sky-400" />
            <div>
              <h3 className="font-bold text-base text-white">Regional Performance & Satisfaction</h3>
              <p className="text-xs text-slate-400">State-level feedback satisfaction</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {digest.state_breakdown && digest.state_breakdown.length > 0 ? (
              digest.state_breakdown.map((spot) => {
                const isGood = spot.helpful_percentage >= 70;
                return (
                  <div 
                    key={spot.state}
                    className="bg-white/5 border border-white/5 rounded-xl p-3.5 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-bold text-sm text-white">
                        {spot.state}
                      </div>
                      <div className="text-xs text-slate-400">
                        Evaluations: {spot.total} (👍 {spot.upvotes} | 👎 {spot.downvotes})
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold border ${
                        isGood 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}>
                        {spot.helpful_percentage.toFixed(1)}% Helpful
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-xs text-slate-400 py-4 text-center">No regional breakdown available.</div>
            )}
          </div>
        </div>
      </div>

      {/* Domain Breakdown in Digest */}
      {digest.domain_breakdown && digest.domain_breakdown.length > 0 && (
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={18} className="text-emerald-400" />
            <h3 className="font-bold text-base text-white">Domain Breakdown in Reporting Period</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {digest.domain_breakdown.map((dom) => (
              <div key={dom.domain} className="bg-white/5 border border-white/5 p-3.5 rounded-xl">
                <div className="font-semibold text-xs text-slate-200 mb-1">{dom.domain}</div>
                <div className="text-lg font-bold text-emerald-400">{dom.helpful_percentage.toFixed(1)}%</div>
                <div className="text-[11px] text-slate-400 mt-1">{dom.total} feedbacks evaluated</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

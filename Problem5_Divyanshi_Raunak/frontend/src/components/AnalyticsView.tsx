import type {
  AnalyticsOverview,
  DomainAnalyticsItem,
  StateAnalyticsItem,
  RootCauseItem
} from '../types';
import {
  ThumbsUp,
  ThumbsDown,
  Mic,
  Database,
  AlertTriangle,
  TrendingUp,
  MapPin,
  Layers,
  Activity,
  HelpCircle
} from 'lucide-react';

interface AnalyticsViewProps {
  overview: AnalyticsOverview | null;
  domains: DomainAnalyticsItem[];
  states: StateAnalyticsItem[];
  rootCauses: RootCauseItem[];
  isLoading: boolean;
  onNavigateToFlagged?: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  overview,
  domains,
  states,
  rootCauses,
  isLoading,
  onNavigateToFlagged
}) => {
  if (isLoading && !overview) {
    return (
      <div className="text-center py-20 px-4">
        <div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981] pulse-dot-online mx-auto mb-4" />
        <h3 className="text-slate-400 font-medium">Loading Agricultural Intelligence Data...</h3>
      </div>
    );
  }

  const helpfulPercentage = overview?.overall_helpful_percentage ?? 0;
  const isHealthy = helpfulPercentage >= 70;

  return (
    <div>
      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">

        {/* Helpfulness Score */}
        <div className="bg-slate-900/75 backdrop-blur-md border border-white/10 rounded-2xl p-4.5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Overall Helpfulness</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isHealthy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div className={`text-3xl font-extrabold font-['Outfit'] ${isHealthy ? 'text-emerald-400' : 'text-amber-400'}`}>
            {helpfulPercentage.toFixed(1)}%
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-3">
            <div
              className={`h-full rounded-full transition-all duration-700 ${isHealthy ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : 'bg-gradient-to-r from-amber-500 to-amber-300'}`}
              style={{ width: `${Math.min(100, helpfulPercentage)}%` }}
            />
          </div>
          <div className="flex items-center gap-2 mt-2.5 text-[11px] text-slate-400">
            <span>Target: &gt; 80.0%</span>
            <span>•</span>
            <span className="text-rose-400">Flag: &lt; {(overview?.active_threshold ?? 0.6) * 100}%</span>
          </div>
        </div>

        {/* Total Feedbacks */}
        <div className="bg-slate-900/75 backdrop-blur-md border border-white/10 rounded-2xl p-4.5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Feedbacks</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-sky-500/15 text-sky-400">
              <Activity size={16} />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-['Outfit'] text-white">
            {overview?.total_feedback_captured.toLocaleString() ?? '—'}
          </div>
          <div className="flex items-center gap-3.5 mt-3 text-xs">
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <ThumbsUp size={13} /> {overview?.overall_upvotes ?? 0}
            </span>
            <span className="text-rose-400 flex items-center gap-1 font-medium">
              <ThumbsDown size={13} /> {overview?.overall_downvotes ?? 0}
            </span>
          </div>
        </div>

        {/* Voice Feedback Count */}
        <div className="bg-slate-900/75 backdrop-blur-md border border-white/10 rounded-2xl p-4.5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Voice Notes</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/15 text-purple-400">
              <Mic size={16} />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-['Outfit'] text-purple-400">
            {overview?.voice_feedback_count.toLocaleString() ?? '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-3 truncate">
            Multimodal Indic Voice NLP analyzed
          </div>
        </div>

        {/* GDB Knowledge Base */}
        <div className="bg-slate-900/75 backdrop-blur-md border border-white/10 rounded-2xl p-4.5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">GDB Knowledge Base</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-500/15 text-cyan-400">
              <Database size={16} />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-['Outfit'] text-white">
            {overview?.total_gdb_entries ?? '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-3">
            Verified Agri-Science records
          </div>
        </div>

        {/* Flagged Review Queue */}
        <div
          className="bg-slate-900/75 backdrop-blur-md border border-rose-500/30 rounded-2xl p-4.5 transition-all hover:-translate-y-0.5 hover:border-rose-500/50 hover:shadow-xl cursor-pointer bg-rose-500/5"
          onClick={onNavigateToFlagged}
          title="Click to view Flagged Quality Queue"
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs text-rose-300 font-semibold uppercase tracking-wider">Flagged For Review</span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-rose-500/20 text-rose-400">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-['Outfit'] text-rose-400">
            {overview?.total_flagged_for_review ?? 0}
          </div>
          <div className="text-[11px] text-rose-300 mt-3 font-medium">
            Action: &lt;60% helpful (N &ge; 10)
          </div>
        </div>
      </div>

      {/* Two Column Layout: Domain Breakdown & Root Causes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* Domain Quality Performance */}
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Layers size={18} className="text-emerald-400" />
              <div>
                <h3 className="font-bold text-base text-white">Quality Performance by Domain</h3>
                <p className="text-xs text-slate-400">Farmer helpfulness ratio broken down across agronomic verticals</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {domains.map((dom, idx) => {
              const pct = dom.helpful_percentage;
              const isGood = pct >= 70;
              const isWarn = pct < 60;
              return (
                <div key={`${dom.domain}-${idx}`} className="bg-white/5 p-3.5 rounded-xl border border-white/5">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-semibold text-sm text-slate-100">{dom.domain}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${isWarn
                      ? 'text-rose-400 bg-rose-500/15 border border-rose-500/30'
                      : isGood
                        ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30'
                        : 'text-amber-400 bg-amber-500/15 border border-amber-500/30'
                      }`}>
                      {pct.toFixed(1)}% Helpful
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isWarn ? 'bg-rose-500' : isGood ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>

                  <div className="flex justify-between mt-2 text-[11px] text-slate-400">
                    <span>Total Evaluated: {dom.total}</span>
                    <span>👍 {dom.upvotes} Upvotes | 👎 {dom.downvotes} Downvotes</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Root Cause Analysis of Farmer Dissatisfaction */}
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <HelpCircle size={18} className="text-amber-400" />
              <div>
                <h3 className="font-bold text-base text-white">Root Causes of Farmer Complaints</h3>
                <p className="text-xs text-slate-400">Why farmers marked answers as unhelpful (Step 2 WhatsApp Drill-Down)</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {rootCauses.length === 0 ? (
              <div className="text-slate-400 text-xs py-4 text-center">No negative feedback root causes reported yet.</div>
            ) : (
              rootCauses.map((rc, idx) => {
                const labelMap: Record<string, { hi: string; en: string }> = {
                  'UNCLEAR_DOSAGE': { hi: 'मात्रा स्पष्ट नहीं', en: 'Unclear Chemical Dosage / Dilution' },
                  'INCORRECT_CHEMICAL': { hi: 'दवा गलत बताई', en: 'Ineffective Active Ingredient' },
                  'NOT_APPLICABLE_STAGE': { hi: 'फसल की अवस्था अलग', en: 'Misaligned with Crop Growth Stage' },
                  'EXPENSIVE_ALTERNATIVE': { hi: 'दवा बहुत महंगी है', en: 'Costly / Needs Affordable Alternative' },
                  'WEATHER_MISMATCH': { hi: 'मौसम के अनुसार नहीं', en: 'Contradicts Rain/Frost Conditions' },
                  'TOO_TECHNICAL': { hi: 'भाषा बहुत कठिन है', en: 'Terminology Overly Technical' },
                  'MEDICINE_UNAVAILABLE_LOCALLY': { hi: 'स्थानीय दुकानों में दवा उपलब्ध नहीं है', en: 'Medicine Not Available in Local Shops' }
                };
                const labels = labelMap[rc.category] || { hi: rc.label, en: rc.label };
                return (
                  <div key={`${rc.label}-${idx}`} className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <div className="flex justify-between items-baseline mb-1">
                      <div>
                        <span className="font-semibold text-xs sm:text-sm text-slate-100">{labels.en}</span>
                        <span className="text-[11px] text-slate-400 ml-1.5 font-normal">({labels.hi})</span>
                      </div>
                      <span className="text-xs font-bold text-rose-400">
                        {rc.percentage.toFixed(1)}% <span className="text-slate-400 font-normal">({rc.count})</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-700"
                        style={{ width: `${Math.min(100, rc.percentage)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Regional Satisfaction Breakdown */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <MapPin size={18} className="text-sky-400" />
          <div>
            <h3 className="font-bold text-base text-white">Regional Farmer Satisfaction by State</h3>
            <p className="text-xs text-slate-400">Performance breakdown across agricultural clusters in North & Central India</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {states.map((st, idx) => {
            const isGood = st.helpful_percentage >= 70;
            return (
              <div
                key={`${st.state}-${idx}`}
                className="bg-white/5 border border-white/5 rounded-xl p-4 transition-all hover:bg-white/10"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm text-white">{st.state}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${isGood ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}>
                    {st.helpful_percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isGood ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, st.helpful_percentage)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2.5 text-[11px] text-slate-400">
                  <span>Feedbacks: {st.total}</span>
                  <span>👍 {st.upvotes} | 👎 {st.downvotes}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

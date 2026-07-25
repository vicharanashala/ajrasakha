import * as React from 'react';
import { useState, useEffect } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Layers,
  Globe,
  MapPin,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/atoms/button';

interface HelpfulnessRateSummary {
  key: string;
  label: string;
  totalRatings: number;
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulnessRatePct: number;
}

interface WeeklyDigestEntry {
  gdbEntryId: string;
  totalRatings: number;
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulnessRatePct: number;
  reReviewTriggered: boolean;
}

interface AnalyticsResponse {
  totalFeedbacks: number;
  overallHelpfulnessRatePct: number;
  byGdbEntry: HelpfulnessRateSummary[];
  byDomain: HelpfulnessRateSummary[];
  byLanguage: HelpfulnessRateSummary[];
  byState: HelpfulnessRateSummary[];
}

interface WeeklyDigestReport {
  weekStartDate: string;
  weekEndDate: string;
  totalFeedbacksCollected: number;
  overallHelpfulnessPct: number;
  lowPerformingEntries: WeeklyDigestEntry[];
  domainBreakdown: HelpfulnessRateSummary[];
}

export const FarmerHelpfulnessDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'analytics' | 're_review' | 'digest'>('analytics');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [digestData, setDigestData] = useState<WeeklyDigestReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDimension, setSelectedDimension] = useState<'gdb' | 'domain' | 'language' | 'state'>('domain');
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const API_PREFIX = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
      const [analyticsRes, digestRes] = await Promise.all([
        fetch(`${API_PREFIX}/feedback/analytics`).then(r => r.json()).catch(() => null),
        fetch(`${API_PREFIX}/feedback/weekly-digest`).then(r => r.json()).catch(() => null),
      ]);

      if (analyticsRes) setAnalyticsData(analyticsRes);
      if (digestRes) setDigestData(digestRes);
    } catch (error) {
      console.error('Error fetching farmer feedback dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleTriggerReReview = async (gdbEntryId: string) => {
    setTriggeringId(gdbEntryId);
    try {
      const API_PREFIX = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
      await fetch(`${API_PREFIX}/feedback/trigger-rereview/${gdbEntryId}`, { method: 'POST' });
      await fetchDashboardData();
    } catch (err) {
      console.error('Failed to trigger re-review:', err);
    } finally {
      setTriggeringId(null);
    }
  };

  const getDimensionList = (): HelpfulnessRateSummary[] => {
    if (!analyticsData) return [];
    switch (selectedDimension) {
      case 'gdb':
        return analyticsData.byGdbEntry || [];
      case 'domain':
        return analyticsData.byDomain || [];
      case 'language':
        return analyticsData.byLanguage || [];
      case 'state':
        return analyticsData.byState || [];
    }
  };

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-600 to-teal-700 p-6 rounded-3xl shadow-xl text-white">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-emerald-200" />
            Farmer Answer Feedback Loop (ACE)
          </h1>
          <p className="text-emerald-100 text-sm md:text-base mt-1">
            Real-time helpfulness telemetry collected directly from WhatsApp (Reply 1/2) & Web interactions.
          </p>
        </div>
        <Button
          onClick={fetchDashboardData}
          disabled={loading}
          className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/20 rounded-xl px-5 py-2.5 flex items-center gap-2 shadow-lg"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>

      {/* KPI Cards Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-bold text-slate-400">Total Feedbacks</p>
            <h3 className="text-3xl font-black mt-1 text-slate-800 dark:text-white">
              {analyticsData?.totalFeedbacks ?? 0}
            </h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-bold text-slate-400">Overall Helpfulness</p>
            <h3 className="text-3xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
              {analyticsData?.overallHelpfulnessRatePct ?? 0}%
            </h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <ThumbsUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-bold text-slate-400">Low-Performing GDBs</p>
            <h3 className="text-3xl font-black mt-1 text-amber-500 dark:text-amber-400">
              {digestData?.lowPerformingEntries?.length ?? 0}
            </h3>
          </div>
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 dark:text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-bold text-slate-400">Weekly Digest Window</p>
            <h3 className="text-lg font-bold mt-1 text-slate-700 dark:text-slate-200">
              {digestData?.weekStartDate ? `${digestData.weekStartDate}` : 'Last 7 Days'}
            </h3>
          </div>
          <div className="w-12 h-12 bg-purple-50 dark:bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Calendar className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Helpfulness Analytics
        </button>
        <button
          onClick={() => setActiveTab('re_review')}
          className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${
            activeTab === 're_review'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Re-Review Triggers
        </button>
        <button
          onClick={() => setActiveTab('digest')}
          className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 ${
            activeTab === 'digest'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Weekly Feedback Digest
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === 'analytics' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700/60 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Helpfulness Rates Breakdown</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Slice usefulness telemetry by GDB entry, agricultural domain, regional language, or state.
              </p>
            </div>

            {/* Dimension Switcher */}
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setSelectedDimension('domain')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedDimension === 'domain' ? 'bg-white dark:bg-slate-800 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Domain
              </button>
              <button
                onClick={() => setSelectedDimension('language')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedDimension === 'language' ? 'bg-white dark:bg-slate-800 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                }`}
              >
                <Globe className="w-3.5 h-3.5" /> Language
              </button>
              <button
                onClick={() => setSelectedDimension('state')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedDimension === 'state' ? 'bg-white dark:bg-slate-800 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" /> State
              </button>
              <button
                onClick={() => setSelectedDimension('gdb')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedDimension === 'gdb' ? 'bg-white dark:bg-slate-800 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                }`}
              >
                <Filter className="w-3.5 h-3.5" /> GDB Entry
              </button>
            </div>
          </div>

          {/* Dimension Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-400 font-bold">
                  <th className="py-3 px-4">Dimension Label</th>
                  <th className="py-3 px-4">Total Ratings</th>
                  <th className="py-3 px-4">Reply 1 (Helpful)</th>
                  <th className="py-3 px-4">Reply 2 (Not Helpful)</th>
                  <th className="py-3 px-4">Helpfulness Rate</th>
                  <th className="py-3 px-4">Visual Indicator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 text-sm">
                {getDimensionList().length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No feedback telemetry recorded for this dimension yet.
                    </td>
                  </tr>
                ) : (
                  getDimensionList().map(item => (
                    <tr key={item.key} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {item.label}
                      </td>
                      <td className="py-3.5 px-4 font-bold">{item.totalRatings}</td>
                      <td className="py-3.5 px-4 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                        <ThumbsUp className="w-4 h-4" /> {item.helpfulCount}
                      </td>
                      <td className="py-3.5 px-4 text-rose-500 font-semibold flex items-center gap-1.5">
                        <ThumbsDown className="w-4 h-4" /> {item.notHelpfulCount}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-extrabold px-2.5 py-1 rounded-full text-xs ${
                            item.helpfulnessRatePct >= 75
                              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : item.helpfulnessRatePct >= 50
                              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                              : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {item.helpfulnessRatePct}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 w-48">
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.helpfulnessRatePct >= 75
                                ? 'bg-emerald-500'
                                : item.helpfulnessRatePct >= 50
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${item.helpfulnessRatePct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 're_review' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700/60 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Automatic Re-Review Pipeline
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                GDB entries whose helpfulness drops below threshold or receive consecutive farmer negative feedback replies.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-xs uppercase text-slate-400 font-bold">
                  <th className="py-3 px-4">GDB Entry ID</th>
                  <th className="py-3 px-4">Total Responses</th>
                  <th className="py-3 px-4">Not Helpful Count</th>
                  <th className="py-3 px-4">Helpfulness Rate</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 text-sm">
                {!digestData?.lowPerformingEntries || digestData.lowPerformingEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      No low-performing GDB entries currently flagged for re-review. Excellent answer quality!
                    </td>
                  </tr>
                ) : (
                  digestData.lowPerformingEntries.map(entry => (
                    <tr key={entry.gdbEntryId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {entry.gdbEntryId}
                      </td>
                      <td className="py-3.5 px-4">{entry.totalRatings}</td>
                      <td className="py-3.5 px-4 text-rose-500 font-bold">{entry.notHelpfulCount}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {entry.helpfulnessRatePct}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-extrabold px-3 py-1 rounded-full">
                          FLAGGED FOR REVIEW
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTriggerReReview(entry.gdbEntryId)}
                          disabled={triggeringId === entry.gdbEntryId}
                          className="text-xs"
                        >
                          {triggeringId === entry.gdbEntryId ? 'Queueing...' : 'Re-queue Review'}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'digest' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700/60 shadow-sm space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-700 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">Weekly Agricultural Team Feedback Digest</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Summary generated for the agricultural expert team covering [{digestData?.weekStartDate || 'N/A'}] to [{digestData?.weekEndDate || 'N/A'}].
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
                Digest Highlights
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                During this period, farmers provided feedback on <strong className="text-slate-900 dark:text-white">{digestData?.totalFeedbacksCollected ?? 0}</strong> answers via WhatsApp and Web channels. The aggregate helpfulness rating stands at <strong className="text-emerald-600 dark:text-emerald-400">{digestData?.overallHelpfulnessPct ?? 0}%</strong>.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
                Domain Quality Summary
              </h3>
              <div className="space-y-2">
                {(digestData?.domainBreakdown || []).map(d => (
                  <div key={d.key} className="flex justify-between items-center text-sm">
                    <span className="font-medium">{d.label}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{d.helpfulnessRatePct}% helpful</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmerHelpfulnessDashboard;

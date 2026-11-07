import { useState } from 'react';
import type { FlaggedEntry, FlaggedConfig } from '../types';
import { api } from '../services/api';
import {
  AlertTriangle,
  Edit3,
  X,
  Save,
  CheckCircle2,
  RotateCw,
  ThumbsDown,
  Sparkles,
  Sliders,
  Clock,
  Bot
} from 'lucide-react';

interface FlaggedQueueViewProps {
  queue: FlaggedEntry[];
  total: number;
  config: FlaggedConfig | null;
  isLoading: boolean;
  onRefresh: () => void;
  onResolve: (
    gdbId: string,
    payload: {
      revised_answer_hi: string;
      revised_answer_en: string;
      reviewer_note: string;
      action?: string;
    }
  ) => Promise<boolean>;
  onUpdateConfig: (config: FlaggedConfig) => Promise<boolean>;
}

export const FlaggedQueueView: React.FC<FlaggedQueueViewProps> = ({
  queue,
  total: _total,
  config,
  isLoading,
  onRefresh,
  onResolve,
  onUpdateConfig,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedEntry, setSelectedEntry] = useState<FlaggedEntry | null>(null);

  // Resolution form state
  const [revisedHi, setRevisedHi] = useState('');
  const [revisedEn, setRevisedEn] = useState('');
  const [reviewerNote, setReviewerNote] = useState('');
  const [actionType, setActionType] = useState('REVISE_AND_REVALIDATE');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI Replacement state
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiMeta, setAiMeta] = useState<{
    model?: string;
    source?: string;
    word_count_hi?: number;
    word_count_en?: number;
  } | null>(null);

  const countWords = (text: string): number => {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const handleGenerateAiReplacement = async (targetEntry?: FlaggedEntry) => {
    const target = targetEntry || selectedEntry;
    if (!target) return;
    try {
      setIsAiGenerating(true);
      const res = await api.generateAiAnswer(target.gdb_id);
      if (res && res.answer_hi && res.answer_en) {
        setRevisedHi(res.answer_hi);
        setRevisedEn(res.answer_en);
        setReviewerNote(res.reviewer_note || 'Auto-generated suitable replacement via NVIDIA Build NIM AI (<100 words in Hindi & English) prior to retirement.');
        setAiMeta({
          model: res.model,
          source: res.source,
          word_count_hi: res.word_count_hi,
          word_count_en: res.word_count_en,
        });
      }
    } catch (err: any) {
      console.error('Failed to generate AI replacement:', err);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleActionChange = (newAction: string) => {
    setActionType(newAction);
    if (newAction === 'RETIRE' && selectedEntry) {
      handleGenerateAiReplacement(selectedEntry);
    }
  };

  // Config modal state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [thresholdInput, setThresholdInput] = useState<number>(config?.helpful_threshold ?? 0.6);
  const [minResponsesInput, setMinResponsesInput] = useState<number>(config?.min_responses ?? 10);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const handleOpenResolve = (entry: FlaggedEntry) => {
    setSelectedEntry(entry);
    setRevisedHi(entry.revised_answer_hi || entry.answer_hi || '');
    setRevisedEn(entry.revised_answer_en || entry.answer_en || '');
    setReviewerNote(entry.reviewer_note || '');
    setActionType('REVISE_AND_REVALIDATE');
    setAiMeta(null);
  };

  const handleCloseResolve = () => {
    setSelectedEntry(null);
    setAiMeta(null);
  };

  const handleSubmitResolution = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;
    setIsSubmitting(true);
    const success = await onResolve(selectedEntry.gdb_id, {
      revised_answer_hi: revisedHi,
      revised_answer_en: revisedEn,
      reviewer_note: reviewerNote,
      action: actionType
    });
    setIsSubmitting(false);
    if (success) {
      handleCloseResolve();
    }
  };

  const handleSaveConfig = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    const success = await onUpdateConfig({
      helpful_threshold: Number(thresholdInput),
      min_responses: Number(minResponsesInput)
    });
    setIsSavingConfig(false);
    if (success) {
      setShowConfigModal(false);
    }
  };

  const [isCronRunning, setIsCronRunning] = useState(false);
  const handleRunCronScan = async () => {
    try {
      setIsCronRunning(true);
      const res = await api.triggerCronNow();
      alert(`Daily Cron Scan Completed!\nScanned Entries: ${res.scanned_entries}\nNewly Flagged: ${res.newly_flagged_count}\nTotal Flagged: ${res.total_flagged_in_run}`);
      onRefresh();
    } catch (err: any) {
      alert(`Cron execution failed: ${err.message}`);
    } finally {
      setIsCronRunning(false);
    }
  };

  const isItemResolved = (item: FlaggedEntry): boolean => {
    if (item.is_resolved === true || item.flag_info?.is_resolved === true || item.flag_info?.resolved === true) return true;
    const status = (item.status || item.flag_info?.review_status || item.review_status || '').toUpperCase();
    return status === 'RE_VALIDATED' || status === 'RESOLVED' || status === 'RETIRED';
  };

  const isItemFlagged = (item: FlaggedEntry): boolean => {
    if (isItemResolved(item)) return false;
    const status = (item.status || item.flag_info?.review_status || item.review_status || '').toUpperCase();
    return (
      status === 'FLAGGED' ||
      status.startsWith('FLAGGED') ||
      status === 'PENDING_AGRI_REVIEW' ||
      status === 'PENDING_REVIEW' ||
      item.is_flagged === true
    );
  };

  const filteredQueue = queue.filter((item) => {
    const isResolved = isItemResolved(item);
    const isFlagged = isItemFlagged(item);

    if (filterStatus === 'RESOLVED') {
      return isResolved;
    }
    if (filterStatus === 'FLAGGED') {
      return isFlagged;
    }
    if (filterStatus === 'ALL') {
      return isResolved || isFlagged;
    }
    return isResolved || isFlagged;
  });

  const flaggedCount = queue.filter(isItemFlagged).length;
  const resolvedCount = queue.filter(isItemResolved).length;
  const allCount = queue.filter((item) => isItemFlagged(item) || isItemResolved(item)).length;

  return (
    <div>
      {/* Header bar */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5 mb-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border transition-all ${flaggedCount > 0
              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              }`}>
              {flaggedCount > 0 ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold font-['Outfit'] text-white">
                  Statistical Flagging Quality Pipeline
                </h2>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border transition-all ${flaggedCount > 0
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm animate-pulse'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}>
                  {flaggedCount} Unresolved
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Autonomous detection of unhelpful answers (&lt; {(config?.helpful_threshold ?? 0.6) * 100}% Helpful, N &ge; {config?.min_responses ?? 10}) • {flaggedCount} active unresolved ({resolvedCount} resolved)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
              {[
                { id: 'ALL', label: 'All', count: allCount },
                { id: 'FLAGGED', label: 'Flagged', count: flaggedCount },
                { id: 'RESOLVED', label: 'Resolved', count: resolvedCount }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${filterStatus === tab.id
                    ? tab.id === 'RESOLVED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                      : tab.id === 'FLAGGED'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                        : 'bg-white/15 text-white border border-white/20 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${filterStatus === tab.id ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-400'
                      }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <button
              className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium text-xs sm:text-sm px-3.5 py-2 rounded-lg border border-amber-500/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              onClick={handleRunCronScan}
              disabled={isCronRunning}
              title="APScheduler Daily Cron Job (Runs every day at 2:00 AM IST). Click to trigger quality scan immediately."
            >
              <Clock size={14} className={isCronRunning ? 'spin-anim' : ''} />
              <span>{isCronRunning ? 'Scanning...' : 'Daily Cron (2 AM IST)'}</span>
            </button>

            <button
              className="bg-white/5 hover:bg-white/10 text-white font-medium text-xs sm:text-sm px-3.5 py-2 rounded-lg border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
              onClick={() => {
                setThresholdInput(config?.helpful_threshold ?? 0.6);
                setMinResponsesInput(config?.min_responses ?? 10);
                setShowConfigModal(true);
              }}
              title="Configure Statistical Flagging Parameters"
            >
              <Sliders size={14} />
              <span>Thresholds</span>
            </button>

            <button
              className="bg-white/5 hover:bg-white/10 text-white font-medium text-xs sm:text-sm px-3.5 py-2 rounded-lg border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer"
              onClick={onRefresh}
              title="Refresh Flagged Queue"
            >
              <RotateCw size={14} className={isLoading ? 'spin-anim' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Queue items list */}
      {filteredQueue.length === 0 ? (
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-12 text-center">
          <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3 opacity-80" />
          <h3 className="text-lg font-bold text-white mb-1">
            {filterStatus === 'RESOLVED'
              ? 'No Resolved (RE_VALIDATED) Queries Found'
              : filterStatus === 'FLAGGED'
                ? 'No Currently Flagged Queries Found'
                : 'No Queries in this view'}
          </h3>
          <p className="text-slate-400 text-xs sm:text-sm">
            {filterStatus === 'RESOLVED'
              ? 'Resolved and re-validated queries will appear here once reviewed.'
              : 'All farmer queries are maintaining helpfulness metrics above the configured threshold.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredQueue.map((item) => {
            const isResolved = isItemResolved(item);
            const ratio = item.helpful_percentage ?? (item.helpful_ratio !== undefined ? item.helpful_ratio * 100 : 0);
            const flagReason = item.flag_info?.flag_reason || (item as any).flag_reason;

            return (
              <div
                key={item.gdb_id}
                className={`bg-slate-900/70 backdrop-blur-md border rounded-2xl p-5 transition-all ${isResolved
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-rose-500/30 bg-rose-500/5'
                  }`}
              >
                {/* Header row */}
                <div className="flex justify-between items-start flex-wrap gap-4 mb-3.5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-mono font-bold text-xs bg-white/10 text-white px-2 py-0.5 rounded">
                        {item.gdb_id}
                      </span>
                      <span className="text-xs font-semibold bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">
                        {item.crop}
                      </span>
                      <span className="text-xs bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded border border-sky-500/30">
                        {item.domain}
                      </span>
                      {item.primary_state && (
                        <span className="text-xs text-slate-400">
                          📍 {item.primary_state}
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${isResolved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          }`}
                      >
                        {isResolved ? 'RE_VALIDATED' : 'FLAGGED'}
                      </span>
                    </div>
                    {item.sub_domain && (
                      <div className="text-xs text-slate-300">
                        Topic: {item.sub_domain}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                    <div className="text-right">
                      <div className={`text-lg font-extrabold ${isResolved ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {ratio.toFixed(1)}% Helpful
                      </div>
                      <div className="text-[11px] text-slate-400">
                        👍 {item.upvotes} / 👎 {item.downvotes} ({item.total_responses} votes)
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${isResolved
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                    >
                      {isResolved ? (
                        <>
                          <CheckCircle2 size={13} className="text-emerald-400" />
                          <span>RE_VALIDATED</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={13} className="text-rose-400" />
                          <span>FLAGGED</span>
                        </>
                      )}
                    </span>

                    <button
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                      onClick={() => handleOpenResolve(item)}
                    >
                      <Edit3 size={13} />
                      <span>{isResolved ? 'Edit Resolution' : 'Review & Revise'}</span>
                    </button>
                  </div>
                </div>

                {/* Status banner */}
                {!isResolved && flagReason && (
                  <div className="mb-3 text-xs text-rose-300 flex items-center gap-1.5 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20">
                    <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                    <span>{flagReason}</span>
                  </div>
                )}
                {isResolved && (
                  <div className="mb-3 text-xs text-emerald-300 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                    <span>Quality issue resolved and re-validated in Knowledge Base</span>
                    {(item.resolved_at || item.flag_info?.resolved_at) && (
                      <span className="text-emerald-400/70 text-[11px] ml-auto">
                        Resolved: {new Date(item.resolved_at || item.flag_info?.resolved_at || '').toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Root cause feedback chips (only shown when currently flagged) */}
                {!isResolved && (() => {
                  const rc = item.flag_info?.root_cause_breakdown || item.root_cause_breakdown;
                  if (!rc || Object.keys(rc).length === 0) return null;
                  return (
                    <div className="mb-3.5 bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <span className="text-xs font-semibold text-amber-400 mr-2 inline-flex items-center gap-1">
                        <ThumbsDown size={11} /> Farmer Complaints:
                      </span>
                      <div className="inline-flex flex-wrap gap-1.5 mt-1">
                        {Object.entries(rc).map(([cause, count]) => (
                          <span
                            key={cause}
                            className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-semibold"
                          >
                            {cause}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Side-by-side Questions and Answers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-2">
                  {/* Hindi Content */}
                  <div className="bg-white/5 p-3.5 rounded-xl border border-white/5">
                    <div className="text-xs font-bold text-sky-400 mb-1">
                      🇮🇳 किसान का प्रश्न (Hindi)
                    </div>
                    <div className="text-sm font-semibold text-white mb-2.5">
                      {item.question_hi}
                    </div>

                    <div className="text-xs font-bold text-slate-400 mb-1">
                      मौजूदा उत्तर (Current GDB Answer):
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed">
                      {item.answer_hi}
                    </div>

                    {item.revised_answer_hi && (
                      <div className="mt-2.5 pt-2.5 border-t border-white/10">
                        <div className="text-xs font-bold text-emerald-400 mb-1">
                          ✓ संशोधित उत्तर (Expert Revised):
                        </div>
                        <div className="text-xs text-emerald-300">
                          {item.revised_answer_hi}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* English Content */}
                  <div className="bg-white/5 p-3.5 rounded-xl border border-white/5">
                    <div className="text-xs font-bold text-sky-400 mb-1">
                      🌐 Farmer Question (English)
                    </div>
                    <div className="text-sm font-semibold text-white mb-2.5">
                      {item.question_en}
                    </div>

                    <div className="text-xs font-bold text-slate-400 mb-1">
                      Current GDB Answer:
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed">
                      {item.answer_en}
                    </div>

                    {item.revised_answer_en && (
                      <div className="mt-2.5 pt-2.5 border-t border-white/10">
                        <div className="text-xs font-bold text-emerald-400 mb-1">
                          ✓ Revised Answer (Expert Verified):
                        </div>
                        <div className="text-xs text-emerald-300">
                          {item.revised_answer_en}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {item.reviewer_note && (
                  <div className="mt-3 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg">
                    <strong>Agronomist Note:</strong> {item.reviewer_note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Resolution Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 modal-fade-in">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 modal-scale-up">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-emerald-400" />
                <h3 className="text-base sm:text-lg font-bold font-['Outfit'] text-white">
                  Agronomist Quality Resolution: {selectedEntry.gdb_id}
                </h3>
              </div>
              <button
                onClick={handleCloseResolve}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitResolution}>
              <div className="bg-white/5 p-3 rounded-xl mb-4 text-xs">
                <div className="text-slate-400">
                  <strong className="text-slate-200">Crop:</strong> {selectedEntry.crop} | <strong className="text-slate-200">Domain:</strong> {selectedEntry.domain}
                </div>
                <div className="text-white mt-1">
                  <strong className="text-slate-200">Question:</strong> {selectedEntry.question_hi}
                </div>
              </div>

              {/* Action selection upfront */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Pipeline Action
                </label>
                <select
                  className="w-full bg-slate-950 border border-white/15 rounded-xl p-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={actionType}
                  onChange={(e) => handleActionChange(e.target.value)}
                >
                  <option value="REVISE_AND_REVALIDATE">Revise Answer & Keep Active in GDB (Recommended)</option>
                  <option value="RETIRE">Retire Answer & Auto-Generate AI Replacement (NVIDIA NIM)</option>
                </select>
              </div>

              {/* NVIDIA AI Generation Banner when RETIRE is selected */}
              {actionType === 'RETIRE' && (
                <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900/80 to-cyan-950/40 border border-emerald-500/30 rounded-xl p-3.5 mb-4 shadow-lg shadow-emerald-950/30">
                  <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <Bot size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white font-['Outfit']">
                            NVIDIA Build NIM AI Integration
                          </span>
                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                            {aiMeta?.model || 'meta/llama-3.1-70b-instruct'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleGenerateAiReplacement()}
                      disabled={isAiGenerating}
                      className="text-xs flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RotateCw size={12} className={isAiGenerating ? 'animate-spin' : ''} />
                      <span>{isAiGenerating ? 'Generating with AI...' : 'Regenerate with NVIDIA AI'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {isAiGenerating
                      ? 'Querying NVIDIA Build NIM API for an optimal, verified agronomic answer (<100 words in Hindi and English)...'
                      : 'Retiring this entry triggers NVIDIA Build AI to generate a scientifically suitable answer (<100 words in Hindi & English) that will be preserved in the knowledge base.'}
                  </p>
                </div>
              )}

              {/* Revised Hindi */}
              <div className="mb-3.5">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-sky-400">
                    संशोधित उत्तर (Revised Answer in Hindi) *
                  </label>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-all ${
                      countWords(revisedHi) <= 100
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                        : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    {countWords(revisedHi)} / 100 words (Max 100)
                  </span>
                </div>
                <textarea
                  className="w-full bg-slate-950 border border-white/15 rounded-xl p-3 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 min-h-[75px]"
                  value={revisedHi}
                  onChange={(e) => setRevisedHi(e.target.value)}
                  placeholder="स्पष्ट मात्रा, दवा का नाम, और छिड़काव का सही तरीका लिखें..."
                  required
                />
              </div>

              {/* Revised English */}
              <div className="mb-3.5">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-sky-400">
                    Revised Answer in English *
                  </label>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-all ${
                      countWords(revisedEn) <= 100
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                        : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    {countWords(revisedEn)} / 100 words (Max 100)
                  </span>
                </div>
                <textarea
                  className="w-full bg-slate-950 border border-white/15 rounded-xl p-3 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 min-h-[75px]"
                  value={revisedEn}
                  onChange={(e) => setRevisedEn(e.target.value)}
                  placeholder="Provide precise chemical formulation, dosage per acre/liter, and precautions..."
                  required
                />
              </div>

              {/* Reviewer Note */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Reviewer Note & Justification
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-white/15 rounded-xl p-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={reviewerNote}
                  onChange={(e) => setReviewerNote(e.target.value)}
                  placeholder="e.g. Corrected active ingredient from 60ml to 50g WP, added water dilution ratio"
                  required
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  className="bg-white/5 hover:bg-white/10 text-white font-medium text-xs sm:text-sm px-4 py-2 rounded-lg border border-white/10 transition-all cursor-pointer"
                  onClick={handleCloseResolve}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50 ${
                    actionType === 'RETIRE'
                      ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                  }`}
                  disabled={isSubmitting || isAiGenerating}
                >
                  <Save size={15} />
                  <span>
                    {isSubmitting
                      ? actionType === 'RETIRE'
                        ? 'Retiring & Saving AI Answer...'
                        : 'Saving...'
                      : actionType === 'RETIRE'
                      ? 'Commit Retirement & Save AI Answer'
                      : 'Commit Resolution & Update GDB'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Threshold Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 modal-fade-in">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-md w-full shadow-2xl p-6 modal-scale-up">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-emerald-400" />
                <h3 className="text-base sm:text-lg font-bold font-['Outfit'] text-white">
                  Statistical Flagging Parameters
                </h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveConfig}>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Helpfulness Threshold (0.1 to 0.95)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="0.95"
                  className="w-full bg-slate-950 border border-white/15 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(parseFloat(e.target.value))}
                  required
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Current setting: {(thresholdInput * 100).toFixed(0)}%. Any query dropping below this is auto-flagged.
                </span>
              </div>

              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Minimum Responses (N)
                </label>
                <input
                  type="number"
                  min="3"
                  max="100"
                  className="w-full bg-slate-950 border border-white/15 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  value={minResponsesInput}
                  onChange={(e) => setMinResponsesInput(parseInt(e.target.value, 10))}
                  required
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Guarantees statistical significance before flagging false positives.
                </span>
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  className="bg-white/5 hover:bg-white/10 text-white font-medium text-xs sm:text-sm px-4 py-2 rounded-lg border border-white/10 transition-all cursor-pointer"
                  onClick={() => setShowConfigModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer disabled:opacity-50"
                  disabled={isSavingConfig}
                >
                  <Save size={15} />
                  <span>{isSavingConfig ? 'Saving...' : 'Update Settings'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

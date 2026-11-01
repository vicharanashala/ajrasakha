import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { GdbEntry } from '../types';
import { 
  Search, 
  BookOpen, 
  ThumbsUp, 
  ThumbsDown, 
  RotateCw,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

import { BackendOfflineError } from './BackendOfflineError';

export const GdbCatalogView: React.FC = () => {
  const [entries, setEntries] = useState<GdbEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [crop, setCrop] = useState('ALL');
  const [domain, setDomain] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [flagFilter, setFlagFilter] = useState<'ALL' | 'FLAGGED' | 'NORMAL'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadEntries = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await api.getGdbEntries({
        crop: crop !== 'ALL' ? crop : undefined,
        domain: domain !== 'ALL' ? domain : undefined,
        status: status !== 'ALL' ? status : undefined,
        is_flagged: flagFilter === 'FLAGGED' ? true : flagFilter === 'NORMAL' ? false : undefined,
        search: search.trim() ? search : undefined,
        limit: 50
      });
      setEntries(res.entries || []);
      setTotal(res.total || 0);
    } catch (e) {
      console.error(e);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, [crop, domain, status, flagFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadEntries();
  };

  if (hasError && entries.length === 0) {
    return (
      <BackendOfflineError 
        title="Knowledge Base (GDB) Offline"
        message="Unable to connect to the backend server to retrieve Golden Database agronomic entries."
        onRetry={loadEntries}
      />
    );
  }

  return (
    <div>
      {/* Search & Filters */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-5 mb-6">
        <form onSubmit={handleSearchSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.2fr_1fr_1fr_auto] gap-3 items-center">
            {/* Search text */}
            <div className="relative">
              <input
                type="text"
                className="w-full bg-slate-950 border border-white/15 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                placeholder="Search crop, pest, Hindi or English query..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Crop filter */}
            <select
              className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
            >
              <option value="ALL">All Crops</option>
              <option value="Wheat">Wheat (गेहूँ)</option>
              <option value="Paddy">Paddy (धान)</option>
              <option value="Mustard">Mustard (सरसों)</option>
              <option value="Cotton">Cotton (कपास)</option>
              <option value="Sugarcane">Sugarcane (गन्ना)</option>
            </select>

            {/* Domain filter */}
            <select
              className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            >
              <option value="ALL">All Domains</option>
              <option value="Pest & Disease Management">Pest & Disease Management</option>
              <option value="Nutrient & Fertilizer Management">Nutrient & Fertilizer</option>
              <option value="Irrigation Scheduling">Irrigation Scheduling</option>
              <option value="Weed Management">Weed Management</option>
            </select>

            {/* Status filter */}
            <select
              className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="FLAGGED_REVIEW">FLAGGED_REVIEW</option>
              <option value="RE_VALIDATED">RE_VALIDATED</option>
            </select>

            {/* Flag filter */}
            <select
              className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              value={flagFilter}
              onChange={(e) => setFlagFilter(e.target.value as any)}
            >
              <option value="ALL">All Entries</option>
              <option value="FLAGGED">⚠️ Flagged Only</option>
              <option value="NORMAL">✓ Non-Flagged Only</option>
            </select>

            <button 
              type="submit" 
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer h-full"
            >
              <Search size={14} />
              <span>Search</span>
            </button>
          </div>
        </form>

        <div className="flex justify-between items-center mt-4 pt-3.5 border-t border-white/10 text-xs text-slate-400">
          <span>Showing {entries.length} of {total} Knowledge Base records</span>
          <button 
            onClick={loadEntries} 
            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 cursor-pointer font-medium"
          >
            <RotateCw size={13} className={isLoading ? 'spin-anim' : ''} />
            <span>Refresh Catalog</span>
          </button>
        </div>
      </div>

      {/* Catalog Cards */}
      {entries.length === 0 ? (
        <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-12 text-center">
          <BookOpen size={48} className="text-slate-400 mx-auto mb-3 opacity-50" />
          <h3 className="text-base sm:text-lg font-bold text-white mb-1">No Knowledge Base Entries Found</h3>
          <p className="text-slate-400 text-xs sm:text-sm">
            Try adjusting your search criteria or resetting filters to ALL.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((item) => {
            const isFlagged = item.is_flagged || item.status === 'FLAGGED_REVIEW';
            const totalVotes = (item.upvotes || 0) + (item.downvotes || 0);
            const helpfulPct = totalVotes > 0 ? ((item.upvotes || 0) / totalVotes) * 100 : 0;

            return (
              <div 
                key={item._id}
                className={`bg-slate-900/70 backdrop-blur-md border rounded-2xl p-5 ${
                  isFlagged 
                    ? 'border-rose-500/30 bg-rose-500/5' 
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* Meta header */}
                <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs bg-white/10 text-white px-2 py-0.5 rounded">
                      {item._id}
                    </span>
                    <span className="text-xs font-semibold bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">
                      {item.crop}
                    </span>
                    <span className="text-xs bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded border border-sky-500/30">
                      {item.domain}
                    </span>
                    {item.sub_domain && (
                      <span className="text-xs text-slate-400">
                        • {item.sub_domain}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3.5 flex-wrap">
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className="text-emerald-400 flex items-center gap-1 font-medium">
                        <ThumbsUp size={12} /> {item.upvotes || 0}
                      </span>
                      <span className="text-rose-400 flex items-center gap-1 font-medium">
                        <ThumbsDown size={12} /> {item.downvotes || 0}
                      </span>
                      <span className={`font-bold px-2 py-0.5 rounded ${
                        helpfulPct >= 60 
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {helpfulPct.toFixed(1)}% Helpful
                      </span>
                    </div>

                    {isFlagged ? (
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-rose-500/20 text-rose-300 border-rose-500/40 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        <span>FLAGGED</span>
                      </span>
                    ) : (
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        <span>{item.status}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Flag Info Banner if item is flagged */}
                {isFlagged && item.flag_info && (
                  <div className="mb-3.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                      <span className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                        <span>Flag Reason: {item.flag_info.flag_reason || 'Helpfulness below threshold'}</span>
                      </span>
                      {item.flag_info.review_status && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Status: {item.flag_info.review_status}
                        </span>
                      )}
                    </div>
                    {item.flag_info.primary_negative_state && (
                      <div className="text-slate-400 text-[11px] mb-1">
                        Primary affected state: {item.flag_info.primary_negative_state}
                      </div>
                    )}
                    {item.flag_info.reviewer_note && (
                      <div className="text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg mt-1.5">
                        <strong>Reviewer Note:</strong> {item.flag_info.reviewer_note}
                      </div>
                    )}
                  </div>
                )}

                {/* Content grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Hindi Q&A */}
                  <div className="bg-white/5 p-3.5 rounded-xl border border-white/5">
                    <div className="text-xs font-bold text-sky-400 mb-1">
                      🇮🇳 प्रश्न (Hindi):
                    </div>
                    <div className="text-sm font-semibold text-white mb-2">
                      {item.question_hi}
                    </div>

                    <div className="text-xs font-bold text-slate-400 mb-1">
                      उत्तर (Hindi Answer):
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed">
                      {item.answer_hi}
                    </div>
                  </div>

                  {/* English Q&A */}
                  <div className="bg-white/5 p-3.5 rounded-xl border border-white/5">
                    <div className="text-xs font-bold text-sky-400 mb-1">
                      🌐 Question (English):
                    </div>
                    <div className="text-sm font-semibold text-white mb-2">
                      {item.question_en}
                    </div>

                    <div className="text-xs font-bold text-slate-400 mb-1">
                      Answer (English):
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed">
                      {item.answer_en}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

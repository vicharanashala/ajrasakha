import React from 'react';
import { WifiOff, RotateCw, Terminal, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface BackendOfflineErrorProps {
  onRetry?: () => void;
  title?: string;
  message?: string;
}

export const BackendOfflineError: React.FC<BackendOfflineErrorProps> = ({
  onRetry,
  title = "Backend Service Unavailable",
  message = "Could not establish connection to the FastAPI backend at http://localhost:8000."
}) => {
  const { refreshAll, isRefreshing } = useAppContext();

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      refreshAll();
    }
  };

  return (
    <div className="bg-slate-900/85 backdrop-blur-xl border border-rose-500/30 rounded-3xl p-6 sm:p-10 max-w-2xl mx-auto my-8 shadow-2xl shadow-rose-950/40 text-center modal-fade-in">
      {/* Icon with animated glow */}
      <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto mb-5 text-rose-400 shadow-lg shadow-rose-500/20">
        <WifiOff size={32} />
      </div>

      <span className="text-[11px] font-extrabold uppercase tracking-widest bg-rose-500/20 text-rose-400 border border-rose-500/30 px-3 py-1 rounded-full">
        Connection Offline
      </span>

      <h2 className="text-xl sm:text-2xl font-extrabold font-['Outfit'] text-white mt-3 mb-2">
        {title}
      </h2>

      <p className="text-sm text-slate-300 max-w-lg mx-auto mb-6 leading-relaxed">
        {message} Please ensure the backend server and local MongoDB database are running.
      </p>

      {/* Terminal Command Instructions */}
      <div className="bg-slate-950/90 border border-white/10 rounded-2xl p-4 sm:p-5 text-left mb-6 font-mono text-xs shadow-inner">
        <div className="flex items-center gap-2 text-slate-400 text-[11px] mb-2 font-semibold">
          <Terminal size={14} className="text-emerald-400" />
          <span>Start backend using UV (in workspace root):</span>
        </div>
        <div className="bg-black/50 p-2.5 rounded-lg text-emerald-400 flex items-center justify-between select-all border border-emerald-500/20">
          <code>uv run python run_backend.py</code>
        </div>

        <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-sky-400 shrink-0" />
          <span>MongoDB must also be active at <code>mongodb://localhost:27017</code></span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={handleRetry}
          disabled={isRefreshing}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RotateCw size={15} className={isRefreshing ? 'spin-anim' : ''} />
          <span>{isRefreshing ? 'Checking Connection...' : 'Retry Connection'}</span>
        </button>

        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noreferrer"
          className="bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium text-xs sm:text-sm px-4 py-2.5 rounded-xl border border-white/10 transition-all flex items-center gap-1.5"
        >
          <span>Open Swagger Docs</span>
          <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
};

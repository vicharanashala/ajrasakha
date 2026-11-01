import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  AlertTriangle,
  MessageSquare,
  BookOpen,
  FileText,
  CloudRain,
  RotateCw
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export function Header({ version = 'v2.0' }: { version?: string }) {
  const { isOnline, unresolvedFlaggedCount, refreshAll, isRefreshing } = useAppContext();

  const tabs = [
    { path: '/', label: 'Executive Analytics', icon: BarChart3, end: true },
    { path: '/flagged', label: 'Flagged Queue', icon: AlertTriangle, badge: unresolvedFlaggedCount > 0 ? unresolvedFlaggedCount : undefined },
    { path: '/whatsapp', label: 'Twilio WhatsApp', icon: MessageSquare },
    { path: '/gdb', label: 'GDB Knowledge Catalog', icon: BookOpen },
    { path: '/digest', label: 'Weekly Agri Digest', icon: FileText },
    { path: '/weather', label: 'IMD Weather Advisory', icon: CloudRain },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <NavLink to="/" className="flex items-center gap-3 no-underline group">
          <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 text-xl transition-transform group-hover:scale-105">
            🌱
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-bold font-['Outfit'] bg-gradient-to-r from-white to-emerald-200 bg-clip-text text-transparent">
                AjraSakha Agri-Intel
              </span>
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                {version}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-medium tracking-wide uppercase hidden sm:block">
              Farmer Feedback Loop & Autonomous Quality Pipeline (ANNAM.AI / IIT Ropar)
            </div>
          </div>
        </NavLink>

        {/* Status & Actions */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-slate-900/60 shadow-sm">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_#10b981] pulse-dot-online' : 'bg-rose-500 shadow-[0_0_8px_#ef4444]'}`} />
            <span className={isOnline ? 'text-emerald-400' : 'text-rose-400'}>
              {isOnline ? 'Backend Online (Port 8000)' : 'Connecting Backend...'}
            </span>
          </div>

          <button
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer disabled:opacity-50"
            onClick={refreshAll}
            title="Refresh All Data"
            disabled={isRefreshing}
          >
            <RotateCw size={16} className={isRefreshing ? 'spin-anim' : ''} />
          </button>
        </div>
      </div>

      {/* Nav Tabs */}
      <nav className="max-w-7xl mx-auto mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-all ${isActive
                  ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`
              }
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  {tab.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}

export default Header;

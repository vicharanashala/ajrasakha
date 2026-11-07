import { Link } from 'react-router-dom';
import { 
  Compass, 
  ArrowLeft, 
  BarChart3, 
  AlertTriangle, 
  MessageSquare, 
  Database, 
  FileText, 
  CloudSun 
} from 'lucide-react';

export function NotFoundPage() {
  const quickLinks = [
    {
      title: 'Executive Analytics',
      path: '/',
      icon: BarChart3,
      desc: 'Real-time telemetry, domain distribution, and root cause heatmaps.',
      color: 'emerald'
    },
    {
      title: 'Flagged Queue',
      path: '/flagged',
      icon: AlertTriangle,
      desc: 'Expert agronomic review & low-confidence answer revalidation.',
      color: 'amber'
    },
    {
      title: 'WhatsApp Simulator',
      path: '/whatsapp',
      icon: MessageSquare,
      desc: 'Interactive 2-turn farmer dialogue & audio voice note testing.',
      color: 'teal'
    },
    {
      title: 'Knowledge Base (GDB)',
      path: '/gdb',
      icon: Database,
      desc: 'Golden agronomic database catalog and approved recommendations.',
      color: 'blue'
    },
    {
      title: 'Weekly Digest',
      path: '/digest',
      icon: FileText,
      desc: 'Executive summaries, weekly trends, and actionable item reports.',
      color: 'indigo'
    },
    {
      title: 'Weather & Crop Advisory',
      path: '/weather',
      icon: CloudSun,
      desc: 'Regional agro-climatic alerts and crop spray-irrigation windows.',
      color: 'amber'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
      <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-3xl p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center justify-center p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 mb-6 shadow-inner">
          <Compass size={42} className="animate-spin-slow" />
        </div>

        <div className="inline-block px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-semibold text-rose-300 uppercase tracking-widest mb-3">
          Error 404 • Destination Not Found
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold font-['Outfit'] text-white tracking-tight mb-3">
          Agro-Intelligence Route Not Found
        </h1>

        <p className="text-slate-300 text-sm sm:text-base max-w-lg mx-auto mb-8 leading-relaxed">
          The requested route or agronomic report does not exist in the AjraSakha feedback dashboard. Choose a valid module below or return to the overview.
        </p>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-left mb-8">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className="group p-4 bg-slate-950/70 hover:bg-slate-950/90 border border-white/10 hover:border-emerald-500/50 rounded-2xl transition-all duration-200 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="p-2 rounded-xl bg-white/5 group-hover:bg-emerald-500/10 text-emerald-400 group-hover:text-emerald-300 transition-colors">
                      <Icon size={18} />
                    </div>
                    <span className="font-semibold text-sm text-slate-100 group-hover:text-emerald-400 transition-colors">
                      {item.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 group-hover:text-slate-300 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-medium text-emerald-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>Navigate to {item.title}</span> &rarr;
                </div>
              </Link>
            );
          })}
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-600/30"
        >
          <ArrowLeft size={16} />
          <span>Return to Executive Analytics</span>
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;

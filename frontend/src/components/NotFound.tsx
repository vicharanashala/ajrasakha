import React, { useEffect, useState } from "react";
import {
  Home,
  Tractor,
  Compass,
  ShieldAlert,
} from "lucide-react";

export const NotFound = () => {
  const [timestamp, setTimestamp] = useState(new Date().toISOString());

  useEffect(() => {
    const timer = setInterval(
      () => setTimestamp(new Date().toISOString()),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-center overflow-hidden transition-colors duration-500 relative font-sans">
      
      {/* 1. Global System Animations */}
      <style>{`
        @keyframes scan-y { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
        @keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 0.5; } 100% { transform: scale(2); opacity: 0; } }
        .animate-scan-y { animation: scan-y 8s linear infinite; }
        .animate-ring { animation: pulse-ring 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .animate-spin-slow { animation: spin 6s linear infinite; }
      `}</style>

      {/* 2. Background Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] opacity-40" />
        <div className="absolute w-full h-1/2 bg-gradient-to-b from-primary/10 to-transparent animate-scan-y" />
      </div>

      {/* 3. Main Visual: Responsive Scaling */}
      <div className="relative mb-6 sm:mb-10 z-10 transform scale-90 sm:scale-100">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full border border-primary/20 animate-ring" />
          <div className="w-48 h-48 rounded-full border border-primary/10 animate-ring [animation-delay:1s]" />
        </div>
        <div className="relative p-6 sm:p-8 bg-background/50 backdrop-blur-md rounded-full border border-primary/10 shadow-xl">
          <Tractor className="w-24 h-24 sm:w-32 sm:h-32 text-primary" strokeWidth={0.75} />
        </div>
        <div className="absolute top-1/2 -right-2 sm:-right-10 flex items-center gap-2 text-destructive animate-pulse bg-background/80 px-2 py-1 border border-destructive/20 rounded-sm">
          <ShieldAlert size={16} />
          <span className="text-[10px] font-black uppercase tracking-widest">
            Signal Lost
          </span>
        </div>
      </div>

      {/* 4. Typography Section */}
      <div className="space-y-4 z-20 w-full max-w-2xl">
        <div className="relative">
          <h1 className="text-8xl sm:text-[14rem] font-black leading-none text-primary/20 select-none">
            404
          </h1>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <h2 className="text-2xl sm:text-5xl font-black text-foreground tracking-tight">
              AREA UNSURVEYED
            </h2>
            <div className="h-1 w-32 sm:w-48 bg-primary mt-2 flex justify-between">
              <div className="w-2 h-full bg-background" />
              <div className="w-2 h-full bg-background" />
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto p-4 border border-primary/10 bg-primary/5 rounded-sm backdrop-blur-sm">
          <p className="text-xs sm:text-sm text-muted-foreground font-mono leading-relaxed uppercase tracking-tight">
            Formal Incident Report: The requested page could not be located in
            the reviewer system.
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground font-mono leading-relaxed uppercase tracking-tight mt-2 opacity-70">
            Advisory: Please verify your link or return to the main dashboard to
            continue reviewing.
          </p>
        </div>
      </div>

      {/* 5. Action Command Center: Visually Balanced & Responsive */}
      <div className="mt-10 sm:mt-14 flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-lg relative z-30 px-4">
        <a
          href="/"
          className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-primary text-primary-foreground font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] transition-all hover:opacity-90 active:scale-[0.98] border border-primary/20 rounded-sm shadow-lg"
        >
          <Home size={18} />
          Main Dashboard
        </a>

        <button
          onClick={() => window.history.back()}
          className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-slate-900 text-white font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] transition-all hover:bg-slate-800 active:scale-[0.98] border border-white/10 rounded-sm shadow-lg"
        >
          <Compass size={18} className="animate-spin-slow" />
          Retrace Page
        </button>
      </div>

      {/* 6. Bottom Dashboard Decoration */}
      <div className="absolute bottom-0 w-full flex flex-col items-center pointer-events-none opacity-20">
        <div className="flex items-end gap-[2px]">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="w-[2px] sm:w-[3px] bg-primary"
              style={{
                height: `${Math.sin(i * 0.8) * 15 + 30}px`,
                opacity: Math.random() * 0.5 + 0.5,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
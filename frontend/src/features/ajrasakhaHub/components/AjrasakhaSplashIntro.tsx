import React, { useEffect, useState } from "react";
import { Sprout, Sparkles, ShieldCheck, Cpu } from "lucide-react";

interface Props {
  onComplete: () => void;
}

export const AjrasakhaSplashIntro: React.FC<Props> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsFadingOut(true);
            setTimeout(onComplete, 500);
          }, 300);
          return 100;
        }
        return prev + 5;
      });
    }, 90);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 text-white transition-opacity duration-500 ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Background ambient glowing orbs */}
      <div className="absolute w-96 h-96 bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute w-72 h-72 bg-teal-500/10 rounded-full blur-[90px] pointer-events-none" />

      <div className="relative flex flex-col items-center z-10 space-y-6 max-w-md px-6 text-center">
        {/* Animated Sprout Logo */}
        <div className="relative flex items-center justify-center">
          {/* Pulsing rings */}
          <div className="absolute w-28 h-28 rounded-3xl border border-emerald-500/30 animate-ping opacity-30" />
          <div className="absolute w-36 h-36 rounded-full border border-teal-500/20 animate-spin opacity-40 duration-1000" />

          {/* Central Logo Box */}
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 via-emerald-600 to-teal-900 border-2 border-emerald-300/60 flex items-center justify-center text-white shadow-[0_0_50px_rgba(16,185,129,0.5)] transform hover:scale-105 transition-all duration-300">
            <Sprout className="w-11 h-11 text-emerald-50 animate-bounce" />
          </div>
        </div>

        {/* Brand Titles */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              Ajrasakha <span className="text-emerald-400 font-bold">(अज्रसखा)</span>
            </h1>
          </div>
          <p className="text-sm font-medium text-emerald-300/90 tracking-wide">
            The Farmer's AI Companion • राष्ट्रीय कृषि साथी
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Real-Time Crop Disease Vision AI • Smart Agro-Weather • Mandi Bhav • Continuous Feedback
          </p>
        </div>

        {/* Loading Bar */}
        <div className="w-64 space-y-2 pt-2">
          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 rounded-full transition-all duration-100 shadow-[0_0_10px_#10b981]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Initializing AI Models...</span>
            <span className="text-emerald-400 font-bold">{progress}%</span>
          </div>
        </div>

        {/* Quick Skip Button */}
        <button
          onClick={onComplete}
          className="text-xs text-slate-500 hover:text-emerald-400 underline underline-offset-4 transition-colors pt-2 cursor-pointer"
        >
          Skip Intro →
        </button>
      </div>
    </div>
  );
};

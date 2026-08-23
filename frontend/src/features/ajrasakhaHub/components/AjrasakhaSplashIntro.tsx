import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sprout, Sparkles, ShieldCheck, Zap, Wheat } from "lucide-react";

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
            setTimeout(onComplete, 600);
          }, 400);
          return 100;
        }
        return prev + 4;
      });
    }, 70);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 text-white overflow-hidden select-none transition-opacity duration-600 ${
        isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* ─────────────────────────────────────────────────────────────
          1. Ambient Glowing Lights & Sky Atmosphere
          ───────────────────────────────────────────────────────────── */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-emerald-500/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[600px] h-[500px] bg-teal-600/15 rounded-full blur-[160px] pointer-events-none" />

      {/* Star / Firefly Particle Dots */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-amber-300/40"
            style={{
              width: `${2 + (i % 3) * 1.5}px`,
              height: `${2 + (i % 3) * 1.5}px`,
              left: `${8 + (i * 8.5) % 88}%`,
              top: `${12 + (i * 13) % 65}%`,
            }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
              scale: [0.8, 1.3, 0.8],
            }}
            transition={{
              duration: 2.5 + (i % 3),
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.3,
            }}
          />
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. Rolling Farm Landscape & Windmills in Background
          ───────────────────────────────────────────────────────────── */}
      {/* Distant Hills */}
      <svg
        className="absolute bottom-14 md:bottom-20 left-0 w-full h-36 md:h-48 text-emerald-950/60 pointer-events-none"
        viewBox="0 0 1440 320"
        fill="currentColor"
        preserveAspectRatio="none"
      >
        <path d="M0,160L60,149.3C120,139,240,117,360,128C480,139,600,181,720,186.7C840,192,960,160,1080,144C1200,128,1320,128,1380,128L1440,128L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
      </svg>

      {/* Middle Ground Farm Fields Wave */}
      <svg
        className="absolute bottom-10 md:bottom-16 left-0 w-full h-28 md:h-36 text-slate-900/90 pointer-events-none"
        viewBox="0 0 1440 320"
        fill="currentColor"
        preserveAspectRatio="none"
      >
        <path d="M0,224L48,208C96,192,192,160,288,160C384,160,480,192,576,202.7C672,213,768,203,864,186.7C960,171,1056,149,1152,154.7C1248,160,1344,192,1392,208L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
      </svg>

      {/* Foreground Soil & Road Stripe */}
      <div className="absolute bottom-0 left-0 right-0 h-14 md:h-18 bg-gradient-to-t from-[#0a0f0a] via-[#101c12] to-transparent border-t border-emerald-500/20" />

      {/* Moving Farm Field Furrows / Ground Texture */}
      <div className="absolute bottom-0 left-0 right-0 h-10 overflow-hidden opacity-30 pointer-events-none">
        <motion.div
          className="w-[200%] h-full flex"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "linear" }}
        >
          <div className="w-1/2 h-full bg-[repeating-linear-gradient(45deg,#10b981_0,#10b981_2px,transparent_0,transparent_20px)]" />
          <div className="w-1/2 h-full bg-[repeating-linear-gradient(45deg,#10b981_0,#10b981_2px,transparent_0,transparent_20px)]" />
        </motion.div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. ANIMATED DRIVING TRACTOR ON HORIZON
          ───────────────────────────────────────────────────────────── */}
      <div className="absolute bottom-5 md:bottom-9 left-0 right-0 pointer-events-none overflow-hidden h-36">
        {/* Tractor Moving horizontally across the screen */}
        <motion.div
          className="absolute flex items-end"
          initial={{ x: "-20vw" }}
          animate={{ x: "110vw" }}
          transition={{
            repeat: Infinity,
            duration: 8.5,
            ease: "linear",
          }}
          style={{ willChange: "transform" }}
        >
          {/* Complete Animated Tractor SVG Container */}
          <div className="relative">
            {/* 1. Exhaust Smoke Rings (Puffing upwards) */}
            <div className="absolute -top-8 left-16">
              {[0, 1, 2].map((idx) => (
                <motion.div
                  key={idx}
                  className="absolute w-3 h-3 rounded-full bg-slate-400/30 blur-[1px]"
                  initial={{ opacity: 0.8, scale: 0.4, y: 0, x: 0 }}
                  animate={{
                    opacity: [0.8, 0],
                    scale: [0.4, 2.2],
                    y: -30,
                    x: -25,
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    ease: "easeOut",
                    delay: idx * 0.4,
                  }}
                />
              ))}
            </div>

            {/* 2. Golden Headlight Volumetric Light Beam */}
            <div
              className="absolute top-10 left-36 w-64 h-24 pointer-events-none"
              style={{
                background: "polygon(0 40%, 100% 0, 100% 100%, 0 70%)",
                clipPath: "polygon(0 45%, 100% 0, 100% 100%, 0 75%)",
                backgroundImage: "linear-gradient(to right, rgba(245, 158, 11, 0.75), rgba(245, 158, 11, 0.15), transparent)",
              }}
            />

            {/* 3. High-Detail SVG Tractor */}
            <svg
              width="170"
              height="105"
              viewBox="0 0 160 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-[0_4px_12px_rgba(16,185,129,0.3)]"
            >
              {/* Cultivator / Rotavator Attached at Back */}
              <g className="text-slate-600">
                <rect x="2" y="65" width="22" height="6" rx="2" fill="#334155" />
                <path d="M4 71 L2 85 M10 71 L8 85 M16 71 L14 85 M22 71 L20 85" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="20" y1="68" x2="35" y2="60" stroke="#475569" strokeWidth="3" />
              </g>

              {/* Chassis & Red/Emerald Body Frame */}
              <g id="tractor-body">
                {/* Engine Bonnet / Hood */}
                <path
                  d="M48 58 L125 58 L128 40 L65 40 L50 48 Z"
                  fill="url(#tractor-metallic-gradient)"
                  stroke="#10b981"
                  strokeWidth="1.5"
                />
                {/* Front Grille Chrome */}
                <path d="M125 40 L132 45 L130 58 L125 58 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
                <line x1="127" y1="44" x2="127" y2="55" stroke="#0f172a" strokeWidth="1.5" />
                <line x1="129" y1="46" x2="129" y2="54" stroke="#0f172a" strokeWidth="1.5" />

                {/* Farmer Driver & Traditional Turban (Pheta) */}
                <circle cx="58" cy="26" r="6" fill="#f59e0b" />
                {/* Turban */}
                <ellipse cx="58" cy="23" rx="7.5" ry="4.5" fill="#e11d48" />
                <path d="M52 23 Q58 19 64 23" stroke="#fbbf24" strokeWidth="1.2" fill="none" />
                {/* Body / Kurta */}
                <path d="M53 32 L64 32 L66 48 L50 48 Z" fill="#f8fafc" />
                {/* Steering Wheel Hand */}
                <line x1="62" y1="36" x2="72" y2="38" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                {/* Steering Wheel */}
                <line x1="70" y1="32" x2="74" y2="44" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />

                {/* Driver Cabin Canopy / Umbrella Roof */}
                <path d="M36 12 L78 12 L75 16 L38 16 Z" fill="#10b981" stroke="#34d399" strokeWidth="1" />
                <line x1="42" y1="16" x2="42" y2="52" stroke="#64748b" strokeWidth="2" />
                <line x1="72" y1="16" x2="72" y2="52" stroke="#64748b" strokeWidth="2" />

                {/* Silencer / Exhaust Stack */}
                <path d="M102 40 L102 18 L105 16" stroke="#475569" strokeWidth="3" strokeLinecap="round" />

                {/* Bright Golden Front Headlight */}
                <circle cx="129" cy="46" r="3.5" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.5" />
              </g>

              {/* Rear Mudguard Arch */}
              <path
                d="M26 62 A 25 25 0 0 1 70 62"
                fill="none"
                stroke="#047857"
                strokeWidth="7"
                strokeLinecap="round"
              />

              {/* ──────────────────────────────────────────────────
                  Animated Rotating Wheels (Spins while driving)
                  ────────────────────────────────────────────────── */}
              {/* BIG REAR WHEEL (Radius 21) */}
              <g transform="translate(48, 66)">
                {/* Outer Deep-Tread Tire */}
                <circle cx="0" cy="0" r="21" fill="#0f172a" stroke="#1e293b" strokeWidth="3.5" />
                {/* Wheel Rim */}
                <circle cx="0" cy="0" r="14" fill="#d97706" stroke="#f59e0b" strokeWidth="1.5" />
                {/* Rotating Spoke Spokes */}
                <g className="origin-center animate-[spin_1.2s_linear_infinite]">
                  <line x1="-14" y1="0" x2="14" y2="0" stroke="#fef3c7" strokeWidth="2" />
                  <line x1="0" y1="-14" x2="0" y2="14" stroke="#fef3c7" strokeWidth="2" />
                  <line x1="-10" y1="-10" x2="10" y2="10" stroke="#fef3c7" strokeWidth="2" />
                  <line x1="-10" y1="10" x2="10" y2="-10" stroke="#fef3c7" strokeWidth="2" />
                  {/* Tire Grip Cleats */}
                  <circle cx="0" cy="0" r="19" fill="none" stroke="#475569" strokeWidth="2" strokeDasharray="5 6" />
                </g>
                <circle cx="0" cy="0" r="4.5" fill="#1e293b" stroke="#f59e0b" strokeWidth="1.5" />
              </g>

              {/* SMALL FRONT WHEEL (Radius 13) */}
              <g transform="translate(116, 74)">
                {/* Outer Tire */}
                <circle cx="0" cy="0" r="13" fill="#0f172a" stroke="#1e293b" strokeWidth="2.5" />
                {/* Wheel Rim */}
                <circle cx="0" cy="0" r="8" fill="#d97706" stroke="#f59e0b" strokeWidth="1" />
                {/* Rotating Spokes */}
                <g className="origin-center animate-[spin_0.75s_linear_infinite]">
                  <line x1="-8" y1="0" x2="8" y2="0" stroke="#fef3c7" strokeWidth="1.5" />
                  <line x1="0" y1="-8" x2="0" y2="8" stroke="#fef3c7" strokeWidth="1.5" />
                  <line x1="-6" y1="-6" x2="6" y2="6" stroke="#fef3c7" strokeWidth="1.5" />
                  <line x1="-6" y1="6" x2="6" y2="-6" stroke="#fef3c7" strokeWidth="1.5" />
                  {/* Cleats */}
                  <circle cx="0" cy="0" r="11.5" fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 4" />
                </g>
                <circle cx="0" cy="0" r="3" fill="#1e293b" stroke="#f59e0b" strokeWidth="1" />
              </g>

              {/* Gradient Shading Definitions */}
              <defs>
                <linearGradient id="tractor-metallic-gradient" x1="48" y1="40" x2="128" y2="58" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#059669" />
                  <stop offset="0.5" stopColor="#10b981" />
                  <stop offset="1" stopColor="#047857" />
                </linearGradient>
              </defs>
            </svg>

            {/* Flying Soil / Seed Particles thrown behind the rear tire */}
            <div className="absolute bottom-2 left-6">
              {[0, 1, 2, 3].map((idx) => (
                <motion.div
                  key={idx}
                  className="absolute w-1.5 h-1.5 rounded-full bg-amber-600/70"
                  animate={{
                    x: [-5, -25],
                    y: [0, -12, 4],
                    opacity: [0.9, 0],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.5,
                    delay: idx * 0.12,
                    ease: "easeOut",
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. Central Splash Content Box & Progress Indicator
          ───────────────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center z-20 space-y-6 max-w-md px-6 text-center">
        {/* Animated Sprout & Tractor Emblem */}
        <div className="relative flex items-center justify-center">
          {/* Pulsing Outer Rings */}
          <div className="absolute w-28 h-28 rounded-3xl border border-emerald-500/30 animate-ping opacity-30" />
          <div className="absolute w-36 h-36 rounded-full border border-teal-500/25 animate-spin opacity-40 duration-1000" />
          <div className="absolute w-44 h-44 rounded-full border border-amber-500/15 animate-pulse opacity-30" />

          {/* Central Logo Box */}
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 via-emerald-600 to-amber-600 border-2 border-emerald-300/60 flex items-center justify-center text-white shadow-[0_0_50px_rgba(16,185,129,0.5)] transform hover:scale-105 transition-all duration-300">
            <Sprout className="w-11 h-11 text-emerald-50 animate-bounce" />
          </div>
        </div>

        {/* Brand Titles */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-md">
              Ajrasakha <span className="text-emerald-400 font-bold">(अज्रसखा)</span>
            </h1>
          </div>
          <p className="text-sm font-semibold text-emerald-300 tracking-wide flex items-center justify-center gap-1.5">
            <Wheat className="w-4 h-4 text-amber-400" />
            <span>The Farmer's AI Companion • राष्ट्रीय कृषि साथी</span>
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Real-Time Vision Disease AI • Live Mandi Bhav • CHC Machine Rates • Video Academy
          </p>
        </div>

        {/* Dynamic Progress Bar with Tractor Indicator */}
        <div className="w-72 sm:w-80 space-y-2 pt-2">
          <div className="relative w-full h-2 bg-slate-900/90 rounded-full overflow-hidden border border-slate-800 p-0.5 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 rounded-full transition-all duration-100 shadow-[0_0_12px_#10b981]"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1 text-emerald-400/90">
              <Zap className="w-3 h-3 text-amber-400 animate-pulse" />
              <span>
                {progress < 30
                  ? "Connecting KVK & Weather Satellites..."
                  : progress < 70
                  ? "Loading Golden Database & CHC Rates..."
                  : "Ready for Precision Agriculture!"}
              </span>
            </span>
            <span className="text-emerald-400 font-bold">{progress}%</span>
          </div>
        </div>

        {/* Quick Skip Button */}
        <button
          onClick={onComplete}
          className="text-xs text-slate-500 hover:text-emerald-400 underline underline-offset-4 transition-colors pt-1 cursor-pointer"
        >
          Skip Intro →
        </button>
      </div>
    </div>
  );
};

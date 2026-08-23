import React from "react";
import { motion } from "framer-motion";

export const FarmerFriendTractorBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden select-none -z-10"
    >
      {/* Deep ambient background gradient base */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-[#0a1118] to-slate-950 opacity-95" />

      {/* Top Emerald Sun/Moon Atmosphere */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-emerald-500/10 rounded-full blur-[150px]" />

      {/* Harvest Gold Warm Ambient Glow */}
      <div className="absolute top-1/3 -left-20 w-[500px] h-[500px] bg-amber-500/8 rounded-full blur-[160px]" />

      {/* Lush Green Field Ambient Glow */}
      <div className="absolute bottom-10 -right-20 w-[550px] h-[550px] bg-emerald-600/10 rounded-full blur-[160px]" />

      {/* Geometric Agricultural Contour Grid Lines */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.035]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="farm-grid-pattern"
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 60 0 L 0 0 0 60"
              fill="none"
              stroke="#10b981"
              strokeWidth="0.8"
            />
            <circle cx="30" cy="30" r="1" fill="#f59e0b" opacity="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#farm-grid-pattern)" />
      </svg>

      {/* Rolling Farm Hills & Field Waves at Bottom */}
      <svg
        className="absolute bottom-0 left-0 w-full h-56 md:h-72 opacity-[0.12] text-emerald-600"
        viewBox="0 0 1440 320"
        fill="currentColor"
        preserveAspectRatio="none"
      >
        <path d="M0,192L48,181.3C96,171,192,149,288,160C384,171,480,213,576,208C672,203,768,149,864,138.7C960,128,1056,160,1152,176C1248,192,1344,192,1392,192L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
      </svg>

      <svg
        className="absolute bottom-0 left-0 w-full h-44 md:h-56 opacity-[0.16] text-teal-800"
        viewBox="0 0 1440 320"
        fill="currentColor"
        preserveAspectRatio="none"
      >
        <path d="M0,224L60,208C120,192,240,160,360,165.3C480,171,600,213,720,208C840,203,960,149,1080,144C1200,139,1320,181,1380,202.7L1440,224L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
      </svg>

      {/* Floating Animated Modern Tractor Silhouette on the Horizon */}
      <div className="absolute bottom-6 left-6 md:bottom-12 md:left-16 opacity-[0.14] text-emerald-400">
        <svg
          width="130"
          height="80"
          viewBox="0 0 120 70"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Tractor Hood and Engine */}
          <path d="M15 45 L50 45 L55 25 L30 25 L15 35 Z" fill="currentColor" fillOpacity="0.3" />
          {/* Cabin Glass & Roof */}
          <path d="M55 25 L75 20 L80 45 L55 45 Z" fill="currentColor" fillOpacity="0.2" />
          <path d="M52 18 L80 15 L83 22 L55 25 Z" fill="currentColor" />
          {/* Exhaust Pipe / Silencer */}
          <path d="M35 25 L35 10 L38 9" strokeWidth="2.5" />
          {/* Big Rear Wheel with Deep Agro Treads */}
          <circle cx="75" cy="48" r="18" fill="#0f172a" stroke="currentColor" strokeWidth="3.5" />
          <circle cx="75" cy="48" r="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx="75" cy="48" r="4" fill="currentColor" />
          {/* Front Small Wheel */}
          <circle cx="25" cy="54" r="12" fill="#0f172a" stroke="currentColor" strokeWidth="3" />
          <circle cx="25" cy="54" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
          <circle cx="25" cy="54" r="2.5" fill="currentColor" />
          {/* Connecting Axle */}
          <line x1="25" y1="54" x2="75" y2="48" strokeWidth="2.5" />
          {/* Front Headlight Beam */}
          <polygon points="12,38 0,33 0,43" fill="#f59e0b" fillOpacity="0.6" stroke="none" />
        </svg>
      </div>

      {/* Second Artistic Farmer & Drone Silhouette in Background */}
      <div className="absolute bottom-8 right-8 md:bottom-14 md:right-24 opacity-[0.12] text-amber-400">
        <svg
          width="110"
          height="75"
          viewBox="0 0 100 70"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Agriculture Drone Hexacopter */}
          <ellipse cx="60" cy="18" rx="14" ry="4" fill="currentColor" fillOpacity="0.3" />
          <line x1="46" y1="18" x2="74" y2="18" strokeWidth="2.5" />
          <circle cx="44" cy="15" r="4" />
          <circle cx="76" cy="15" r="4" />
          <circle cx="60" cy="18" r="3" fill="currentColor" />
          <path d="M52 22 L48 30 L72 30 L68 22" strokeWidth="1.5" />
          {/* Spray Droplet lines */}
          <line x1="53" y1="32" x2="51" y2="44" strokeDasharray="2 3" opacity="0.8" />
          <line x1="60" y1="32" x2="60" y2="46" strokeDasharray="2 3" opacity="0.8" />
          <line x1="67" y1="32" x2="69" y2="44" strokeDasharray="2 3" opacity="0.8" />
          {/* Farmer Silhouette with Pheta / Turban holding remote */}
          <circle cx="20" cy="40" r="4.5" fill="currentColor" />
          <path d="M17 38 Q20 34 25 38" strokeWidth="3" />
          <path d="M20 46 L20 62 L15 70" strokeWidth="2.5" />
          <path d="M20 62 L25 70" strokeWidth="2.5" />
          <path d="M20 50 L27 54 L30 50" strokeWidth="2" />
        </svg>
      </div>

      {/* Floating Golden Crop Spore Particles (Framer Motion) */}
      <div className="absolute inset-0">
        {[...Array(9)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-gradient-to-r from-emerald-400 to-amber-300 opacity-20 blur-[0.5px]"
            style={{
              width: `${4 + (i % 3) * 2}px`,
              height: `${4 + (i % 3) * 2}px`,
              left: `${10 + (i * 11) % 85}%`,
              top: `${20 + (i * 17) % 70}%`,
            }}
            animate={{
              y: [-15, 15, -15],
              x: [-10, 10, -10],
              opacity: [0.15, 0.4, 0.15],
            }}
            transition={{
              duration: 6 + (i % 4) * 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.7,
            }}
          />
        ))}
      </div>
    </div>
  );
};

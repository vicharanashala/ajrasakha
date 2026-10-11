import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Mic, Volume2, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

export type AvatarState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING" | "ERROR";

interface FarmerAvatarProps {
  state: AvatarState;
  isSpeaking?: boolean;
  onAvatarClick?: () => void;
  className?: string;
  errorMessage?: string;
}

export const FarmerAvatar: React.FC<FarmerAvatarProps> = ({
  state,
  isSpeaking = false,
  onAvatarClick,
  className,
  errorMessage,
}) => {
  const [blink, setBlink] = useState(false);
  const [mouthFrame, setMouthFrame] = useState(0);

  // Blinking loop for natural character presence
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 200);
    }, 4000);
    return () => clearInterval(blinkInterval);
  }, []);

  // Synchronized mouth animation when speaking
  useEffect(() => {
    if (state !== "SPEAKING" && !isSpeaking) {
      setMouthFrame(0);
      return;
    }
    const interval = setInterval(() => {
      setMouthFrame((prev) => (prev + 1) % 4);
    }, 120);
    return () => clearInterval(interval);
  }, [state, isSpeaking]);

  const getStateConfig = () => {
    switch (state) {
      case "LISTENING":
        return {
          label: "Listening...",
          badgeColor: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
          haloColor: "from-emerald-400/20 to-teal-500/20",
          ringColor: "ring-emerald-500/50",
          icon: <Mic className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />,
        };
      case "THINKING":
        return {
          label: "Analyzing query...",
          badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/30",
          haloColor: "from-amber-400/20 to-orange-500/20",
          ringColor: "ring-amber-500/50",
          icon: <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-spin" />,
        };
      case "SPEAKING":
        return {
          label: "Speaking answer...",
          badgeColor: "bg-primary/10 text-primary border-primary/30",
          haloColor: "from-primary/20 to-emerald-400/20",
          ringColor: "ring-primary/60",
          icon: <Volume2 className="w-3.5 h-3.5 text-primary animate-bounce" />,
        };
      case "ERROR":
        return {
          label: errorMessage || "Try again",
          badgeColor: "bg-destructive/10 text-destructive border-destructive/30",
          haloColor: "from-rose-400/20 to-red-500/20",
          ringColor: "ring-destructive/50",
          icon: <AlertCircle className="w-3.5 h-3.5 text-destructive" />,
        };
      default:
        return {
          label: "AjraSakha Ready",
          badgeColor: "bg-muted text-muted-foreground border-border",
          haloColor: "from-emerald-500/10 to-amber-500/10",
          ringColor: "ring-border",
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
        };
    }
  };

  const config = getStateConfig();

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-3 select-none transition-all duration-300",
        className
      )}
      onClick={onAvatarClick}
    >
      {/* Outer Pulse Rings for Active States */}
      <div className="relative group cursor-pointer">
        {state === "LISTENING" && (
          <div className="absolute -inset-3 rounded-full bg-emerald-500/20 animate-ping opacity-75 pointer-events-none" />
        )}
        {state === "SPEAKING" && (
          <div className="absolute -inset-3 rounded-full bg-primary/20 animate-pulse pointer-events-none" />
        )}
        {state === "THINKING" && (
          <div className="absolute -inset-2.5 rounded-full border-2 border-dashed border-amber-500/50 animate-spin pointer-events-none" />
        )}

        {/* Avatar Circular Container */}
        <div
          className={cn(
            "relative w-32 h-32 md:w-36 md:h-36 rounded-full overflow-hidden bg-gradient-to-b shadow-lg border-2 border-background ring-2 transition-all duration-300",
            config.haloColor,
            config.ringColor
          )}
        >
          {/* Detailed SVG Illustration of Indian Farmer */}
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-105"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Background Sky & Sun Accent */}
            <circle cx="100" cy="100" r="98" fill="#F0FDF4" />
            <circle cx="100" cy="115" r="80" fill="#DCFCE7" opacity="0.6" />

            {/* Shoulders & Kurta (White) */}
            <path
              d="M30 195 C 40 148, 65 140, 100 140 C 135 140, 160 148, 170 195 Z"
              fill="#F8FAFC"
              stroke="#CBD5E1"
              strokeWidth="2"
            />
            {/* Kurta Collar */}
            <path
              d="M86 142 L100 160 L114 142 Z"
              fill="#E2E8F0"
              stroke="#CBD5E1"
              strokeWidth="1.5"
            />

            {/* Nehru Vest / Gamcha (Green Agri Scarf) */}
            <path
              d="M48 165 C 55 145, 75 142, 85 142 L80 195 L40 195 Z"
              fill="#15803D"
              opacity="0.9"
            />
            <path
              d="M152 165 C 145 145, 125 142, 115 142 L120 195 L160 195 Z"
              fill="#16A34A"
              opacity="0.9"
            />

            {/* Neck */}
            <rect x="86" y="120" width="28" height="28" rx="6" fill="#D97706" opacity="0.4" />
            <rect x="88" y="118" width="24" height="26" rx="6" fill="#EA580C" opacity="0.3" />
            <path d="M88 120 L100 135 L112 120" fill="#C2410C" opacity="0.15" />

            {/* Ears */}
            <ellipse cx="62" cy="98" rx="7" ry="12" fill="#FDBA74" stroke="#EA580C" strokeWidth="1" />
            <ellipse cx="138" cy="98" rx="7" ry="12" fill="#FDBA74" stroke="#EA580C" strokeWidth="1" />
            {/* Small Gold Earring on Left Ear */}
            <circle cx="60" cy="104" r="2.5" fill="#FBBF24" stroke="#D97706" strokeWidth="0.8" />

            {/* Face Shape */}
            <ellipse
              cx="100"
              cy="98"
              rx="38"
              ry="42"
              fill="#FED7AA"
              stroke="#F97316"
              strokeWidth="1.2"
            />

            {/* Rosy Cheeks */}
            <circle cx="78" cy="106" r="6" fill="#F87171" opacity="0.35" />
            <circle cx="122" cy="106" r="6" fill="#F87171" opacity="0.35" />

            {/* Eyebrows (Warm, Friendly) */}
            <path
              d="M74 82 Q85 78 94 82"
              fill="none"
              stroke="#334155"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M106 82 Q115 78 126 82"
              fill="none"
              stroke="#334155"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Eyes (Blinking animation) */}
            {blink ? (
              <>
                <line x1="75" y1="92" x2="91" y2="92" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="109" y1="92" x2="125" y2="92" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
              </>
            ) : (
              <>
                <ellipse cx="83" cy="91" rx="5" ry="6" fill="#1E293B" />
                <circle cx="85" cy="89" r="2" fill="#FFFFFF" />
                <ellipse cx="117" cy="91" rx="5" ry="6" fill="#1E293B" />
                <circle cx="119" cy="89" r="2" fill="#FFFFFF" />
              </>
            )}

            {/* Nose */}
            <path
              d="M98 90 Q100 106 96 107 Q100 110 104 107"
              fill="none"
              stroke="#EA580C"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Tilak / Churna Spot on Forehead */}
            <rect x="98.5" y="68" width="3" height="8" rx="1.5" fill="#DC2626" />
            <circle cx="100" cy="78" r="1.5" fill="#F59E0B" />

            {/* Friendly Indian Mustache */}
            <path
              d="M100 115 C92 110, 72 112, 68 122 C76 124, 92 122, 100 117 C108 122, 124 124, 132 122 C128 112, 108 110, 100 115 Z"
              fill="#1E293B"
            />

            {/* Mouth / Smile (Morphs based on Speaking State) */}
            {state === "SPEAKING" ? (
              mouthFrame === 0 ? (
                // Open shape 1
                <path
                  d="M92 123 Q100 133 108 123 Q100 126 92 123 Z"
                  fill="#7F1D1D"
                  stroke="#450A0A"
                  strokeWidth="1.2"
                />
              ) : mouthFrame === 1 ? (
                // Open shape 2 (wider)
                <path
                  d="M90 123 Q100 137 110 123 Q100 127 90 123 Z"
                  fill="#991B1B"
                  stroke="#450A0A"
                  strokeWidth="1.2"
                />
              ) : mouthFrame === 2 ? (
                // Moderate open
                <path
                  d="M93 124 Q100 131 107 124 Z"
                  fill="#7F1D1D"
                  stroke="#450A0A"
                  strokeWidth="1"
                />
              ) : (
                // Closed smile
                <path
                  d="M92 124 Q100 129 108 124"
                  fill="none"
                  stroke="#450A0A"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )
            ) : state === "ERROR" ? (
              // Slight concerned/gentle curve
              <path
                d="M92 127 Q100 123 108 127"
                fill="none"
                stroke="#450A0A"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            ) : (
              // Gentle, friendly welcoming smile
              <path
                d="M90 123 Q100 132 110 123"
                fill="none"
                stroke="#450A0A"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            )}

            {/* Traditional Indian Pagri (Turban - Saffron & Marigold Folds) */}
            {/* Base Turban Wrap */}
            <path
              d="M52 72 C48 35, 90 22, 108 22 C135 22, 160 38, 150 72 C146 54, 116 46, 100 46 C75 46, 56 56, 52 72 Z"
              fill="#EA580C"
            />
            {/* Prominent Swirls/Folds */}
            <path
              d="M48 68 C44 45, 78 28, 102 30 C125 32, 152 45, 148 68 C135 52, 105 45, 88 47 C70 48, 54 58, 48 68 Z"
              fill="#F97316"
            />
            <path
              d="M55 60 C68 40, 108 34, 138 48 C144 51, 148 58, 146 64 C132 50, 98 44, 76 50 C65 53, 58 58, 55 60 Z"
              fill="#FB923C"
            />
            {/* Top Turban Peak & Fold Accent */}
            <path
              d="M92 24 C100 14, 118 16, 122 26 C114 20, 102 20, 92 24 Z"
              fill="#C2410C"
            />
            {/* Turban Brooch / Kalgi Feather Accent */}
            <ellipse cx="78" cy="46" rx="4" ry="6" fill="#FBBF24" stroke="#D97706" strokeWidth="1" />
            <circle cx="78" cy="46" r="2" fill="#DC2626" />
          </svg>
        </div>

        {/* Floating Sound Waves when Speaking */}
        {state === "SPEAKING" && (
          <div className="absolute -right-3 top-6 flex items-center gap-0.5 bg-background/90 px-1.5 py-1 rounded-full shadow border text-primary">
            <span className="w-1 h-2 bg-primary rounded-full animate-pulse" />
            <span className="w-1 h-3.5 bg-primary rounded-full animate-bounce" />
            <span className="w-1 h-2 bg-primary rounded-full animate-pulse" />
          </div>
        )}
      </div>

      {/* State Status Badge */}
      <div
        className={cn(
          "mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border shadow-xs transition-all duration-200",
          config.badgeColor
        )}
      >
        {config.icon}
        <span className="truncate max-w-[180px]">{config.label}</span>
      </div>
    </div>
  );
};

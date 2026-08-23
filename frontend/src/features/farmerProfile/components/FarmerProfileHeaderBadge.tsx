import React from "react";
import type { IFarmerProfile } from "../types";
import { farmerProfileService } from "../services/farmerProfileService";
import { User, ShieldCheck, Crown, ChevronRight, Zap } from "lucide-react";

interface Props {
  profile: IFarmerProfile | null;
  onOpenCard: () => void;
  onSwitchToFarmerMode?: () => void;
}

export const FarmerProfileHeaderBadge: React.FC<Props> = ({
  profile,
  onOpenCard,
  onSwitchToFarmerMode,
}) => {
  if (!profile) return null;

  const isOwner = farmerProfileService.isOwner() || profile.farmerName.toLowerCase().includes("tomarjii");

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onOpenCard}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-2xl border text-left shadow-lg transition-all duration-200 cursor-pointer group ${
          isOwner
            ? "bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/70 border-amber-400/60 hover:border-amber-300 shadow-amber-950/50 hover:scale-[1.02]"
            : "bg-gradient-to-r from-emerald-950/80 via-slate-900 to-amber-950/60 border-emerald-500/40 hover:border-emerald-400 shadow-emerald-950/40 hover:scale-[1.02]"
        }`}
        title={isOwner ? "Owner (tomarjii) - Full Master Access" : "View Kisan Digital Passbook"}
      >
        {/* Avatar Circle */}
        <div
          className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shadow-md flex-shrink-0 ${
            isOwner
              ? "bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950"
              : "bg-gradient-to-br from-emerald-400 to-amber-500 text-slate-950"
          }`}
        >
          {isOwner ? <Crown className="w-4 h-4 fill-slate-950" /> : profile.farmerName.charAt(0)}
        </div>

        {/* Info Block */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-xs font-black truncate max-w-[130px] sm:max-w-[170px] transition-colors ${
                isOwner ? "text-amber-300 group-hover:text-amber-200" : "text-white group-hover:text-emerald-300"
              }`}
            >
              {isOwner ? "tomarjii" : profile.farmerName}
            </span>
            {isOwner ? (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-400 text-slate-950">
                Owner VIP
              </span>
            ) : (
              <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            )}
          </div>
          <span className="text-[10px] text-slate-400 truncate max-w-[140px] sm:max-w-[190px]">
            {isOwner ? "Master Access (Fully Unlocked)" : `${profile.landSizeAcres} एकड़ • ${profile.villageName || profile.district}`}
          </span>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors ml-0.5" />
      </button>
    </div>
  );
};

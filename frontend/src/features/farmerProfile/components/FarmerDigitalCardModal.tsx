import React from "react";
import type { IFarmerProfile } from "../types";
import { getCategoryBadgeLabel, farmerProfileService } from "../services/farmerProfileService";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  X,
  User,
  Phone,
  MapPin,
  Wheat,
  Tractor,
  Droplets,
  ShieldCheck,
  Award,
  Crown,
  Edit2,
  Share2,
  Printer,
  Sparkles,
  Zap,
  RotateCcw,
} from "lucide-react";
import { toast } from "@/shared/components/toast";

interface Props {
  profile: IFarmerProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSwitchProfile: () => void;
  onResetSession: () => void;
}

export const FarmerDigitalCardModal: React.FC<Props> = ({
  profile,
  isOpen,
  onClose,
  onEdit,
  onSwitchProfile,
  onResetSession,
}) => {
  const { language, t } = useLanguage();

  if (!isOpen || !profile) return null;

  const isOwner = farmerProfileService.isOwner() || profile.farmerName.toLowerCase().includes("tomarjii");
  const categoryLabel = getCategoryBadgeLabel(profile.farmerCategory, language);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(
        `Ajrasakha ID: ${profile.id}\nName: ${profile.farmerName}\nStatus: ${isOwner ? "Owner (tomarjii)" : "Verified Farmer"}`
      );
      toast.success(t("पहचान पत्र विवरण कॉपी हो गया!", "Identity Details Copied!", "Copied!"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-xl overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2">
            <span
              className={`p-1 rounded-lg border ${
                isOwner
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              }`}
            >
              {isOwner ? <Crown className="w-4 h-4 text-amber-400" /> : <Award className="w-4 h-4" />}
            </span>
            <h3 className="text-sm font-bold text-white">
              {isOwner
                ? t("👑 मालिक पहचान पत्र (Tomarjii Master Pass)", "Tomarjii Master Access Pass", "Master Pass")
                : t("डिजिटल किसान पहचान पत्र (Kisan Passbook)", "Digital Kisan Identity Passbook", "Kisan Passbook")}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              title="Share Card"
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handlePrint}
              title="Print Card"
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Digital Smart Kisan ID Card */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 bg-slate-950/60">
          {/* Card Container */}
          <div
            className={`relative rounded-3xl border-2 p-6 sm:p-7 shadow-2xl overflow-hidden ${
              isOwner
                ? "bg-gradient-to-br from-amber-950 via-slate-900 to-emerald-950/90 border-amber-400/60"
                : "bg-gradient-to-br from-emerald-950 via-slate-900 to-amber-950/90 border-emerald-400/40"
            }`}
          >
            {/* Ambient Watermark Emblem */}
            <div className="absolute right-4 bottom-4 opacity-5 pointer-events-none">
              {isOwner ? <Crown className="w-64 h-64 text-amber-400" /> : <Wheat className="w-64 h-64 text-emerald-400" />}
            </div>

            {/* Card Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                    {isOwner ? "👑 AJRASAKHA SOVEREIGN MASTER ARCHITECT" : "GOVERNMENT OF INDIA • राष्ट्रीय कृषि नेटवर्क"}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
                  {profile.farmerName}
                </h2>
                <p className="text-xs text-slate-300 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>
                    {profile.villageName}, {profile.blockOrTehsil}, {profile.district} ({profile.state})
                  </span>
                </p>
              </div>

              {/* Verified Badge */}
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 shadow-md border ${
                    isOwner
                      ? "bg-amber-400 text-slate-950 border-amber-300"
                      : "bg-emerald-500/20 text-emerald-300 border-emerald-400"
                  }`}
                >
                  {isOwner ? <Crown className="w-3.5 h-3.5 fill-slate-950" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                  {isOwner ? "Owner (Fully Unlocked)" : "Verified Farmer"}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {isOwner ? "Unlimited Sovereign Access" : categoryLabel}
                </span>
              </div>
            </div>

            {/* Card Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-white/10 text-xs">
              <div className="p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">
                  {isOwner ? "कवरेज (Coverage)" : "कुल भूमि (Land)"}
                </span>
                <p className="text-sm font-black text-amber-400 mt-0.5">
                  {isOwner ? "All India AI Hub" : `${profile.landSizeAcres} एकड़`}
                </p>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">सिस्टम रोल (Role)</span>
                <p className="text-sm font-bold text-emerald-300 mt-0.5 truncate">
                  {isOwner ? "Master Owner (tomarjii)" : profile.primaryCrop}
                </p>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">एक्सेस स्थिति (Access)</span>
                <p className="text-sm font-bold text-teal-300 mt-0.5 truncate capitalize">
                  {isOwner ? "100% Fully Open" : profile.irrigationSource}
                </p>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">मालिक आईडी (ID)</span>
                <p className="text-sm font-mono font-bold text-white mt-0.5">
                  {profile.id}
                </p>
              </div>
            </div>

            {/* Machinery & Livestock Tags */}
            <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold">उपलब्ध यंत्र व सुविधाएं (Ecosystem):</span>
                <div className="flex flex-wrap gap-1.5">
                  {profile.machineryOwned.map((m, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-lg bg-emerald-950/70 border border-emerald-600/40 text-[11px] text-emerald-300 font-medium"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* ID Stamp */}
              <div className="p-2 rounded-xl bg-slate-950/80 border border-amber-500/40 text-right flex-shrink-0">
                <span className="text-[9px] font-mono uppercase text-slate-400 block">Security Signature</span>
                <span className="text-xs font-mono font-black text-amber-300">tomarjii-verified</span>
              </div>
            </div>
          </div>

          {/* Action Buttons: Reset / Switch / Edit */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              onClick={() => {
                onClose();
                onResetSession();
              }}
              className="px-4 py-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>{t("🔄 किसान डेटा रीसेट व फ्रेश लॉगिन", "🔄 Reset & Fresh Farmer Login", "Reset & Fresh Login")}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onSwitchProfile}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {t("नया किसान टेस्ट करें", "Test Farmer Onboarding", "Test Farmer")}
              </button>

              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-black shadow-lg shadow-emerald-950 transition-all active:scale-95 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>{t("प्रोफाइल संपादित करें", "Edit Profile", "Edit Profile")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

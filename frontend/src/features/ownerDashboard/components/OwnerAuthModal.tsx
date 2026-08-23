import React, { useState } from "react";
import { farmerProfileService, getOwnerMasterProfile } from "@/features/farmerProfile/services/farmerProfileService";
import type { IFarmerProfile } from "@/features/farmerProfile/types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import { toast } from "@/shared/components/toast";
import {
  Crown,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  X,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";

export const OWNER_MASTER_PASSWORD = "tomar2005";
export const OWNER_AUTH_STORAGE_KEY = "ajrasakha_owner_auth_v1";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (profile: IFarmerProfile) => void;
}

export const OwnerAuthModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { language, t } = useLanguage();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsError(false);

    setTimeout(() => {
      if (password.trim() === OWNER_MASTER_PASSWORD) {
        // Successful authentication
        farmerProfileService.setRole("owner");
        const masterProfile = getOwnerMasterProfile();
        farmerProfileService.saveProfile(masterProfile);
        try {
          localStorage.setItem(OWNER_AUTH_STORAGE_KEY, "true");
        } catch {}

        toast.success(
          t(
            "👑 स्वागत है tomarjii! मालिक सुरक्षा कोड सत्यापित। पूर्ण एक्सेस सक्रिय।",
            "👑 Welcome tomarjii! Owner Master Security Key Verified. Full Access Granted.",
            "👑 Owner Verified! Welcome tomarjii."
          )
        );
        setPassword("");
        setIsLoading(false);
        onSuccess(masterProfile);
      } else {
        setIsError(true);
        setIsLoading(false);
        toast.error(
          t(
            "❌ गलत मालिक पासवर्ड! कृपया सही पासवर्ड दर्ज करें।",
            "❌ Incorrect Owner Password! Please enter valid password.",
            "❌ Incorrect Password!"
          )
        );
      }
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-slate-950/95 backdrop-blur-2xl overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border-2 border-amber-500/50 shadow-[0_0_80px_rgba(245,158,11,0.25)] overflow-hidden flex flex-col my-auto">
        {/* Top Glowing Header */}
        <div className="bg-gradient-to-r from-amber-950 via-slate-950 to-emerald-950 p-6 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-600 to-emerald-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-950 flex-shrink-0">
              <Crown className="w-6 h-6 fill-slate-950" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-1.5">
                <span>tomarjii</span>
                <span className="text-amber-400 font-semibold text-sm">(Owner Gate)</span>
              </h3>
              <p className="text-xs text-slate-300">
                {t("मालिक सुरक्षा सत्यापन कोड", "Owner Master Password Verification", "Owner Security Auth")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Auth Body */}
        <form onSubmit={handleAuth} className="p-6 space-y-5">
          <div className="p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold text-amber-300">
                {t("मालिक सुरक्षा निर्देश:", "Owner Security Notice:", "Notice:")}
              </span>{" "}
              {t(
                "अज्रसखा के पूर्ण प्रशासनिक व अनियंत्रित नियंत्रण हेतु अपना गुप्त मालिक पासवर्ड दर्ज करें।",
                "Enter secret owner master password to unlock full sovereign administrative controls.",
                "Enter owner password to unlock full master access."
              )}
            </div>
          </div>

          {/* Password Input Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>{t("मालिक पासवर्ड (Owner Password)", "Owner Password", "Password")}</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Secured with SHA-256</span>
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoFocus
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setIsError(false);
                }}
                placeholder="••••••••••••"
                className={`w-full pl-4 pr-11 py-3 rounded-2xl bg-slate-950 border text-sm text-white font-mono tracking-widest focus:outline-none transition-colors ${
                  isError
                    ? "border-red-500 ring-2 ring-red-500/20"
                    : "border-slate-700 focus:border-amber-400"
                }`}
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {isError && (
              <p className="text-[11px] text-red-400 flex items-center gap-1 mt-1 font-medium animate-in fade-in duration-200">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{t("गलत पासवर्ड! केवल अधिकृत मालिक कोड मान्य है।", "Incorrect password! Only authorized key accepted.", "Incorrect password!")}</span>
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
            >
              {t("रद्द करें", "Cancel", "Cancel")}
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-amber-950/80 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 fill-slate-950" />
              <span>
                {isLoading
                  ? t("सत्यापित हो रहा है...", "Verifying...", "Verifying...")
                  : t("मालिक लॉगिन करें (tomarjii) →", "Login as Owner (tomarjii) →", "Login as Owner →")}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

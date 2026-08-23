import React, { useState, useEffect } from "react";
import { OWNER_MASTER_PASSWORD, OWNER_AUTH_STORAGE_KEY } from "./OwnerAuthModal";
import { ownerApprovalService } from "../services/ownerApprovalService";
import {
  farmerProfileService,
  getOwnerMasterProfile,
  calculateFarmerCategory,
  generateKisanCardId,
  getDemoFarmerProfile,
} from "@/features/farmerProfile/services/farmerProfileService";
import { INDIAN_AGRI_STATES } from "@/features/farmerProfile/data/indianAgriGeoData";
import type { IFarmerProfile, SoilType, IrrigationSource, FarmingType } from "@/features/farmerProfile/types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import { toast } from "@/shared/components/toast";
import {
  Crown,
  Lock,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Eye,
  EyeOff,
  User,
  Phone,
  MapPin,
  Wheat,
  Tractor,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Zap,
} from "lucide-react";

interface Props {
  onUnlockOwner: (profile: IFarmerProfile) => void;
  onUnlockApprovedFarmer: (profile: IFarmerProfile) => void;
}

export const MasterSecurityGatekeeper: React.FC<Props> = ({
  onUnlockOwner,
  onUnlockApprovedFarmer,
}) => {
  const { language, setLanguage, t } = useLanguage();

  const [activeMode, setActiveMode] = useState<"owner" | "farmer">("owner");

  // Owner Auth State
  const [ownerPassword, setOwnerPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isOwnerError, setIsOwnerError] = useState(false);
  const [isOwnerLoading, setIsOwnerLoading] = useState(false);

  // Farmer Registration State
  const [farmerStep, setFarmerStep] = useState<1 | 2>(1);
  const [farmerName, setFarmerName] = useState("");
  const [phoneNo, setPhoneNo] = useState("");
  const [selectedState, setSelectedState] = useState("Punjab");
  const [selectedDistrict, setSelectedDistrict] = useState("Ludhiana");
  const [villageName, setVillageName] = useState("");
  const [landSizeAcres, setLandSizeAcres] = useState<number>(4.0);
  const [primaryCrop, setPrimaryCrop] = useState("Wheat (गेहूं)");

  // Farmer Pending Approval State
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(() => {
    return localStorage.getItem("ajrasakha_pending_farmer_req_id") || null;
  });
  const [pendingFarmerProfile, setPendingFarmerProfile] = useState<IFarmerProfile | null>(() => {
    const raw = localStorage.getItem("ajrasakha_pending_farmer_profile");
    return raw ? JSON.parse(raw) : null;
  });
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);

  // Poll for Approval if farmer is waiting
  useEffect(() => {
    if (!submittedRequestId) return;

    const interval = setInterval(() => {
      const allRequests = ownerApprovalService.getRequests();
      const myReq = allRequests.find((r) => r.id === submittedRequestId);
      if (myReq && myReq.status === "APPROVED") {
        clearInterval(interval);
        toast.success(
          t(
            "🎉 बधाई हो! मालिक (tomarjii) ने आपका प्रवेश स्वीकृत कर दिया है!",
            "🎉 Congratulations! Owner (tomarjii) has APPROVED your access!",
            "🎉 Access Approved by tomarjii!"
          )
        );
        localStorage.removeItem("ajrasakha_pending_farmer_req_id");
        localStorage.removeItem("ajrasakha_pending_farmer_profile");
        farmerProfileService.saveProfile(myReq.profile);
        farmerProfileService.setRole("farmer");
        onUnlockApprovedFarmer(myReq.profile);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [submittedRequestId, onUnlockApprovedFarmer, t]);

  // Handle Owner Master Password Submission
  const handleOwnerUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setIsOwnerLoading(true);
    setIsOwnerError(false);

    setTimeout(() => {
      if (ownerPassword.trim() === OWNER_MASTER_PASSWORD) {
        farmerProfileService.setRole("owner");
        const masterProfile = getOwnerMasterProfile();
        farmerProfileService.saveProfile(masterProfile);
        try {
          localStorage.setItem(OWNER_AUTH_STORAGE_KEY, "true");
        } catch {}

        toast.success(
          t(
            "👑 स्वागत है tomarjii! मालिक सुरक्षा कोड सत्यापित। ऐप 100% अनलॉक हो गया।",
            "👑 Welcome tomarjii! Owner Master Access Verified. Platform 100% Unlocked.",
            "👑 Owner Verified! Welcome tomarjii."
          )
        );
        setIsOwnerLoading(false);
        onUnlockOwner(masterProfile);
      } else {
        setIsOwnerError(true);
        setIsOwnerLoading(false);
        toast.error(
          t(
            "❌ गलत मालिक पासवर्ड! कृपया सही पासवर्ड (tomar2005) दर्ज करें।",
            "❌ Incorrect Owner Password! Please enter valid password (tomar2005).",
            "❌ Incorrect Password!"
          )
        );
      }
    }, 200);
  };

  // Handle Farmer Registration Request Submission
  const handleFarmerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmerName.trim() || !phoneNo.trim()) {
      toast.error(t("कृपया नाम और फोन नंबर दर्ज करें", "Please enter name and phone number", "Fill name & phone"));
      return;
    }

    const newProfile: IFarmerProfile = {
      id: generateKisanCardId(selectedState, phoneNo),
      farmerName: farmerName.trim(),
      phoneNo: phoneNo.trim(),
      gender: "male",
      age: 38,
      state: selectedState,
      district: selectedDistrict,
      blockOrTehsil: "Tehsil",
      villageName: villageName.trim() || "Village",
      pincode: "110001",
      landSizeAcres: landSizeAcres,
      farmerCategory: calculateFarmerCategory(landSizeAcres),
      soilType: "alluvial",
      irrigationSource: "borewell",
      primaryCrop: primaryCrop,
      secondaryCrops: ["Mustard / Rapeseed (सरसों / राई)"],
      farmingType: "mixed",
      livestock: ["Dairy Cow (देसी / साहीवाल गाय)"],
      machineryOwned: ["Tractor 40-50 HP (ट्रैक्टर)"],
      preferredLanguage: language,
      registeredAt: new Date().toISOString(),
      isVerified: false,
    };

    const req = ownerApprovalService.registerNewFarmer(newProfile);
    setSubmittedRequestId(req.id);
    setPendingFarmerProfile(newProfile);
    try {
      localStorage.setItem("ajrasakha_pending_farmer_req_id", req.id);
      localStorage.setItem("ajrasakha_pending_farmer_profile", JSON.stringify(newProfile));
    } catch {}

    toast.success(
      t(
        "अनुरोध भेजा गया! मालिक (tomarjii) के सत्यापन का इंतजार करें।",
        "Request Sent! Awaiting approval from Owner (tomarjii).",
        "Request Sent! Awaiting approval."
      )
    );
  };

  // Manual Check Approval
  const handleCheckApprovalNow = () => {
    if (!submittedRequestId) return;
    setIsCheckingApproval(true);
    setTimeout(() => {
      const allRequests = ownerApprovalService.getRequests();
      const myReq = allRequests.find((r) => r.id === submittedRequestId);
      setIsCheckingApproval(false);
      if (myReq && myReq.status === "APPROVED") {
        toast.success(t("🎉 आपका अनुरोध स्वीकृत है! प्रवेश कर रहे हैं...", "🎉 Access Approved! Entering...", "Approved!"));
        localStorage.removeItem("ajrasakha_pending_farmer_req_id");
        localStorage.removeItem("ajrasakha_pending_farmer_profile");
        farmerProfileService.saveProfile(myReq.profile);
        farmerProfileService.setRole("farmer");
        onUnlockApprovedFarmer(myReq.profile);
      } else {
        toast.error(
          t(
            "⏳ अभी तक लंबित (Pending) है। कृपया मालिक (tomarjii) द्वारा स्वीकृत होने की प्रतीक्षा करें।",
            "⏳ Still Pending. Please wait until approved by Owner (tomarjii).",
            "Still Pending approval."
          )
        );
      }
    }, 400);
  };

  const stateObj = INDIAN_AGRI_STATES.find((s) => s.state === selectedState) || INDIAN_AGRI_STATES[0];

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto selection:bg-amber-500 selection:text-slate-950">
      {/* Background Animated Gradient Mesh */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.25),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.15),transparent_50%)] pointer-events-none" />

      {/* Top Header Controls (Language) */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 z-10">
        <div className="flex items-center bg-slate-900/90 border border-slate-700/80 rounded-xl p-1 text-xs shadow-lg backdrop-blur-md">
          <button
            onClick={() => setLanguage("en")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              language === "en" ? "bg-amber-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
            }`}
          >
            🇬🇧 EN
          </button>
          <button
            onClick={() => setLanguage("hi")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              language === "hi" ? "bg-amber-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
            }`}
          >
            🇮🇳 हिन्दी
          </button>
          <button
            onClick={() => setLanguage("hinglish")}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              language === "hinglish" ? "bg-amber-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
            }`}
          >
            🌾 Hinglish
          </button>
        </div>
      </div>

      {/* Main Security Card */}
      <div className="relative w-full max-w-xl rounded-3xl bg-slate-900/90 border-2 border-amber-500/40 shadow-[0_0_90px_rgba(245,158,11,0.2)] backdrop-blur-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-300">
        {/* Brand Banner */}
        <div className="p-6 sm:p-7 bg-gradient-to-r from-amber-950 via-slate-950 to-emerald-950 border-b border-amber-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-600 to-emerald-500 text-slate-950 flex items-center justify-center shadow-xl shadow-amber-950/80 flex-shrink-0">
              <Crown className="w-7 h-7 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Ajrasakha <span className="text-amber-400 font-semibold">(अज्रसखा)</span>
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-400 text-slate-950 tracking-wider">
                  Sovereign AI
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {t(
                  "मालिक सुरक्षा गेटवे (Owner Master Security Gatekeeper)",
                  "Master Sovereign Security Gateway",
                  "Security Gateway"
                )}
              </p>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-900/90 border border-amber-500/40 text-right flex-shrink-0">
            <span className="text-[9px] font-mono text-slate-400 uppercase block">Owner Sign</span>
            <span className="text-xs font-mono font-black text-amber-300">tomarjii</span>
          </div>
        </div>

        {/* Portal Mode Switcher (Owner vs Farmer) */}
        {!submittedRequestId && (
          <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center gap-2">
            <button
              onClick={() => setActiveMode("owner")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeMode === "owner"
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-950/60 scale-[1.02]"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              <Crown className="w-4 h-4 fill-current" />
              <span>{t("👑 मालिक प्रवेश (Owner Access)", "👑 Owner Master Access", "👑 Owner Master")}</span>
            </button>

            <button
              onClick={() => setActiveMode("farmer")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeMode === "farmer"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-950/60 scale-[1.02]"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              <Wheat className="w-4 h-4 text-emerald-400" />
              <span>{t("🌾 किसान पहुंच अनुरोध (Farmer Request)", "🌾 Farmer Access Request", "🌾 Farmer Request")}</span>
            </button>
          </div>
        )}

        {/* 1. OWNER MASTER LOGIN FORM */}
        {activeMode === "owner" && !submittedRequestId && (
          <form onSubmit={handleOwnerUnlock} className="p-6 sm:p-8 space-y-6">
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-300 text-sm">
                  {t("मालिक पासवर्ड सत्यापन (Owner Pass Verification)", "Owner Master Password Required", "Owner Verification")}
                </p>
                <p className="text-slate-300 mt-1 leading-relaxed">
                  {t(
                    "यह ऐप केवल मालिक (tomarjii) के पासवर्ड दर्ज करने के बाद ही पूरी तरह खुलेगा। कृपया अपना गुप्त मास्टर पासवर्ड दर्ज करें।",
                    "This system requires the owner master password (tomar2005) to unlock sovereign access.",
                    "Enter owner master password to unlock platform."
                  )}
                </p>
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>{t("मालिक मास्टर पासवर्ड (Master Password)", "Owner Master Password", "Password")}</span>
                </span>
                <span className="text-[10px] font-mono text-amber-400/80">Default: tomar2005</span>
              </label>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoFocus
                  required
                  value={ownerPassword}
                  onChange={(e) => {
                    setOwnerPassword(e.target.value);
                    setIsOwnerError(false);
                  }}
                  placeholder={t("मालिक पासवर्ड दर्ज करें...", "Enter owner master password...", "Enter password")}
                  className={`w-full pl-4 pr-12 py-3.5 rounded-2xl bg-slate-950 border text-sm text-white font-mono placeholder-slate-600 focus:outline-none transition-all ${
                    isOwnerError
                      ? "border-red-500 ring-2 ring-red-500/20"
                      : "border-slate-700 focus:border-amber-400"
                  }`}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {isOwnerError && (
                <p className="text-xs text-red-400 flex items-center gap-1 mt-1.5 font-medium animate-in fade-in">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{t("गलत पासवर्ड! केवल मालिक पासवर्ड (tomar2005) मान्य है।", "Incorrect password! Enter valid owner password (tomar2005).", "Incorrect password!")}</span>
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isOwnerLoading}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-950/80 transition-all duration-300 hover:scale-[1.02] active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 fill-slate-950" />
              <span>
                {isOwnerLoading
                  ? t("सत्यापित किया जा रहा है...", "Verifying Master Key...", "Verifying...")
                  : t("👑 मालिक के रूप में ऐप अनलॉक करें (tomarjii) →", "👑 Unlock Platform as Owner (tomarjii) →", "Unlock as Owner →")}
              </span>
            </button>
          </form>
        )}

        {/* 2. FARMER REGISTRATION REQUEST FORM */}
        {activeMode === "farmer" && !submittedRequestId && (
          <form onSubmit={handleFarmerSubmit} className="p-6 sm:p-8 space-y-4">
            <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-300">
                  {t("किसान पहुंच नीति:", "Farmer Access Policy:", "Policy:")}
                </span>{" "}
                {t(
                  "किसान विवरण भरने के बाद आपका अनुरोध मालिक (tomarjii) के पास स्वीकृति हेतु जाएगा। अनुमोदन के बाद ही ऐप खुलेगा।",
                  "After submitting, your request will be queued for Owner (tomarjii) approval before app unlocks.",
                  "Request requires Owner approval."
                )}
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{t("किसान का पूरा नाम *", "Farmer Name *", "Name *")}</label>
                <input
                  type="text"
                  required
                  value={farmerName}
                  onChange={(e) => setFarmerName(e.target.value)}
                  placeholder="उदा. रामपाल सिंह"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{t("मोबाइल नंबर *", "Mobile Number *", "Phone *")}</label>
                <input
                  type="tel"
                  required
                  value={phoneNo}
                  onChange={(e) => setPhoneNo(e.target.value)}
                  placeholder="98XXXXXXXX"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{t("राज्य (State)", "State", "State")}</label>
                <select
                  value={selectedState}
                  onChange={(e) => {
                    setSelectedState(e.target.value);
                    const st = INDIAN_AGRI_STATES.find((s) => s.state === e.target.value);
                    if (st) setSelectedDistrict(st.districts[0]);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {INDIAN_AGRI_STATES.map((s) => (
                    <option key={s.state} value={s.state}>
                      {s.state} ({s.stateHi})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{t("जिला (District)", "District", "District")}</label>
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {stateObj.districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">{t("गांव का नाम (Village)", "Village Name", "Village")}</label>
                <input
                  type="text"
                  value={villageName}
                  onChange={(e) => setVillageName(e.target.value)}
                  placeholder="उदा. कुटेल"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  {t("कुल कृषि भूमि (एकड़)", "Land (Acres)", "Land")}: <strong className="text-amber-400">{landSizeAcres} एकड़</strong>
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={30}
                  step={0.5}
                  value={landSizeAcres}
                  onChange={(e) => setLandSizeAcres(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Submit Request Button */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const demo = getDemoFarmerProfile();
                  setFarmerName(demo.farmerName);
                  setPhoneNo(demo.phoneNo);
                  setSelectedState(demo.state);
                  setSelectedDistrict(demo.district);
                  setVillageName(demo.villageName);
                  setLandSizeAcres(demo.landSizeAcres);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                {t("⚡ डेमो भरें", "⚡ Demo Fill", "⚡ Demo")}
              </button>

              <button
                type="submit"
                className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs sm:text-sm shadow-xl shadow-emerald-950 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{t("अनुमोदन हेतु अनुरोध भेजें →", "Submit for Owner Approval →", "Request Access →")}</span>
              </button>
            </div>
          </form>
        )}

        {/* 3. FARMER PENDING APPROVAL HOLDING SCREEN */}
        {submittedRequestId && (
          <div className="p-6 sm:p-8 space-y-6 text-center animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-400 flex items-center justify-center mx-auto animate-pulse">
              <Clock className="w-8 h-8" />
            </div>

            <div>
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/50">
                Status: PENDING APPROVAL (अनुमोदन लंबित)
              </span>
              <h3 className="text-lg font-black text-white mt-3">
                {t("मालिक (tomarjii) के अनुमोदन की प्रतीक्षा है", "Waiting for Owner (tomarjii) Approval", "Awaiting Approval")}
              </h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto mt-2 leading-relaxed">
                {t(
                  `नमस्ते ${pendingFarmerProfile?.farmerName || "किसान मित्र"}! आपका अनुरोध आईडी [${submittedRequestId}] दर्ज है। जैसे ही मालिक (tomarjii) अपने डैशबोर्ड से स्वीकृति देंगे, ऐप तुरंत अनलॉक हो जाएगा।`,
                  `Hello ${pendingFarmerProfile?.farmerName || "Farmer"}! Request ID [${submittedRequestId}] is queued. App will unlock as soon as tomarjii approves it.`,
                  "Waiting for owner approval."
                )}
              </p>
            </div>

            {/* Live Polling Status Box */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                <span>{t("लाइव ऑटो-चेक चालू है (Auto-checking every 2s)...", "Live Auto-checking status...", "Auto checking...")}</span>
              </div>

              <button
                onClick={handleCheckApprovalNow}
                disabled={isCheckingApproval}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingApproval ? "animate-spin text-amber-400" : ""}`} />
                <span>{t("अभी स्थिति जांचें", "Check Status Now", "Check Now")}</span>
              </button>
            </div>

            {/* Bypass to Owner Login */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setSubmittedRequestId(null);
                  setActiveMode("owner");
                }}
                className="text-xs text-amber-400 hover:text-amber-300 underline font-bold cursor-pointer"
              >
                {t("👑 क्या आप मालिक हैं? पासवर्ड से लॉगिन करें →", "👑 Are you Owner? Login with Password →", "👑 Owner Login →")}
              </button>
            </div>
          </div>
        )}

        {/* Footer Trademark */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800/80 text-center text-[11px] text-slate-500 flex items-center justify-between px-6 font-mono">
          <span>Designed & Owned by <strong>tomarjii</strong></span>
          <span className="text-emerald-400">All Rights Reserved © 2026</span>
        </div>
      </div>
    </div>
  );
};

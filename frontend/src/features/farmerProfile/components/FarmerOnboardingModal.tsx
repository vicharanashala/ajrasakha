import React, { useState } from "react";
import type { IFarmerProfile, SoilType, IrrigationSource, FarmingType } from "../types";
import {
  INDIAN_AGRI_STATES,
  MAJOR_CROPS_LIST,
  SOIL_TYPES_LIST,
  IRRIGATION_SOURCES_LIST,
  LIVESTOCK_OPTIONS,
  MACHINERY_OPTIONS,
} from "../data/indianAgriGeoData";
import {
  calculateFarmerCategory,
  generateKisanCardId,
  getDemoFarmerProfile,
  getOwnerMasterProfile,
  farmerProfileService,
} from "../services/farmerProfileService";
import { ownerApprovalService } from "@/features/ownerDashboard/services/ownerApprovalService";
import { OwnerAuthModal } from "@/features/ownerDashboard/components/OwnerAuthModal";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import { toast } from "@/shared/components/toast";
import {
  User,
  Phone,
  MapPin,
  Sprout,
  Tractor,
  Wheat,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Flame,
  Zap,
  Info,
  Droplets,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onProfileCreated: (profile: IFarmerProfile) => void;
  existingProfile?: IFarmerProfile | null;
  onCancel?: () => void;
}

export const FarmerOnboardingModal: React.FC<Props> = ({
  isOpen,
  onProfileCreated,
  existingProfile,
  onCancel,
}) => {
  const { language, t } = useLanguage();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [farmerName, setFarmerName] = useState(existingProfile?.farmerName || "");
  const [phoneNo, setPhoneNo] = useState(existingProfile?.phoneNo || "");
  const [gender, setGender] = useState<"male" | "female" | "other">(existingProfile?.gender || "male");
  const [age, setAge] = useState<number | undefined>(existingProfile?.age || 38);

  const [selectedState, setSelectedState] = useState(existingProfile?.state || "Punjab");
  const [selectedDistrict, setSelectedDistrict] = useState(existingProfile?.district || "Ludhiana");
  const [blockOrTehsil, setBlockOrTehsil] = useState(existingProfile?.blockOrTehsil || "Samrala (समराला)");
  const [villageName, setVillageName] = useState(existingProfile?.villageName || "Bondli (बोंदली)");
  const [pincode, setPincode] = useState(existingProfile?.pincode || "141114");

  const [landSizeAcres, setLandSizeAcres] = useState<number>(existingProfile?.landSizeAcres || 4.5);
  const [soilType, setSoilType] = useState<SoilType>(existingProfile?.soilType || "alluvial");
  const [irrigationSource, setIrrigationSource] = useState<IrrigationSource>(
    existingProfile?.irrigationSource || "borewell"
  );

  const [primaryCrop, setPrimaryCrop] = useState(existingProfile?.primaryCrop || "Wheat (गेहूं)");
  const [secondaryCrops, setSecondaryCrops] = useState<string[]>(
    existingProfile?.secondaryCrops || ["Paddy / Rice (धान / चावल)"]
  );
  const [farmingType, setFarmingType] = useState<FarmingType>(existingProfile?.farmingType || "mixed");

  const [livestock, setLivestock] = useState<string[]>(
    existingProfile?.livestock || ["Dairy Cow (देसी / साहीवाल गाय)"]
  );
  const [machineryOwned, setMachineryOwned] = useState<string[]>(
    existingProfile?.machineryOwned || ["Tractor 40-50 HP (ट्रैक्टर)"]
  );
  const [showOwnerAuth, setShowOwnerAuth] = useState(false);

  if (!isOpen) return null;

  // Selected State Districts
  const stateObj = INDIAN_AGRI_STATES.find((s) => s.state === selectedState) || INDIAN_AGRI_STATES[0];
  const availableDistricts = stateObj.districts;

  const handleEnterAsOwner = () => {
    setShowOwnerAuth(true);
  };

  const handleOwnerAuthSuccess = (masterProfile: any) => {
    setShowOwnerAuth(false);
    onProfileCreated(masterProfile);
  };

  const handleQuickDemoFill = () => {
    const demo = getDemoFarmerProfile();
    setFarmerName(demo.farmerName);
    setPhoneNo(demo.phoneNo);
    setGender(demo.gender);
    setAge(demo.age);
    setSelectedState(demo.state);
    setSelectedDistrict(demo.district);
    setBlockOrTehsil(demo.blockOrTehsil);
    setVillageName(demo.villageName);
    setPincode(demo.pincode || "132114");
    setLandSizeAcres(demo.landSizeAcres);
    setSoilType(demo.soilType);
    setIrrigationSource(demo.irrigationSource);
    setPrimaryCrop(demo.primaryCrop);
    setSecondaryCrops(demo.secondaryCrops);
    setFarmingType(demo.farmingType);
    setLivestock(demo.livestock);
    setMachineryOwned(demo.machineryOwned);
    toast.success(t("डेमो किसान प्रोफाइल लोड हो गई!", "Demo Farmer Profile Loaded!", "Demo profile loaded!"));
  };

  const toggleSecondaryCrop = (cropName: string) => {
    setSecondaryCrops((prev) =>
      prev.includes(cropName) ? prev.filter((c) => c !== cropName) : [...prev, cropName]
    );
  };

  const toggleLivestock = (item: string) => {
    setLivestock((prev) =>
      prev.includes(item) ? prev.filter((l) => l !== item) : [...prev, item]
    );
  };

  const toggleMachinery = (mach: string) => {
    setMachineryOwned((prev) =>
      prev.includes(mach) ? prev.filter((m) => m !== mach) : [...prev, mach]
    );
  };

  const calculatedCategory = calculateFarmerCategory(landSizeAcres || 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!farmerName.trim()) {
      toast.error(t("कृपया किसान का नाम दर्ज करें!", "Please enter Farmer's Name!", "Enter name!"));
      setStep(1);
      return;
    }

    if (!phoneNo.trim() || phoneNo.length < 10) {
      toast.error(t("कृपया सही 10-अंकीय मोबाइल नंबर दर्ज करें!", "Please enter valid 10-digit Mobile Number!", "Enter valid phone!"));
      setStep(1);
      return;
    }

    const finalProfile: IFarmerProfile = {
      id: existingProfile?.id || generateKisanCardId(selectedState, phoneNo),
      farmerName: farmerName.trim(),
      phoneNo: phoneNo.trim(),
      gender,
      age: age || 35,
      state: selectedState,
      district: selectedDistrict,
      blockOrTehsil: blockOrTehsil.trim() || "Tehsil Center",
      villageName: villageName.trim() || "Gram Vikas",
      pincode: pincode.trim() || "110001",
      landSizeAcres: Number(landSizeAcres) || 2,
      farmerCategory: calculatedCategory,
      soilType,
      irrigationSource,
      primaryCrop,
      secondaryCrops,
      farmingType,
      livestock,
      machineryOwned,
      preferredLanguage: language === "en" ? "en" : language === "hinglish" ? "hinglish" : "hi",
      registeredAt: existingProfile?.registeredAt || new Date().toISOString(),
      isVerified: true,
    };

    farmerProfileService.saveProfile(finalProfile);
    ownerApprovalService.registerNewFarmer(finalProfile);

    toast.success(
      t(
        `स्वागत है ${finalProfile.farmerName}! आपका किसान पंजीकरण सफल रहा (मालिक अनुमोदन भेजा गया)।`,
        `Welcome ${finalProfile.farmerName}! Registration complete & sent for Owner Approval.`,
        `Welcome ${finalProfile.farmerName}! Registration sent for approval.`
      )
    );

    onProfileCreated(finalProfile);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-slate-950/95 backdrop-blur-2xl overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-3xl bg-slate-900 border-2 border-emerald-500/40 shadow-[0_0_80px_rgba(16,185,129,0.25)] overflow-hidden flex flex-col my-auto max-h-[94vh]">
        {/* Top Decorative Banner */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-amber-950 p-5 sm:p-6 border-b border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-600 to-amber-500 border border-emerald-300 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-950 flex-shrink-0">
              <Sprout className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  {t("किसान प्रोफाइल पंजीकरण", "Farmer Profile & Digital Passbook", "Kisan Profile Registration")}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Step {step} of 4
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {t(
                  "अज्रसखा का उपयोग करने के लिए अपना किसान विवरण भरें (एक बार पंजीकरण)",
                  "Complete your farm profile to access personalized AI, Weather & Rates",
                  "Apna kisan profile banayein aage badhne ke liye"
                )}
              </p>
            </div>
          </div>

          {/* Quick Action Buttons: Owner Direct Bypass & Demo Fill */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEnterAsOwner}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black shadow-lg shadow-amber-950/80 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              <span>{t("👑 मैं मालिक हूँ (tomarjii) - सीधा प्रवेश →", "👑 I am Owner (tomarjii) - Direct Access →", "👑 Owner Direct Access →")}</span>
            </button>

            <button
              type="button"
              onClick={handleQuickDemoFill}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <span>{t("⚡ किसान डेमो भरें", "⚡ Demo Farmer", "⚡ Demo")}</span>
            </button>
          </div>
        </div>

        {/* Step Indicator Tabs */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/60 text-xs font-semibold">
          {[
            { id: 1, label: t("1. व्यक्तिगत", "1. Personal", "1. Personal"), icon: User },
            { id: 2, label: t("2. स्थान / पता", "2. Location", "2. Location"), icon: MapPin },
            { id: 3, label: t("3. खेत व मिट्टी", "3. Land & Soil", "3. Land & Soil"), icon: Wheat },
            { id: 4, label: t("4. फसलें व यंत्र", "4. Crops & Implements", "4. Crops & Tech"), icon: Tractor },
          ].map((s) => {
            const Icon = s.icon;
            const isCurrent = step === s.id;
            const isDone = step > s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id as any)}
                className={`py-3 px-2 flex items-center justify-center gap-1.5 transition-colors border-b-2 text-center ${
                  isCurrent
                    ? "border-emerald-400 text-emerald-300 bg-emerald-950/40 font-bold"
                    : isDone
                    ? "border-emerald-600/60 text-emerald-400/80 hover:bg-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.id}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-7 overflow-y-auto flex-1 flex flex-col justify-between gap-6">
          {/* ──────────────── STEP 1: PERSONAL DETAILS ──────────────── */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-200 flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  {t(
                    "यह जानकारी आपके लिए व्यक्तिगत मौसम पूर्वानुमान, मंडी भाव और सरकारी योजनाओं के लिए आवश्यक है।",
                    "This information customizes advisory, Mandi Bhav and government schemes for your farm.",
                    "Yeh info aapke farm ke hisab se AI salah dene ke liye zaroori hai."
                  )}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Farmer Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t("किसान का पूरा नाम (Full Name) *", "Farmer Full Name *", "Farmer Name *")}</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={farmerName}
                    onChange={(e) => setFarmerName(e.target.value)}
                    placeholder={t("उदा. रामपाल सिंह / चौधरी सुखविंदर", "e.g. Rampal Singh / Sukhwinder", "e.g. Ramesh Kumar")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Mobile Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t("मोबाइल / व्हाट्सएप्प नंबर (Phone / WhatsApp) *", "Mobile / WhatsApp *", "Mobile No *")}</span>
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={phoneNo}
                    onChange={(e) => setPhoneNo(e.target.value.replace(/\D/g, ""))}
                    placeholder="9876543210"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Gender */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    {t("लिंग (Gender)", "Gender", "Gender")}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "male", label: t("पुरुष (Male)", "Male", "Male") },
                      { id: "female", label: t("महिला (Female)", "Female", "Female") },
                      { id: "other", label: t("अन्य (Other)", "Other", "Other") },
                    ].map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGender(g.id as any)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                          gender === g.id
                            ? "bg-emerald-600 text-white border-emerald-400 shadow-md"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Age */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    {t("आयु (Age in Years)", "Age (Years)", "Age")}
                  </label>
                  <input
                    type="number"
                    min={18}
                    max={95}
                    value={age || ""}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ──────────────── STEP 2: LOCATION DETAILS ──────────────── */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* State */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t("राज्य (State) *", "State *", "State *")}</span>
                  </label>
                  <select
                    value={selectedState}
                    onChange={(e) => {
                      setSelectedState(e.target.value);
                      const s = INDIAN_AGRI_STATES.find((x) => x.state === e.target.value);
                      if (s && s.districts.length > 0) {
                        setSelectedDistrict(s.districts[0]);
                      }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                  >
                    {INDIAN_AGRI_STATES.map((s) => (
                      <option key={s.state} value={s.state} className="bg-slate-900 text-white">
                        {language === "hi" ? s.stateHi : s.state} ({s.stateHi})
                      </option>
                    ))}
                  </select>
                </div>

                {/* District */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    {t("जिला (District) *", "District *", "District *")}
                  </label>
                  <select
                    value={selectedDistrict}
                    onChange={(e) => setSelectedDistrict(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                  >
                    {availableDistricts.map((d) => (
                      <option key={d} value={d} className="bg-slate-900 text-white">
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Block / Tehsil */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    {t("तहसील / ब्लॉक (Tehsil / Block)", "Tehsil / Block", "Tehsil")}
                  </label>
                  <input
                    type="text"
                    value={blockOrTehsil}
                    onChange={(e) => setBlockOrTehsil(e.target.value)}
                    placeholder={t("उदा. घरौंडा / समराला / आमेर", "e.g. Gharaunda / Samrala", "e.g. Samrala")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                {/* Village */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    {t("गांव का नाम (Village Name)", "Village Name", "Village Name")}
                  </label>
                  <input
                    type="text"
                    value={villageName}
                    onChange={(e) => setVillageName(e.target.value)}
                    placeholder={t("उदा. कुटेल / बोंदली / रामपुर", "e.g. Kutail / Bondli", "e.g. Kutail")}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ──────────────── STEP 3: LAND, SOIL & IRRIGATION ──────────────── */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Land Size */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                      <Wheat className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t("कुल कृषि भूमि (Total Land in Acres) *", "Total Land (Acres) *", "Total Land (Acres)")}</span>
                    </label>
                    <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                      {landSizeAcres} एकड़ (Acres)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="50"
                    step="0.5"
                    value={landSizeAcres}
                    onChange={(e) => setLandSizeAcres(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>0.5 एकड़</span>
                    <span className="text-emerald-400 font-bold">
                      {calculatedCategory === "marginal"
                        ? "सीमांत किसान (Marginal)"
                        : calculatedCategory === "small"
                        ? "लघु किसान (Small)"
                        : calculatedCategory === "medium"
                        ? "मध्यम किसान (Medium)"
                        : "वृहद किसान (Large)"}
                    </span>
                    <span>50 एकड़</span>
                  </div>
                </div>

                {/* Soil Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    {t("मिट्टी का प्रकार (Soil Type)", "Soil Type", "Soil Type")}
                  </label>
                  <select
                    value={soilType}
                    onChange={(e) => setSoilType(e.target.value as SoilType)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                  >
                    {SOIL_TYPES_LIST.map((s) => (
                      <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                        {language === "en" ? s.labelEn : s.labelHi}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Irrigation Source */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Droplets className="w-3.5 h-3.5 text-blue-400" />
                    <span>{t("मुख्य सिंचाई साधन (Irrigation Source)", "Irrigation Source", "Irrigation Source")}</span>
                  </label>
                  <select
                    value={irrigationSource}
                    onChange={(e) => setIrrigationSource(e.target.value as IrrigationSource)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                  >
                    {IRRIGATION_SOURCES_LIST.map((irr) => (
                      <option key={irr.id} value={irr.id} className="bg-slate-900 text-white">
                        {language === "en" ? irr.labelEn : irr.labelHi}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Farming Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    {t("खेती की पद्धति (Farming Method)", "Farming Method", "Farming Method")}
                  </label>
                  <select
                    value={farmingType}
                    onChange={(e) => setFarmingType(e.target.value as FarmingType)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                  >
                    <option value="mixed" className="bg-slate-900 text-white">मिश्रित खेती (Mixed Chemical & Bio)</option>
                    <option value="organic" className="bg-slate-900 text-white">100% जैविक / प्राकृतिक (Organic)</option>
                    <option value="chemical" className="bg-slate-900 text-white">पारंपरिक रासायनिक (Conventional)</option>
                    <option value="natural" className="bg-slate-900 text-white">शून्य बजट प्राकृतिक खेती (ZBNF)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────── STEP 4: CROPS, LIVESTOCK & MACHINERY ──────────────── */}
          {step === 4 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Primary Crop */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <Wheat className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t("मुख्य फसल (Primary Crop) *", "Primary Crop *", "Primary Crop *")}</span>
                </label>
                <select
                  value={primaryCrop}
                  onChange={(e) => setPrimaryCrop(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                >
                  {MAJOR_CROPS_LIST.map((c) => (
                    <option key={c.id} value={c.nameEn} className="bg-slate-900 text-white">
                      {c.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Secondary Crops Checkboxes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  {t("अन्य फसलें (Secondary / Companion Crops)", "Secondary Crops", "Secondary Crops")}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MAJOR_CROPS_LIST.slice(0, 8).map((c) => {
                    const isSelected = secondaryCrops.includes(c.nameEn);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleSecondaryCrop(c.nameEn)}
                        className={`p-2 rounded-xl text-xs font-medium border text-left flex items-center justify-between transition-all ${
                          isSelected
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-400 font-bold"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                        }`}
                      >
                        <span className="truncate">{c.nameHi}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Machinery Owned */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1">
                  <Tractor className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t("उपलब्ध कृषि यंत्र (Owned Equipment)", "Owned Machinery", "Machinery")}</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {MACHINERY_OPTIONS.map((m) => {
                    const isSelected = machineryOwned.includes(m.labelEn);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMachinery(m.labelEn)}
                        className={`p-2 rounded-xl text-xs font-medium border text-left flex items-center justify-between transition-all ${
                          isSelected
                            ? "bg-amber-500/20 text-amber-300 border-amber-400 font-bold"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                        }`}
                      >
                        <span className="truncate">{m.labelHi}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Livestock */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  {t("पशुपालन (Livestock / Dairy)", "Livestock / Dairy", "Livestock")}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {LIVESTOCK_OPTIONS.map((l) => {
                    const isSelected = livestock.includes(l.labelEn);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => toggleLivestock(l.labelEn)}
                        className={`p-2 rounded-xl text-xs font-medium border text-left flex items-center justify-between transition-all ${
                          isSelected
                            ? "bg-teal-500/20 text-teal-300 border-teal-400 font-bold"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                        }`}
                      >
                        <span className="truncate">{l.labelHi}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Bottom Action Buttons: Prev, Next & Submit */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t("पिछला (Back)", "Back", "Back")}</span>
              </button>
            ) : onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition-colors"
              >
                {t("रद्द करें", "Cancel", "Cancel")}
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && (!farmerName.trim() || !phoneNo.trim())) {
                    toast.error(t("कृपया नाम और मोबाइल नंबर भरें!", "Enter Name and Mobile!", "Fill details!"));
                    return;
                  }
                  setStep((s) => (s + 1) as any);
                }}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-950 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ml-auto"
              >
                <span>{t("अगला (Next)", "Next", "Next")}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                className="flex items-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 hover:from-emerald-400 hover:to-amber-300 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-emerald-950/80 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer ml-auto"
              >
                <Sparkles className="w-4 h-4 fill-slate-950" />
                <span>
                  {t(
                    "पंजीकरण पूरा करें एवं प्रवेश करें →",
                    "Complete Registration & Enter Hub →",
                    "Save & Enter →"
                  )}
                </span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Owner Master Auth Password Modal */}
      <OwnerAuthModal
        isOpen={showOwnerAuth}
        onClose={() => setShowOwnerAuth(false)}
        onSuccess={handleOwnerAuthSuccess}
      />
    </div>
  );
};

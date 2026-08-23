import React, { useState } from "react";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { AjrasakhaSplashIntro } from "./components/AjrasakhaSplashIntro";
import { FarmerFriendTractorBackground } from "./components/FarmerFriendTractorBackground";
import { useSecurityGuard } from "./hooks/useSecurityGuard";
import { KisanAIChatbot } from "@/features/kisanAI/KisanAIChatbot";
import { FarmerFeedbackDashboard } from "@/features/farmerFeedback/FarmerFeedbackDashboard";
import { AgroWeatherView } from "@/features/agroWeather/AgroWeatherView";
import { CropDiseaseScanner } from "@/features/cropScanner/CropDiseaseScanner";
import { MandiBhavTracker } from "@/features/mandiBhav/MandiBhavTracker";
import { FertilizerCalculator } from "@/features/fertilizerCalc/FertilizerCalculator";
import { EquipmentHub } from "@/features/equipmentHub/EquipmentHub";
import { KrishiVideosHub } from "@/features/krishiVideos/KrishiVideosHub";
import { FarmerOnboardingModal } from "@/features/farmerProfile/components/FarmerOnboardingModal";
import { FarmerDigitalCardModal } from "@/features/farmerProfile/components/FarmerDigitalCardModal";
import { FarmerProfileHeaderBadge } from "@/features/farmerProfile/components/FarmerProfileHeaderBadge";
import { farmerProfileService } from "@/features/farmerProfile/services/farmerProfileService";
import { OwnerDashboard } from "@/features/ownerDashboard/OwnerDashboard";
import { OwnerNotificationBell } from "@/features/ownerDashboard/components/OwnerNotificationBell";
import { ownerApprovalService } from "@/features/ownerDashboard/services/ownerApprovalService";
import type { IFarmerProfile } from "@/features/farmerProfile/types";
import {
  Bot,
  BarChart3,
  CloudSun,
  Scan,
  TrendingUp,
  Calculator,
  Sprout,
  ShieldCheck,
  Sparkles,
  Tractor,
  Youtube,
  UserPlus,
  Crown,
  Lock,
} from "lucide-react";
import { toast } from "@/shared/components/toast";

export type AjrasakhaTab =
  | "kisan-ai"
  | "farmer-feedback"
  | "equipment-rates"
  | "krishi-videos"
  | "agro-weather"
  | "crop-scanner"
  | "mandi-bhav"
  | "fertilizer-calc"
  | "owner-admin";

interface Props {
  initialTab?: AjrasakhaTab;
}

const AjrasakhaHubContent: React.FC<Props> = ({ initialTab = "kisan-ai" }) => {
  const [activeTab, setActiveTab] = useState<AjrasakhaTab>(initialTab);
  const { language, setLanguage, t } = useLanguage();

  // Load existing farmer profile
  const [farmerProfile, setFarmerProfile] = useState<IFarmerProfile | null>(() => {
    return farmerProfileService.getProfile();
  });

  // Onboarding & Splash Flow
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !farmerProfileService.getProfile();
  });
  const [showSplash, setShowSplash] = useState<boolean>(false);

  // Modals
  const [showDigitalCard, setShowDigitalCard] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Enable Anti-Inspection & Copy-Protection Security Guard
  useSecurityGuard();

  const handleProfileCreated = (profile: IFarmerProfile) => {
    setFarmerProfile(profile);
    setShowOnboarding(false);
    setIsEditingProfile(false);
    // Trigger splash intro animation with tractor right after onboarding
    setShowSplash(true);
  };

  const handleSwitchProfile = () => {
    setShowDigitalCard(false);
    setIsEditingProfile(false);
    setShowOnboarding(true);
  };

  const handleFullResetAndFreshLogin = () => {
    farmerProfileService.clearProfile();
    setFarmerProfile(null);
    setShowDigitalCard(false);
    setIsEditingProfile(false);
    setShowSplash(false);
    setShowOnboarding(true);
    toast.success(t("सत्र रीसेट हो गया! कृपया नया किसान विवरण भरें।", "Session reset! Please enter new farmer details.", "Reset complete."));
  };

  const TABS = [
    {
      id: "kisan-ai" as AjrasakhaTab,
      labelEn: "Kisan AI Assistant",
      labelHi: "किसान AI सहायक",
      labelHinglish: "Kisan AI Sahayak",
      icon: Bot,
      badge: "Voice & TTS",
    },
    {
      id: "farmer-feedback" as AjrasakhaTab,
      labelEn: "Feedback Loop (Project 5)",
      labelHi: "फीडबैक एनालिटिक्स",
      labelHinglish: "Farmer Feedback Loop",
      icon: BarChart3,
      badge: "MongoDB Live",
    },
    {
      id: "equipment-rates" as AjrasakhaTab,
      labelEn: "Equipment & Live Rates",
      labelHi: "कृषि उपकरण व दरें",
      labelHinglish: "Equipment & CHC Rates",
      icon: Tractor,
      badge: "CHC & SMAM",
    },
    {
      id: "krishi-videos" as AjrasakhaTab,
      labelEn: "Krishi Video Academy",
      labelHi: "कृषि वीडियो हब",
      labelHinglish: "Krishi Video Academy",
      icon: Youtube,
      badge: "HD Tutorials",
    },
    {
      id: "agro-weather" as AjrasakhaTab,
      labelEn: "Agro-Weather & Advisory",
      labelHi: "मौसम व स्प्रे सलाह",
      labelHinglish: "Mausam & Spray Salah",
      icon: CloudSun,
      badge: "Live Satellite",
    },
    {
      id: "crop-scanner" as AjrasakhaTab,
      labelEn: "Crop Disease Scanner",
      labelHi: "फसल रोग पहचान",
      labelHinglish: "Fasal Rog Pehchan",
      icon: Scan,
      badge: "Vision AI",
    },
    {
      id: "mandi-bhav" as AjrasakhaTab,
      labelEn: "Mandi Bhav Tracker",
      labelHi: "दैनिक मंडी भाव",
      labelHinglish: "Mandi Bhav Tracker",
      icon: TrendingUp,
      badge: "APMC Live",
    },
    {
      id: "fertilizer-calc" as AjrasakhaTab,
      labelEn: "NPK Calculator",
      labelHi: "संतुलित खाद कैलकुलेटर",
      labelHinglish: "NPK Khaad Calculator",
      icon: Calculator,
      badge: "Precision",
    },
    {
      id: "owner-admin" as AjrasakhaTab,
      labelEn: "Tomarjii Admin Hub",
      labelHi: "👑 मालिक डैशबोर्ड (Tomarjii)",
      labelHinglish: "Tomarjii Owner Hub",
      icon: Crown,
      badge: "Owner VIP",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950 font-sans ajrasakha-protected relative overflow-x-hidden">
      {/* Background Stylized Farmer Friend & Tractor Canvas */}
      <FarmerFriendTractorBackground />

      {/* 1. Mandatory Farmer Onboarding Gatekeeper Modal */}
      {(showOnboarding || isEditingProfile) && (
        <FarmerOnboardingModal
          isOpen={showOnboarding || isEditingProfile}
          onProfileCreated={handleProfileCreated}
          existingProfile={isEditingProfile ? farmerProfile : null}
          onCancel={isEditingProfile ? () => setIsEditingProfile(false) : undefined}
        />
      )}

      {/* 2. Intro Splash Animation with Driving Tractor */}
      {showSplash && (
        <AjrasakhaSplashIntro
          onComplete={() => {
            setShowSplash(false);
          }}
        />
      )}

      {/* 3. Digital Kisan ID Card Passbook Modal */}
      <FarmerDigitalCardModal
        profile={farmerProfile}
        isOpen={showDigitalCard}
        onClose={() => setShowDigitalCard(false)}
        onEdit={() => {
          setShowDigitalCard(false);
          setIsEditingProfile(true);
        }}
        onSwitchProfile={handleSwitchProfile}
        onResetSession={handleFullResetAndFreshLogin}
      />

      {/* Top Main Master Header */}
      <header className="sticky top-0 z-50 bg-slate-950/90 border-b border-slate-800/80 backdrop-blur-2xl px-4 py-3 shadow-2xl transition-all duration-300">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Logo & Brand Title */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-600 to-amber-600 border border-emerald-300/40 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-950/80 hover:scale-105 transition-transform duration-300">
                <Sprout className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                    Ajrasakha <span className="text-emerald-400 font-semibold">(अज्रसखा)</span>
                  </h1>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/80 shadow-sm flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    tomarjii ecosystem
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {t(
                    "राष्ट्रीय कृषि बुद्धिमत्ता, उपकरण दरें एवं किसान वीडियो नेटवर्क",
                    "National Agriculture Intelligence, Machinery Rates & Video Hub",
                    "Rashtriya Krishi AI, Machinery Rates & Video Network"
                  )}
                </p>
              </div>
            </div>

            {/* Farmer Profile Badge + Owner Bell + Language Toggle */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Owner Notification Bell */}
              <OwnerNotificationBell onOpenOwnerDashboard={() => setActiveTab("owner-admin")} />

              {farmerProfile ? (
                <FarmerProfileHeaderBadge
                  profile={farmerProfile}
                  onOpenCard={() => setShowDigitalCard(true)}
                />
              ) : (
                <button
                  onClick={() => setShowOnboarding(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold shadow-md transition-colors cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{t("प्रोफाइल बनाएं", "Create Profile", "Profile")}</span>
                </button>
              )}

              {/* Global Language Toggle */}
              <div className="flex items-center bg-slate-900/90 border border-slate-700/80 rounded-xl p-1 text-xs shadow-lg backdrop-blur-md">
                <button
                  onClick={() => setLanguage("en")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all duration-200 ${
                    language === "en"
                      ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🇬🇧 EN
                </button>
                <button
                  onClick={() => setLanguage("hi")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all duration-200 ${
                    language === "hi"
                      ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🇮🇳 हिन्दी
                </button>
                <button
                  onClick={() => setLanguage("hinglish")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition-all duration-200 ${
                    language === "hinglish"
                      ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🌾 Hinglish
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Tab Switcher */}
          <nav className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto py-1 no-scrollbar">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const label =
                language === "en"
                  ? tab.labelEn
                  : language === "hinglish"
                  ? tab.labelHinglish
                  : tab.labelHi;
              const isOwnerTab = tab.id === "owner-admin";
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 shadow-sm active:scale-95 flex-shrink-0 border ${
                    isActive
                      ? isOwnerTab
                        ? "bg-amber-500 text-slate-950 border-amber-300 font-bold shadow-lg shadow-amber-950/80 scale-[1.02]"
                        : "bg-emerald-500 text-slate-950 border-emerald-300 font-bold shadow-lg shadow-emerald-950/80 scale-[1.02]"
                      : isOwnerTab
                      ? "bg-amber-950/40 hover:bg-amber-950/80 text-amber-300 hover:text-amber-200 border-amber-500/40"
                      : "bg-slate-900/80 hover:bg-slate-800/90 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-slate-950" : isOwnerTab ? "text-amber-400" : "text-emerald-400"}`} />
                  <span>{label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? "bg-slate-950 text-emerald-300"
                          : isOwnerTab
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Active Tab Content View with Smooth Animation */}
      <main key={activeTab} className="flex-1 w-full ajrasakha-tab-enter">
        {activeTab === "kisan-ai" && <KisanAIChatbot />}
        {activeTab === "farmer-feedback" && <FarmerFeedbackDashboard />}
        {activeTab === "equipment-rates" && <EquipmentHub />}
        {activeTab === "krishi-videos" && <KrishiVideosHub />}
        {activeTab === "agro-weather" && <AgroWeatherView />}
        {activeTab === "crop-scanner" && <CropDiseaseScanner />}
        {activeTab === "mandi-bhav" && <MandiBhavTracker />}
        {activeTab === "fertilizer-calc" && <FertilizerCalculator />}
        {activeTab === "owner-admin" && <OwnerDashboard onResetSession={handleFullResetAndFreshLogin} />}
      </main>

      {/* Footer with Owner Branding & All Rights Reserved */}
      <footer className="border-t border-slate-800/80 bg-slate-950/95 py-4 px-4 text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-slate-200">
            Designed, Engineered & Owned by <strong className="text-amber-400 font-black">tomarjii</strong>
          </span>
        </div>
        <div className="text-[11px] text-emerald-400/90 flex items-center gap-1 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>All Rights Reserved © 2026 tomarjii • Ajrasakha National Agricultural AI Ecosystem</span>
        </div>
      </footer>
    </div>
  );
};

export const AjrasakhaHub: React.FC<Props> = (props) => {
  return (
    <LanguageProvider>
      <AjrasakhaHubContent {...props} />
    </LanguageProvider>
  );
};

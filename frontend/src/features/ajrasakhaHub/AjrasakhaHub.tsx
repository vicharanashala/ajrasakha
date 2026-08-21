import React, { useState } from "react";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { AjrasakhaSplashIntro } from "./components/AjrasakhaSplashIntro";
import { useSecurityGuard } from "./hooks/useSecurityGuard";
import { KisanAIChatbot } from "@/features/kisanAI/KisanAIChatbot";
import { FarmerFeedbackDashboard } from "@/features/farmerFeedback/FarmerFeedbackDashboard";
import { AgroWeatherView } from "@/features/agroWeather/AgroWeatherView";
import { CropDiseaseScanner } from "@/features/cropScanner/CropDiseaseScanner";
import { MandiBhavTracker } from "@/features/mandiBhav/MandiBhavTracker";
import { FertilizerCalculator } from "@/features/fertilizerCalc/FertilizerCalculator";
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
} from "lucide-react";

export type AjrasakhaTab =
  | "kisan-ai"
  | "farmer-feedback"
  | "agro-weather"
  | "crop-scanner"
  | "mandi-bhav"
  | "fertilizer-calc";

interface Props {
  initialTab?: AjrasakhaTab;
}

const AjrasakhaHubContent: React.FC<Props> = ({ initialTab = "kisan-ai" }) => {
  const [activeTab, setActiveTab] = useState<AjrasakhaTab>(initialTab);
  const [showSplash, setShowSplash] = useState(true);
  const { language, setLanguage, t } = useLanguage();

  // Enable Anti-Inspection & Copy-Protection Security Guard
  useSecurityGuard();

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
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950 font-sans ajrasakha-protected relative overflow-x-hidden">
      {/* Background ambient glowing gradient spheres */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[450px] h-[450px] bg-teal-600/10 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Intro Splash Animation */}
      {showSplash && <AjrasakhaSplashIntro onComplete={() => setShowSplash(false)} />}

      {/* Top Main Master Header */}
      <header className="sticky top-0 z-50 bg-slate-950/85 border-b border-slate-800/80 backdrop-blur-2xl px-4 py-3 shadow-2xl transition-all duration-300">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Logo & Brand Title */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-600 to-teal-800 border border-emerald-300/40 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-950/80 hover:scale-105 transition-transform duration-300">
                <Sprout className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                    Ajrasakha <span className="text-emerald-400 font-semibold">(अज्रसखा)</span>
                  </h1>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/80 shadow-sm flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    Enterprise AI
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {t(
                    "राष्ट्रीय कृषि बुद्धिमत्ता एवं किसान फीडबैक नेटवर्क",
                    "National AI Agriculture Intelligence & Farmer Feedback Network",
                    "Rashtriya Krishi AI & Farmer Feedback Network"
                  )}
                </p>
              </div>
            </div>

            {/* Global Language Toggle */}
            <div className="flex items-center gap-2">
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
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 shadow-sm active:scale-95 flex-shrink-0 border ${
                    isActive
                      ? "bg-emerald-500 text-slate-950 border-emerald-300 font-bold shadow-lg shadow-emerald-950/80 scale-[1.02]"
                      : "bg-slate-900/80 hover:bg-slate-800/90 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-slate-950" : "text-emerald-400"}`} />
                  <span>{label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? "bg-slate-950 text-emerald-300"
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
        {activeTab === "agro-weather" && <AgroWeatherView />}
        {activeTab === "crop-scanner" && <CropDiseaseScanner />}
        {activeTab === "mandi-bhav" && <MandiBhavTracker />}
        {activeTab === "fertilizer-calc" && <FertilizerCalculator />}
      </main>

      {/* Footer with Security Badge */}
      <footer className="border-t border-slate-800/80 bg-slate-950/90 py-3 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-center gap-2">
        <span>Ajrasakha (अज्रसखा) Agricultural AI • Empowering Farmers with Golden Q&A Intelligence & Feedback Loop</span>
        <span className="text-[11px] text-emerald-500/80 flex items-center gap-1 font-mono">
          <ShieldCheck className="w-3.5 h-3.5" />
          Protected & Encrypted • All Rights Reserved © 2026
        </span>
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

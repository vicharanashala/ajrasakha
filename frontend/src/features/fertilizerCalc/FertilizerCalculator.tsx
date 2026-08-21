import React, { useState } from "react";
import {
  FlaskConical,
  Calculator,
  Sprout,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Wheat,
  Layers,
  Scale,
} from "lucide-react";

interface CropFertilizerProfile {
  name: string;
  hindiName: string;
  basalDapKg: number; // per acre
  basalMopKg: number;
  basalZincKg: number;
  splitUrea1Kg: number; // 21-25 days
  splitUrea2Kg: number; // 40-45 days
  micronutrientAdvice: string;
}

const CROP_PROFILES: Record<string, CropFertilizerProfile> = {
  Wheat: {
    name: "Wheat",
    hindiName: "गेहूं",
    basalDapKg: 50, // 1 bag
    basalMopKg: 20,
    basalZincKg: 10,
    splitUrea1Kg: 40,
    splitUrea2Kg: 40,
    micronutrientAdvice: "बालियां निकलते समय 0.5% जिंक सल्फेट + 2% यूरिया का पर्णीय छिड़काव करें।",
  },
  Rice: {
    name: "Paddy / Rice",
    hindiName: "धान",
    basalDapKg: 45,
    basalMopKg: 25,
    basalZincKg: 10,
    splitUrea1Kg: 35,
    splitUrea2Kg: 35,
    micronutrientAdvice: "रोपाई के 30 दिन बाद 0.2% जिंक EDTA का स्प्रे करने से खैरा रोग से बचाव होता है।",
  },
  Cotton: {
    name: "Cotton",
    hindiName: "कपास (नरमा)",
    basalDapKg: 55,
    basalMopKg: 30,
    basalZincKg: 10,
    splitUrea1Kg: 45,
    splitUrea2Kg: 45,
    micronutrientAdvice: "फूल व टिंडे बनते समय 1% पोटेशियम नाइट्रेट (13:0:45) + 0.1% बोरॉन का स्प्रे करें।",
  },
  Mustard: {
    name: "Mustard",
    hindiName: "सरसों",
    basalDapKg: 40,
    basalMopKg: 15,
    basalZincKg: 10,
    splitUrea1Kg: 35,
    splitUrea2Kg: 0,
    micronutrientAdvice: "सल्फर (बेंटोनाइट 90%) @ 10 किग्रा/एकड़ अवश्य डालें जिससे तेल की मात्रा बढ़ती है।",
  },
  Potato: {
    name: "Potato",
    hindiName: "आलू",
    basalDapKg: 75,
    basalMopKg: 50,
    basalZincKg: 10,
    splitUrea1Kg: 50,
    splitUrea2Kg: 40,
    micronutrientAdvice: "कंद बनते समय (Tubering Stage) बोरॉन 20% @ 1 ग्राम/लीटर का स्प्रे करें।",
  },
  Sugarcane: {
    name: "Sugarcane",
    hindiName: "गन्ना",
    basalDapKg: 80,
    basalMopKg: 60,
    basalZincKg: 15,
    splitUrea1Kg: 65,
    splitUrea2Kg: 65,
    micronutrientAdvice: "गन्ने में फेरस सल्फेट 0.5% का स्प्रे पीलापन दूर करने के लिए करें।",
  },
};

export const FertilizerCalculator: React.FC = () => {
  const [selectedCrop, setSelectedCrop] = useState<string>("Wheat");
  const [acres, setAcres] = useState<number>(2);
  const [soilType, setSoilType] = useState<string>("Loamy");

  const profile = CROP_PROFILES[selectedCrop] || CROP_PROFILES["Wheat"];

  // Soil type multiplier
  const soilMultiplier = soilType === "Sandy" ? 1.15 : soilType === "Clay" ? 0.95 : 1.0;

  const totalDapKg = Math.round(profile.basalDapKg * acres * soilMultiplier);
  const totalDapBags = (totalDapKg / 50).toFixed(1);

  const totalMopKg = Math.round(profile.basalMopKg * acres * soilMultiplier);
  const totalZincKg = Math.round(profile.basalZincKg * acres);

  const totalUreaSplit1Kg = Math.round(profile.splitUrea1Kg * acres * soilMultiplier);
  const totalUreaSplit2Kg = Math.round(profile.splitUrea2Kg * acres * soilMultiplier);
  const totalUreaKg = totalUreaSplit1Kg + totalUreaSplit2Kg;
  const totalUreaBags = (totalUreaKg / 45).toFixed(1);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-800 border border-emerald-400/50 flex items-center justify-center text-white shadow-lg shadow-emerald-950/60">
            <Calculator className="w-7 h-7 text-emerald-100 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">
                Smart NPK Fertilizer & Dosage Calculator (संतुलित खाद कैलकुलेटर)
              </h2>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                Agronomy Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">
              खेत के क्षेत्रफल (एकड़), फसल और मिट्टी अनुसार यूरिया, डीएपी, पोटाश की सटीक मात्रा
            </p>
          </div>
        </div>
      </div>

      {/* Main Calculator Inputs & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Inputs Card */}
        <div className="lg:col-span-5 rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl backdrop-blur-xl space-y-5">
          <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-3">
            खेत व फसल का विवरण (Input Details)
          </h3>

          {/* Crop Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">फसल चुनें (Crop):</label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              {Object.keys(CROP_PROFILES).map((crop) => (
                <option key={crop} value={crop}>
                  {CROP_PROFILES[crop].hindiName} ({CROP_PROFILES[crop].name})
                </option>
              ))}
            </select>
          </div>

          {/* Acres Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-300">
              <span>खेत का क्षेत्रफल (Land Area):</span>
              <span className="text-emerald-400 font-bold">{acres} एकड़ (Acres)</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="25"
              step="0.5"
              value={acres}
              onChange={(e) => setAcres(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0.5 एकड़</span>
              <span>10 एकड़</span>
              <span>25 एकड़</span>
            </div>
          </div>

          {/* Soil Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">मिट्टी का प्रकार (Soil Type):</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "Loamy", name: "दोमट (Loam)" },
                { id: "Clay", name: "काली/चिकनी (Clay)" },
                { id: "Sandy", name: "रेतीली (Sandy)" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSoilType(s.id)}
                  className={`p-2 rounded-xl text-xs font-semibold border transition-all ${
                    soilType === s.id
                      ? "bg-emerald-950 text-emerald-300 border-emerald-600 shadow-sm"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Output Recommendations Card */}
        <div className="lg:col-span-7 rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl backdrop-blur-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <span className="text-xs font-semibold text-emerald-400">
                कुल क्षेत्रफल: {acres} एकड़ • {profile.hindiName}
              </span>
              <h3 className="text-base font-bold text-slate-100 mt-0.5">
                अनुशंसित उर्वरक खुराक (Recommended Fertilizer Schedule)
              </h3>
            </div>
          </div>

          {/* 3 Main Bags Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* DAP Card */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1 text-center">
              <span className="text-[11px] font-bold text-emerald-400 block uppercase">
                DAP (18:46:0)
              </span>
              <div className="text-2xl font-black text-slate-100">{totalDapKg} kg</div>
              <span className="text-xs text-slate-400 block">
                ≈ {totalDapBags} बोरी (50kg)
              </span>
              <span className="text-[10px] text-emerald-500 font-medium block pt-1">
                बुवाई के समय (Basal)
              </span>
            </div>

            {/* Urea Card */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1 text-center">
              <span className="text-[11px] font-bold text-blue-400 block uppercase">
                Neem Urea (46% N)
              </span>
              <div className="text-2xl font-black text-slate-100">{totalUreaKg} kg</div>
              <span className="text-xs text-slate-400 block">
                ≈ {totalUreaBags} बोरी (45kg)
              </span>
              <span className="text-[10px] text-blue-400 font-medium block pt-1">
                2 बार में विभाजित (Splits)
              </span>
            </div>

            {/* Potash MOP */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1 text-center">
              <span className="text-[11px] font-bold text-amber-400 block uppercase">
                MOP पोटाश (0:0:60)
              </span>
              <div className="text-2xl font-black text-slate-100">{totalMopKg} kg</div>
              <span className="text-xs text-slate-400 block">
                + {totalZincKg} kg Zinc 21%
              </span>
              <span className="text-[10px] text-amber-400 font-medium block pt-1">
                बुवाई / रोपाई पर
              </span>
            </div>
          </div>

          {/* Schedule Breakdown */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-300">
              खाद डालने का सही समय व तरीका (Application Schedule):
            </h4>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  1
                </span>
                <div>
                  <span className="font-bold text-slate-200">बुवाई के समय (At Sowing):</span>
                  <p className="text-slate-400 mt-0.5">
                    पूरा DAP ({totalDapKg} kg) + पोटाश ({totalMopKg} kg) + जिंक ({totalZincKg} kg) खेत की अंतिम जुताई या सीड ड्रिल से डालें।
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-950 text-blue-400 border border-blue-800 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  2
                </span>
                <div>
                  <span className="font-bold text-slate-200">पहली सिंचाई (21-25 दिन बाद):</span>
                  <p className="text-slate-400 mt-0.5">
                    यूरिया की पहली खुराक ({totalUreaSplit1Kg} kg) सिंचाई से ठीक पहले या बाद में खेत में ओट आने पर बखेरें।
                  </p>
                </div>
              </div>

              {totalUreaSplit2Kg > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-purple-950 text-purple-400 border border-purple-800 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    3
                  </span>
                  <div>
                    <span className="font-bold text-slate-200">दूसरी सिंचाई (40-45 दिन बाद):</span>
                    <p className="text-slate-400 mt-0.5">
                      यूरिया की दूसरी खुराक ({totalUreaSplit2Kg} kg) का छिड़काव करें।
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Micronutrient Advisory */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2.5 text-xs text-slate-300">
            <Sprout className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p>
              <span className="font-bold text-slate-100">सूक्ष्म पोषक सलाह:</span>{" "}
              {profile.micronutrientAdvice}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

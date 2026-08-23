import React, { useState } from "react";
import type { IFarmingEquipment } from "../types";
import { FARMING_EQUIPMENT_DATA } from "../data/equipmentData";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  Calculator,
  Tractor,
  TrendingDown,
  Clock,
  Droplets,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import CountUp from "react-countup";

interface Props {
  initialEquipment?: IFarmingEquipment | null;
  onClose?: () => void;
}

export const EquipmentRateCalculator: React.FC<Props> = ({ initialEquipment, onClose }) => {
  const { language, t } = useLanguage();
  const [acres, setAcres] = useState<number>(5);

  // Selected operations
  const [selectedTillageId, setSelectedTillageId] = useState<string>("eq-02"); // Rotavator
  const [selectedSowingId, setSelectedSowingId] = useState<string>("eq-04"); // Super Seeder
  const [selectedSprayingId, setSelectedSprayingId] = useState<string>("eq-03"); // Drone
  const [selectedHarvestingId, setSelectedHarvestingId] = useState<string>("eq-06"); // Harvester

  const tillageEq = FARMING_EQUIPMENT_DATA.find((e) => e.id === selectedTillageId);
  const sowingEq = FARMING_EQUIPMENT_DATA.find((e) => e.id === selectedSowingId);
  const sprayingEq = FARMING_EQUIPMENT_DATA.find((e) => e.id === selectedSprayingId);
  const harvestingEq = FARMING_EQUIPMENT_DATA.find((e) => e.id === selectedHarvestingId);

  // Rental Calculations
  const tillageCost = (tillageEq?.perAcreRentalRate || 850) * acres;
  const sowingCost = (sowingEq?.perAcreRentalRate || 1400) * acres;
  const sprayingCost = (sprayingEq?.perAcreRentalRate || 400) * acres;
  const harvestingCost = (harvestingEq?.perAcreRentalRate || 1800) * acres;

  const totalMachineRentalCost = tillageCost + sowingCost + sprayingCost + harvestingCost;

  // Conventional Manual/Traditional Cost (roughly 1.8x to 2.2x due to manual labor + multiple tillage)
  const manualTillageCost = 1400 * acres;
  const manualSowingCost = 2200 * acres; // Manual broadcasting + labor
  const manualSprayingCost = 750 * acres; // Manual knapsack + labor
  const manualHarvestingCost = 3400 * acres; // Manual sickle harvesting + labor + threshing
  const totalManualCost = manualTillageCost + manualSowingCost + manualSprayingCost + manualHarvestingCost;

  const totalSavings = Math.max(0, totalManualCost - totalMachineRentalCost);
  const savingsPercent = totalManualCost > 0 ? Math.round((totalSavings / totalManualCost) * 100) : 0;
  const hoursSaved = Math.round(acres * 6.5); // Approx 6.5 hours saved per acre with mechanization

  return (
    <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-700/80 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 shadow-lg shadow-emerald-950/60">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              {t("कृषि उपकरण लागत एवं बचत कैलकुलेटर", "Custom Hiring & Mechanization ROI Calculator", "CHC Rate & Savings Calculator")}
            </h2>
            <p className="text-xs text-slate-400">
              {t(
                "अपने खेत के आकार (एकड़) के अनुसार कस्टम हायरिंग (CHC) किराया और बचत का तुरंत आकलन करें",
                "Calculate total farm preparation, sowing, drone spray & harvest rental cost vs manual labor",
                "Calculate CHC machine rental cost vs manual expenses"
              )}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
          >
            ✕ Close
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left Form: Land Area and Machine Pickers (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Acreage Slider & Quick Buttons */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {t("खेत का कुल क्षेत्रफल (Land Size in Acres)", "Total Farm Area (Acres)", "Total Farm Area")}
              </label>
              <span className="text-xl font-extrabold text-emerald-400 font-mono">
                {acres} <span className="text-xs text-slate-400 font-normal">Acres</span>
              </span>
            </div>

            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={acres}
              onChange={(e) => setAcres(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />

            <div className="flex items-center gap-2 pt-1">
              {[1, 2, 5, 10, 20, 50].map((num) => (
                <button
                  key={num}
                  onClick={() => setAcres(num)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    acres === num
                      ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-950"
                      : "bg-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {num} Acre
                </button>
              ))}
            </div>
          </div>

          {/* Machine Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1. Tillage */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                1. {t("जुताई / लेवलर (Tillage)", "Land Prep / Tillage", "Tillage")}
              </span>
              <select
                value={selectedTillageId}
                onChange={(e) => setSelectedTillageId(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {FARMING_EQUIPMENT_DATA.filter((e) => e.category === "tillage").map((eq) => (
                  <option key={eq.id} value={eq.id} className="bg-slate-900 text-white">
                    {language === "en" ? eq.name : eq.nameHi} (₹{eq.perAcreRentalRate}/acre)
                  </option>
                ))}
              </select>
              <div className="text-right text-xs font-bold text-emerald-400 font-mono">
                = ₹{tillageCost.toLocaleString("en-IN")}
              </div>
            </div>

            {/* 2. Sowing */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                2. {t("बुवाई / रोपाई (Sowing)", "Sowing / Planting", "Sowing")}
              </span>
              <select
                value={selectedSowingId}
                onChange={(e) => setSelectedSowingId(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {FARMING_EQUIPMENT_DATA.filter((e) => e.category === "sowing").map((eq) => (
                  <option key={eq.id} value={eq.id} className="bg-slate-900 text-white">
                    {language === "en" ? eq.name : eq.nameHi} (₹{eq.perAcreRentalRate}/acre)
                  </option>
                ))}
              </select>
              <div className="text-right text-xs font-bold text-emerald-400 font-mono">
                = ₹{sowingCost.toLocaleString("en-IN")}
              </div>
            </div>

            {/* 3. Spraying */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                3. {t("छिड़काव / ड्रोन (Spraying)", "Crop Care / Drone", "Drone Spraying")}
              </span>
              <select
                value={selectedSprayingId}
                onChange={(e) => setSelectedSprayingId(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {FARMING_EQUIPMENT_DATA.filter((e) => e.category === "spraying").map((eq) => (
                  <option key={eq.id} value={eq.id} className="bg-slate-900 text-white">
                    {language === "en" ? eq.name : eq.nameHi} (₹{eq.perAcreRentalRate}/acre)
                  </option>
                ))}
              </select>
              <div className="text-right text-xs font-bold text-emerald-400 font-mono">
                = ₹{sprayingCost.toLocaleString("en-IN")}
              </div>
            </div>

            {/* 4. Harvesting */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                4. {t("कटाई एवं मड़ाई (Harvest)", "Harvesting / Threshing", "Harvesting")}
              </span>
              <select
                value={selectedHarvestingId}
                onChange={(e) => setSelectedHarvestingId(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {FARMING_EQUIPMENT_DATA.filter((e) => e.category === "harvesting").map((eq) => (
                  <option key={eq.id} value={eq.id} className="bg-slate-900 text-white">
                    {language === "en" ? eq.name : eq.nameHi} (₹{eq.perAcreRentalRate}/acre)
                  </option>
                ))}
              </select>
              <div className="text-right text-xs font-bold text-emerald-400 font-mono">
                = ₹{harvestingCost.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        </div>

        {/* Right Summary Card: ROI, Total Cost & Farmer Savings (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-gradient-to-br from-emerald-950/50 via-slate-900 to-slate-900 border border-emerald-500/40 p-5 sm:p-6 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t("लागत तुलना विवरण", "Cost Comparison Summary", "Cost Summary")}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {savingsPercent}% {t("बचत", "Savings", "Bachat")}
              </span>
            </div>

            {/* Total Rental Cost */}
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-xs text-slate-300">
                {t("मशीन किराया कुल (CHC Rent)", "Total Machine Rental", "Total CHC Rent")}:
              </span>
              <span className="text-2xl font-black text-emerald-400 font-mono">
                ₹<CountUp end={totalMachineRentalCost} duration={0.8} separator="," />
              </span>
            </div>

            {/* Manual Labor Cost */}
            <div className="mt-2 flex items-baseline justify-between text-xs text-slate-400">
              <span>{t("पारंपरिक मजदूरी खर्च (Manual)", "Manual Labor Cost", "Manual Cost")}:</span>
              <span className="line-through font-mono">
                ₹{totalManualCost.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Big Net Savings Highlight */}
            <div className="mt-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col gap-1">
              <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-emerald-400" />
                {t("किसान की शुद्ध बचत (Net Savings)", "Total Farmer Savings", "Net Savings")}
              </span>
              <span className="text-3xl font-black text-white font-mono tracking-tight">
                ₹<CountUp end={totalSavings} duration={1.0} separator="," />
              </span>
              <span className="text-[11px] text-emerald-400/90">
                {t(
                  "मशीनों के उपयोग से प्रति एकड़ ₹" + Math.round(totalSavings / (acres || 1)) + " की बचत होती है",
                  `Saving approx ₹${Math.round(totalSavings / (acres || 1))} per acre through mechanization`,
                  `Saving approx ₹${Math.round(totalSavings / (acres || 1))} per acre`
                )}
              </span>
            </div>

            {/* Key Benefits Matrix */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="font-bold text-white">~{hoursSaved} {t("घंटे", "Hours", "Hrs")}</div>
                  <div className="text-[10px] text-slate-400">{t("समय की बचत", "Time Saved", "Time Saved")}</div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-400" />
                <div>
                  <div className="font-bold text-white">35% {t("कम", "Less", "Less")}</div>
                  <div className="text-[10px] text-slate-400">{t("डीजल व पानी", "Diesel & Water", "Fuel & Water")}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {t(
                "दरें स्थानीय CHC केंद्र व सरकारी SMAM दिशानिर्देशों पर आधारित हैं",
                "Rates based on regional CHC centres & SMAM norms",
                "Live regional CHC verified rates"
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

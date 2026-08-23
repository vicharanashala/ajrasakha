import React from "react";
import type { EquipmentCategory, IEquipmentFilterState } from "../types";
import { ALL_INDIAN_STATES } from "../data/equipmentData";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  Search,
  Filter,
  Tractor,
  RotateCcw,
  Sparkles,
  MapPin,
  Tag,
  Percent,
} from "lucide-react";

interface Props {
  filters: IEquipmentFilterState;
  onChange: (updates: Partial<IEquipmentFilterState>) => void;
  onReset: () => void;
  totalCount: number;
}

export const EquipmentFilters: React.FC<Props> = ({
  filters,
  onChange,
  onReset,
  totalCount,
}) => {
  const { language, t } = useLanguage();

  const CATEGORIES: { id: EquipmentCategory; labelHi: string; labelEn: string }[] = [
    { id: "all", labelHi: "सभी उपकरण (All)", labelEn: "All Equipment" },
    { id: "tractors", labelHi: "ट्रैक्टर एवं पावर", labelEn: "Tractors & Power" },
    { id: "tillage", labelHi: "जुताई व लेवलर", labelEn: "Tillage & Leveling" },
    { id: "sowing", labelHi: "बुवाई व सुपर सीडर", labelEn: "Sowing & Seeders" },
    { id: "spraying", labelHi: "कृषि ड्रोन व स्प्रेयर", labelEn: "Drones & Sprayers" },
    { id: "harvesting", labelHi: "कंबाइन व थ्रेशर", labelEn: "Harvesters & Threshers" },
    { id: "irrigation", labelHi: "सोलर पंप व ड्रिप", labelEn: "Solar & Irrigation" },
  ];

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 sm:p-5 shadow-lg backdrop-blur-xl flex flex-col gap-4">
      {/* Category Pills Slider */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {CATEGORIES.map((cat) => {
          const isActive = filters.category === cat.id;
          const label = language === "en" ? cat.labelEn : cat.labelHi;
          return (
            <button
              key={cat.id}
              onClick={() => onChange({ category: cat.id })}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 shadow-sm active:scale-95 flex-shrink-0 border ${
                isActive
                  ? "bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-md shadow-emerald-950 scale-[1.02]"
                  : "bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 hover:text-white border-slate-700/70"
              }`}
            >
              <Tractor className={`w-3.5 h-3.5 ${isActive ? "text-slate-950" : "text-emerald-400"}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Second Row: Search, State Filter, View Mode, Sort */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder={t(
              "मशीन, ड्रोन, ट्रैक्टर, या फसल खोजें...",
              "Search tractor, drone, seeder, crop...",
              "Search machine, drone, tractor..."
            )}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* State Selector */}
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400 pointer-events-none" />
          <select
            value={filters.state}
            onChange={(e) => onChange({ state: e.target.value })}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors appearance-none cursor-pointer"
          >
            {ALL_INDIAN_STATES.map((st, i) => (
              <option key={i} value={st.split(" ")[0]} className="bg-slate-900 text-white">
                {st}
              </option>
            ))}
          </select>
        </div>

        {/* View Mode (All / Buy & Subsidies / Rent & CHC) */}
        <div className="flex items-center bg-slate-950/80 border border-slate-700/80 rounded-xl p-1 text-xs">
          <button
            onClick={() => onChange({ rentOrBuyView: "all" })}
            className={`flex-1 py-1 px-2 rounded-lg font-medium transition-colors text-center ${
              filters.rentOrBuyView === "all"
                ? "bg-emerald-500 text-slate-950 font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t("सभी दरें", "All Rates", "All")}
          </button>
          <button
            onClick={() => onChange({ rentOrBuyView: "rental" })}
            className={`flex-1 py-1 px-2 rounded-lg font-medium transition-colors text-center ${
              filters.rentOrBuyView === "rental"
                ? "bg-blue-500 text-white font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t("किराया (Rent)", "Rent (CHC)", "Rent CHC")}
          </button>
          <button
            onClick={() => onChange({ rentOrBuyView: "purchase" })}
            className={`flex-1 py-1 px-2 rounded-lg font-medium transition-colors text-center ${
              filters.rentOrBuyView === "purchase"
                ? "bg-amber-500 text-slate-950 font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t("सब्सिडी (Buy)", "Buy Subsidy", "Buy Subsidy")}
          </button>
        </div>

        {/* Sort By */}
        <div className="flex items-center gap-2">
          <select
            value={filters.sortBy}
            onChange={(e) => onChange({ sortBy: e.target.value as any })}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
          >
            <option value="popular" className="bg-slate-900 text-white">
              {t("सर्वाधिक लोकप्रिय (Most Popular)", "Most Popular", "Most Popular")}
            </option>
            <option value="subsidy-desc" className="bg-slate-900 text-white">
              {t("अधिकतम सरकारी सब्सिडी (Highest Subsidy)", "Highest Subsidy %", "Highest Subsidy")}
            </option>
            <option value="rent-asc" className="bg-slate-900 text-white">
              {t("किराया: कम से ज्यादा (Lowest Rental)", "Lowest Rental Rate", "Lowest Rental")}
            </option>
            <option value="price-asc" className="bg-slate-900 text-white">
              {t("कीमत: कम से ज्यादा (Price: Low to High)", "Price: Low to High", "Price Low-High")}
            </option>
            <option value="price-desc" className="bg-slate-900 text-white">
              {t("कीमत: ज्यादा से कम (Price: High to Low)", "Price: High to Low", "Price High-Low")}
            </option>
          </select>

          <button
            onClick={onReset}
            title={t("फ़िल्टर रीसेट करें", "Reset Filters", "Reset")}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

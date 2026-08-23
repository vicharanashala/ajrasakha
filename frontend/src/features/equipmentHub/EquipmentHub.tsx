import React, { useState, useMemo } from "react";
import { FARMING_EQUIPMENT_DATA } from "./data/equipmentData";
import type { IFarmingEquipment, IEquipmentFilterState } from "./types";
import { EquipmentCard } from "./components/EquipmentCard";
import { EquipmentFilters } from "./components/EquipmentFilters";
import { EquipmentRateCalculator } from "./components/EquipmentRateCalculator";
import { EquipmentDetailModal } from "./components/EquipmentDetailModal";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  Tractor,
  Calculator,
  Percent,
  Sparkles,
  ShieldCheck,
  Fuel,
  Info,
  TrendingDown,
} from "lucide-react";

export const EquipmentHub: React.FC = () => {
  const { language, t } = useLanguage();

  const [filters, setFilters] = useState<IEquipmentFilterState>({
    category: "all",
    state: "All",
    search: "",
    sortBy: "popular",
    rentOrBuyView: "all",
  });

  const [selectedEquipmentForModal, setSelectedEquipmentForModal] = useState<IFarmingEquipment | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorInitialEq, setCalculatorInitialEq] = useState<IFarmingEquipment | null>(null);

  const handleFilterChange = (updates: Partial<IEquipmentFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const handleResetFilters = () => {
    setFilters({
      category: "all",
      state: "All",
      search: "",
      sortBy: "popular",
      rentOrBuyView: "all",
    });
  };

  // Filter and sort items
  const filteredEquipment = useMemo(() => {
    let list = [...FARMING_EQUIPMENT_DATA];
    const norm = (s?: string) => (s || "").toLowerCase().trim();

    // Category
    if (filters.category !== "all") {
      list = list.filter((item) => item.category === filters.category);
    }

    // State
    if (filters.state !== "All" && filters.state !== "All States (समस्त राज्य)") {
      list = list.filter((item) =>
        item.statesAvailable.some((st) => norm(st).includes(norm(filters.state)))
      );
    }

    // View Mode (Rental vs Purchase)
    if (filters.rentOrBuyView === "rental") {
      list = list.filter((item) => item.hourlyRentalRate > 0 || item.perAcreRentalRate > 0);
    } else if (filters.rentOrBuyView === "purchase") {
      list = list.filter((item) => item.subsidyPercentage > 0);
    }

    // Search
    if (filters.search) {
      const q = norm(filters.search);
      list = list.filter(
        (item) =>
          norm(item.name).includes(q) ||
          norm(item.nameHi).includes(q) ||
          norm(item.powerRating).includes(q) ||
          item.suitableCrops.some((c) => norm(c).includes(q)) ||
          item.suitableCropsHi.some((c) => norm(c).includes(q)) ||
          norm(item.subsidyScheme).includes(q)
      );
    }

    // Sort
    if (filters.sortBy === "popular") {
      list.sort((a, b) => b.popularityScore - a.popularityScore);
    } else if (filters.sortBy === "subsidy-desc") {
      list.sort((a, b) => b.subsidyPercentage - a.subsidyPercentage);
    } else if (filters.sortBy === "rent-asc") {
      list.sort((a, b) => a.perAcreRentalRate - b.perAcreRentalRate);
    } else if (filters.sortBy === "price-asc") {
      list.sort((a, b) => a.effectivePrice - b.effectivePrice);
    } else if (filters.sortBy === "price-desc") {
      list.sort((a, b) => b.effectivePrice - a.effectivePrice);
    }

    return list;
  }, [filters]);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
      {/* Top Banner Hero */}
      <div className="rounded-3xl bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-amber-950/40 border border-slate-800 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-amber-400 text-slate-950 shadow-lg shadow-emerald-950/80">
            <Tractor className="w-8 h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {t(
                  "कृषि उपकरण एवं लाइव दरें हब",
                  "Farming Equipment & Live Rates Hub",
                  "Krishi Equipment & Live Rates"
                )}
              </h1>
              <span className="px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                CHC & SMAM Live Data
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              {t(
                "आधुनिक खेती के प्रमुख यंत्र, सरकारी सब्सिडी (40%-60%), और कस्टम हायरिंग (CHC) के लाइव प्रति एकड़ / प्रति घंटा किराया दरें",
                "Explore essential modern farm machinery, government subsidies (40%-60%), and live CHC rental rates per acre/hour",
                "Modern farm machinery, govt subsidies & live CHC rental rates"
              )}
            </p>
          </div>
        </div>

        {/* Quick ROI Calculator Launch Button */}
        <button
          onClick={() => setShowCalculator((prev) => !prev)}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold shadow-lg transition-all duration-300 active:scale-95 whitespace-nowrap cursor-pointer ${
            showCalculator
              ? "bg-slate-800 text-emerald-400 border border-emerald-500/40"
              : "bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-emerald-950/60 hover:scale-105"
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>
            {showCalculator
              ? t("कैलकुलेटर छिपाएं", "Hide ROI Calculator", "Hide Calculator")
              : t("लागत व बचत कैलकुलेटर खोलें", "Open Acreage ROI Calculator", "Open Calculator")}
          </span>
        </button>
      </div>

      {/* Interactive Acreage ROI Calculator */}
      {showCalculator && (
        <EquipmentRateCalculator
          initialEquipment={calculatorInitialEq}
          onClose={() => setShowCalculator(false)}
        />
      )}

      {/* Filter and Category Controls */}
      <EquipmentFilters
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
        totalCount={filteredEquipment.length}
      />

      {/* Equipment Cards Grid */}
      {filteredEquipment.length === 0 ? (
        <div className="p-12 rounded-3xl bg-slate-900/60 border border-slate-800 text-center flex flex-col items-center justify-center gap-3">
          <Tractor className="w-12 h-12 text-slate-600" />
          <h3 className="text-base font-bold text-slate-300">
            {t("कोई उपकरण नहीं मिला", "No Equipment Matches Filter", "No equipment found")}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm">
            {t(
              "कृपया अपने खोज शब्द या फ़िल्टर बदलकर दोबारा प्रयास करें।",
              "Try adjusting your category, state or search keyword.",
              "Try clearing filters."
            )}
          </p>
          <button
            onClick={handleResetFilters}
            className="mt-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition-colors"
          >
            {t("सभी फ़िल्टर रीसेट करें", "Reset All Filters", "Reset Filters")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEquipment.map((item) => (
            <EquipmentCard
              key={item.id}
              equipment={item}
              onSelectDetails={(eq) => setSelectedEquipmentForModal(eq)}
              onOpenCalculatorWithEq={(eq) => {
                setCalculatorInitialEq(eq);
                setShowCalculator(true);
                window.scrollTo({ top: 180, behavior: "smooth" });
              }}
            />
          ))}
        </div>
      )}

      {/* Detailed Modal */}
      <EquipmentDetailModal
        equipment={selectedEquipmentForModal}
        isOpen={Boolean(selectedEquipmentForModal)}
        onClose={() => setSelectedEquipmentForModal(null)}
        onOpenCalculator={(eq) => {
          setSelectedEquipmentForModal(null);
          setCalculatorInitialEq(eq);
          setShowCalculator(true);
          window.scrollTo({ top: 180, behavior: "smooth" });
        }}
      />
    </div>
  );
};

export default EquipmentHub;

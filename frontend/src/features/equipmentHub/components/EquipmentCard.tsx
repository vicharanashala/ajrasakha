import React from "react";
import type { IFarmingEquipment } from "../types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  Tractor,
  Sparkles,
  Fuel,
  Gauge,
  Percent,
  CheckCircle2,
  PhoneCall,
  Calculator,
  ArrowRight,
  ShieldCheck,
  Zap,
} from "lucide-react";
import CountUp from "react-countup";

interface Props {
  equipment: IFarmingEquipment;
  onSelectDetails: (eq: IFarmingEquipment) => void;
  onOpenCalculatorWithEq: (eq: IFarmingEquipment) => void;
}

const formatRupee = (num: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
};

export const EquipmentCard: React.FC<Props> = ({
  equipment,
  onSelectDetails,
  onOpenCalculatorWithEq,
}) => {
  const { language, t } = useLanguage();
  const title = language === "en" ? equipment.name : equipment.nameHi;
  const categoryLabel = language === "en" ? equipment.categoryLabelEn : equipment.categoryLabelHi;
  const crops = language === "en" ? equipment.suitableCrops : equipment.suitableCropsHi;
  const hasRental = equipment.hourlyRentalRate > 0 || equipment.perAcreRentalRate > 0;

  return (
    <div className="group relative rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-800/80 border border-slate-800/80 hover:border-emerald-500/50 p-5 shadow-xl backdrop-blur-xl transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-950/40 flex flex-col justify-between">
      {/* Top Banner Tag & Category */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-emerald-300 border border-slate-700/80 flex items-center gap-1">
            <Tractor className="w-3 h-3 text-emerald-400" />
            {categoryLabel}
          </span>

          {equipment.badge && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-amber-500/20 to-emerald-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 shadow-sm">
              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
              {equipment.badge}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-2 leading-snug">
          {title}
        </h3>

        {/* Technical Specs Tags */}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/60">
            <Gauge className="w-3 h-3 text-blue-400" />
            <span>{equipment.powerRating}</span>
          </div>
          <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/60">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>{equipment.workCapacity}</span>
          </div>
        </div>

        {/* Pricing Box: Purchase & Govt Subsidy */}
        <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {t("लागत (MRP)", "Market MRP Price", "MRP Price")}:
            </span>
            <span className="text-xs text-slate-400 line-through font-mono">
              {formatRupee(equipment.mrpPrice)}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1 border-t border-slate-800">
            <div>
              <span className="text-[11px] text-emerald-400 font-semibold block">
                {t("सब्सिडी के बाद मूल्य", "Effective Farmer Price", "Subsidy Ke Baad Rate")}:
              </span>
              <span className="text-[10px] text-slate-400">
                {equipment.subsidyPercentage}% {t("सब्सिडी", "Subsidy", "Subsidy")} ({equipment.subsidyScheme.split(" ")[0]})
              </span>
            </div>
            <div className="text-right">
              <span className="text-lg font-black text-emerald-400 font-mono tracking-tight">
                {formatRupee(equipment.effectivePrice)}
              </span>
            </div>
          </div>
        </div>

        {/* Live CHC Rental Rates Card */}
        {hasRental ? (
          <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-blue-950/30 to-slate-900/90 border border-blue-500/20 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-300 tracking-wider flex items-center gap-1">
                <Fuel className="w-3 h-3 text-blue-400" />
                {t("कस्टम हायरिंग (CHC) किराया", "Custom Hiring (CHC) Live Rent", "CHC Live Rental Rate")}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                {equipment.includesFuelAndDriver
                  ? t("डीजल व ड्राइवर सहित", "Incl. Fuel & Operator", "Fuel & Driver Included")
                  : t("केवल मशीन किराया", "Machine only", "Machine only")}
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm font-extrabold text-blue-400 font-mono">
                ₹{equipment.perAcreRentalRate} <span className="text-[10px] text-slate-400 font-normal">/ acre</span>
              </div>
              <div className="text-[10px] text-slate-400">
                (₹{equipment.hourlyRentalRate} / hour)
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t("100% स्थायी स्वामित्व परिसंपत्ति", "100% Capital Asset (Long Term)", "Permanent Farm Asset")}</span>
          </div>
        )}

        {/* Suitable Crops Chips */}
        <div className="mt-3">
          <span className="text-[10px] text-slate-400 font-medium block mb-1">
            {t("उपयुक्त फसलें", "Suitable Crops", "Suitable Crops")}:
          </span>
          <div className="flex flex-wrap gap-1">
            {crops.slice(0, 4).map((c, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md bg-slate-800/80 text-[10px] text-slate-300 border border-slate-700/60"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center gap-2">
        <button
          onClick={() => onSelectDetails(equipment)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700/80 transition-all duration-200 active:scale-95"
        >
          <span>{t("विस्तार से देखें", "View Details & Subsidy", "Full Details")}</span>
          <ArrowRight className="w-3 h-3 text-emerald-400" />
        </button>

        {hasRental && (
          <button
            onClick={() => onOpenCalculatorWithEq(equipment)}
            title={t("लागत कैलकुलेटर", "Calculate Acreage Cost", "Calculate Cost")}
            className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 transition-all duration-200 active:scale-95 flex items-center justify-center"
          >
            <Calculator className="w-4 h-4 text-emerald-400" />
          </button>
        )}
      </div>
    </div>
  );
};

import React, { useState } from "react";
import type { IFarmingEquipment } from "../types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  Tractor,
  Sparkles,
  Percent,
  CheckCircle2,
  PhoneCall,
  ShieldCheck,
  Zap,
  Gauge,
  Droplets,
  Fuel,
  FileText,
  Building2,
  ExternalLink,
  X,
} from "lucide-react";
import { toast } from "@/shared/components/toast";

interface Props {
  equipment: IFarmingEquipment | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenCalculator: (eq: IFarmingEquipment) => void;
}

const formatRupee = (num: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
};

export const EquipmentDetailModal: React.FC<Props> = ({
  equipment,
  isOpen,
  onClose,
  onOpenCalculator,
}) => {
  const { language, t } = useLanguage();
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [farmerPhone, setFarmerPhone] = useState("");
  const [farmerDistrict, setFarmerDistrict] = useState("");

  if (!isOpen || !equipment) return null;

  const title = language === "en" ? equipment.name : equipment.nameHi;
  const categoryLabel = language === "en" ? equipment.categoryLabelEn : equipment.categoryLabelHi;
  const crops = language === "en" ? equipment.suitableCrops : equipment.suitableCropsHi;
  const features = language === "en" ? equipment.keyFeatures : equipment.keyFeaturesHi;

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmerPhone || farmerPhone.length < 10) {
      toast.error("कृपया 10 अंकों का वैध मोबाइल नंबर दर्ज करें (Enter valid 10-digit number)");
      return;
    }
    setBookingSuccess(true);
    toast.success(`CHC बुकिंग व सब्सिडी जानकारी आपके नंबर ${farmerPhone} पर भेज दी गई है!`);
    setTimeout(() => {
      setBookingSuccess(false);
      onClose();
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 sm:p-8 text-slate-100 my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Tag */}
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {categoryLabel}
          </span>
          {equipment.badge && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {equipment.badge}
            </span>
          )}
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-black text-white pr-8">
          {title}
        </h2>

        {/* Pricing Grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Purchase Price & Subsidy */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              {t("सरकारी सब्सिडी योजना", "Government Subsidy Scheme", "Govt Subsidy Scheme")}
            </span>
            <div className="mt-2 text-sm font-bold text-amber-300 flex items-center gap-1.5">
              <Percent className="w-4 h-4 text-amber-400" />
              {equipment.subsidyScheme}
            </div>
            <div className="mt-3 flex items-baseline justify-between pt-2 border-t border-slate-800">
              <div>
                <span className="text-[11px] text-slate-400 line-through block">
                  MRP: {formatRupee(equipment.mrpPrice)}
                </span>
                <span className="text-xs text-emerald-400 font-medium">
                  {equipment.subsidyPercentage}% {t("सब्सिडी छूट", "Grant Subsidy", "Subsidy Discount")}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {formatRupee(equipment.effectivePrice)}
                </span>
              </div>
            </div>
          </div>

          {/* CHC Rental Live Rates */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-950/40 to-slate-950 border border-blue-500/30">
            <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider block flex items-center gap-1.5">
              <Fuel className="w-4 h-4 text-blue-400" />
              {t("कस्टम हायरिंग सेंटर (CHC) किराया दरें", "CHC Custom Hiring Live Rates", "CHC Live Rental Rates")}
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-xs text-slate-300">{t("प्रति एकड़ दर", "Per Acre Rate", "Per Acre Rate")}:</span>
              <span className="text-xl font-extrabold text-blue-400 font-mono">
                ₹{equipment.perAcreRentalRate} <span className="text-xs text-slate-400 font-normal">/ acre</span>
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-xs text-slate-400">
              <span>{t("प्रति घंटा दर", "Hourly Rate", "Hourly Rate")}:</span>
              <span className="font-mono">₹{equipment.hourlyRentalRate} / hr</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400 italic">
              * {equipment.includesFuelAndDriver ? t("डीजल एवं ऑपरेटर चार्ज शामिल", "Includes diesel & operator", "Includes diesel & operator") : t("मशीन किराया मात्र", "Machine rental only", "Machine only")}
            </div>
          </div>
        </div>

        {/* Technical Specs 4-Box Grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span className="text-[10px] text-slate-400 block">{t("पावर / इंजन", "Power / Engine", "Power / Engine")}</span>
            <span className="font-bold text-slate-200 mt-0.5 block">{equipment.powerRating}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span className="text-[10px] text-slate-400 block">{t("कार्य क्षमता", "Work Capacity", "Work Capacity")}</span>
            <span className="font-bold text-slate-200 mt-0.5 block">{equipment.workCapacity}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span className="text-[10px] text-slate-400 block">{t("ईंधन / ऊर्जा", "Fuel / Energy", "Fuel / Energy")}</span>
            <span className="font-bold text-slate-200 mt-0.5 block">{equipment.fuelConsumption}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <span className="text-[10px] text-slate-400 block">{t("उपलब्ध राज्य", "States Available", "States")}</span>
            <span className="font-bold text-emerald-400 mt-0.5 block">{equipment.statesAvailable.length}+ States</span>
          </div>
        </div>

        {/* Key Features List */}
        <div className="mt-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
            {t("मुख्य विशेषताएं एवं लाभ", "Key Features & Agronomic Benefits", "Key Features")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {features.map((feat, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CHC Rental Quick Booking & Subsidy Enquiry Form */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-emerald-400" />
            {t("कस्टम हायरिंग सेंटर (CHC) किराया बुकिंग / सब्सिडी सहायता", "Book CHC Rental / Enquire Subsidy", "Book CHC Rental")}
          </h4>

          {bookingSuccess ? (
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-center text-sm font-bold text-emerald-300 flex flex-col items-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <span>{t("अनुरोध प्राप्त हुआ! निकटतम CHC ऑपरेटर जल्द आपसे संपर्क करेंगे।", "Enquiry Received! Nearest CHC operator will contact you.", "Request Submitted!")}</span>
            </div>
          ) : (
            <form onSubmit={handleBookingSubmit} className="flex flex-col sm:flex-row gap-2">
              <input
                type="tel"
                value={farmerPhone}
                onChange={(e) => setFarmerPhone(e.target.value)}
                placeholder={t("अपना 10-अंकीय मोबाइल नंबर दर्ज करें", "Enter 10-digit Mobile Number", "Mobile Number")}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                maxLength={10}
              />
              <input
                type="text"
                value={farmerDistrict}
                onChange={(e) => setFarmerDistrict(e.target.value)}
                placeholder={t("जिला / कस्बा (District)", "District / Village", "District")}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950 transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                {t("बुकिंग / जानकारी भेजें", "Request Booking / SMS", "Send Request")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

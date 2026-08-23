import React from "react";
import type { VideoCategory, IVideoFilterState } from "../types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  Search,
  RotateCcw,
  Sparkles,
  BookmarkCheck,
  Video,
  Languages,
  PlusCircle,
} from "lucide-react";

interface Props {
  filters: IVideoFilterState;
  onChange: (updates: Partial<IVideoFilterState>) => void;
  onReset: () => void;
  onOpenAddModal: () => void;
  totalCount: number;
  bookmarkedCount: number;
}

export const VideoFilters: React.FC<Props> = ({
  filters,
  onChange,
  onReset,
  onOpenAddModal,
  totalCount,
  bookmarkedCount,
}) => {
  const { language, t } = useLanguage();

  const CATEGORIES: { id: VideoCategory; labelHi: string; labelEn: string }[] = [
    { id: "all", labelHi: "सभी श्रेणियां (All)", labelEn: "All Categories" },
    { id: "crop-guides", labelHi: "फसल उत्पादन व टिप्स", labelEn: "Crop Production" },
    { id: "machinery-drones", labelHi: "ड्रोन व कृषि यंत्र", labelEn: "Drones & Machines" },
    { id: "pest-disease", labelHi: "कीट व रोग रोकथाम", labelEn: "Pest & Disease Care" },
    { id: "organic-farming", labelHi: "प्राकृतिक / जैविक खेती", labelEn: "Organic Farming" },
    { id: "govt-schemes", labelHi: "सरकारी योजनाएं व सब्सिडी", labelEn: "Govt Subsidies" },
  ];

  const LANGUAGES = [
    { id: "all", label: t("सभी भाषाएं (All)", "All Languages", "All"), icon: "🌟" },
    { id: "hi", label: "🇮🇳 हिन्दी (Hindi)", icon: "🇮🇳" },
    { id: "en", label: "🌐 English", icon: "🌐" },
  ];

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 sm:p-5 shadow-lg backdrop-blur-xl flex flex-col gap-4">
      {/* Top Quick Bar: Category Pills + Add Video */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
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
                <Video className={`w-3.5 h-3.5 ${isActive ? "text-slate-950" : "text-emerald-400"}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Suggest / Add Custom Video CTA */}
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs shadow-md shadow-emerald-950 whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer flex-shrink-0"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>{t("वीडियो जोड़ें", "Add Video", "Add Video")}</span>
        </button>
      </div>

      {/* Language Quick Toggle Pills Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-300">
            {t("वीडियो भाषा (Video Language):", "Select Language:", "Language:")}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {LANGUAGES.map((lang) => {
            const isSelected = filters.language === lang.id;
            return (
              <button
                key={lang.id}
                onClick={() => onChange({ language: lang.id })}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                  isSelected
                    ? "bg-emerald-600 text-white border-emerald-400 shadow-md font-bold"
                    : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                <span>{lang.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Second Row: Search, Bookmarks filter, Sort & Reset */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1 border-t border-slate-800/80">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder={t(
              "फसल, रोग, ड्रोन, या तकनीक खोजें...",
              "Search crop, pest, drone, scheme...",
              "Search crop, pest, drone..."
            )}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Bookmarked Filter Button */}
        <button
          onClick={() => onChange({ onlyBookmarked: !filters.onlyBookmarked })}
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
            filters.onlyBookmarked
              ? "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md shadow-amber-950"
              : "bg-slate-950/80 hover:bg-slate-800 text-slate-300 border-slate-700/80"
          }`}
        >
          <BookmarkCheck className="w-4 h-4" />
          <span>
            {t("सहेजे गए वीडियो", "Saved Bookmarks", "Saved Videos")} ({bookmarkedCount})
          </span>
        </button>

        {/* Reset & Sort */}
        <div className="flex items-center justify-between gap-2">
          <select
            value={filters.sortBy}
            onChange={(e) => onChange({ sortBy: e.target.value as any })}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
          >
            <option value="popular" className="bg-slate-900 text-white">
              {t("सर्वाधिक लोकप्रिय (Most Popular)", "Most Popular", "Most Popular")}
            </option>
            <option value="newest" className="bg-slate-900 text-white">
              {t("नवीनतम वीडियो (Newest)", "Newest", "Newest")}
            </option>
          </select>

          <button
            onClick={onReset}
            title={t("फ़िल्टर रीसेट करें", "Reset Filters", "Reset")}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

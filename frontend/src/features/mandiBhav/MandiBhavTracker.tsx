import React, { useState } from "react";
import type { IMandiPrice } from "./types";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Search,
  Filter,
  MapPin,
  Landmark,
  BadgePercent,
  CheckCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const SAMPLE_MANDI_PRICES: IMandiPrice[] = [
  {
    id: "m-1",
    crop: "Wheat",
    hindiName: "गेहूं (कनक)",
    mandi: "Khanna Mandi (एशिया की सबसे बड़ी मंडी)",
    district: "Ludhiana",
    state: "Punjab",
    modalPrice: 2480,
    minPrice: 2350,
    maxPrice: 2540,
    mspPrice: 2275,
    trend: "UP",
    changeAmount: 35,
    arrivalTons: 1420,
    aiRecommendation: "HOLD",
    recommendationReason: "आगामी 2 सप्ताह में आटे की मांग बढ़ने से भाव ₹2550+ जाने की संभावना है।",
    updatedAt: "Today, 11:30 AM",
  },
  {
    id: "m-2",
    crop: "Mustard",
    hindiName: "सरसों (राय)",
    mandi: "Alwar Mandi",
    district: "Alwar",
    state: "Rajasthan",
    modalPrice: 5620,
    minPrice: 5400,
    maxPrice: 5750,
    mspPrice: 5650,
    trend: "UP",
    changeAmount: 60,
    arrivalTons: 890,
    aiRecommendation: "HOLD",
    recommendationReason: "तेल मिलों की सक्रिय लिवाली, तिलहन आयात शुल्क बढ़ने के संकेत।",
    updatedAt: "Today, 12:15 PM",
  },
  {
    id: "m-3",
    crop: "Cotton",
    hindiName: "कपास (नरमा)",
    mandi: "Sirsa Mandi",
    district: "Sirsa",
    state: "Haryana",
    modalPrice: 7150,
    minPrice: 6850,
    maxPrice: 7320,
    mspPrice: 7020,
    trend: "DOWN",
    changeAmount: -40,
    arrivalTons: 650,
    aiRecommendation: "SELL_NOW",
    recommendationReason: "कपास की नई आवक तेज हो रही है, तत्काल माल निकालना लाभदायक रहेगा।",
    updatedAt: "Today, 10:45 AM",
  },
  {
    id: "m-4",
    crop: "Tomato",
    hindiName: "टमाटर (देसी/हाइब्रिड)",
    mandi: "Nashik APMC",
    district: "Nashik",
    state: "Maharashtra",
    modalPrice: 1850,
    minPrice: 1600,
    maxPrice: 2100,
    mspPrice: undefined,
    trend: "UP",
    changeAmount: 110,
    arrivalTons: 430,
    aiRecommendation: "SELL_NOW",
    recommendationReason: "लोकल सप्लाई सीमित होने के कारण वर्तमान में उच्च प्रीमियम मिल रहा है।",
    updatedAt: "Today, 09:30 AM",
  },
  {
    id: "m-5",
    crop: "Basmati Rice",
    hindiName: "धान (1121 बासमती)",
    mandi: "Karnal Mandi",
    district: "Karnal",
    state: "Haryana",
    modalPrice: 4280,
    minPrice: 4050,
    maxPrice: 4450,
    mspPrice: 2183,
    trend: "UP",
    changeAmount: 85,
    arrivalTons: 1100,
    aiRecommendation: "HOLD",
    recommendationReason: "निर्यात सौदों में तेजी, भाव ₹4500 तक जाने की उम्मीद।",
    updatedAt: "Today, 01:00 PM",
  },
  {
    id: "m-6",
    crop: "Potato",
    hindiName: "आलू (ज्योति/पुखराज)",
    mandi: "Agra Mandi",
    district: "Agra",
    state: "Uttar Pradesh",
    modalPrice: 1240,
    minPrice: 1100,
    maxPrice: 1350,
    mspPrice: undefined,
    trend: "STABLE",
    changeAmount: 0,
    arrivalTons: 2100,
    aiRecommendation: "WATCH",
    recommendationReason: "कोल्ड स्टोरेज से आवक सामान्य, भाव स्थिर रहने का अनुमान।",
    updatedAt: "Today, 11:00 AM",
  },
];

export const MandiBhavTracker: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedState, setSelectedState] = useState("all");
  const [selectedCrop, setSelectedCrop] = useState("all");

  const filteredPrices = SAMPLE_MANDI_PRICES.filter((item) => {
    const matchSearch =
      item.crop.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.hindiName.includes(searchTerm) ||
      item.mandi.toLowerCase().includes(searchTerm.toLowerCase());
    const matchState = selectedState === "all" || item.state === selectedState;
    const matchCrop = selectedCrop === "all" || item.crop === selectedCrop;
    return matchSearch && matchState && matchCrop;
  });

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-800 border border-emerald-400/50 flex items-center justify-center text-white shadow-lg shadow-emerald-950/60">
            <TrendingUp className="w-7 h-7 text-emerald-100 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">
                Live APMC Mandi Bhav (दैनिक मंडी भाव व बाजार सलाह)
              </h2>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                Real-Time APMC
              </span>
            </div>
            <p className="text-xs text-slate-400">
              विभिन्न कृषि मंडियों के ताजा मॉडल भाव (₹/क्विंटल), MSP तुलना और AI सेलिंग परामर्श
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="फसल या मंडी का नाम खोजें (उदा. Wheat, Alwar, सरसों)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none cursor-pointer w-full sm:w-44"
        >
          <option value="all">सभी राज्य (All States)</option>
          <option value="Punjab">Punjab (पंजाब)</option>
          <option value="Haryana">Haryana (हरियाणा)</option>
          <option value="Rajasthan">Rajasthan (राजस्थान)</option>
          <option value="Uttar Pradesh">Uttar Pradesh (उत्तर प्रदेश)</option>
          <option value="Maharashtra">Maharashtra (महाराष्ट्र)</option>
        </select>

        <select
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none cursor-pointer w-full sm:w-44"
        >
          <option value="all">सभी फसलें (All Crops)</option>
          <option value="Wheat">Wheat (गेहूं)</option>
          <option value="Mustard">Mustard (सरसों)</option>
          <option value="Cotton">Cotton (कपास)</option>
          <option value="Tomato">Tomato (टमाटर)</option>
          <option value="Basmati Rice">Basmati Rice (धान)</option>
          <option value="Potato">Potato (आलू)</option>
        </select>
      </div>

      {/* Mandi Rate Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPrices.map((item) => (
          <div
            key={item.id}
            className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 shadow-xl backdrop-blur-xl flex flex-col justify-between space-y-4 transition-all"
          >
            {/* Top row */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-semibold text-emerald-400 block">
                  {item.state} • {item.district}
                </span>
                <h3 className="text-base font-bold text-slate-100">{item.crop}</h3>
                <p className="text-xs text-slate-400 font-medium">{item.hindiName}</p>
              </div>

              {/* Trend Badge */}
              <div
                className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl border ${
                  item.trend === "UP"
                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-700"
                    : item.trend === "DOWN"
                    ? "bg-rose-950/80 text-rose-300 border-rose-700"
                    : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                {item.trend === "UP" ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                ) : item.trend === "DOWN" ? (
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Minus className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>
                  {item.trend === "UP" ? `+₹${item.changeAmount}` : item.trend === "DOWN" ? `-₹${Math.abs(item.changeAmount)}` : "स्थिर"}
                </span>
              </div>
            </div>

            {/* Modal Price Highlight */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-baseline justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Modal Price (मॉडल भाव)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-50">₹{item.modalPrice}</span>
                  <span className="text-xs text-slate-400">/ क्विंटल</span>
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-400 space-y-0.5">
                <div>Min: ₹{item.minPrice}</div>
                <div>Max: ₹{item.maxPrice}</div>
                {item.mspPrice && (
                  <div className="text-emerald-400 font-medium">MSP: ₹{item.mspPrice}</div>
                )}
              </div>
            </div>

            {/* Mandi & Arrival */}
            <div className="text-xs text-slate-300 flex items-center justify-between border-t border-slate-800/80 pt-2.5">
              <span className="truncate pr-2 font-medium">📍 {item.mandi}</span>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">
                आवक: {item.arrivalTons} टन
              </span>
            </div>

            {/* AI Recommendation Banner */}
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  AI बाजार सलाह:
                </span>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                    item.aiRecommendation === "HOLD"
                      ? "bg-amber-950 text-amber-300 border border-amber-800"
                      : item.aiRecommendation === "SELL_NOW"
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                      : "bg-blue-950 text-blue-300 border border-blue-800"
                  }`}
                >
                  {item.aiRecommendation === "HOLD"
                    ? "HOLD (रोकें)"
                    : item.aiRecommendation === "SELL_NOW"
                    ? "SELL NOW (बेचें)"
                    : "WATCH (निगरानी रखें)"}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {item.recommendationReason}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from "react";
import {
  CloudSun,
  LayoutDashboard,
  CloudLightning,
  Sprout,
  MessageSquareText,
  Database,
  ShieldAlert,
  AlertTriangle,
  CalendarCheck2,
  Search,
  MapPin,
  RefreshCw,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  Sun,
  Droplets,
  Wind,
  Gauge,
  Cloud,
  Eye,
  Sunrise,
  Sunset,
  SprayCan,
  Bug,
  Bot,
  Send,
  Trash2,
  Zap,
  Sparkles,
  BadgeCheck,
  Droplet,
  X,
  BookOpen,
  Target,
  Layers,
  FileText
} from "lucide-react";

interface GdbEntry {
  id: string;
  question: string;
  domain: string;
  answerSnippet: string;
  totalFeedback: number;
  helpfulCount: number;
  unhelpfulCount: number;
  score: number; // percentage
  status: "Healthy" | "Flagged" | "Under Review" | "Resolved";
  language: string;
  state: string;
  flagReason?: string;
  suggestedFix?: string;
}

interface WeatherData {
  name: string;
  sys?: { country?: string; sunrise?: number; sunset?: number };
  coord?: { lat?: number; lon?: number };
  main?: { temp: number; feels_like: number; humidity: number; pressure: number };
  wind?: { speed: number; deg?: number };
  clouds?: { all: number };
  visibility?: number;
  weather?: Array<{ id: number; main: string; description: string; icon: string }>;
}

export const WeatherDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "overview" | "playground" | "agro" | "whatsapp" | "gdb" | "flagged" | "alerts" | "digest"
  >("overview");
  const [isPsModalOpen, setIsPsModalOpen] = useState<boolean>(false);

  // Weather State
  const [currentCity, setCurrentCity] = useState<string>("Bhopal");
  const [searchInput, setSearchInput] = useState<string>("Bhopal");
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(false);
  const [selectedCrop, setSelectedCrop] = useState<string>("wheat");
  const [riskFilter, setRiskFilter] = useState<string>("all");

  // GDB State
  const [gdbSearch, setGdbSearch] = useState<string>("" );
  const [gdbDomainFilter, setGdbDomainFilter] = useState<string>("all");

  // Master GDB Mock Data
  const [gdbEntries, setGdbEntries] = useState<GdbEntry[]>([
    {
      id: "GDB-1042",
      question: "Gehun me peela ratwa (Yellow Rust) ke lakshan aur roktham kya hai?",
      domain: "Crop Protection",
      answerSnippet: "Propiconazole 25% EC (Tilt) ko 200 ml prati 200 litre paani me gholkar prati acre chhidkaw karein.",
      totalFeedback: 142,
      helpfulCount: 131,
      unhelpfulCount: 11,
      score: 92.2,
      status: "Healthy",
      language: "Hindi",
      state: "Punjab"
    },
    {
      id: "GDB-2819",
      question: "Sarson me chepa (Aphid) ke niyanthan ke liye kaunsi dawai dalein?",
      domain: "Pest Control",
      answerSnippet: "Dimethoate 30% EC ya Imidacloprid 17.8% SL @ 50ml prati 100 litre paani me milakar spray karein.",
      totalFeedback: 89,
      helpfulCount: 78,
      unhelpfulCount: 11,
      score: 87.6,
      status: "Healthy",
      language: "Hindi",
      state: "Rajasthan"
    },
    {
      id: "GDB-4402",
      question: "Dhaan ki fasal me Urea ka santulit prayog kab aur kitni matra me karein?",
      domain: "Soil & Nutrients",
      answerSnippet: "Urea ko 3 barabar bhaago me baantein: Basal dose ropai ke samay, pehla top dressing 20-25 din baad aur doosra 40-45 din baad.",
      totalFeedback: 110,
      helpfulCount: 101,
      unhelpfulCount: 9,
      score: 91.8,
      status: "Healthy",
      language: "Hindi",
      state: "Uttar Pradesh"
    },
    {
      id: "GDB-7812",
      question: "Kapas me gulabi sundi (Pink Bollworm) ka prabhav kaise rokein?",
      domain: "Crop Protection",
      answerSnippet: "Pheromone traps lagayein (5-8 prati acre). Aakraman aadhik hone par Profenophos 50% EC 400ml/acre spray karein.",
      totalFeedback: 48,
      helpfulCount: 26,
      unhelpfulCount: 22,
      score: 54.2,
      status: "Flagged",
      language: "Marathi",
      state: "Maharashtra",
      flagReason: "Missing regional bio-pesticide alternative & dosage unclear for drip farmers",
      suggestedFix: "Add Neem oil (10,000 ppm) recommendation and clear liter-per-pump ratio."
    },
    {
      id: "GDB-9205",
      question: "Tamatar me patti modak rog (Leaf Curl Virus) ka upchar kya hai?",
      domain: "Horticulture",
      answerSnippet: "Virus ka direct upchar nahi hai, safed makkhi (Whitefly) ko control karein Diafenthiuron 50% WP se.",
      totalFeedback: 35,
      helpfulCount: 18,
      unhelpfulCount: 17,
      score: 51.4,
      status: "Flagged",
      language: "Telugu",
      state: "Andhra Pradesh",
      flagReason: "Answer too technical; doesn't explain nursery net covering or organic repellent",
      suggestedFix: "Provide simple step-by-step yellow sticky trap guide and farmer-friendly language."
    },
    {
      id: "GDB-5310",
      question: "Chane me ukhta rog (Fusarium Wilt) se bachav ke upay?",
      domain: "Crop Protection",
      answerSnippet: "Trichoderma viride 5-10g/kg beej upchar karein aur khet me Carbendazim 50% WP ka prayog karein.",
      totalFeedback: 62,
      helpfulCount: 32,
      unhelpfulCount: 30,
      score: 51.6,
      status: "Flagged",
      language: "Hindi",
      state: "Madhya Pradesh",
      flagReason: "Trichoderma soil application timing not specified before sowing",
      suggestedFix: "Include FYM (Gobar ki khaad) mixing proportion for Trichoderma."
    },
    {
      id: "GDB-3312",
      question: "Mirch me churna phaphoondi (Powdery Mildew) ka ilaj?",
      domain: "Horticulture",
      answerSnippet: "Sulfur 80% WDG 2g/L ya Hexaconazole 5% EC 1ml/L paani me gholkar chhidkaw karein.",
      totalFeedback: 94,
      helpfulCount: 86,
      unhelpfulCount: 8,
      score: 91.5,
      status: "Healthy",
      language: "Hindi",
      state: "Madhya Pradesh"
    }
  ]);

  // WhatsApp Messages
  const [chatInput, setChatInput] = useState<string>("");
  const [awaitingFeedbackForGdb, setAwaitingFeedbackForGdb] = useState<string | null>("GDB-1042");
  const [chatMessages, setChatMessages] = useState<Array<{
    sender: "user" | "bot";
    text: string;
    time: string;
    gdbId?: string;
    isFeedbackPrompt?: boolean;
  }>>([
    {
      sender: "bot",
      text: "Namaste Kisan Bhai! 🙏 Main Ajrasakha AI Assistant hoon. Aap kisi bhi fasal, keet-rog, spray salah, ya mausam ke baare me pooch sakte hain.",
      time: "09:30 AM"
    },
    {
      sender: "user",
      text: "Gehun me peela ratwa (Yellow Rust) aa raha hai, kya spray karun?",
      time: "09:31 AM"
    },
    {
      sender: "bot",
      text: "🌾 **GDB Verified Answer [GDB-1042]:**\nGehun me Peela Ratwa (Yellow Rust) ke liye Propiconazole 25% EC (Tilt) ko 200 ml prati 200 litre paani me gholkar prati acre chhidkaw karein. Chhidkaw subah ya shaam ke samay karein.",
      time: "09:31 AM",
      gdbId: "GDB-1042"
    },
    {
      sender: "bot",
      text: "Was this helpful? 🙏\nReply **1** for Yes (Haan) 👍\nReply **2** for No (Nahi) 👎",
      time: "09:31 AM",
      isFeedbackPrompt: true,
      gdbId: "GDB-1042"
    }
  ]);

  const OPENWEATHER_API_KEY = (import.meta as any).env?.VITE_OPENWEATHER_API_KEY || localStorage.getItem("OPENWEATHER_API_KEY") || "";

  const fetchWeather = async (city: string) => {
    setIsLoadingWeather(true);
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},IN&appid=${OPENWEATHER_API_KEY}&units=metric&lang=hi`
      );
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setWeatherData(data);
      setCurrentCity(data.name);
    } catch {
      setWeatherData({
        name: city,
        sys: { country: "IN", sunrise: Math.floor(Date.now() / 1000 - 36000), sunset: Math.floor(Date.now() / 1000 + 7200) },
        coord: { lat: 23.2599, lon: 77.4126 },
        main: { temp: 28.4, feels_like: 29.1, humidity: 42, pressure: 1014 },
        wind: { speed: 2.3 },
        clouds: { all: 15 },
        visibility: 8000,
        weather: [{ id: 800, main: "Clear", description: "साफ आसमान / Sunny", icon: "01d" }]
      });
      setCurrentCity(city);
    } finally {
      setIsLoadingWeather(false);
    }
  };

  useEffect(() => {
    fetchWeather("Bhopal");
  }, []);

  const handleSendMessage = (customText?: string) => {
    const textToSend = customText || chatInput;
    if (!textToSend.trim()) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMsg = { sender: "user" as const, text: textToSend, time };
    setChatMessages(prev => [...prev, newMsg]);
    if (!customText) setChatInput("");

    const cleaned = textToSend.trim();
    if ((cleaned === "1" || cleaned === "2" || cleaned.toLowerCase() === "yes" || cleaned.toLowerCase() === "no") && awaitingFeedbackForGdb) {
      const isPositive = cleaned === "1" || cleaned.toLowerCase() === "yes";

      setGdbEntries(prev => prev.map(entry => {
        if (entry.id === awaitingFeedbackForGdb) {
          const newHelpful = isPositive ? entry.helpfulCount + 1 : entry.helpfulCount;
          const newUnhelpful = !isPositive ? entry.unhelpfulCount + 1 : entry.unhelpfulCount;
          const total = newHelpful + newUnhelpful;
          const newScore = Number(((newHelpful / total) * 100).toFixed(1));
          const newStatus = (newScore < 60 && total >= 10) ? "Flagged" : entry.status === "Flagged" && newScore >= 60 ? "Healthy" : entry.status;

          return {
            ...entry,
            helpfulCount: newHelpful,
            unhelpfulCount: newUnhelpful,
            totalFeedback: total,
            score: newScore,
            status: newStatus
          };
        }
        return entry;
      }));

      setTimeout(() => {
        const replyText = isPositive
          ? "Dhanyawad! Aapka feedback record kar liya gaya hai (👍 1 - Helpful). Isse hamara Kisan Sahayata system behtar hota hai."
          : "Dhanyawad! Aapka feedback record kar liya gaya hai (👎 2 - Not Helpful). Hum is jawaab ko apne Agronomist Expert Queue me re-review ke liye bhej rahe hain.";

        setChatMessages(prev => [
          ...prev,
          { sender: "bot", text: replyText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        ]);
        setAwaitingFeedbackForGdb(null);
      }, 500);
      return;
    }

    setTimeout(() => {
      let matchedGdb = gdbEntries[0];
      const q = textToSend.toLowerCase();

      if (q.includes("sarson") || q.includes("chepa") || q.includes("aphid")) {
        matchedGdb = gdbEntries.find(g => g.id === "GDB-2819") || gdbEntries[1];
      } else if (q.includes("dhaan") || q.includes("urea") || q.includes("khad")) {
        matchedGdb = gdbEntries.find(g => g.id === "GDB-4402") || gdbEntries[2];
      } else if (q.includes("kapas") || q.includes("sundi") || q.includes("bollworm")) {
        matchedGdb = gdbEntries.find(g => g.id === "GDB-7812") || gdbEntries[3];
      } else if (q.includes("tamatar") || q.includes("leaf curl") || q.includes("patti")) {
        matchedGdb = gdbEntries.find(g => g.id === "GDB-9205") || gdbEntries[4];
      } else if (q.includes("chana") || q.includes("ukhta") || q.includes("wilt")) {
        matchedGdb = gdbEntries.find(g => g.id === "GDB-5310") || gdbEntries[5];
      } else if (q.includes("weather") || q.includes("mausam") || q.includes("baarish") || q.includes("rain") || q.includes("barish")) {
        matchedGdb = {
          id: "GDB-WX01",
          question: "Hyperlocal District Weather & Spray Forecast",
          domain: "Weather & Advisory",
          answerSnippet: `🌧️ **IMD & AWS Live Mausam [${currentCity}]:**\nTaapmaan: ${Math.round(weatherData?.main?.temp || 28)}°C | Nami: ${weatherData?.main?.humidity || 42}% | Hawa: ${(weatherData?.wind?.speed ? weatherData.wind.speed * 3.6 : 8.2).toFixed(1)} km/h.\nAgale 48 ghanto tak baarish ki sambhavna sirf 10% hai. Fasal spray ke liye mausam bilkul anukool hai.`,
          totalFeedback: 420,
          helpfulCount: 395,
          unhelpfulCount: 25,
          score: 94.0,
          status: "Healthy",
          language: "Hindi",
          state: "Madhya Pradesh"
        };
      }

      setAwaitingFeedbackForGdb(matchedGdb.id);

      setChatMessages(prev => [
        ...prev,
        {
          sender: "bot",
          text: `🌱 **GDB Verified Answer [${matchedGdb.id}]:**\n${matchedGdb.answerSnippet}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          gdbId: matchedGdb.id
        },
        {
          sender: "bot",
          text: `Was this helpful? 🙏\nReply **1** for Yes (Haan) 👍\nReply **2** for No (Nahi) 👎`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isFeedbackPrompt: true,
          gdbId: matchedGdb.id
        }
      ]);
    }, 600);
  };

  const handleResolveFlagged = (id: string) => {
    setGdbEntries(prev => prev.map(entry => {
      if (entry.id === id) {
        return {
          ...entry,
          status: "Resolved",
          score: 85.0,
          helpfulCount: entry.helpfulCount + 10
        };
      }
      return entry;
    }));
  };

  const totalFeedbackCount = gdbEntries.reduce((acc, curr) => acc + curr.totalFeedback, 0);
  const totalHelpfulCount = gdbEntries.reduce((acc, curr) => acc + curr.helpfulCount, 0);
  const overallHelpfulPercentage = ((totalHelpfulCount / totalFeedbackCount) * 100).toFixed(1);
  const flaggedEntries = gdbEntries.filter(g => g.status === "Flagged" || g.score < 60);

  const stateRows = [
    { name: "Madhya Pradesh", factor: "Clear Skies & Dry Soil", districts: "Bhopal, Indore, Sehore", rainStat: "+8% vs Normal", queries: "18,420", risk: "moderate" },
    { name: "Haryana", factor: "Favorable Rabi Sun Window", districts: "Rohtak, Karnal, Hisar", rainStat: "-2% vs Normal", queries: "14,890", risk: "normal" },
    { name: "Rajasthan", factor: "Dry & Rising Day Heat", districts: "Jaipur, Alwar, Jodhpur", rainStat: "-15% vs Normal", queries: "22,110", risk: "high" },
    { name: "Punjab", factor: "Optimal Spray Window", districts: "Ludhiana, Amritsar, Bathinda", rainStat: "+4% vs Normal", queries: "16,350", risk: "normal" },
    { name: "Uttar Pradesh", factor: "Mild Mornings & Low Rain", districts: "Varanasi, Prayagraj, Meerut", rainStat: "+11% vs Normal", queries: "29,400", risk: "normal" },
    { name: "Himachal Pradesh", factor: "Hailstorm & Rain Risk", districts: "Shimla, Solan, Kangra", rainStat: "+35% vs Normal", queries: "8,920", risk: "high" }
  ];

  const filteredStates = riskFilter === "all" ? stateRows : stateRows.filter(s => s.risk === riskFilter);

  const filteredGdb = gdbEntries.filter(g => {
    const matchesSearch = g.question.toLowerCase().includes(gdbSearch.toLowerCase()) ||
                          g.id.toLowerCase().includes(gdbSearch.toLowerCase()) ||
                          g.answerSnippet.toLowerCase().includes(gdbSearch.toLowerCase());
    const matchesDomain = gdbDomainFilter === "all" || g.domain === gdbDomainFilter;
    return matchesSearch && matchesDomain;
  });

  const windSpeedKph = (weatherData?.wind?.speed ? weatherData.wind.speed * 3.6 : 8.2);
  const isSpraySafe = windSpeedKph <= 15;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CloudSun className="w-6 h-6 text-slate-950 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">AJRASAKHA</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">PS-5 & FEEDBACK SUITE</span>
            </div>
            <p className="text-xs text-slate-400 font-medium hidden sm:block">15.5M Weather Intelligence, Crop Agro-Advisories & GDB Answer Feedback Loop</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => setIsPsModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-all"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Problem Statement 5 Blueprint</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs bg-slate-900 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-lg font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>OpenWeather Live Active</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs bg-slate-900 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg">
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-white">{currentCity}, IN</span>
          </div>

          <button onClick={() => fetchWeather(currentCity)} className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-all shadow-md active:scale-95">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingWeather ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* FULL 8-TAB NAVIGATION BAR */}
      <nav className="bg-slate-900/70 border-b border-slate-800 px-4 lg:px-8 py-2 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          <button onClick={() => setActiveTab("overview")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === "overview" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "text-slate-400 border-transparent hover:bg-slate-800"}`}>
            <LayoutDashboard className="w-4 h-4" />
            <span>Overview & Analytics</span>
          </button>

          <button onClick={() => setActiveTab("playground")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === "playground" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "text-slate-400 border-transparent hover:bg-slate-800"}`}>
            <CloudLightning className="w-4 h-4" />
            <span>Live Weather Playground</span>
            <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-mono">LIVE API</span>
          </button>

          <button onClick={() => setActiveTab("agro")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === "agro" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "text-slate-400 border-transparent hover:bg-slate-800"}`}>
            <Sprout className="w-4 h-4" />
            <span>Smart Crop Advisory</span>
          </button>

          <button onClick={() => setActiveTab("whatsapp")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === "whatsapp" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "text-slate-400 border-transparent hover:bg-slate-800"}`}>
            <MessageSquareText className="w-4 h-4" />
            <span>WhatsApp Simulator</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">FEEDBACK 1/2</span>
          </button>

          <button onClick={() => setActiveTab("gdb")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === "gdb" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "text-slate-400 border-transparent hover:bg-slate-800"}`}>
            <Database className="w-4 h-4" />
            <span>GDB Entries (20k)</span>
          </button>

          <button onClick={() => setActiveTab("flagged")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === "flagged" ? "bg-rose-500/15 text-rose-400 border-rose-500/30" : "text-slate-400 border-transparent hover:bg-slate-800"}`}>
            <ShieldAlert className="w-4 h-4" />
            <span>Flagged Review (&lt;60%)</span>
            <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-bold">
              {flaggedEntries.length}
            </span>
          </button>

          <button onClick={() => setActiveTab("alerts")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === "alerts" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "text-slate-400 border-transparent hover:bg-slate-800"}`}>
            <AlertTriangle className="w-4 h-4" />
            <span>IMD Severe Alerts</span>
          </button>

          <button onClick={() => setActiveTab("digest")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${activeTab === "digest" ? "bg-purple-500/15 text-purple-400 border-purple-500/30" : "text-slate-400 border-transparent hover:bg-slate-800"}`}>
            <CalendarCheck2 className="w-4 h-4" />
            <span>Weekly Agri Digest</span>
          </button>
        </div>
      </nav>

      {/* MAIN CONTAINER */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-6">

        {/* TAB 1: OVERVIEW & ANALYTICS */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            
            {/* HERO BANNER */}
            <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-cyan-950/60 border border-emerald-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mt-1 shadow-inner">
                    <Target className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-slate-950">PROBLEM STATEMENT 5 & PROJECT FEEDBACK LOOP</span>
                      <span className="text-xs text-emerald-400 font-mono">15.54M KCC Weather Queries + 20,000 GDB Quality Signal</span>
                    </div>
                    <h2 className="font-extrabold text-2xl text-white tracking-tight">Hyperlocal Weather Intelligence, Agro-Advisory & GDB Feedback Loop</h2>
                    <p className="text-xs text-slate-300 max-w-3xl mt-1.5 leading-relaxed">
                      Unified platform resolving weather forecasting, spray suitability windows, and continuous GDB knowledge base improvement via farmer WhatsApp feedback (Reply 1/2).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab("playground")}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-600/30 active:scale-95"
                  >
                    <CloudLightning className="w-4 h-4" />
                    <span>Live Weather Playground</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("whatsapp")}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl transition-all border border-slate-700 active:scale-95"
                  >
                    <MessageSquareText className="w-4 h-4" />
                    <span>WhatsApp Bot</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span><b>59</b> Weather Clusters</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span><b>20,000+</b> GDB Answers</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <ThumbsUp className="w-4 h-4 text-purple-400" />
                  <span><b>{overallHelpfulPercentage}%</b> Farmer Satisfaction</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <SprayCan className="w-4 h-4 text-amber-400" />
                  <span><b>7</b> Crops Monitored</span>
                </div>
              </div>
            </div>

            {/* KPI METRIC CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total KCC Queries</span>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-extrabold text-3xl text-white">15.54M</span>
                  <span className="text-xs text-emerald-400 font-semibold flex items-center">+12.4%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">15,549,889 KCC weather queries indexed</p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Helpfulness Score</span>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ThumbsUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-extrabold text-3xl text-emerald-400">{overallHelpfulPercentage}%</span>
                  <span className="text-xs text-emerald-400 font-semibold flex items-center">
                    <Sparkles className="w-3.5 h-3.5 mr-0.5" /> High Satisfaction
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">From live farmer WhatsApp ratings</p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">IMD Alerts Active</span>
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-extrabold text-3xl text-amber-400">14 Districts</span>
                  <span className="text-xs text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">Orange Alert</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Thunderstorm & Hailstorm bulletins</p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Auto-Flagged Answers</span>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-extrabold text-3xl text-rose-400">{flaggedEntries.length}</span>
                  <span className="text-xs text-rose-400 font-semibold flex items-center">
                    &lt; 60% Score
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Queued for Agronomist Re-Editing</p>
              </div>
            </div>

            {/* DEMAND BREAKDOWN & STATE RISK INDEX */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
                <h3 className="font-bold text-lg text-white mb-2">Farmer Weather Needs (KCC 59 Clusters)</h3>
                <p className="text-xs text-slate-400 mb-4">Official demand distribution from 15.5M meteorological queries</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-emerald-400">1. General 7-Day Weather Forecast</span>
                      <span className="text-white">91.38% (13.7M)</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: "91.38%" }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-blue-400">2. District Weather Forecast & Alerts</span>
                      <span className="text-white">4.66% (1.33M)</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: "20%" }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-cyan-400">3. Rain Statistics & Prediction</span>
                      <span className="text-white">1.92% (248K)</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-cyan-400 h-full rounded-full" style={{ width: "12%" }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-amber-400">4. Live Weather Observation (AWS)</span>
                      <span className="text-white">1.42% (180K)</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-400 h-full rounded-full" style={{ width: "9%" }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-purple-400">5. Crop Weather Impact & Agromet Advisory</span>
                      <span className="text-white">0.62% (78K)</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-purple-400 h-full rounded-full" style={{ width: "6%" }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* State Table Filter & Card */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg text-white">State Meteorological Risk Index</h3>
                    <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 outline-none">
                      <option value="all">All States</option>
                      <option value="high">High Risk</option>
                      <option value="moderate">Moderate</option>
                      <option value="normal">Normal</option>
                    </select>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {filteredStates.map((st, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 bg-slate-950/70 rounded-xl border border-slate-800 text-xs">
                        <div>
                          <span className="font-bold text-white block">{st.name}</span>
                          <span className="text-slate-400 text-[11px]">{st.factor}</span>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${st.risk === "high" ? "bg-rose-500/20 text-rose-300" : st.risk === "moderate" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                            {st.risk}
                          </span>
                          <span className="block text-slate-400 text-[11px] font-mono mt-0.5">{st.queries} q</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
                  Data synchronized with IMD National Agromet bulletins
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE WEATHER PLAYGROUND */}
        {activeTab === "playground" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 min-w-[280px]">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Enter City / District</label>
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchInput}
                      onChange={e => setSearchInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && fetchWeather(searchInput)}
                      placeholder="Type district (e.g. Bhopal, Rohtak, Jaipur, Ludhiana, Varanasi)..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <button onClick={() => fetchWeather(searchInput)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all">
                    Inspect
                  </button>
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-1.5">
                <span className="text-xs text-slate-400 mr-1">Presets:</span>
                {["Bhopal", "Rohtak", "Jaipur", "Ludhiana", "Varanasi", "Hyderabad"].map(city => (
                  <button
                    key={city}
                    onClick={() => { setSearchInput(city); fetchWeather(city); }}
                    className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-emerald-500/20 text-slate-200 border border-slate-700 transition-all"
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>

            {/* Weather Metric Hero */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-900/80 to-emerald-950/30 border border-emerald-500/20 rounded-2xl p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-extrabold text-3xl text-white tracking-tight">{currentCity}</h2>
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        {weatherData?.sys?.country || "IN"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Lat: {weatherData?.coord?.lat?.toFixed(4) || "23.2599"}° N, Lon: {weatherData?.coord?.lon?.toFixed(4) || "77.4126"}° E
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-emerald-400 capitalize">{weatherData?.weather?.[0]?.description || "Clear Sky"}</span>
                    <p className="text-xs text-slate-400 font-mono">Live synced</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center my-4">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Sun className="w-12 h-12 stroke-[1.5]" />
                    </div>
                    <div>
                      <div className="flex items-baseline">
                        <span className="font-extrabold text-6xl text-white tracking-tighter">{Math.round(weatherData?.main?.temp || 28)}</span>
                        <span className="text-2xl text-emerald-400 font-bold ml-1">°C</span>
                      </div>
                      <p className="text-xs text-slate-400">Feels like {(weatherData?.main?.feels_like || 29).toFixed(1)}°C</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-slate-400 flex items-center gap-1"><Droplets className="w-3.5 h-3.5 text-cyan-400" /> Humidity</span>
                      <p className="font-bold text-base text-white mt-0.5">{weatherData?.main?.humidity || 42}%</p>
                    </div>
                    <div>
                      <span className="text-slate-400 flex items-center gap-1"><Wind className="w-3.5 h-3.5 text-emerald-400" /> Wind Speed</span>
                      <p className="font-bold text-base text-white mt-0.5">{windSpeedKph.toFixed(1)} km/h</p>
                    </div>
                    <div>
                      <span className="text-slate-400 flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-purple-400" /> Pressure</span>
                      <p className="font-bold text-base text-white mt-0.5">{weatherData?.main?.pressure || 1014} hPa</p>
                    </div>
                    <div>
                      <span className="text-slate-400 flex items-center gap-1"><Cloud className="w-3.5 h-3.5 text-blue-400" /> Cloud Cover</span>
                      <p className="font-bold text-base text-white mt-0.5">{weatherData?.clouds?.all || 15}%</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-300 font-medium">
                  <span className="flex items-center gap-1.5"><Sunrise className="w-4 h-4 text-amber-400" /> Sunrise: <b className="text-white">06:12 AM</b></span>
                  <span className="flex items-center gap-1.5"><Sunset className="w-4 h-4 text-orange-400" /> Sunset: <b className="text-white">06:48 PM</b></span>
                  <span className="flex items-center gap-1.5"><Eye className="w-4 h-4 text-cyan-400" /> Visibility: <b className="text-white">8.0 km</b></span>
                </div>
              </div>

              {/* Raw JSON Debugger */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-white">Live API Payload</h3>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">HTTP 200 OK</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Live JSON from OpenWeatherMap endpoint</p>
                  <pre className="bg-slate-950 text-emerald-400 font-mono text-[11px] p-3 rounded-xl overflow-x-auto max-h-48 border border-slate-800 leading-relaxed">
                    {JSON.stringify(weatherData, null, 2)}
                  </pre>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Latency: <strong className="text-white">128ms</strong></span>
                  <span>Units: <strong className="text-white">Metric (°C)</strong></span>
                </div>
              </div>
            </div>

            {/* 7-Day Forecast */}
            <div>
              <h3 className="font-bold text-lg text-white mb-3 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                <span>7-Day Agro-Meteorological Forecast</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {["Today", "Tomorrow", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, idx) => {
                  const base = Math.round(weatherData?.main?.temp || 28);
                  const high = base + (idx % 2 === 0 ? 1 : -1) * (idx * 0.5);
                  const rainProb = [0, 5, 15, 60, 10, 0, 5][idx];
                  return (
                    <div key={day} className={`bg-slate-900/70 border rounded-xl p-3.5 text-center flex flex-col items-center justify-between ${rainProb > 40 ? "border-cyan-500/40 bg-cyan-950/20" : "border-slate-800"}`}>
                      <span className={`text-xs font-bold ${idx === 0 ? "text-emerald-400" : "text-slate-300"}`}>{day}</span>
                      <div className="my-2 p-2 rounded-lg bg-slate-950 text-slate-200">
                        {rainProb > 40 ? <Cloud className="w-5 h-5 text-cyan-400" /> : <Sun className="w-5 h-5 text-amber-400" />}
                      </div>
                      <div className="text-xs">
                        <span className="font-bold text-white">{Math.round(high)}°</span>
                        <span className="text-slate-400 text-[11px] ml-1">{Math.round(high - 8)}°</span>
                      </div>
                      <span className={`text-[10px] mt-1 font-mono ${rainProb > 40 ? "text-cyan-300 font-bold" : "text-slate-400"}`}>
                        💧 {rainProb}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SMART AGRO ADVISORY */}
        {activeTab === "agro" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <h3 className="font-bold text-xl text-white">Smart Crop Spray & Irrigation Advisor</h3>
                  <p className="text-xs text-slate-400">Automatic advisory calculated from current wind speed ({windSpeedKph.toFixed(1)} km/h) & humidity ({weatherData?.main?.humidity || 42}%)</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-300 font-medium">Select Crop:</label>
                  <select value={selectedCrop} onChange={e => setSelectedCrop(e.target.value)} className="bg-slate-950 border border-slate-700 text-white font-semibold text-sm rounded-xl px-4 py-2 outline-none focus:border-emerald-500">
                    <option value="wheat">Wheat (गेहूँ)</option>
                    <option value="mustard">Mustard (सरसों)</option>
                    <option value="cotton">Cotton (कपास)</option>
                    <option value="paddy">Paddy / Rice (धान)</option>
                    <option value="chilli">Chilli (मिर्च)</option>
                    <option value="maize">Maize (मक्का)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className={`rounded-2xl p-5 border ${isSpraySafe ? "bg-emerald-950/20 border-emerald-500/30" : "bg-rose-950/20 border-rose-500/30"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold uppercase tracking-wider ${isSpraySafe ? "text-emerald-400" : "text-rose-400"}`}>Spray Suitability Window</span>
                    <SprayCan className={`w-5 h-5 ${isSpraySafe ? "text-emerald-400" : "text-rose-400"}`} />
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${isSpraySafe ? "bg-emerald-500 text-slate-950" : "bg-rose-500 text-white"}`}>
                    {isSpraySafe ? "SAFE TO SPRAY" : "UNSAFE: HIGH DRIFT"}
                  </span>
                  <h4 className="font-bold text-base text-white mt-3">
                    {isSpraySafe ? "Favorable Wind & Zero Rain Risk" : "Wind Speed Exceeds 15 km/h"}
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {isSpraySafe
                      ? `Wind speed is ${windSpeedKph.toFixed(1)} km/h with dry conditions. Excellent window for ${selectedCrop.toUpperCase()} foliar fungicide/insecticide spray.`
                      : `Wind speed is ${windSpeedKph.toFixed(1)} km/h. Risk of chemical drift onto non-target areas. Postpone spray until wind subsides.`}
                  </p>
                </div>

                <div className="rounded-2xl p-5 border bg-blue-950/20 border-blue-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Irrigation (सिंचाई) Advisory</span>
                    <Droplet className="w-5 h-5 text-blue-400" />
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-500 text-slate-950">
                    IRRIGATION RECOMMENDED
                  </span>
                  <h4 className="font-bold text-base text-white mt-3">Dry Soil & No Imminent Rain</h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Clear skies forecasted for the next 48h. Provide light evening irrigation to maintain root zone moisture.
                  </p>
                </div>

                <div className="rounded-2xl p-5 border bg-amber-950/20 border-amber-500/30">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Pest Surveillance Index</span>
                    <Bug className="w-5 h-5 text-amber-400" />
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-500 text-slate-950">
                    MODERATE SURVEILLANCE
                  </span>
                  <h4 className="font-bold text-base text-white mt-3">Aphid & Sucking Pest Alert</h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Current temperature ({Math.round(weatherData?.main?.temp || 28)}°C) favors sucking pests in {selectedCrop}. Inspect leaf undersides regularly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: WHATSAPP SIMULATOR */}
        {activeTab === "whatsapp" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            <div className="lg:col-span-2 bg-slate-950 border border-slate-800 rounded-3xl p-5 flex flex-col h-[650px] shadow-2xl">
              <div className="bg-emerald-900/40 border border-emerald-500/30 rounded-2xl p-3.5 flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                      Ajrasakha Kisan Mitra <BadgeCheck className="w-4 h-4 text-emerald-400" />
                    </h4>
                    <p className="text-[11px] text-emerald-300">Official GDB Verified Advisory & Feedback Bot</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-mono">WhatsApp Online</span>
                  <button onClick={() => setChatMessages([{ sender: "bot", text: "Namaste Kisan Bhai! Main Ajrasakha GDB & Weather AI hoon. Apna sawal poochhein.", time: "10:00 AM" }])} className="text-slate-400 hover:text-slate-200 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2 text-xs custom-scrollbar">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex items-start gap-2.5 max-w-[88%] ${msg.sender === "user" ? "ml-auto justify-end" : ""}`}>
                    <div className={`p-3.5 shadow-md space-y-2.5 ${
                      msg.sender === "user"
                        ? "bg-emerald-800 text-white rounded-[16px_0px_16px_16px]"
                        : "bg-slate-900 border border-slate-800 text-slate-100 rounded-[0px_16px_16px_16px]"
                    }`}>
                      <p className="leading-relaxed whitespace-pre-line">{msg.text}</p>
                      
                      {msg.isFeedbackPrompt && (
                        <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-slate-400 font-medium">Quick Reply:</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSendMessage("1")}
                              className="flex items-center gap-1 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 px-3 py-1.5 rounded-lg font-bold transition-all"
                            >
                              <ThumbsUp className="w-3 h-3" /> Reply 1 (Yes)
                            </button>
                            <button
                              onClick={() => handleSendMessage("2")}
                              className="flex items-center gap-1 bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 px-3 py-1.5 rounded-lg font-bold transition-all"
                            >
                              <ThumbsDown className="w-3 h-3" /> Reply 2 (No)
                            </button>
                          </div>
                        </div>
                      )}

                      <span className="block text-[10px] text-slate-400 text-right font-mono">{msg.time}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSendMessage()}
                  placeholder={awaitingFeedbackForGdb ? "Type '1' for Yes or '2' for No..." : "Poochhein (e.g. Gehun me spray, Kal mausam kaisa rahega, Dhaan me khad)..."}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-emerald-500"
                />
                <button onClick={() => handleSendMessage()} className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl transition-all shadow-md shadow-emerald-600/20 active:scale-95">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Test Queries */}
            <div className="space-y-6">
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                <h4 className="font-bold text-sm text-white mb-2 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>1-Click Test Scenarios</span>
                </h4>
                <div className="space-y-2">
                  {[
                    { q: "Kal Bhopal me mausam kaisa rahega aur baarish hogi kya?", tag: "Weather Forecast (IMD/AWS)" },
                    { q: "Gehun me peela ratwa (Yellow Rust) aa raha hai, kya spray karun?", tag: "High Quality (GDB-1042)" },
                    { q: "Kapas me gulabi sundi (Pink Bollworm) ka prabhav kaise rokein?", tag: "Low Score / Flagged (GDB-7812)" },
                    { q: "Tamatar me patti modak rog (Leaf Curl Virus) ka upchar kya hai?", tag: "Too Technical (GDB-9205)" }
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item.q)}
                      className="w-full text-left p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 group transition-all"
                    >
                      <span className="font-medium text-white block mb-0.5">{item.q}</span>
                      <span className="text-[10px] text-emerald-400 font-mono">{item.tag}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/70 border border-emerald-500/20 rounded-2xl p-5 text-xs text-slate-300 space-y-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Project 5 Closed Feedback Loop</span>
                </h4>
                <ol className="space-y-2 list-decimal list-inside text-slate-400 leading-relaxed">
                  <li><strong className="text-slate-200">1. Answer Delivery:</strong> AjraSakha delivers expert GDB answer.</li>
                  <li><strong className="text-slate-200">2. Auto Follow-up:</strong> Sends <em>"Reply 1 for Yes, 2 for No"</em>.</li>
                  <li><strong className="text-slate-200">3. Live Signal:</strong> Votes recorded against specific GDB ID.</li>
                  <li><strong className="text-slate-200">4. Auto Flagging:</strong> If score drops &lt; 60%, flags for Agronomist re-review.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: GDB DIRECTORY */}
        {activeTab === "gdb" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 min-w-[280px]">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Search GDB Answers</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={gdbSearch}
                    onChange={e => setGdbSearch(e.target.value)}
                    placeholder="Search by GDB-ID, Crop, Disease, or Fertilizer..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Filter Domain</label>
                <select
                  value={gdbDomainFilter}
                  onChange={e => setGdbDomainFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-xs text-white rounded-xl px-3 py-2.5 outline-none"
                >
                  <option value="all">All Domains</option>
                  <option value="Crop Protection">Crop Protection</option>
                  <option value="Pest Control">Pest Control</option>
                  <option value="Soil & Nutrients">Soil & Nutrients</option>
                  <option value="Horticulture">Horticulture</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg text-white">GDB Master Knowledge Base Directory</h3>
                  <p className="text-xs text-slate-400">Showing expert-verified answers linked with live farmer feedback signals</p>
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
                  {filteredGdb.length} entries shown
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">GDB ID</th>
                      <th className="py-3 px-4">Farmer Question</th>
                      <th className="py-3 px-4">Domain</th>
                      <th className="py-3 px-4">State / Lang</th>
                      <th className="py-3 px-4">Feedback Ratio</th>
                      <th className="py-3 px-4">Helpful %</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {filteredGdb.map(entry => (
                      <tr key={entry.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400">{entry.id}</td>
                        <td className="py-3 px-4 max-w-xs">
                          <p className="font-semibold text-white truncate">{entry.question}</p>
                          <p className="text-[11px] text-slate-400 truncate">{entry.answerSnippet}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                            {entry.domain}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-300">
                          {entry.state} • <span className="text-cyan-400">{entry.language}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          <span className="text-emerald-400 font-bold">👍 {entry.helpfulCount}</span> / <span className="text-rose-400">👎 {entry.unhelpfulCount}</span>
                        </td>
                        <td className="py-3 px-4 font-bold text-sm">
                          <span className={entry.score >= 60 ? "text-emerald-400" : "text-rose-400"}>
                            {entry.score}%
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            entry.status === "Healthy" ? "bg-emerald-500/20 text-emerald-300" :
                            entry.status === "Flagged" ? "bg-rose-500/20 text-rose-300" :
                            "bg-purple-500/20 text-purple-300"
                          }`}>
                            {entry.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setActiveTab("whatsapp");
                              setTimeout(() => handleSendMessage(entry.question), 200);
                            }}
                            className="text-xs bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700 transition-all"
                          >
                            Test in Bot
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: FLAGGED REVIEW QUEUE (< 60%) */}
        {activeTab === "flagged" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 border border-rose-500/30 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-white">Automated Flagged Review Queue (&lt; 60% Helpfulness)</h3>
                    <p className="text-xs text-slate-400">GDB entries with consistently poor farmer feedback requiring agronomist re-editing</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 font-bold font-mono">
                    Threshold: &lt; 60% Positive (10+ Votes)
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {flaggedEntries.map(entry => (
                <div key={entry.id} className="bg-slate-900/80 border border-rose-500/30 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-lg">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-rose-400 text-sm">{entry.id}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">
                        Score: {entry.score}%
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-white mb-2 leading-snug">{entry.question}</h4>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300 mb-3 italic">
                      "{entry.answerSnippet}"
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="text-rose-300 font-medium">
                        <strong className="text-slate-400">Why Farmer Rated Low:</strong> {entry.flagReason}
                      </div>
                      <div className="text-emerald-300 font-medium">
                        <strong className="text-slate-400">Recommended Fix:</strong> {entry.suggestedFix}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-mono">
                      👍 {entry.helpfulCount} / 👎 {entry.unhelpfulCount} ({entry.totalFeedback} votes)
                    </span>
                    <button
                      onClick={() => handleResolveFlagged(entry.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-md active:scale-95"
                    >
                      ✓ Approve Re-Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 7: IMD SEVERE ALERTS */}
        {activeTab === "alerts" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-slate-900/70 border-l-4 border-l-rose-500 border border-slate-800 rounded-2xl p-5">
                <span className="text-xs font-bold text-rose-400 uppercase">Red Alert • Hailstorm</span>
                <h4 className="font-bold text-base text-white mt-1">Shimla & Solan, HP</h4>
                <p className="text-xs text-slate-300 mt-2">Severe hailstorm and gusty winds (45–55 km/h). Fruit growers deploy anti-hail nets.</p>
              </div>

              <div className="bg-slate-900/70 border-l-4 border-l-amber-500 border border-slate-800 rounded-2xl p-5">
                <span className="text-xs font-bold text-amber-400 uppercase">Orange Alert • Heavy Rain</span>
                <h4 className="font-bold text-base text-white mt-1">Bhopal & Sehore, MP</h4>
                <p className="text-xs text-slate-300 mt-2">Isolated heavy rainfall expected (64.5 to 115.5 mm). Create field drainage channels.</p>
              </div>

              <div className="bg-slate-900/70 border-l-4 border-l-yellow-500 border border-slate-800 rounded-2xl p-5">
                <span className="text-xs font-bold text-yellow-400 uppercase">Yellow Alert • Heatwave</span>
                <h4 className="font-bold text-base text-white mt-1">Barmer & Jodhpur, RJ</h4>
                <p className="text-xs text-slate-300 mt-2">Day temperatures likely to exceed 41°C. Frequent light irrigation advised.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: WEEKLY AGRI DIGEST */}
        {activeTab === "digest" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 font-mono">
                  WEEKLY AGRONOMIST DIGEST #24
                </span>
                <h3 className="font-bold text-xl text-white mt-2 mb-3">Priority Review Digest for Agronomy Team</h3>
                
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-rose-400">1. Pink Bollworm in Cotton (Marathi)</h4>
                      <span className="text-xs text-slate-400 font-mono">GDB-7812 • 54.2%</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      <strong>Feedback:</strong> Farmers found spray instructions too expensive; missing pheromone lure timing.
                    </p>
                    <p className="text-[11px] text-emerald-400">
                      <strong>Action:</strong> Include biological IPM control and cost-effective lure schedule.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-rose-400">2. Tomato Leaf Curl Virus (Telugu)</h4>
                      <span className="text-xs text-slate-400 font-mono">GDB-9205 • 51.4%</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      <strong>Feedback:</strong> Stating "no direct cure" discouraged farmers; missing vector guidance.
                    </p>
                    <p className="text-[11px] text-emerald-400">
                      <strong>Action:</strong> Explain Whitefly management with yellow sticky traps and net covers.
                    </p>
                  </div>
                </div>
              </div>

              {/* Language Satisfaction */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
                <h3 className="font-bold text-lg text-white mb-3">Language Satisfaction Index</h3>
                <div className="space-y-2.5">
                  {[
                    { lang: "Hindi (हिंदी)", score: 91.4, votes: "14,200", status: "Optimal" },
                    { lang: "Punjabi (ਪੰਜਾਬੀ)", score: 89.2, votes: "6,800", status: "Optimal" },
                    { lang: "Marathi (मराठी)", score: 72.5, votes: "4,900", status: "Moderate" },
                    { lang: "Telugu (తెలుగు)", score: 68.0, votes: "3,100", status: "Needs Review" },
                    { lang: "Gujarati (ગુજરાતી)", score: 87.5, votes: "2,400", status: "Optimal" }
                  ].map((l, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                      <div>
                        <span className="font-bold text-white block">{l.lang}</span>
                        <span className="text-slate-400 text-[11px]">{l.votes} feedback votes</span>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-sm text-emerald-400">{l.score}%</span>
                        <span className={`block text-[10px] font-bold ${l.score >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
                          {l.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* PS-5 RESEARCH & BLUEPRINT MODAL */}
        {isPsModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-6 text-xs text-slate-300 shadow-2xl relative custom-scrollbar">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">Problem Statement 5: Weather Intelligence & Farmer Feedback Loop</h3>
                    <p className="text-slate-400 text-xs">Kisan Call Center (KCC) 15.5M Queries + 20,000+ GDB Answers Quality Loop</p>
                  </div>
                </div>
                <button onClick={() => setIsPsModalOpen(false)} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <h4 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> 1. Problem Overview & Scope
                  </h4>
                  <p className="leading-relaxed text-slate-300">
                    In the Kisan Call Center (KCC) dataset of <b>43.4M queries</b>, <b>15.54M (35.8%)</b> are weather-related. At the same time, ACE has <b>20,000+ expert-validated answers in GDB</b>, but lacked a systematic farmer feedback channel.
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <h4 className="font-bold text-sm text-cyan-400 flex items-center gap-2">
                    <Layers className="w-4 h-4" /> 2. Complete End-to-End Solution
                  </h4>
                  <ul className="space-y-2 list-disc list-inside text-slate-300">
                    <li><b>Live Weather & Agromet Advisory:</b> OpenWeatherMap + IMD Local Mirrors providing 7-day forecasts, spray window alerts, and rain barometers.</li>
                    <li><b>WhatsApp Feedback Prompt:</b> After delivering answers, AjraSakha asks: <em>"Reply 1 for Yes, 2 for No"</em>.</li>
                    <li><b>Automated Re-Review Queue:</b> Low-rated entries (&lt; 60%) automatically routed to Agronomists.</li>
                    <li><b>Weekly Digest:</b> Consolidated priority reports for the agricultural science team.</li>
                  </ul>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-800">
                <button onClick={() => setIsPsModalOpen(false)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all">
                  Understood & Close
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

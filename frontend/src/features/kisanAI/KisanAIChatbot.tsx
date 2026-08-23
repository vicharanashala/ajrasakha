import React, { useState, useRef, useEffect } from "react";
import type { IChatMessage, IAgroQuickPrompt } from "./types";
import { KisanAIService } from "./services/kisanAIService";
import type { AgroAnswer } from "./services/kisanAIService";
import { ChatMessageItem } from "./components/ChatMessageItem";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import { toast } from "@/shared/components/toast";
import {
  Send,
  Mic,
  MicOff,
  Image as ImageIcon,
  Sparkles,
  Bot,
  RefreshCw,
  X,
  Languages,
  ShieldCheck,
  Zap,
  Volume2,
  VolumeX,
  Camera,
  AlertCircle,
  FileText,
  Wheat,
  Activity,
  Layers,
} from "lucide-react";

const QUICK_PROMPTS_HI: IAgroQuickPrompt[] = [
  {
    id: "1",
    icon: "🌾",
    title: "गेहूं पीला रतुआ",
    category: "Pest & Disease",
    query: "गेहूं में पीला रतुआ (Yellow Rust) की रोकथाम के लिए कौन सी दवा स्प्रे करें?",
    crop: "Wheat",
  },
  {
    id: "2",
    icon: "🌿",
    title: "कपास गुलाबी सुंडी",
    category: "Pest & Disease",
    query: "कपास में गुलाबी सुंडी (Pink Bollworm) के नियंत्रण के लिए फेरोमोन ट्रैप और कीटनाशक बताएं?",
    crop: "Cotton",
  },
  {
    id: "3",
    icon: "🏛️",
    title: "PM-Kisan स्थिति",
    category: "Government Schemes",
    query: "पीएम किसान सम्मान निधि 18वीं किस्त और e-KYC की स्थिति कैसे चेक करें?",
    crop: "General",
  },
  {
    id: "4",
    icon: "🍅",
    title: "टमाटर पत्ती मरोड़",
    category: "Pest & Disease",
    query: "टमाटर में पत्ती मरोड़ (Leaf Curl Virus) और फल छेदक कीट का इलाज क्या है?",
    crop: "Tomato",
  },
  {
    id: "5",
    icon: "🧪",
    title: "संतुलित NPK खाद",
    category: "Nutrient",
    query: "प्रति एकड़ गेहूं और धान की फसल में यूरिया व डीएपी की सही संतुलित मात्रा क्या है?",
    crop: "Wheat",
  },
  {
    id: "6",
    icon: "☀️",
    title: "PM-कुसुम सोलर पंप",
    category: "Government Schemes",
    query: "पीएम-कुसुम 90% सब्सिडी सोलर पंप योजना का लाभ कैसे लें?",
    crop: "General",
  },
];

const QUICK_PROMPTS_EN: IAgroQuickPrompt[] = [
  {
    id: "1",
    icon: "🌾",
    title: "Wheat Yellow Rust",
    category: "Pest & Disease",
    query: "How to treat yellow rust in wheat and which fungicide should I spray?",
    crop: "Wheat",
  },
  {
    id: "2",
    icon: "🌿",
    title: "Cotton Pink Bollworm",
    category: "Pest & Disease",
    query: "How to control pink bollworm in cotton using pheromone traps & pesticides?",
    crop: "Cotton",
  },
  {
    id: "3",
    icon: "🏛️",
    title: "PM-Kisan Verification",
    category: "Government Schemes",
    query: "How to check PM-Kisan 18th installment status and Aadhaar e-KYC?",
    crop: "General",
  },
  {
    id: "4",
    icon: "🍅",
    title: "Tomato Leaf Curl",
    category: "Pest & Disease",
    query: "What is the best treatment for leaf curl virus and whiteflies in tomato?",
    crop: "Tomato",
  },
  {
    id: "5",
    icon: "🧪",
    title: "Balanced NPK Dosage",
    category: "Nutrient",
    query: "What is the recommended dosage of Urea and DAP per acre for wheat & paddy?",
    crop: "Wheat",
  },
  {
    id: "6",
    icon: "☀️",
    title: "PM-KUSUM Solar Pump",
    category: "Government Schemes",
    query: "How to apply for 90% subsidy on PM-KUSUM Solar Pump scheme?",
    crop: "General",
  },
];

export const KisanAIChatbot: React.FC = () => {
  const { language, t } = useLanguage();
  const [messages, setMessages] = useState<IChatMessage[]>(() => {
    return [
      {
        id: "msg-welcome",
        sender: "assistant",
        text:
          language === "hi"
            ? "🌾 **राम-राम किसान भाई!** मैं आपका अज्रसखा AI कृषि विशेषज्ञ हूँ।\n\n- आप फसल रोग, कीट नियंत्रण, खाद की संतुलित मात्रा (NPK), सरकारी योजनाओं (PM-Kisan, PM-KUSUM) या मौसम से संबंधित कोई भी प्रश्न पूछ सकते हैं।\n- 📸 **तस्वीर भेजकर जांचें:** पत्ती, कीड़ा या फसल की फोटो अपलोड करके तत्काल AI विज़न रोग निदान पाएं!"
            : language === "hinglish"
            ? "🌾 **Namaste Kisan Bhai!** Mai aapka Ajrasakha AI Krishi Expert hoon.\n\n- Aap fasal rog, keet ilaaj, NPK khaad dose, sarkari yojana ya mausam se juda koi bhi sawal pooch sakte hain.\n- 📸 **Photo Bhejein:** Patti ya fasal ki photo attach karke live AI Rog Analysis paayein!"
            : "🌾 **Greetings Farmer Friend!** I am your Ajrasakha AI Agricultural Intelligence Advisor.\n\n- Ask any question about crop diseases, pest solutions, balanced NPK fertilizers, subsidies (PM-Kisan, PM-KUSUM) or agro-weather.\n- 📸 **Multimodal Vision:** Upload or drop crop foliage photos for instant AI disease diagnosis!",
        timestamp: new Date(),
        crop: "General",
        domain: "AI Assistant",
      },
    ];
  });

  const [inputQuery, setInputQuery] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const quickPrompts = language === "en" ? QUICK_PROMPTS_EN : QUICK_PROMPTS_HI;

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Voice Input Speech Recognition Setup
  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = language === "en" ? "en-IN" : "hi-IN";

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputQuery((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsRecording(false);
      };

      recognitionRef.current.onerror = () => {
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, [language]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast.error(t("आपके ब्राउज़र में वॉइस इनपुट समर्थित नहीं है", "Voice input not supported on this browser", "Voice not supported"));
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.lang = language === "en" ? "en-IN" : "hi-IN";
        recognitionRef.current.start();
        setIsRecording(true);
        toast.success(t("🎙️ बोलना शुरू करें...", "🎙️ Listening...", "🎙️ Listening..."));
      } catch (e) {
        setIsRecording(false);
      }
    }
  };

  // Image Upload Handling
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error(t("इमेज साइज 8MB से कम होना चाहिए", "Image size must be under 8MB", "Image too large"));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
        toast.success(t("📸 फसल की तस्वीर संलग्न हो गई!", "📸 Crop image attached!", "Image attached!"));
      };
      reader.readAsDataURL(file);
    }
  };

  // Quick Demo Image Attachment for Testing
  const handleSampleImage = (type: "wheat" | "tomato") => {
    // Generate an illustrative placeholder data URL canvas
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = type === "wheat" ? "#854d0e" : "#991b1b";
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText(type === "wheat" ? "Wheat Yellow Rust Sample" : "Tomato Leaf Curl Sample", 40, 150);
      setAttachedImage(canvas.toDataURL());
      setInputQuery(
        type === "wheat"
          ? language === "hi"
            ? "मेरी गेहूं की पत्तियों पर पीली धारियां हैं, इसका रोग और उपचार बताएं"
            : "Yellow stripe rust on wheat leaves, please analyze and give treatment"
          : language === "hi"
          ? "टमाटर के पौधे की पत्तियां ऊपर मुड़ रही हैं, क्या रोग है?"
          : "Tomato leaf curling upwards, what is this disease?"
      );
      toast.success(t("📸 नमूना फसल तस्वीर लोड हो गई!", "📸 Sample crop photo loaded!", "Sample photo loaded!"));
    }
  };

  // Text-To-Speech (TTS) Voice Player
  const handlePlayTTS = (text: string, msgId: string) => {
    if (!("speechSynthesis" in window)) {
      toast.error("TTS audio not supported");
      return;
    }

    if (playingAudioId === msgId) {
      window.speechSynthesis.cancel();
      setPlayingAudioId(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Clean markdown symbols for smooth voice
    const cleanText = text.replace(/[*#_`\[\]()]/g, "").substring(0, 400);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language === "en" ? "en-IN" : "hi-IN";
    utterance.rate = 1.0;

    utterance.onend = () => {
      setPlayingAudioId(null);
    };
    utterance.onerror = () => {
      setPlayingAudioId(null);
    };

    setPlayingAudioId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  // Send Message Handler
  const handleSendMessage = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend && !attachedImage) return;

    const userMessage: IChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: textToSend || t("📸 फसल तस्वीर का विश्लेषण करें", "📸 Analyze attached crop photo", "📸 Analyze photo"),
      timestamp: new Date(),
      attachedImage: attachedImage || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    const currentImage = attachedImage;
    setAttachedImage(null);
    setIsTyping(true);

    try {
      const response: AgroAnswer = await KisanAIService.answerAgroQuestion(
        textToSend,
        language,
        currentImage || undefined
      );

      const botMessage: IChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "assistant",
        text: response.text,
        timestamp: new Date(),
        crop: response.crop,
        domain: response.domain,
        questionId: response.questionId,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (e) {
      toast.error(t("AI उत्तर प्राप्त करने में त्रुटि", "Error generating AI response", "Error"));
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: "msg-welcome-new",
        sender: "assistant",
        text:
          language === "hi"
            ? "🌾 **वार्तालाप रीसेट हो गया!** नया कृषि प्रश्न पूछें या तस्वीर भेजें।"
            : "🌾 **Chat Reset!** Ask any new agricultural query or upload a photo.",
        timestamp: new Date(),
        crop: "General",
        domain: "AI Assistant",
      },
    ]);
    toast.success(t("चैट रीसेट हो गई!", "Chat cleared!", "Chat cleared!"));
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-3 sm:p-6 flex flex-col gap-4">
      {/* 🚀 Futuristic AI Top Status Bar */}
      <div className="rounded-3xl bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-amber-950/80 border border-emerald-500/30 p-4 sm:p-5 shadow-2xl backdrop-blur-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-amber-500 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-950 flex-shrink-0">
              <Bot className="w-6 h-6" />
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-1.5">
                <span>Ajrasakha Omni-Agri AI</span>
                <span className="text-emerald-400 text-xs sm:text-sm font-semibold">(2.0 Vision)</span>
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                256-Bit SafeSearch
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {t(
                "असीमित कृषि बुद्धिमत्ता, मल्टीमॉडल विज़न इमेज रोग निदान, NPK पोषण व योजना परामर्श",
                "Omni Agricultural Intelligence, Multimodal Image Disease Scanner & Subsidies",
                "Advanced Multimodal Agri AI Assistant"
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
            title="Clear Chat History"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t("चैट साफ करें", "Clear Chat", "Clear")}</span>
          </button>
        </div>
      </div>

      {/* 💬 Main Chat Container */}
      <div className="rounded-3xl bg-slate-900/85 border border-slate-800 shadow-2xl backdrop-blur-2xl flex flex-col h-[650px] overflow-hidden">
        {/* Messages Scroll Area */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="relative group">
              <ChatMessageItem message={msg} />

              {/* TTS Voice Speaker Button on Assistant Messages */}
              {msg.sender === "assistant" && (
                <button
                  onClick={() => handlePlayTTS(msg.text, msg.id)}
                  className={`mt-1 ml-12 px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow ${
                    playingAudioId === msg.id
                      ? "bg-amber-500 text-slate-950 animate-pulse"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700"
                  }`}
                  title="Listen in Voice (आवाज में सुनें)"
                >
                  {playingAudioId === msg.id ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>{t("ऑडियो रोकें (Stop)", "Stop Audio", "Stop")}</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t("🔊 आवाज में सुनें (Listen)", "Listen Audio", "Listen")}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 w-fit animate-in fade-in">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-emerald-300 font-bold">
                  {t("अज्रसखा AI विश्लेषण कर रहा है...", "Ajrasakha AI is analyzing...", "AI analyzing...")}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Sample Image Pills Bar */}
        <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
          <span className="text-slate-400 text-[11px] font-semibold whitespace-nowrap flex items-center gap-1">
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>{t("विज़न डेमो:", "Vision Demo:", "Demo:")}</span>
          </span>

          <button
            onClick={() => handleSampleImage("wheat")}
            className="px-3 py-1 rounded-xl bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-500/40 whitespace-nowrap text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1"
          >
            <span>🌾 गेहूं पीला रतुआ फोटो</span>
          </button>

          <button
            onClick={() => handleSampleImage("tomato")}
            className="px-3 py-1 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-rose-300 border border-rose-500/40 whitespace-nowrap text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1"
          >
            <span>🍅 टमाटर पत्ती मरोड़ फोटो</span>
          </button>
        </div>

        {/* Quick Prompts Carousel */}
        <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {quickPrompts.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSendMessage(p.query)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950/80 border border-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-300 text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer shadow-sm"
            >
              <span>{p.icon}</span>
              <span>{p.title}</span>
            </button>
          ))}
        </div>

        {/* Image Attachment Preview Bar */}
        {attachedImage && (
          <div className="px-4 py-2.5 bg-emerald-950/40 border-t border-emerald-500/30 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <img
                src={attachedImage}
                alt="Attached Preview"
                className="w-12 h-12 object-cover rounded-xl border border-emerald-400/50 shadow-md"
              />
              <div>
                <span className="text-xs font-bold text-white block">
                  {t("📸 तस्वीर संलग्न है (AI विज़न विश्लेषण हेतु तैयार)", "📸 Image attached for Vision AI", "Image ready")}
                </span>
                <span className="text-[10px] text-emerald-300">
                  {t("संदेश भेजें पर क्लिक करें", "Click send to diagnose disease & health", "Click send")}
                </span>
              </div>
            </div>

            <button
              onClick={() => setAttachedImage(null)}
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-red-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ⌨️ Chat Input Bar */}
        <div className="p-3.5 sm:p-4 bg-slate-950 border-t border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Attach Image Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border border-slate-700/80 transition-all shadow-md active:scale-95 cursor-pointer flex-shrink-0"
              title={t("फसल की तस्वीर अपलोड करें", "Upload Crop Image", "Attach Image")}
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Voice Input Mic Button */}
            <button
              type="button"
              onClick={toggleRecording}
              className={`p-3 rounded-2xl border transition-all shadow-md active:scale-95 cursor-pointer flex-shrink-0 ${
                isRecording
                  ? "bg-red-600 text-white border-red-400 animate-pulse ring-4 ring-red-500/30"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border-slate-700/80"
              }`}
              title={t("आवाज में बोलें", "Speak in Voice", "Voice Mic")}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Text Input */}
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={
                attachedImage
                  ? t("तस्वीर के बारे में कुछ बताएं (वैकल्पिक)...", "Ask about this crop photo...", "Ask about photo...")
                  : isRecording
                  ? t("सुन रहा हूँ... बोलिए", "Listening... Please speak", "Listening...")
                  : t("फसल रोग, खाद की मात्रा, योजनाएं या कोई भी प्रश्न पूछें...", "Ask about crop disease, NPK dosage, subsidies...", "Ask anything...")
              }
              className="flex-1 px-4 py-3.5 rounded-2xl bg-slate-900/90 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />

            {/* Send Submit Button */}
            <button
              type="submit"
              disabled={(!inputQuery.trim() && !attachedImage) || isTyping}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold shadow-lg shadow-emerald-950/80 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-40 disabled:hover:scale-100 flex-shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from "react";
import type { IChatMessage, IAgroQuickPrompt } from "./types";
import { KisanAIService } from "./services/kisanAIService";
import { ChatMessageItem } from "./components/ChatMessageItem";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
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
} from "lucide-react";
import { toast } from "react-hot-toast";

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
];

const QUICK_PROMPTS_HINGLISH: IAgroQuickPrompt[] = [
  {
    id: "1",
    icon: "🌾",
    title: "Gehu Peela Ratuwa",
    category: "Pest & Disease",
    query: "Gehu me yellow rust (peela ratuwa) lag gaya hai, kaunsi dawa spray karein?",
    crop: "Wheat",
  },
  {
    id: "2",
    icon: "🌿",
    title: "Kapas Gulabi Sundi",
    category: "Pest & Disease",
    query: "Kapas me pink bollworm (gulabi sundi) ke liye konsi dawa best hai?",
    crop: "Cotton",
  },
  {
    id: "3",
    icon: "🏛️",
    title: "PM-Kisan Kist",
    category: "Government Schemes",
    query: "PM Kisan samman nidhi 18th kist aur e-KYC status kaise check karein?",
    crop: "General",
  },
  {
    id: "4",
    icon: "🍅",
    title: "Tamatar Patti Marod",
    category: "Pest & Disease",
    query: "Tamatar me patti marod (leaf curl) bimari ka pakka ilaj kya hai?",
    crop: "Tomato",
  },
  {
    id: "5",
    icon: "🧪",
    title: "Urea & DAP Matra",
    category: "Nutrient",
    query: "1 acre me gehu aur dhan ke liye DAP aur Urea kitna daalna chahiye?",
    crop: "Wheat",
  },
];

export const KisanAIChatbot: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const [messages, setMessages] = useState<IChatMessage[]>([
    {
      id: "welcome-1",
      sender: "assistant",
      text:
        language === "en"
          ? "🌾 **Hello Farmer Friend! I am your Ajrasakha (अज्रसखा) Kisan AI Assistant.**\n\nI am here 24x7 to answer any of your farming, crop protection, pesticide dosage, mandi bhav, weather, or general questions!\n\nChoose from the prompts below or type/speak your question in English, Hindi, or Hinglish!"
          : language === "hinglish"
          ? "🌾 **Ram-Ram Kisan Bhai! Main aapka Ajrasakha (अज्रसखा) Kisan AI Assistant hoon.**\n\nAap kheti, fasal bimari, keet, khaad-dawa, mandi bhav, ya koi bhi sawal pooch sakte hain.\n\nNeeche diye gaye prompts me se chunein ya bolkar / likhkar sawal poochein!"
          : "🌾 **राम-राम किसान भाई! मैं आपका अज्रसखा किसान AI सहायक हूँ।**\n\nमैं आपकी फसलों में रोग-कीट नियंत्रण, खाद-उर्वरक की सही मात्रा, मौसम अनुसार सिंचाई सलाह और सरकारी योजनाओं की जानकारी देने के लिए यहाँ हूँ।\n\nनीचे दिए गए सुझावों में से चुनें या अपना सवाल बोलकर / लिखकर पूछें!",
      timestamp: new Date(),
      crop: "General",
      domain: language === "en" ? "Agro Guide" : "कृषि मित्र",
      questionId: "66a100000000000000000000",
    },
  ]);

  const [inputQuery, setInputQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Speech Recognition Setup
  useEffect(() => {
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = language === "en" ? "en-IN" : "hi-IN";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputQuery(transcript);
        setIsRecording(false);
        toast.success(`Voice Captured: "${transcript}"`, { icon: "🎙️" });
      };

      recognition.onerror = () => {
        setIsRecording(false);
        toast.error("Could not capture speech. Please try speaking again.");
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, [language]);

  const handleToggleRecord = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition is not supported in this browser.");
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
        toast("Listening... Speak now!", { icon: "🎙️" });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImage(reader.result as string);
        toast.success(t("फसल की फोटो अटैच कर दी गई है! 🌿", "Crop leaf photo attached! 🌿", "Fasal ki photo attach ho gayi hai! 🌿"));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query && !attachedImage) return;

    const userMsgId = `user-${Date.now()}`;
    const newUserMessage: IChatMessage = {
      id: userMsgId,
      sender: "user",
      text: query || (language === "en" ? "Please analyze this crop leaf for symptoms." : "कृपया इस फसल की पत्ती में रोग का निदान करें।"),
      attachedImage: attachedImage || undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInputQuery("");
    setAttachedImage(null);
    setIsTyping(true);

    try {
      const response = await KisanAIService.generateAgroAnswer(newUserMessage.text, language);
      const assistantMsg: IChatMessage = {
        id: `ai-${Date.now()}`,
        sender: "assistant",
        text: response.text,
        crop: response.crop,
        domain: response.domain,
        questionId: response.questionId,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error(err);
      toast.error(t("उत्तर लाने में समस्या हुई।", "Failed to generate answer. Please try again.", "Uttar laane me samasya hui."));
    } finally {
      setIsTyping(false);
    }
  };

  const handleFeedbackGiven = async (messageId: string, rating: 1 | 2, text?: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, feedbackSubmitted: true, feedbackRating: rating }
          : m
      )
    );

    // Call Project 5 feedback loop service
    await KisanAIService.submitMessageFeedback({
      questionId: target.questionId || "66a100000000000000000001",
      queryText: target.text.slice(0, 100),
      deliveredAnswer: target.text,
      crop: target.crop,
      domain: target.domain,
      rating,
      feedbackText: text,
    });
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "assistant",
        text:
          language === "en"
            ? "🌾 **Ajrasakha Kisan AI Assistant is ready.** How may I help you today?"
            : language === "hinglish"
            ? "🌾 **Ajrasakha Kisan AI taiyar hai.** Aaj aapki kheti ya kisi bhi sawal me kya madad kar sakta hoon?"
            : "🌾 **अज्रसखा किसान AI सहायक तैयार है।** आज आपकी खेती में क्या मदद कर सकता हूँ?",
        timestamp: new Date(),
        crop: "General",
        domain: language === "en" ? "Agro Guide" : "कृषि मित्र",
        questionId: "66a100000000000000000000",
      },
    ]);
    toast.success(t("चैट रीसेट कर दी गई है।", "Chat has been reset.", "Chat reset ho gayi hai."));
  };

  const activePrompts =
    language === "en"
      ? QUICK_PROMPTS_EN
      : language === "hinglish"
      ? QUICK_PROMPTS_HINGLISH
      : QUICK_PROMPTS_HI;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-6xl mx-auto p-3 md:p-6">
      {/* Top Chat Header */}
      <div className="flex items-center justify-between p-4 mb-3 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-800 border border-emerald-400/50 flex items-center justify-center text-white shadow-lg shadow-emerald-950/60">
              <Bot className="w-6 h-6 text-emerald-100 animate-pulse" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100 tracking-tight">
                Ajrasakha Kisan AI (अज्रसखा)
              </h2>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                {t("कृषि समर्पित", "Agro AI", "Kisan Sahayak")}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {t(
                "24x7 कृषि विशेषज्ञ • रोग निदान • खाद-बीज • मंडी भाव • PM-Kisan",
                "24x7 Agronomist AI • Disease Control • NPK Fertilizers • Mandi Bhav • PM-Kisan",
                "24x7 Fasal Rog • Dawa Dosage • NPK Khaad • Mandi Bhav • Har Sawal Ka Jawab"
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* In-Chat Language Switcher */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setLanguage("en")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                language === "en" ? "bg-emerald-600 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage("hi")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                language === "hi" ? "bg-emerald-600 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              हिन्दी
            </button>
            <button
              onClick={() => setLanguage("hinglish")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                language === "hinglish" ? "bg-emerald-600 text-slate-950" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Hinglish
            </button>
          </div>

          <button
            onClick={handleClearChat}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 transition-all text-xs flex items-center gap-1.5"
            title="Reset Chat"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Main Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 shadow-inner backdrop-blur-md space-y-2">
        {messages.map((msg) => (
          <ChatMessageItem
            key={msg.id}
            message={msg}
            onFeedbackGiven={handleFeedbackGiven}
          />
        ))}

        {isTyping && (
          <div className="flex items-center gap-2.5 text-xs text-emerald-400/80 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl w-fit animate-pulse">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>
              {t(
                "अज्रसखा कृषि विशेषज्ञ उत्तर तैयार कर रहे हैं...",
                "Ajrasakha AI is generating expert response...",
                "Ajrasakha AI jawab taiyar kar raha hai..."
              )}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Carousel */}
      <div className="py-2.5 overflow-x-auto flex gap-2 no-scrollbar">
        {activePrompts.map((prompt) => (
          <button
            key={prompt.id}
            onClick={() => handleSendMessage(prompt.query)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-emerald-950/80 border border-slate-800 hover:border-emerald-700 text-slate-300 hover:text-emerald-300 text-xs font-medium whitespace-nowrap transition-all shadow-sm active:scale-95 flex-shrink-0"
          >
            <span>{prompt.icon}</span>
            <span>{prompt.title}</span>
          </button>
        ))}
      </div>

      {/* Image Preview if attached */}
      {attachedImage && (
        <div className="relative inline-flex items-center gap-2 p-2 mb-2 bg-slate-900 border border-emerald-700/60 rounded-xl w-fit">
          <img
            src={attachedImage}
            alt="Leaf Preview"
            className="w-12 h-12 object-cover rounded-lg"
          />
          <span className="text-xs text-slate-300">
            {t("फसल की फोटो जोड़ी गई", "Crop photo attached", "Fasal ki photo attach ho gayi")}
          </span>
          <button
            onClick={() => setAttachedImage(null)}
            className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bottom Input Box */}
      <div className="p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl flex items-center gap-2">
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleImageSelect}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title={t("फसल की फोटो अपलोड करें", "Upload crop photo", "Fasal ki photo upload karein")}
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 border border-slate-700 transition-all flex-shrink-0"
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleToggleRecord}
          title={isRecording ? t("रिकॉर्डिंग रोकें", "Stop recording", "Recording rokein") : t("बोलकर पूछें", "Voice Input", "Bolkar poochein")}
          className={`p-2.5 rounded-xl border transition-all flex-shrink-0 ${
            isRecording
              ? "bg-rose-600 text-white border-rose-500 animate-bounce"
              : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 border-slate-700"
          }`}
        >
          {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder={
            isRecording
              ? t("सुन रहा हूँ... बोलिए!", "Listening... speak now!", "Sun raha hoon... boliye!")
              : t("फसल, रोग, खाद या कोई भी सवाल पूछें...", "Ask any crop, pest, fertilizer, or general question...", "Fasal, bimari, dawa, mandi bhav ya kuch bhi poochein...")
          }
          className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />

        <button
          type="button"
          onClick={() => handleSendMessage()}
          disabled={(!inputQuery.trim() && !attachedImage) || isTyping}
          className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-slate-950 font-bold transition-all shadow-md shadow-emerald-950 flex-shrink-0"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
};

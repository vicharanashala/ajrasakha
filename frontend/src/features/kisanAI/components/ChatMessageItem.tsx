import React, { useState } from "react";
import type { IChatMessage } from "../types";
import { KisanAIService } from "../services/kisanAIService";
import {
  Volume2,
  VolumeX,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  Bot,
  User,
  Sprout,
  Share2,
} from "lucide-react";
import { toast } from "react-hot-toast";

interface Props {
  message: IChatMessage;
  onFeedbackGiven?: (messageId: string, rating: 1 | 2, text?: string) => void;
}

export const ChatMessageItem: React.FC<Props> = ({ message, onFeedbackGiven }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNegativeModal, setShowNegativeModal] = useState(false);
  const [feedbackReason, setFeedbackReason] = useState("");
  const isUser = message.sender === "user";

  const handleToggleAudio = () => {
    if (!("speechSynthesis" in window)) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      window.speechSynthesis.cancel();
      const cleanText = message.text.replace(/[*#_`\[\]()]/g, "").substring(0, 400);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "hi-IN";
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      setIsPlaying(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handlePositiveRating = () => {
    if (message.feedbackSubmitted) return;
    if (onFeedbackGiven) {
      onFeedbackGiven(message.id, 1);
    }
    toast.success("धन्यवाद! आपकी प्रतिक्रिया दर्ज कर ली गई है। 👍", {
      icon: "🌾",
      style: { borderRadius: "12px", background: "#0f172a", color: "#10b981", border: "1px solid #10b981" },
    });
  };

  const handleNegativeSubmit = (reasonText?: string) => {
    const finalReason = reasonText || feedbackReason || "उत्तर संतोषजनक नहीं था";
    if (onFeedbackGiven) {
      onFeedbackGiven(message.id, 2, finalReason);
    }
    setShowNegativeModal(false);
    toast("फीडबैक एक्सपर्ट रिव्यूअर डेस्क को भेज दिया गया है। 👨‍🌾", {
      icon: "📋",
      style: { borderRadius: "12px", background: "#0f172a", color: "#f43f5e", border: "1px solid #f43f5e" },
    });
  };

  const handleShareWhatsApp = () => {
    const shareText = `🌾 *Ajrasakha Kisan AI Advisory*\n\n${message.text}\n\n👉 Ajrasakha - Your Farming Companion`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank");
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-start gap-2.5 max-w-[85%] md:max-w-[70%] flex-row-reverse">
          <div className="w-8 h-8 rounded-full bg-emerald-600/80 border border-emerald-400/40 flex items-center justify-center flex-shrink-0 text-white shadow-md shadow-emerald-950">
            <User className="w-4 h-4" />
          </div>
          <div className="bg-emerald-900/60 border border-emerald-700/50 rounded-2xl rounded-tr-none px-4 py-3 text-sm text-emerald-50 shadow-lg backdrop-blur-md">
            {message.attachedImage && (
              <img
                src={message.attachedImage}
                alt="Crop attachment"
                className="w-48 h-32 object-cover rounded-xl mb-2 border border-emerald-500/30"
              />
            )}
            <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
            <span className="text-[10px] text-emerald-300/60 mt-1 block text-right">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-3 max-w-[90%] md:max-w-[80%]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 border border-emerald-400/50 flex items-center justify-center flex-shrink-0 text-white shadow-lg shadow-emerald-950/60 mt-0.5">
          <Bot className="w-5 h-5 text-emerald-100" />
        </div>

        <div className="flex flex-col gap-2 flex-1">
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl rounded-tl-none p-4.5 text-sm text-slate-100 shadow-xl backdrop-blur-xl relative group">
            {/* Header Badge */}
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                  <Sprout className="w-3 h-3 text-emerald-400" />
                  {message.crop || "कृषि"} • {message.domain || "सलाह"}
                </span>
                <span className="text-[10px] text-slate-500">
                  Ajrasakha Golden AI
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleToggleAudio}
                  title={isPlaying ? "Stop audio" : "Listen in Hindi"}
                  className={`p-1.5 rounded-lg border transition-all ${
                    isPlaying
                      ? "bg-emerald-500 text-slate-950 border-emerald-400 animate-pulse"
                      : "bg-slate-800/80 text-slate-300 hover:text-emerald-400 border-slate-700 hover:border-emerald-500/40"
                  }`}
                >
                  {isPlaying ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleShareWhatsApp}
                  title="Share to WhatsApp"
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-emerald-950 text-slate-300 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/40 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Answer Content */}
            <div className="prose prose-invert prose-sm max-w-none text-slate-200 leading-relaxed space-y-2">
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>

            {/* Project 5: Direct Farmer Answer Feedback Loop */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
              <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
                क्या यह उत्तर मददगार था?
              </span>

              {message.feedbackSubmitted ? (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {message.feedbackRating === 1 ? "Helpful (मददगार)" : "Not Helpful (रिव्यू भेजा गया)"}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePositiveRating}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-700/60 hover:border-emerald-500 transition-all shadow-sm active:scale-95"
                  >
                    <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                    हाँ / Helpful
                  </button>
                  <button
                    onClick={() => setShowNegativeModal(true)}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900/80 text-rose-300 border border-rose-800/50 hover:border-rose-600 transition-all shadow-sm active:scale-95"
                  >
                    <ThumbsDown className="w-3.5 h-3.5 text-rose-400" />
                    नहीं / Not Helpful
                  </button>
                </div>
              )}
            </div>

            {/* Negative Feedback Sub-Modal */}
            {showNegativeModal && (
              <div className="mt-3 p-3 rounded-xl bg-slate-950/90 border border-rose-900/60 animate-in fade-in duration-200">
                <p className="text-[11px] font-medium text-rose-300 mb-2">
                  कृपया कारण बताएं ताकि हमारे कृषि वैज्ञानिक इसे सुधार सकें:
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {[
                    "दवा की सही मात्रा नहीं है",
                    "कीट/रोग की गलत पहचान",
                    "स्थानीय मौसम अनुकूल नहीं",
                    "स्प्रे का समय स्पष्ट नहीं",
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleNegativeSubmit(chip)}
                      className="text-[10px] bg-slate-900 hover:bg-rose-950 border border-slate-700 hover:border-rose-700 text-slate-300 px-2 py-1 rounded-md transition-all text-left"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="अन्य कारण लिखें..."
                    value={feedbackReason}
                    onChange={(e) => setFeedbackReason(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-rose-600"
                  />
                  <button
                    onClick={() => handleNegativeSubmit()}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}
          </div>

          <span className="text-[10px] text-slate-500 pl-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from "react";
import type { IKrishiVideo } from "../types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  X,
  Youtube,
  CheckCircle2,
  Bookmark,
  BookmarkCheck,
  ThumbsUp,
  Share2,
  ExternalLink,
  Sparkles,
  Play,
  AlertCircle,
} from "lucide-react";
import { toast } from "@/shared/components/toast";

interface Props {
  video: IKrishiVideo | null;
  isOpen: boolean;
  onClose: () => void;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  isLiked: boolean;
  onLike: (id: string) => void;
}

export const VideoPlayerModal: React.FC<Props> = ({
  video,
  isOpen,
  onClose,
  isBookmarked,
  onToggleBookmark,
  isLiked,
  onLike,
}) => {
  const { language, t } = useLanguage();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  if (!isOpen || !video) return null;

  const title = language === "en" ? video.title : video.titleHi;
  const categoryLabel = language === "en" ? video.categoryLabelEn : video.categoryLabelHi;
  const keyTakeaways = language === "en" ? video.keyTakeaways : video.keyTakeawaysHi;
  const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(
    typeof window !== "undefined" ? window.location.origin : ""
  )}`;

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(youtubeUrl);
      toast.success(t("यूट्यूब वीडियो लिंक कॉपी हो गया!", "YouTube Video Link Copied!", "Link copied!"));
    }
  };

  const handleOpenYouTube = () => {
    window.open(youtubeUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-lg overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
              {categoryLabel}
            </span>
            <span className="text-xs text-slate-400 font-medium truncate">
              {video.channelName}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Direct Open in YouTube */}
            <button
              onClick={handleOpenYouTube}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-xs font-bold shadow transition-all cursor-pointer"
            >
              <Youtube className="w-3.5 h-3.5 fill-white" />
              <span className="hidden sm:inline">{t("YouTube पर खोलें", "Open in YouTube", "YouTube")}</span>
              <ExternalLink className="w-3 h-3" />
            </button>

            <button
              onClick={handleShare}
              title={t("शेयर करें", "Share Video", "Share")}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => onToggleBookmark(video.id)}
              title={isBookmarked ? "Remove Bookmark" : "Save Bookmark"}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {isBookmarked ? (
                <BookmarkCheck className="w-4 h-4 text-emerald-400 fill-emerald-400/30" />
              ) : (
                <Bookmark className="w-4 h-4 text-slate-400 hover:text-emerald-400" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-600/80 text-slate-300 hover:text-white transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Player Box with YouTube No-Cookie Embed */}
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setIframeLoaded(true)}
            className="w-full h-full border-0"
          />

          {/* Quick Fallback Overlay bar at bottom of player */}
          <div className="absolute bottom-2 right-2 z-10">
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black/75 hover:bg-red-600/90 text-white text-[11px] font-semibold backdrop-blur-md border border-white/20 transition-all shadow-md"
            >
              <span>{t("YouTube ऐप पर देखें", "Watch on YouTube App", "YouTube")}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Video Content & Key Points */}
        <div className="p-4 sm:p-6 overflow-y-auto flex flex-col gap-4 bg-slate-900">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-snug">
                {title}
              </h2>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Youtube className="w-3.5 h-3.5 text-rose-500" />
                  {video.channelName}
                </span>
                <span>•</span>
                <span>{video.views} views</span>
                <span>•</span>
                <span>{video.duration}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onLike(video.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isLiked
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                }`}
              >
                <ThumbsUp className={`w-3.5 h-3.5 ${isLiked ? "fill-rose-400 text-rose-400" : ""}`} />
                <span>{(video.likes + (isLiked ? 1 : 0)).toLocaleString("en-IN")}</span>
              </button>

              <button
                onClick={handleOpenYouTube}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-colors"
              >
                <span>{t("YouTube पर देखें", "Watch on YouTube", "Watch")}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Actionable Key Takeaways Checklist */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 mb-2.5 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              {t("वीडियो से मुख्य कृषि परामर्श एवं निष्कर्ष", "Key Agronomic Takeaways & Field Advice", "Key Takeaways")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {keyTakeaways.map((tip, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-200"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

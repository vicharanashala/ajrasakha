import React from "react";
import type { IKrishiVideo } from "../types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  Play,
  Clock,
  Eye,
  CheckCircle2,
  Bookmark,
  BookmarkCheck,
  ThumbsUp,
  Sparkles,
  Youtube,
  Tv,
} from "lucide-react";

interface Props {
  video: IKrishiVideo;
  onPlay: (v: IKrishiVideo) => void;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  onLike: (id: string) => void;
  isLiked: boolean;
}

export const VideoCard: React.FC<Props> = ({
  video,
  onPlay,
  isBookmarked,
  onToggleBookmark,
  onLike,
  isLiked,
}) => {
  const { language, t } = useLanguage();
  const title = language === "en" ? video.title : video.titleHi;
  const categoryLabel = language === "en" ? video.categoryLabelEn : video.categoryLabelHi;
  const keyTakeaways = language === "en" ? video.keyTakeaways : video.keyTakeawaysHi;

  return (
    <div className="group relative rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-800/80 border border-slate-800/90 hover:border-emerald-500/60 shadow-xl backdrop-blur-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-950/40 flex flex-col justify-between">
      {/* Thumbnail Area */}
      <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
        <img
          src={video.thumbnailUrl}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-90 group-hover:opacity-100"
          loading="lazy"
        />
        {/* Dark Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

        {/* Duration Badge */}
        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700/80 text-[10px] font-mono font-bold text-white flex items-center gap-1 shadow-md">
          <Clock className="w-3 h-3 text-emerald-400" />
          <span>{video.duration}</span>
        </div>

        {/* Language Badge */}
        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-950/80 border border-slate-700/80 text-[10px] font-bold text-emerald-300 shadow-md">
          {video.languageLabel}
        </div>

        {/* Central Play Button Overlay on Hover */}
        <button
          onClick={() => onPlay(video)}
          className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.7)] group-hover:scale-110 transition-all duration-300 active:scale-95 cursor-pointer z-10"
          title="Play Video"
        >
          <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
        </button>

        {/* Top Right Bookmark Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(video.id);
          }}
          title={isBookmarked ? "Remove Bookmark" : "Save to Bookmarks"}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-slate-950/80 hover:bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white transition-colors z-20 cursor-pointer"
        >
          {isBookmarked ? (
            <BookmarkCheck className="w-4 h-4 text-emerald-400 fill-emerald-400/30" />
          ) : (
            <Bookmark className="w-4 h-4 text-slate-400 hover:text-emerald-400" />
          )}
        </button>
      </div>

      {/* Body Details */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          {/* Channel Info & Category */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 gap-2 mb-1.5">
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <Youtube className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
              <span className="truncate">{video.channelName}</span>
            </span>
            <span className="text-[10px] text-slate-400 flex items-center gap-1 flex-shrink-0">
              <Eye className="w-3 h-3 text-blue-400" />
              {video.views}
            </span>
          </div>

          {/* Title */}
          <h3
            onClick={() => onPlay(video)}
            className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-2 leading-snug cursor-pointer"
          >
            {title}
          </h3>

          {/* Quick Key Takeaway Snippet */}
          {keyTakeaways.length > 0 && (
            <div className="mt-2.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="line-clamp-2 leading-tight">
                <strong className="text-slate-200">{t("मुख्य बिंदु:", "Key Takeaway:", "Mukhya Bindu:")} </strong>
                {keyTakeaways[0]}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions: Like & Watch CTA */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={() => onLike(video.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              isLiked
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                : "bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60"
            }`}
          >
            <ThumbsUp className={`w-3 h-3 ${isLiked ? "fill-rose-400 text-rose-400" : ""}`} />
            <span>{(video.likes + (isLiked ? 1 : 0)).toLocaleString("en-IN")}</span>
          </button>

          <button
            onClick={() => onPlay(video)}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
            <span>{t("वीडियो देखें", "Watch Video", "Watch Video")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from "react";
import { KRISHI_VIDEOS_DATA } from "./data/videoData";
import type { IKrishiVideo, IVideoFilterState } from "./types";
import { VideoCard } from "./components/VideoCard";
import { VideoFilters } from "./components/VideoFilters";
import { VideoPlayerModal } from "./components/VideoPlayerModal";
import { AddVideoModal } from "./components/AddVideoModal";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  Youtube,
  Sparkles,
  Play,
  BookmarkCheck,
  Tv,
  GraduationCap,
  TrendingUp,
} from "lucide-react";

const USER_VIDEOS_STORAGE_KEY = "ajrasakha_user_videos_v1";
const BOOKMARKS_STORAGE_KEY = "ajrasakha_video_bookmarks_v1";
const LIKES_STORAGE_KEY = "ajrasakha_video_likes_v1";

export const KrishiVideosHub: React.FC = () => {
  const { language, t } = useLanguage();

  // Load custom videos from localStorage
  const [userVideos, setUserVideos] = useState<IKrishiVideo[]>(() => {
    try {
      const saved = localStorage.getItem(USER_VIDEOS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set<string>();
  });

  // Likes
  const [likes, setLikes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(LIKES_STORAGE_KEY);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set<string>();
  });

  const [filters, setFilters] = useState<IVideoFilterState>({
    category: "all",
    language: "all",
    search: "",
    sortBy: "popular",
    onlyBookmarked: false,
  });

  const [selectedVideoForPlayer, setSelectedVideoForPlayer] = useState<IKrishiVideo | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Combine default dataset + user submitted videos
  const allVideos = useMemo(() => {
    return [...userVideos, ...KRISHI_VIDEOS_DATA];
  }, [userVideos]);

  const handleAddVideo = (newVid: IKrishiVideo) => {
    const updated = [newVid, ...userVideos];
    setUserVideos(updated);
    try {
      localStorage.setItem(USER_VIDEOS_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  };

  const handleToggleBookmark = (id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const handleLike = (id: string) => {
    setLikes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const handleFilterChange = (updates: Partial<IVideoFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const handleResetFilters = () => {
    setFilters({
      category: "all",
      language: "all",
      search: "",
      sortBy: "popular",
      onlyBookmarked: false,
    });
  };

  // Filter and sort videos
  const filteredVideos = useMemo(() => {
    let list = [...allVideos];
    const norm = (s?: string) => (s || "").toLowerCase().trim();

    if (filters.category !== "all") {
      list = list.filter((v) => v.category === filters.category);
    }

    if (filters.language !== "all") {
      list = list.filter((v) => v.language === filters.language);
    }

    if (filters.onlyBookmarked) {
      list = list.filter((v) => bookmarks.has(v.id));
    }

    if (filters.search) {
      const q = norm(filters.search);
      list = list.filter(
        (v) =>
          norm(v.title).includes(q) ||
          norm(v.titleHi).includes(q) ||
          norm(v.channelName).includes(q) ||
          v.keyTakeaways.some((t) => norm(t).includes(q)) ||
          v.keyTakeawaysHi.some((t) => norm(t).includes(q)) ||
          v.suitableCrops.some((c) => norm(c).includes(q))
      );
    }

    if (filters.sortBy === "popular") {
      list.sort((a, b) => b.likes - a.likes);
    } else if (filters.sortBy === "newest") {
      list.sort((a, b) => (b.id.startsWith("user") ? 1 : -1));
    }

    return list;
  }, [allVideos, filters, bookmarks]);

  const featuredVideo = allVideos[0];

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
      {/* Hero Banner with Featured Video Sneak Peek */}
      <div className="rounded-3xl bg-gradient-to-r from-rose-950/40 via-slate-900/90 to-emerald-950/50 border border-slate-800 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-rose-500 via-red-600 to-amber-500 text-white shadow-lg shadow-rose-950/80">
            <Youtube className="w-8 h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {t(
                  "कृषि वीडियो अकादमी एवं ज्ञान केंद्र",
                  "YouTube Krishi Video Academy & Knowledge Hub",
                  "Krishi YouTube Academy"
                )}
              </h1>
              <span className="px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                HD Krishi Tutorials
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              {t(
                "विशेषज्ञों द्वारा प्रमाणित आधुनिक खेती के वीडियो ट्यूटोरियल: ड्रोन छिड़काव, अधिक पैदावार के नियम, प्राकृतिक खाद, और सरकारी योजनाएं",
                "Expert-verified farming tutorials: Agri Drones, high-yield crop management, organic vermicompost, and govt subsidies",
                "Verified video tutorials on drones, crop management & organic farming"
              )}
            </p>
          </div>
        </div>

        {/* Featured Video Quick Play CTA */}
        {featuredVideo && (
          <button
            onClick={() => setSelectedVideoForPlayer(featuredVideo)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white text-xs sm:text-sm font-bold shadow-lg shadow-rose-950/80 transition-all duration-300 hover:scale-105 active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{t("फीचर्ड वीडियो देखें", "Watch Featured Tutorial", "Watch Featured")}</span>
          </button>
        )}
      </div>

      {/* Filter and Category Controls */}
      <VideoFilters
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        totalCount={filteredVideos.length}
        bookmarkedCount={bookmarks.size}
      />

      {/* Video Cards Grid */}
      {filteredVideos.length === 0 ? (
        <div className="p-12 rounded-3xl bg-slate-900/60 border border-slate-800 text-center flex flex-col items-center justify-center gap-3">
          <Youtube className="w-12 h-12 text-slate-600" />
          <h3 className="text-base font-bold text-slate-300">
            {t("कोई वीडियो नहीं मिला", "No Videos Found", "No videos found")}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm">
            {t(
              "कृपया अपने खोज शब्द बदलें या अपना पसंदीदा यूट्यूब वीडियो जोड़ें।",
              "Try adjusting your filters or add a new YouTube farming video link.",
              "Try clearing filters."
            )}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
            >
              {t("फ़िल्टर रीसेट करें", "Reset Filters", "Reset")}
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition-colors"
            >
              {t("नया वीडियो जोड़ें", "Add New Video", "Add Video")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onPlay={(v) => setSelectedVideoForPlayer(v)}
              isBookmarked={bookmarks.has(video.id)}
              onToggleBookmark={handleToggleBookmark}
              isLiked={likes.has(video.id)}
              onLike={handleLike}
            />
          ))}
        </div>
      )}

      {/* Video Player Modal */}
      <VideoPlayerModal
        video={selectedVideoForPlayer}
        isOpen={Boolean(selectedVideoForPlayer)}
        onClose={() => setSelectedVideoForPlayer(null)}
        isBookmarked={selectedVideoForPlayer ? bookmarks.has(selectedVideoForPlayer.id) : false}
        onToggleBookmark={handleToggleBookmark}
        isLiked={selectedVideoForPlayer ? likes.has(selectedVideoForPlayer.id) : false}
        onLike={handleLike}
      />

      {/* Add Custom Video Modal */}
      <AddVideoModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddVideo={handleAddVideo}
      />
    </div>
  );
};

export default KrishiVideosHub;

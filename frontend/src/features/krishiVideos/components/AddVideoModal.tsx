import React, { useState } from "react";
import type { IKrishiVideo, VideoCategory } from "../types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  X,
  PlusCircle,
  Youtube,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { toast } from "@/shared/components/toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddVideo: (video: IKrishiVideo) => void;
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : (url.length === 11 ? url : null);
}

export const AddVideoModal: React.FC<Props> = ({ isOpen, onClose, onAddVideo }) => {
  const { language, t } = useLanguage();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [channelName, setChannelName] = useState("");
  const [category, setCategory] = useState<VideoCategory>("crop-guides");
  const [keyTakeaway, setKeyTakeaway] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ytId = extractYouTubeId(url.trim());
    if (!ytId) {
      toast.error(t("कृपया एक वैध यूट्यूब वीडियो लिंक दर्ज करें", "Please enter a valid YouTube Video Link", "Enter valid YouTube URL"));
      return;
    }
    if (!title.trim()) {
      toast.error(t("कृपया वीडियो का शीर्षक दर्ज करें", "Please enter a Video Title", "Enter title"));
      return;
    }

    const newVideo: IKrishiVideo = {
      id: `user-vid-${Date.now()}`,
      youtubeId: ytId,
      title: title.trim(),
      titleHi: title.trim(),
      channelName: channelName.trim() || "Kisan Community (किसान समुदाय)",
      category,
      categoryLabelEn: category.replace("-", " ").toUpperCase(),
      categoryLabelHi: "समुदाय वीडियो",
      duration: "10:00",
      views: "100+",
      language: "hi",
      languageLabel: "हिन्दी (Hindi)",
      thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      keyTakeaways: [keyTakeaway.trim() || "Farmer recommended agricultural guidance video."],
      keyTakeawaysHi: [keyTakeaway.trim() || "किसान द्वारा साझा किया गया उपयोगी कृषि वीडियो।"],
      suitableCrops: ["All Crops"],
      isVerified: false,
      likes: 1,
    };

    onAddVideo(newVideo);
    toast.success(t("वीडियो सफलतापूर्वक लाइब्रेरी में जोड़ा गया!", "Video added to library successfully!", "Video added!"));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 sm:p-8 text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
            <Youtube className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white">
            {t("नया कृषि वीडियो जोड़ें", "Add YouTube Krishi Video", "Add Video")}
          </h3>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          {t(
            "यूट्यूब का कोई भी उपयोगी कृषि वीडियो लिंक पेस्ट करें और अपनी लाइब्रेरी में सहेजें",
            "Paste any helpful farming YouTube URL to add to your academy library",
            "Add YouTube farming URL"
          )}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t("यूट्यूब वीडियो लिंक या Video ID *", "YouTube URL or Video ID *", "YouTube Link")}
            </label>
            <input
              type="text"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t("वीडियो शीर्षक *", "Video Title *", "Video Title")}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("जैसे: गेहूं में खरपतवार नियंत्रण का सही समय", "E.g.: Wheat Weed Control Timing", "Video Title")}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t("चैनल का नाम", "Channel Name", "Channel")}
              </label>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Channel name..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t("श्रेणी (Category)", "Category", "Category")}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as VideoCategory)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="crop-guides">Crop Production</option>
                <option value="machinery-drones">Machinery & Drones</option>
                <option value="pest-disease">Pest & Disease</option>
                <option value="organic-farming">Organic Farming</option>
                <option value="govt-schemes">Govt Schemes</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t("मुख्य सलाह / निष्कर्ष", "Key Advice / Takeaway", "Key Advice")}
            </label>
            <textarea
              rows={2}
              value={keyTakeaway}
              onChange={(e) => setKeyTakeaway(e.target.value)}
              placeholder={t("इस वीडियो से मुख्य सीख...", "Key learning from this video...", "Key learning...")}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
            >
              {t("रद्द करें", "Cancel", "Cancel")}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950 transition-all duration-200 active:scale-95 cursor-pointer"
            >
              {t("लाइब्रेरी में जोड़ें", "Add to Academy", "Add Video")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

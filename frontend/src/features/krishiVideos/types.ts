export type VideoCategory =
  | "all"
  | "crop-guides"
  | "machinery-drones"
  | "organic-farming"
  | "pest-disease"
  | "govt-schemes";

export interface IKrishiVideo {
  id: string;
  youtubeId: string;
  title: string;
  titleHi: string;
  channelName: string;
  category: VideoCategory;
  categoryLabelEn: string;
  categoryLabelHi: string;
  duration: string;
  views: string;
  language: "hi" | "pa" | "mr" | "te" | "en";
  languageLabel: string;
  thumbnailUrl: string;
  keyTakeaways: string[];
  keyTakeawaysHi: string[];
  suitableCrops: string[];
  isVerified: boolean;
  likes: number;
}

export interface IVideoFilterState {
  category: VideoCategory;
  language: string;
  search: string;
  sortBy: "popular" | "newest";
  onlyBookmarked: boolean;
}

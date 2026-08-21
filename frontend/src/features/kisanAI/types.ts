export interface IChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  crop?: string;
  domain?: string;
  language?: string;
  attachedImage?: string;
  questionId?: string; // Links to Golden DB or generated question ID
  feedbackSubmitted?: boolean;
  feedbackRating?: 1 | 2; // 1 = Helpful, 2 = Not Helpful
  isAudioPlaying?: boolean;
}

export interface IAgroQuickPrompt {
  id: string;
  icon: string;
  title: string;
  category: string;
  query: string;
  crop: string;
}

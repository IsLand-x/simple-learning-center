export interface VideoCaptionCue {
  startSeconds: number;
  durationSeconds: number;
  text: string;
}

export interface VideoResource {
  id: string;
  youtubeVideoId: string;
  url: string;
  title: string;
  channelId?: string;
  channelTitle: string;
  description?: string;
  durationSeconds: number;
  captions: {
    originalLanguage: string;
    originalLanguageLabel: string;
    original: VideoCaptionCue[];
    chinese: VideoCaptionCue[];
    error?: string;
  };
  lastPositionSeconds?: number;
  createdAt: number;
  updatedAt: number;
}

export interface VideoTimestampNote {
  id: string;
  videoId: string;
  timeSeconds: number;
  content: string;
  quoteOriginal?: string;
  quoteChinese?: string;
  createdAt: number;
  updatedAt: number;
}

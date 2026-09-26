import { useState, useEffect, useRef, useCallback } from 'react';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { VideoResource } from '../../../../../contracts/videos';
import type { YouTubePlayerHandle } from '../components/Playback/YouTubePlayer';
import type { TranscriptMode } from '../components/Transcript/videoTranscript';
export function useVideoPlayback(selectedVideo: VideoResource | undefined) {
  const [transcriptMode, setTranscriptMode] = useState<TranscriptMode>('bilingual');
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  useEffect(() => {
    setCurrentTime(selectedVideo?.lastPositionSeconds ?? 0);
    currentTimeRef.current = selectedVideo?.lastPositionSeconds ?? 0;
    if (!selectedVideo) setTranscriptMode('original');
    else if (/^zh(?:-|$)/i.test(selectedVideo.captions.originalLanguage))
      setTranscriptMode('original');
    else if (selectedVideo.captions.original.length && selectedVideo.captions.chinese.length)
      setTranscriptMode('bilingual');
    else if (selectedVideo.captions.original.length) setTranscriptMode('original');
    else setTranscriptMode('chinese');
    // Selection-derived state resets only when the selected video identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideo?.id]);

  useEffect(() => {
    if (!selectedVideo) return undefined;
    const videoId = selectedVideo.id;
    return () => {
      const seconds = currentTimeRef.current;
      if (seconds > 0)
        useLearningStore.getState().updateVideoResource(videoId, { lastPositionSeconds: seconds });
    };
    // Persist the position captured for the video that owned this effect instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideo?.id]);

  const handleTimeUpdate = useCallback((seconds: number) => {
    currentTimeRef.current = seconds;
    setCurrentTime(seconds);
  }, []);

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds);
    currentTimeRef.current = seconds;
    setCurrentTime(seconds);
  }, []);

  return { transcriptMode, setTranscriptMode, currentTime, playerRef, handleTimeUpdate, seekTo };
}

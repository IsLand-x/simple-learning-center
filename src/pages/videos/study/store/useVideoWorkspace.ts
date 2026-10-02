import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { VideoResource } from '../../../../../contracts/videos';
import { useMediaQuery } from '../../../../util/browser/useMediaQuery';
import { confirmDialog } from '../../../../util/confirmDialog';
import { useVideoPlayback } from './useVideoPlayback';

import { type VideoPanel } from '../components/Transcript/videoTranscript';

export function useVideoWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mobileLayout = useMediaQuery('(max-width: 800px)');
  const compactLayout = useMediaQuery('(max-width: 1100px)');
  const videos = useLearningStore((state) => state.videoResources);
  const videoPanelWidth = useLearningStore((state) => state.videoPanelWidth);
  const deleteVideoResource = useLearningStore((state) => state.deleteVideoResource);
  const setVideoPanelWidth = useLearningStore((state) => state.setVideoPanelWidth);
  const [activePanel, setActivePanel] = useState<VideoPanel | null>('transcript');
  const [addVisible, setAddVisible] = useState(false);
  const requestedVideoId = searchParams.get('video') ?? '';
  const selectedVideo = videos.find((video) => video.id === requestedVideoId);

  useEffect(() => {
    if (mobileLayout || selectedVideo || !videos.length || requestedVideoId) return;
    setSearchParams({ video: videos[0].id }, { replace: true });
  }, [mobileLayout, requestedVideoId, selectedVideo, setSearchParams, videos]);

  const selectVideo = (video: VideoResource) => {
    setSearchParams({ video: video.id });
    setActivePanel('transcript');
  };

  const removeSelectedVideo = () => {
    if (!selectedVideo) return;
    confirmDialog({
      title: '删除视频资料？',
      content: `“${selectedVideo.title}”的字幕、时间点笔记、学习笔记和 AI 对话会一并删除。`,
      okText: '删除',
      okType: 'danger',
      onOk: () => {
        const nextVideo = videos.find((video) => video.id !== selectedVideo.id);
        deleteVideoResource(selectedVideo.id);
        setSearchParams(nextVideo ? { video: nextVideo.id } : {}, { replace: true });
      },
    });
  };
  const playback = useVideoPlayback(selectedVideo);
  return {
    ...playback,
    videos,
    selectedVideo,
    setAddVisible,
    selectVideo,
    removeSelectedVideo,
    activePanel,
    mobileLayout,
    setSearchParams,
    setActivePanel,
    compactLayout,
    setVideoPanelWidth,
    videoPanelWidth,
    addVisible,
  };
}

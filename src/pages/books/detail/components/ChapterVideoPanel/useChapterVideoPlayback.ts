import { useEffect, useRef, useState } from 'react';
import type { ChapterVideo } from '../../../../../../contracts/reading';

export function useChapterVideoPlayback(video: ChapterVideo | undefined, autoplayId?: string) {
  const player = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState('');
  const videoId = video?.id;
  const current =
    video?.scenes.reduce(
      (selected, scene, index) => (time + 0.05 >= scene.startSeconds ? index : selected),
      0,
    ) ?? 0;
  const play = () => {
    setError('');
    void player.current?.play().catch(() => setError('请点击播放器的播放按钮继续观看'));
  };
  useEffect(() => {
    let disposed = false;
    setTime(0);
    setError('');
    if (videoId && autoplayId === videoId)
      void player.current?.play().catch(() => {
        if (!disposed) setError('已切换分 P，请点击播放继续观看');
      });
    return () => {
      disposed = true;
    };
  }, [videoId, autoplayId]);
  useEffect(() => {
    if (player.current) player.current.playbackRate = rate;
  }, [videoId, rate]);
  const seek = (seconds: number) => {
    if (!player.current) return;
    player.current.currentTime = seconds;
    setTime(seconds);
    play();
  };
  const fullscreen = () => {
    const element = player.current as
      (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!element) return;
    setError('');
    if (element.requestFullscreen)
      void element
        .requestFullscreen()
        .catch(() => setError('暂时无法全屏，请使用播放器内的全屏按钮'));
    else if (element.webkitEnterFullscreen) element.webkitEnterFullscreen();
    else setError('当前浏览器不支持全屏，请直接在播放器中观看');
    void element.play().catch(() => undefined);
  };
  return { player, current, rate, setRate, error, setError, setTime, play, seek, fullscreen };
}

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Spin, Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;

interface YouTubePlayerInstance {
  destroy: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
}

interface YouTubePlayerConstructor {
  new (element: HTMLElement, options: {
    videoId: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady: (event: { target: YouTubePlayerInstance }) => void;
      onStateChange: () => void;
      onError: () => void;
    };
  }): YouTubePlayerInstance;
}

declare global {
  interface Window {
    YT?: { Player: YouTubePlayerConstructor };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let iframeApiPromise: Promise<void> | undefined;

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (iframeApiPromise) return iframeApiPromise;
  iframeApiPromise = new Promise<void>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (existing) {
      existing.addEventListener('error', () => reject(new Error('YouTube 播放器加载失败')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.addEventListener('error', () => reject(new Error('YouTube 播放器加载失败')), { once: true });
    document.head.append(script);
  }).catch((error) => {
    iframeApiPromise = undefined;
    throw error;
  });
  return iframeApiPromise;
}

export interface YouTubePlayerHandle {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, {
  videoId: string;
  initialTime?: number;
  onTimeUpdate?: (seconds: number) => void;
}>(({ videoId, initialTime = 0, onTimeUpdate }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useImperativeHandle(ref, () => ({
    seekTo(seconds) {
      playerRef.current?.seekTo(Math.max(0, seconds), true);
      onTimeUpdate?.(Math.max(0, seconds));
    },
    getCurrentTime() {
      return playerRef.current?.getCurrentTime() ?? 0;
    },
  }), [onTimeUpdate]);

  useEffect(() => {
    let disposed = false;
    let interval = 0;
    setStatus('loading');
    const setup = async () => {
      try {
        await loadYouTubeIframeApi();
        if (disposed || !hostRef.current || !window.YT?.Player) return;
        playerRef.current?.destroy();
        playerRef.current = new window.YT.Player(hostRef.current, {
          videoId,
          playerVars: {
            enablejsapi: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }) => {
              if (disposed) return;
              setStatus('ready');
              if (initialTime > 0) target.seekTo(initialTime, true);
              onTimeUpdate?.(target.getCurrentTime());
              interval = window.setInterval(() => {
                const currentTime = playerRef.current?.getCurrentTime();
                if (Number.isFinite(currentTime)) onTimeUpdate?.(currentTime ?? 0);
              }, 500);
            },
            onStateChange: () => {
              const currentTime = playerRef.current?.getCurrentTime();
              if (Number.isFinite(currentTime)) onTimeUpdate?.(currentTime ?? 0);
            },
            onError: () => setStatus('error'),
          },
        });
      } catch {
        if (!disposed) setStatus('error');
      }
    };
    void setup();
    return () => {
      disposed = true;
      window.clearInterval(interval);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [initialTime, onTimeUpdate, videoId]);

  return (
    <div className="youtube-player" aria-label="YouTube 视频播放器">
      <div ref={hostRef} className="youtube-player__host" />
      {status !== 'ready' && (
        <div className="youtube-player__status" role={status === 'error' ? 'alert' : 'status'}>
          {status === 'loading' ? <><Spin /><Text type="tertiary">正在加载播放器…</Text></> : <Text type="danger">播放器加载失败，请检查网络后重试</Text>}
        </div>
      )}
    </div>
  );
});

YouTubePlayer.displayName = 'YouTubePlayer';

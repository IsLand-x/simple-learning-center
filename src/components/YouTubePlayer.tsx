import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Spin, Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;
const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

interface YouTubePlayerMessage {
  event?: string;
  info?: {
    currentTime?: number;
  };
}

function parsePlayerMessage(data: unknown): YouTubePlayerMessage | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as YouTubePlayerMessage;
    } catch {
      return null;
    }
  }
  return data && typeof data === 'object' ? data as YouTubePlayerMessage : null;
}

function isYouTubeMessageOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (
      url.hostname === 'youtube.com'
      || url.hostname.endsWith('.youtube.com')
      || url.hostname === 'youtube-nocookie.com'
      || url.hostname.endsWith('.youtube-nocookie.com')
    );
  } catch {
    return false;
  }
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
  const reactId = useId();
  const playerId = useMemo(() => `learning-center-youtube-${reactId.replace(/[^a-z0-9_-]/gi, '')}`, [reactId]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimeoutRef = useRef(0);
  const currentTimeRef = useRef(Math.max(0, initialTime));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const embedUrl = useMemo(() => {
    const params = new URLSearchParams({
      enablejsapi: '1',
      origin: window.location.origin,
      playsinline: '1',
      rel: '0',
    });
    if (initialTime > 0) params.set('start', String(Math.floor(initialTime)));
    return `${YOUTUBE_EMBED_ORIGIN}/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
  }, [initialTime, videoId]);

  const postCommand = (func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func,
      args,
      id: playerId,
    }), YOUTUBE_EMBED_ORIGIN);
  };

  useImperativeHandle(ref, () => ({
    seekTo(seconds) {
      const nextSeconds = Math.max(0, seconds);
      currentTimeRef.current = nextSeconds;
      postCommand('seekTo', [nextSeconds, true]);
      onTimeUpdate?.(nextSeconds);
    },
    getCurrentTime() {
      return currentTimeRef.current;
    },
  }));

  useEffect(() => {
    currentTimeRef.current = Math.max(0, initialTime);
    loadTimeoutRef.current = window.setTimeout(() => setStatus('error'), 15_000);
    const pollInterval = window.setInterval(() => postCommand('getCurrentTime'), 500);
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !isYouTubeMessageOrigin(event.origin)) return;
      const message = parsePlayerMessage(event.data);
      if (!message) return;
      if (message.event === 'onReady') {
        window.clearTimeout(loadTimeoutRef.current);
        setStatus('ready');
      } else if (message.event === 'onError') {
        window.clearTimeout(loadTimeoutRef.current);
        setStatus('error');
      }
      const currentTime = Number(message.info?.currentTime);
      if (Number.isFinite(currentTime)) {
        currentTimeRef.current = Math.max(0, currentTime);
        onTimeUpdate?.(currentTimeRef.current);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.clearTimeout(loadTimeoutRef.current);
      window.clearInterval(pollInterval);
      window.removeEventListener('message', handleMessage);
    };
  }, [initialTime, onTimeUpdate, playerId, videoId]);

  const handleLoad = () => {
    window.clearTimeout(loadTimeoutRef.current);
    setStatus('ready');
    const listen = () => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: playerId }), YOUTUBE_EMBED_ORIGIN);
      postCommand('addEventListener', ['onReady']);
      postCommand('addEventListener', ['onStateChange']);
      postCommand('addEventListener', ['onError']);
      if (initialTime > 0) postCommand('seekTo', [initialTime, true]);
    };
    listen();
    window.setTimeout(listen, 250);
  };

  return (
    <div className="youtube-player" aria-label="YouTube 视频播放器">
      <iframe
        ref={iframeRef}
        id={playerId}
        className="youtube-player__host"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        src={embedUrl}
        title="YouTube 视频播放器"
        onError={() => {
          window.clearTimeout(loadTimeoutRef.current);
          setStatus('error');
        }}
        onLoad={handleLoad}
      />
      {status !== 'ready' && (
        <div className="youtube-player__status" role={status === 'error' ? 'alert' : 'status'}>
          {status === 'loading' ? <><Spin /><Text type="tertiary">正在加载播放器…</Text></> : <Text type="danger">播放器加载失败，请检查网络后重试</Text>}
        </div>
      )}
    </div>
  );
});

YouTubePlayer.displayName = 'YouTubePlayer';

import { IconAlertCircle } from '@douyinfe/semi-icons';
import { Button, Spin } from '@douyinfe/semi-ui';
import { useEffect, useRef, useState } from 'react';
import { ImageDialog } from './ImageDialog';

const historyKey = 'learningCenterImageViewer';

export function ExpandableImage({
  src,
  alt = '',
  dimensions,
}: {
  src?: string;
  alt?: string;
  dimensions?: { width: number; height: number };
}) {
  const [result, setResult] = useState<{
    src: string;
    failed: boolean;
    dimensions?: { width: number; height: number };
  }>();
  const [attempt, setAttempt] = useState(0);
  const current = result?.src === src ? result : undefined;
  const loading = !current;
  const failed = current?.failed ?? false;
  const size = dimensions ?? current?.dimensions;
  const [open, setOpen] = useState(false);
  const historyId = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const closing = useRef(false);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (!historyId.current || event.state?.[historyKey] === historyId.current) return;
      historyId.current = null;
      setOpen(false);
      trigger.current?.focus();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (historyId.current && window.history.state?.[historyKey] === historyId.current) {
        window.history.back();
      }
    };
  }, []);

  if (!src) return null;
  return (
    <>
      <Button
        className="expandable-image"
        aria-label={`${failed ? '重试加载图片' : '全屏查看图片'}：${alt || '图片'}`}
        aria-busy={loading}
        disabled={loading}
        theme="borderless"
        type="tertiary"
        onClick={(event) => {
          if (failed) {
            setResult(undefined);
            setAttempt((value) => value + 1);
            return;
          }
          trigger.current = event.currentTarget;
          if (historyId.current) return;
          closing.current = false;
          historyId.current = crypto.randomUUID();
          // Preserve the reader drawer's history marker so Back only closes this image.
          window.history.pushState(
            { ...window.history.state, [historyKey]: historyId.current },
            '',
            window.location.href,
          );
          setOpen(true);
        }}
      >
        <span
          className="expandable-image__frame relative block w-full min-h-11 overflow-hidden [border-radius:var(--semi-border-radius-medium)]"
          style={{ aspectRatio: size ? `${size.width} / ${size.height}` : '4 / 3' }}
        >
          <img
            key={`${src}:${attempt}`}
            src={src}
            alt={alt}
            width={size?.width}
            height={size?.height}
            className={`h-full w-full object-contain ${loading || failed ? 'invisible' : ''}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={(event) => {
              const image = event.currentTarget;
              setResult({
                src,
                failed: false,
                dimensions: { width: image.naturalWidth, height: image.naturalHeight },
              });
            }}
            onError={() => setResult({ src, failed: true })}
          />
          {(loading || failed) && (
            <span
              role={failed ? 'alert' : 'status'}
              aria-label={failed ? '图片加载失败，点击重试' : '图片加载中'}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 [background:var(--semi-color-fill-0)] [color:var(--semi-color-text-2)]"
            >
              {failed ? <IconAlertCircle /> : <Spin size="small" />}
              <span className="text-xs">{failed ? '图片加载失败，点击重试' : '图片加载中…'}</span>
            </span>
          )}
        </span>
      </Button>
      {open && (
        <ImageDialog
          src={src}
          alt={alt}
          onClose={() => {
            if (closing.current) return;
            closing.current = true;
            window.history.back();
          }}
        />
      )}
    </>
  );
}

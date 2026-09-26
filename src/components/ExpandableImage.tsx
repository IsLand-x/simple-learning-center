import { Button } from '@douyinfe/semi-ui';
import { useEffect, useRef, useState } from 'react';
import { ImageDialog } from './ImageDialog';

const historyKey = 'learningCenterImageViewer';

export function ExpandableImage({ src, alt = '' }: { src?: string; alt?: string }) {
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
        aria-label={`全屏查看图片：${alt || '图片'}`}
        theme="borderless"
        type="tertiary"
        onClick={(event) => {
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
        <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" />
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

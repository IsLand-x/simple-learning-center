import { useEffect, useRef, useState } from 'react';
import { IconMinus, IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Modal, Typography } from '@douyinfe/semi-ui';

const historyKey = 'learningCenterImageViewer';
const bodyStyle = { padding: 0 };

function ImageDialog({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const zoom = (delta: number) => setScale((value) => Math.min(4, Math.max(1, value + delta)));

  return (
    <Modal
      visible
      fullScreen
      className="image-viewer"
      bodyStyle={bodyStyle}
      closable={false}
      header={null}
      footer={null}
      onCancel={onClose}
    >
      <div
        className="image-viewer__content"
        aria-label="全屏图片查看器"
        onKeyUp={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (['+', '=', '-', '0'].includes(event.key)) {
            event.preventDefault();
            if (event.key === '0') setScale(1);
            else zoom(event.key === '-' ? -0.25 : 0.25);
          }
        }}
      >
        <div className="image-viewer__toolbar">
          <ButtonGroup aria-label="图片缩放">
            <Button
              aria-label="缩小图片"
              title="缩小（-）"
              icon={<IconMinus />}
              theme="borderless"
              type="tertiary"
              disabled={scale <= 1 || status !== 'loaded'}
              onClick={() => zoom(-0.25)}
            />
            <Button
              aria-label="恢复图片适应屏幕"
              title="适应屏幕（0）"
              icon={<IconRefresh />}
              theme="borderless"
              type="tertiary"
              onClick={() => setScale(1)}
            >
              {Math.round(scale * 100)}%
            </Button>
            <Button
              aria-label="放大图片"
              title="放大（+）"
              icon={<IconPlus />}
              theme="borderless"
              type="tertiary"
              disabled={scale >= 4 || status !== 'loaded'}
              onClick={() => zoom(0.25)}
            />
          </ButtonGroup>
          <Button autoFocus theme="borderless" type="tertiary" onClick={onClose}>
            关闭图片
          </Button>
        </div>
        <div className="image-viewer__canvas">
          {status !== 'loaded' && (
            <Typography.Text className="image-viewer__status" role="status">
              {status === 'error' ? '图片加载失败，请关闭后重试' : '正在加载图片…'}
            </Typography.Text>
          )}
          <div
            className="image-viewer__stage"
            style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
          >
            <img
              src={src}
              alt={alt}
              draggable={false}
              referrerPolicy="no-referrer"
              onLoad={() => setStatus('loaded')}
              onError={() => setStatus('error')}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

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

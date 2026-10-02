import { useState } from 'react';
import { IconMinus, IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Modal, Typography } from '@douyinfe/semi-ui';
import { useImageViewport } from './useImageViewport';
const bodyStyle = { padding: 0 };
export function ImageDialog({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const { canvasRef, imageRef, view, reset, zoom } = useImageViewport(status === 'loaded');
  const { scale } = view;

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
        className="image-viewer__content [height:100dvh] min-w-0 min-h-0"
        aria-label="全屏图片查看器"
        onKeyUp={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
          if (['+', '=', '-', '0'].includes(event.key)) {
            event.preventDefault();
            if (event.key === '0') reset();
            else zoom(event.key === '-' ? -0.25 : 0.25);
          }
        }}
      >
        <div className="image-viewer__toolbar justify-between [padding:calc(6px_+_env(safe-area-inset-top))_max(12px,_env(safe-area-inset-right))_6px_max(12px,_env(safe-area-inset-left))] [background:var(--semi-color-bg-1)]">
          <ButtonGroup aria-label="图片缩放">
            <Button
              aria-label="缩小图片"
              title="缩小（-）"
              icon={<IconMinus />}
              theme="borderless"
              type="tertiary"
              disabled={scale <= 0.5 || status !== 'loaded'}
              onClick={() => zoom(-0.25)}
            />
            <Button
              aria-label="恢复图片适应屏幕"
              title="适应屏幕（0）"
              icon={<IconRefresh />}
              theme="borderless"
              type="tertiary"
              onClick={reset}
            >
              {Math.round(scale * 100)}%
            </Button>
            <Button
              aria-label="放大图片"
              title="放大（+）"
              icon={<IconPlus />}
              theme="borderless"
              type="tertiary"
              disabled={scale >= 6 || status !== 'loaded'}
              onClick={() => zoom(0.25)}
            />
          </ButtonGroup>
          <Button autoFocus theme="borderless" type="tertiary" onClick={onClose}>
            关闭图片
          </Button>
        </div>
        <div className="relative flex min-h-0 min-w-0 flex-1 [padding:20px_max(20px,_env(safe-area-inset-right))_max(24px,_env(safe-area-inset-bottom))_max(20px,_env(safe-area-inset-left))]">
          <div
            ref={canvasRef}
            className="image-viewer__canvas relative min-h-0 min-w-0 touch-none select-none [overscroll-behavior:contain] cursor-grab active:cursor-grabbing"
            title="Ctrl/Cmd + 滚轮缩放，拖动查看；触屏可双指缩放"
          >
            {status !== 'loaded' && (
              <Typography.Text
                className="image-viewer__status absolute [inset:24px] text-center [color:var(--semi-color-text-1)]"
                role="status"
              >
                {status === 'error' ? '图片加载失败，请关闭后重试' : '正在加载图片…'}
              </Typography.Text>
            )}
            <div className="image-viewer__stage flex h-full w-full items-center justify-center">
              <img
                ref={imageRef}
                style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${scale})` }}
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
      </div>
    </Modal>
  );
}

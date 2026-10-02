import { IconMinus, IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Modal, Tooltip } from '@douyinfe/semi-ui';
import { useEffect, useState, type CSSProperties } from 'react';
import { clamp } from '../../../../../util/format';

const rssImageViewerBodyStyle = { padding: 0 };

type CssVariables = CSSProperties & Record<`--${string}`, string | number>;

export function RssImageViewer({
  image,
  onClose,
}: {
  image: RssImageViewerImage | null;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setScale(1);
  }, [image?.src]);

  useEffect(() => {
    if (!image) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setScale((current) => clamp(current + 0.25, 0.5, 4));
      }
      if (event.key === '-') {
        event.preventDefault();
        setScale((current) => clamp(current - 0.25, 0.5, 4));
      }
      if (event.key === '0') {
        event.preventDefault();
        setScale(1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [image, onClose]);

  return (
    <Modal
      bodyStyle={rssImageViewerBodyStyle}
      centered
      className="rss-image-viewer"
      closable={false}
      footer={null}
      maskClosable
      visible={Boolean(image)}
      width="min(1120px, calc(100vw - 40px))"
      onCancel={onClose}
    >
      <div
        className="rss-image-viewer__content [height:min(84vh,_900px)] [min-height:360px] [@media(max-width:560px)]:[height:88vh] [@media(max-width:560px)]:[min-height:300px]"
        aria-label="图片查看器"
      >
        <div className="rss-image-viewer__toolbar [min-height:48px] [flex:0_0_48px] justify-end">
          <ButtonGroup aria-label="图片缩放">
            <Tooltip content="缩小（-）">
              <Button
                aria-label="缩小图片"
                disabled={scale <= 0.5}
                icon={<IconMinus />}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={() => setScale((current) => clamp(current - 0.25, 0.5, 4))}
              />
            </Tooltip>
            <Button
              aria-label="恢复图片原始缩放"
              icon={<IconRefresh />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => setScale(1)}
            >
              {Math.round(scale * 100)}%
            </Button>
            <Tooltip content="放大（+）">
              <Button
                aria-label="放大图片"
                disabled={scale >= 4}
                icon={<IconPlus />}
                size="small"
                theme="borderless"
                type="tertiary"
                onClick={() => setScale((current) => clamp(current + 0.25, 0.5, 4))}
              />
            </Tooltip>
          </ButtonGroup>
          <Button size="small" theme="borderless" type="tertiary" onClick={onClose}>
            关闭
          </Button>
        </div>
        <div className="rss-image-viewer__canvas min-w-0 min-h-0 [padding:20px] [background:var(--semi-color-fill-0)] [@media(max-width:560px)]:[padding:8px]">
          <div
            className="rss-image-viewer__stage [width:var(--rss-image-width)] [min-height:100%] [margin:0_auto] [place-items:start_center]"
            style={{ '--rss-image-width': `${scale * 100}%` } as CssVariables}
          >
            {image && (
              <img alt={image.alt} draggable={false} referrerPolicy="no-referrer" src={image.src} />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export interface RssImageViewerImage {
  src: string;
  alt: string;
}

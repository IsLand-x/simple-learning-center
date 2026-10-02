import {
  IconAIStrokedLevel1,
  IconBookmark,
  IconComment,
  IconDeleteStroked,
} from '@douyinfe/semi-icons';
import { Button, ButtonGroup } from '@douyinfe/semi-ui';
import type { HighlightItem } from '../../../contracts/reading';
import type { ReaderHighlightTarget } from '../../types/reader';
import { clamp } from '../../util/format';
type SelectionAnnotation = Pick<HighlightItem, 'id' | 'kind' | 'text' | 'comment'>;
export function HighlightToolbar({
  activeHighlight,
  activeHighlightTarget,
  onAskAboutHighlight,
  onCancelHighlight,
  showViewHighlight,
  onViewHighlight,
  onEditHighlightComment,
}: {
  activeHighlight: SelectionAnnotation;
  activeHighlightTarget: ReaderHighlightTarget;
  onAskAboutHighlight?: () => void;
  onCancelHighlight: () => void;
  showViewHighlight: boolean;
  onViewHighlight: () => void;
  onEditHighlightComment: () => void;
}) {
  return (
    <div
      className={`selection-toolbar fixed [z-index:30] [padding:4px] [background:var(--semi-color-bg-2)] [color:var(--semi-color-text-0)] [box-shadow:var(--semi-shadow-elevated)] [transform:translate(-50%,_-100%)] mobile:[top:auto]! mobile:[right:auto]! mobile:[bottom:calc(var(--mobile-reader-toolbar-height)_+_env(safe-area-inset-bottom)_+_12px)] mobile:[left:50%]! mobile:[width:min(336px,_calc(100vw_-_24px))] mobile:[max-width:calc(100vw_-_24px)] mobile:[padding:4px] mobile:[transform:translateX(-50%)] mobile:[animation:mobile-selection-toolbar-in_180ms_ease-out] selection-toolbar--highlight${activeHighlightTarget.rect.top < 150 ? ' selection-toolbar--below' : ''}`}
      role="toolbar"
      aria-label="已高亮内容操作"
      style={{
        left: clamp(
          activeHighlightTarget.rect.left + activeHighlightTarget.rect.width / 2,
          170,
          window.innerWidth - 170,
        ),
        top:
          activeHighlightTarget.rect.top < 150
            ? activeHighlightTarget.rect.top + activeHighlightTarget.rect.height + 8
            : activeHighlightTarget.rect.top - 8,
      }}
    >
      <ButtonGroup
        aria-label="已高亮内容操作"
        className="selection-toolbar__button-group mobile:[max-width:100%]"
        size="small"
        theme="borderless"
        type="tertiary"
      >
        {onAskAboutHighlight && (
          <Button
            aria-label="使用已高亮内容向 AI 提问"
            icon={<IconAIStrokedLevel1 />}
            onClick={onAskAboutHighlight}
          >
            AI 提问
          </Button>
        )}
        <Button icon={<IconDeleteStroked />} onClick={onCancelHighlight}>
          <span className="selection-toolbar__label--full">取消高亮</span>
          <span className="selection-toolbar__label--compact">取消</span>
        </Button>
        {showViewHighlight && activeHighlight.kind !== 'comment' && (
          <Button icon={<IconBookmark />} onClick={onViewHighlight}>
            <span className="selection-toolbar__label--full">在高亮中查看</span>
            <span className="selection-toolbar__label--compact">查看</span>
          </Button>
        )}
        <Button icon={<IconComment />} onClick={onEditHighlightComment}>
          <span className="selection-toolbar__label--full">
            {activeHighlight.comment ? '查看评论' : '评论'}
          </span>
          <span className="selection-toolbar__label--compact">评论</span>
        </Button>
      </ButtonGroup>
    </div>
  );
}

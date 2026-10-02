import { IconAIStrokedLevel1, IconBookmark, IconComment } from '@douyinfe/semi-icons';
import { Button, ButtonGroup } from '@douyinfe/semi-ui';
import type { ReaderSelection } from '../../types/reader';
import { clamp } from '../../util/format';
export function SelectionToolbar({
  selection,
  onAskAboutSelection,
  onSaveHighlight,
  onCreateComment,
}: {
  selection: ReaderSelection;
  onAskAboutSelection: () => void;
  onSaveHighlight: () => void;
  onCreateComment: () => void;
}) {
  return (
    <div
      className={`selection-toolbar fixed [z-index:30] [padding:4px] [background:var(--semi-color-bg-2)] [color:var(--semi-color-text-0)] [box-shadow:var(--semi-shadow-elevated)] [transform:translate(-50%,_-100%)] mobile:[top:auto]! mobile:[right:auto]! mobile:[bottom:calc(var(--mobile-reader-toolbar-height)_+_env(safe-area-inset-bottom)_+_12px)] mobile:[left:50%]! mobile:[width:min(336px,_calc(100vw_-_24px))] mobile:[max-width:calc(100vw_-_24px)] mobile:[padding:4px] mobile:[transform:translateX(-50%)] mobile:[animation:mobile-selection-toolbar-in_180ms_ease-out] ${selection.rect.top < 150 ? ' selection-toolbar--below' : ''}`}
      role="toolbar"
      aria-label="文本选择操作"
      onMouseDown={(event) => event.preventDefault()}
      style={{
        left: clamp(selection.rect.left + selection.rect.width / 2, 120, window.innerWidth - 120),
        top:
          selection.rect.top < 150
            ? selection.rect.top + selection.rect.height + 8
            : selection.rect.top - 8,
      }}
    >
      <ButtonGroup
        aria-label="文本选择操作"
        className="selection-toolbar__button-group mobile:[max-width:100%]"
        size="small"
        theme="borderless"
        type="tertiary"
      >
        <Button icon={<IconAIStrokedLevel1 />} onClick={onAskAboutSelection}>
          提问
        </Button>
        <Button icon={<IconBookmark />} onClick={onSaveHighlight}>
          高亮
        </Button>
        <Button icon={<IconComment />} onClick={onCreateComment}>
          评论
        </Button>
      </ButtonGroup>
    </div>
  );
}

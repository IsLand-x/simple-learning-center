import {
  IconChevronLeft,
  IconChevronRight,
  IconColorPalette,
  IconSidebar,
} from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Popover, Tooltip } from '@douyinfe/semi-ui';

import { getReaderThemeName } from '../../../../../util/reading/readerThemes';

import {
  ReaderStylePanel,
  type ReaderStylePanelProps,
} from '../../../../../components/reading/ReaderStylePanel';
import type { ReaderToolbarNavigationProps } from './options';

interface ReaderDesktopToolbarProps extends ReaderToolbarNavigationProps, ReaderStylePanelProps {
  stylePopoverVisible: boolean;
  onStylePopoverVisibleChange: (visible: boolean) => void;
}

export function ReaderDesktopToolbar({
  preferences,
  tocCollapsed,
  onChangePreferences,
  onToggleToc,
  onPrev,
  onNext,
  stylePopoverVisible,
  onStylePopoverVisibleChange,
}: ReaderDesktopToolbarProps) {
  const stylePanel = (
    <ReaderStylePanel preferences={preferences} onChangePreferences={onChangePreferences} />
  );

  return (
    <div className="reader-toolbar [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] [gap:6px] [padding:0] [@media(max-width:860px)]:overflow-x-auto">
      <Tooltip content={tocCollapsed ? '展开书籍目录' : '收起书籍目录'}>
        <Button
          aria-label={tocCollapsed ? '展开书籍目录' : '收起书籍目录'}
          icon={<IconSidebar />}
          theme="borderless"
          type="tertiary"
          onClick={onToggleToc}
        />
      </Tooltip>
      <span className="reader-toolbar__divider [width:1px] [height:22px] [background:var(--semi-color-border)]" />
      <ButtonGroup>
        <Tooltip content="上一页（← / ↑）">
          <Button
            aria-label="上一页"
            icon={<IconChevronLeft />}
            theme="borderless"
            type="tertiary"
            onClick={onPrev}
          />
        </Tooltip>
        <Tooltip content="下一页（→ / ↓）">
          <Button
            aria-label="下一页"
            icon={<IconChevronRight />}
            theme="borderless"
            type="tertiary"
            onClick={onNext}
          />
        </Tooltip>
      </ButtonGroup>
      <span className="reader-toolbar__divider [width:1px] [height:22px] [background:var(--semi-color-border)]" />
      <Popover
        content={stylePanel}
        contentClassName="reader-style-popover"
        position="bottomLeft"
        showArrow={false}
        trigger="click"
        visible={stylePopoverVisible}
        onVisibleChange={onStylePopoverVisibleChange}
      >
        <Button
          aria-label="打开阅读样式设置"
          icon={<IconColorPalette />}
          theme="borderless"
          type="tertiary"
        >
          {getReaderThemeName(preferences.theme)}
        </Button>
      </Popover>
    </div>
  );
}

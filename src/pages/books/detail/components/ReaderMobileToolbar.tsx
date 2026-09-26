import { Button } from '@douyinfe/semi-ui';
import { IconApps, IconChevronLeft, IconChevronRight, IconSidebar } from '@douyinfe/semi-icons';

import { ReaderAiActivityIcon } from './ReaderAiActivityIcon';
import { useReaderAiActivity } from '../store/hooks/useReaderAiActivity';
import { readerAiActivityLabel } from '../store/model/readerAiActivity';

import type { ReaderToolbarNavigationProps } from '../store/model/readerToolbar';

interface ReaderMobileToolbarProps extends ReaderToolbarNavigationProps {
  moreOpen: boolean;
  onToggleMore: () => void;
}

export function ReaderMobileToolbar({
  tocCollapsed,
  onToggleToc,
  onPrev,
  onNext,
  moreOpen,
  onToggleMore,
}: ReaderMobileToolbarProps) {
  const { status } = useReaderAiActivity();
  const statusLabel = readerAiActivityLabel(status);
  return (
    <div
      className="reader-toolbar [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] [gap:6px] [padding:0] [@media(max-width:860px)]:overflow-x-auto reader-toolbar--mobile"
      aria-label="移动端阅读工具栏"
    >
      <Button
        aria-label={tocCollapsed ? '打开书籍目录' : '收起书籍目录'}
        aria-pressed={!tocCollapsed}
        icon={<IconSidebar />}
        theme="borderless"
        type="tertiary"
        onClick={onToggleToc}
      >
        目录
      </Button>
      <Button
        aria-label="上一页"
        icon={<IconChevronLeft />}
        theme="borderless"
        type="tertiary"
        onClick={onPrev}
      >
        上一页
      </Button>
      <Button
        aria-label="下一页"
        icon={<IconChevronRight />}
        theme="borderless"
        type="tertiary"
        onClick={onNext}
      >
        下一页
      </Button>
      <Button
        aria-label={
          statusLabel
            ? `${moreOpen ? '收起' : '打开'}更多功能，${statusLabel}`
            : moreOpen
              ? '收起更多功能'
              : '打开更多功能，默认显示 AI 助手'
        }
        aria-pressed={moreOpen}
        className={moreOpen ? 'mobile-reader-tool--active' : ''}
        icon={status === 'idle' ? <IconApps /> : <ReaderAiActivityIcon />}
        theme="borderless"
        type="tertiary"
        onClick={onToggleMore}
      >
        {status === 'running' ? 'AI 运行中' : status === 'unread' ? 'AI 未读' : '更多功能'}
      </Button>
    </div>
  );
}

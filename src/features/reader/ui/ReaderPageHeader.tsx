import { IconArrowLeft, IconDeleteStroked, IconMore } from '@douyinfe/semi-icons';
import { Button, Dropdown, Empty, Progress, Tooltip, Typography } from '@douyinfe/semi-ui';
import { ReaderDesktopToolbar } from '../../../components/ReaderToolbar';
import type { BookItem, ReaderPreferences } from '../../../types';
import { formatPageProgress } from '../model/readerPageModel';

const { Text } = Typography;

export function MissingReaderBook({ onBack }: { onBack: () => void }) {
  return (
    <main className="missing-book">
      <Empty title="这本书不在书架中" description="它可能已被删除，或服务器数据目录已被清理" />
      <Button theme="solid" type="primary" onClick={onBack}>
        返回书架
      </Button>
    </main>
  );
}

export function ReaderPageHeader({
  book,
  currentChapter,
  mobileReader,
  mobileChromeVisible,
  mobileOverlayOpen,
  preferences,
  stylePopoverVisible,
  tocCollapsed,
  onBack,
  onChangePreferences,
  onDelete,
  onNext,
  onPrev,
  onStylePopoverVisibleChange,
  onToggleToc,
}: {
  book: BookItem;
  currentChapter: string;
  mobileReader: boolean;
  mobileChromeVisible: boolean;
  mobileOverlayOpen: boolean;
  preferences: ReaderPreferences;
  stylePopoverVisible: boolean;
  tocCollapsed: boolean;
  onBack: () => void;
  onChangePreferences: (changes: Partial<ReaderPreferences>) => void;
  onDelete: () => void;
  onNext: () => void;
  onPrev: () => void;
  onStylePopoverVisibleChange: (visible: boolean) => void;
  onToggleToc: () => void;
}) {
  return (
    <header className="reader-header">
      <div aria-hidden={mobileReader && !mobileChromeVisible} className="reader-header__identity">
        <Tooltip content={mobileOverlayOpen ? '关闭当前浮层' : '返回书架'} position="bottomLeft">
          <Button
            aria-label={mobileOverlayOpen ? '关闭当前浮层' : '退出阅读并返回书架'}
            className="reader-header__back"
            icon={<IconArrowLeft size="large" />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={onBack}
          />
        </Tooltip>
        <Progress
          type="circle"
          percent={book.progress}
          width={28}
          showInfo={false}
          stroke="var(--semi-color-primary)"
        />
        <div className="reader-header__title">
          <Text strong ellipsis={{ showTooltip: true }}>
            {book.title}
          </Text>
          <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
            {Math.round(book.progress)}% · {formatPageProgress(book)} · {currentChapter}
          </Text>
        </div>
      </div>
      <div
        aria-hidden={!mobileReader || mobileChromeVisible}
        className="reader-header__immersive-summary"
      >
        <Text strong ellipsis={{ showTooltip: true }}>
          {book.title}
        </Text>
        <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
          {currentChapter}
        </Text>
      </div>
      {!mobileReader && (
        <div className="reader-header__toolbar">
          <ReaderDesktopToolbar
            preferences={preferences}
            tocCollapsed={tocCollapsed}
            stylePopoverVisible={stylePopoverVisible}
            onChangePreferences={onChangePreferences}
            onStylePopoverVisibleChange={onStylePopoverVisibleChange}
            onToggleToc={onToggleToc}
            onPrev={onPrev}
            onNext={onNext}
          />
        </div>
      )}
      <div aria-hidden={mobileReader && !mobileChromeVisible} className="reader-header__actions">
        <Dropdown
          trigger="hover"
          position="bottomRight"
          render={
            <Dropdown.Menu>
              <Dropdown.Item type="danger" icon={<IconDeleteStroked />} onClick={onDelete}>
                删除
              </Dropdown.Item>
            </Dropdown.Menu>
          }
        >
          <Button
            aria-label="更多书籍操作"
            icon={<IconMore />}
            theme="borderless"
            type="tertiary"
          />
        </Dropdown>
      </div>
    </header>
  );
}

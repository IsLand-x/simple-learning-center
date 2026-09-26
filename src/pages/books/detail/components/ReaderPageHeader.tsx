import { IconArrowLeft, IconDeleteStroked, IconMore } from '@douyinfe/semi-icons';
import { Button, Dropdown, Empty, Progress, Tooltip, Typography } from '@douyinfe/semi-ui';
import { ReaderDesktopToolbar } from './ReaderDesktopToolbar';
import type { BookItem, ReaderPreferences } from '../../../../types/domain';
import { formatPageProgress } from '../store/model/readerPageModel';

const { Text } = Typography;

export function MissingReaderBook({ onBack }: { onBack: () => void }) {
  return (
    <main className="missing-book [min-height:360px] [place-items:center] [align-content:center] [gap:16px] w-full [background:var(--semi-color-bg-0)]">
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
    <header className="reader-header [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] [padding:0_8px_0_12px] [background:var(--semi-color-bg-1)] mobile:relative mobile:[height:58px] mobile:[min-height:58px] mobile:[padding:0_8px] mobile:overflow-hidden">
      <div
        aria-hidden={mobileReader && !mobileChromeVisible}
        className="reader-header__identity min-w-0 mobile:[transition:opacity_140ms_ease,_transform_180ms_ease,_visibility_0s_linear]"
      >
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
        <div className="reader-header__title min-w-0 [line-height:1.1]">
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
        className="reader-header__immersive-summary mobile:absolute mobile:[inset:0_14px] mobile:min-w-0 mobile:justify-center mobile:[gap:2px] mobile:[opacity:0] mobile:[transform:translateY(4px)] mobile:[visibility:hidden] mobile:pointer-events-none mobile:[transition:opacity_140ms_ease,_transform_180ms_ease,_visibility_0s_linear_180ms]"
      >
        <Text strong ellipsis={{ showTooltip: true }}>
          {book.title}
        </Text>
        <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
          {currentChapter}
        </Text>
      </div>
      {!mobileReader && (
        <div className="reader-header__toolbar min-w-0">
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
      <div
        aria-hidden={mobileReader && !mobileChromeVisible}
        className="reader-header__actions [margin-left:auto] mobile:[transition:opacity_140ms_ease,_transform_180ms_ease,_visibility_0s_linear]"
      >
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

import { useState } from 'react';
import { bookSharesApi } from '../../../../../api/book-shares';
import { IconArrowLeft, IconDeleteStroked, IconMore } from '@douyinfe/semi-icons';
import { Button, Dropdown, Progress, Tooltip, Typography, Toast } from '@douyinfe/semi-ui';
import { useNavigate } from 'react-router-dom';
import { useLearningStore } from '../../../../../store/useLearningStore';
import type { BookItem } from '../../../../../../contracts/books';
import type { ReaderPreferences } from '../../../../../../contracts/reading';
import { confirmMoveBookToTrash } from '../../../../../util/confirmBookTrash';
import { formatPageProgress } from './pageProgress';
import { ReaderDesktopToolbar } from './ReaderDesktopToolbar';

const { Text } = Typography;

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
  onNext: () => void;
  onPrev: () => void;
  onStylePopoverVisibleChange: (visible: boolean) => void;
  onToggleToc: () => void;
}) {
  const navigate = useNavigate();
  const trashBook = useLearningStore((state) => state.trashBook);
  const [sharing, setSharing] = useState(false);
  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const share = await bookSharesApi.create(book.id);
      window.location.assign(share.url);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '分享失败');
      setSharing(false);
    }
  };
  const handleRevokeShare = async () => {
    try {
      await bookSharesApi.revoke(book.id);
      Toast.success('已停止分享，原链接已失效');
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '停止分享失败');
    }
  };
  const handleDelete = () => {
    confirmMoveBookToTrash(book, (trashedBook) => {
      trashBook(book.id, trashedBook.deletedAt);
      navigate('/');
    });
  };

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
          trigger="click"
          position="bottomRight"
          render={
            <Dropdown.Menu>
              <Dropdown.Item
                disabled={sharing || book.kind !== 'epub'}
                onClick={() => void handleShare()}
              >
                分享
              </Dropdown.Item>
              <Dropdown.Item
                disabled={book.kind !== 'epub'}
                onClick={() => void handleRevokeShare()}
              >
                停止分享
              </Dropdown.Item>
              <Dropdown.Item type="danger" icon={<IconDeleteStroked />} onClick={handleDelete}>
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

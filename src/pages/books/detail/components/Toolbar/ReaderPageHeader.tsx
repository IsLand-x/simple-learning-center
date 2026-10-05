import { useEffect, useState } from 'react';
import type { BookShareLink } from '../../../../../api/book-shares/type';
import { BookRenameDialog } from './BookRenameDialog';
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
  const [share, setShare] = useState<BookShareLink | null>(null);
  const [shareLoading, setShareLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  useEffect(() => {
    let active = true;
    setShareLoading(true);
    setShare(null);
    void bookSharesApi
      .status(book.id)
      .then((value) => {
        if (active) setShare(value);
      })
      .catch((error: unknown) => {
        if (active) Toast.error(error instanceof Error ? error.message : '读取分享状态失败');
      })
      .finally(() => {
        if (active) setShareLoading(false);
      });
    return () => {
      active = false;
    };
  }, [book.id]);
  const handleShare = async () => {
    if (sharing) return;
    setMenuVisible(false);
    setSharing(true);
    try {
      const created = await bookSharesApi.create(book.id);
      setShare(created);
      window.location.assign(created.url);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '分享失败');
      setSharing(false);
    }
  };
  const handleRevokeShare = async () => {
    if (sharing) return;
    setMenuVisible(false);
    setSharing(true);
    try {
      await bookSharesApi.revoke(book.id);
      setShare(null);
      Toast.success('已停止分享，原链接已失效');
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '停止分享失败');
    } finally {
      setSharing(false);
    }
  };
  const handleCopyShare = async () => {
    if (!share) return;
    setMenuVisible(false);
    try {
      await navigator.clipboard.writeText(new URL(share.url, window.location.origin).href);
      Toast.success('分享链接已复制');
    } catch {
      Toast.error('复制失败，请检查浏览器剪贴板权限');
    }
  };
  const handleDelete = () => {
    setMenuVisible(false);
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
          visible={menuVisible}
          onVisibleChange={setMenuVisible}
          position="bottomRight"
          render={
            <Dropdown.Menu>
              <Dropdown.Item
                onClick={() => {
                  setMenuVisible(false);
                  setRenaming(true);
                }}
              >
                重命名书籍
              </Dropdown.Item>
              {share ? (
                <>
                  <Dropdown.Item disabled={sharing} onClick={() => void handleCopyShare()}>
                    复制分享链接
                  </Dropdown.Item>
                  <Dropdown.Item disabled={sharing} onClick={() => void handleRevokeShare()}>
                    停止分享
                  </Dropdown.Item>
                </>
              ) : (
                <Dropdown.Item
                  disabled={shareLoading || sharing || book.kind !== 'epub'}
                  onClick={() => void handleShare()}
                >
                  分享本书
                </Dropdown.Item>
              )}
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
      {renaming && <BookRenameDialog book={book} onClose={() => setRenaming(false)} />}
    </header>
  );
}

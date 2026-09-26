import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDeleteStroked,
  IconMore,
} from '@douyinfe/semi-icons';
import { Button, Dropdown, Progress, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { useNavigate } from 'react-router-dom';
import { booksApi } from '../../../../../api/books/index';
import { useLearningStore } from '../../../../../store/useLearningStore';
import type { BookItem } from '../../../../../../contracts/books';
import type { ReaderPreferences } from '../../../../../../contracts/reading';
import { confirmDialog } from '../../../../../util/confirmDialog';
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
  const handleDelete = () => {
    confirmDialog({
      title: `将《${book.title}》移到回收站？`,
      content: '书籍和相关学习记录会保留 30 天；期间可以恢复，也可以在回收站中彻底删除。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
      okText: '移到回收站',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        try {
          const trashedBook = await booksApi.moveToTrash(book.id);
          trashBook(book.id, trashedBook.deletedAt);
          Toast.success('已移到回收站，30 天内可以恢复');
          navigate('/');
        } catch (error) {
          Toast.error(error instanceof Error ? error.message : '无法将书籍移到回收站');
          throw error;
        }
      },
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
          trigger="hover"
          position="bottomRight"
          render={
            <Dropdown.Menu>
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

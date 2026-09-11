import { useMemo, useState } from 'react';
import { IconDeleteStroked, IconRestoreStroked } from '@douyinfe/semi-icons';
import { Button, Empty, Toast, Typography } from '@douyinfe/semi-ui';
import { confirmDialog } from '../../../lib/confirmDialog';
import { permanentlyDeleteBook, restoreBookFromTrash } from '../../../lib/epubStorage';
import { formatRelativeTime } from '../../../lib/format';
import { useLearningStore } from '../../../store/useLearningStore';
import type { TrashedBookItem } from '../../../types';
import { trashDaysRemaining } from '../model/libraryView';
import { BookCover } from './BookCover';

const { Text } = Typography;

export interface TrashViewProps {
  trashedBooks: TrashedBookItem[];
}

export function TrashView({ trashedBooks }: TrashViewProps) {
  const restoreBook = useLearningStore((state) => state.restoreBook);
  const deleteBookPermanently = useLearningStore((state) => state.deleteBookPermanently);
  const [pendingAction, setPendingAction] = useState<{
    bookId: string;
    kind: 'restore' | 'delete';
  } | null>(null);
  const sortedTrashedBooks = useMemo(
    () => [...trashedBooks].sort((left, right) => right.deletedAt - left.deletedAt),
    [trashedBooks],
  );

  const restore = async (item: TrashedBookItem) => {
    setPendingAction({ bookId: item.book.id, kind: 'restore' });
    try {
      await restoreBookFromTrash(item.book.id);
      restoreBook(item.book.id);
      Toast.success(`已恢复《${item.book.title}》`);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '无法恢复书籍');
    } finally {
      setPendingAction(null);
    }
  };

  const removePermanently = (item: TrashedBookItem) => {
    confirmDialog({
      title: `彻底删除《${item.book.title}》？`,
      content:
        'EPUB 文件、阅读进度、笔记、高亮、评论和 AI 对话都会从服务器数据目录中清除，且无法恢复。',
      icon: <IconDeleteStroked size="large" style={{ color: 'var(--semi-color-danger)' }} />,
      okText: '彻底删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        setPendingAction({ bookId: item.book.id, kind: 'delete' });
        try {
          const result = await permanentlyDeleteBook(item.book.id);
          deleteBookPermanently(item.book.id, result.deletedAt);
          Toast.success('书籍已彻底删除');
        } catch (error) {
          Toast.error(error instanceof Error ? error.message : '无法彻底删除书籍');
          throw error;
        } finally {
          setPendingAction(null);
        }
      },
    });
  };

  if (!sortedTrashedBooks.length) {
    return (
      <div className="library-empty">
        <Empty title="回收站是空的" description="从阅读器删除的书会在这里保留 30 天" />
      </div>
    );
  }

  return (
    <section className="book-trash" aria-label="回收站中的书籍">
      <div className="book-trash__notice">
        <Text type="tertiary">
          书籍在移入回收站 30 天后自动清除；恢复前，相关学习记录仍会完整保留。
        </Text>
      </div>
      <div className="book-trash__list">
        {sortedTrashedBooks.map((item) => {
          const daysRemaining = trashDaysRemaining(item.deletedAt);
          const restoring =
            pendingAction?.bookId === item.book.id && pendingAction.kind === 'restore';
          const deleting =
            pendingAction?.bookId === item.book.id && pendingAction.kind === 'delete';
          return (
            <article className="book-trash__item" key={item.book.id}>
              <BookCover book={item.book} compact />
              <div className="book-trash__copy">
                <Text strong ellipsis={{ showTooltip: true }}>
                  {item.book.title}
                </Text>
                <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
                  {item.book.author}
                </Text>
                <Text size="small" type="tertiary">
                  {formatRelativeTime(item.deletedAt)}移入 · {daysRemaining} 天后自动清除
                </Text>
              </div>
              <div className="book-trash__actions">
                <Button
                  disabled={Boolean(pendingAction)}
                  icon={<IconRestoreStroked />}
                  loading={restoring}
                  theme="borderless"
                  type="tertiary"
                  onClick={() => void restore(item)}
                >
                  恢复
                </Button>
                <Button
                  disabled={Boolean(pendingAction)}
                  icon={<IconDeleteStroked />}
                  loading={deleting}
                  theme="borderless"
                  type="danger"
                  onClick={() => removePermanently(item)}
                >
                  彻底删除
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

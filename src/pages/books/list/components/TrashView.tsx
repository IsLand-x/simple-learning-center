import { booksApi } from '../../../../api/books';
import { useMemo, useState } from 'react';
import { IconDeleteStroked, IconRestoreStroked } from '@douyinfe/semi-icons';
import { Button, Empty, Toast, Typography } from '@douyinfe/semi-ui';
import { confirmDialog } from '../../../../util/confirmDialog';

import { formatRelativeTime } from '../../../../util/format';
import { useLearningStore } from '../../../../util/state/useLearningStore';
import type { TrashedBookItem } from '../../../../types/domain';
import { trashDaysRemaining } from '../store/model/libraryView';
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
      await booksApi.restoreFromTrash(item.book.id);
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
          const result = await booksApi.permanentlyDelete(item.book.id);
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
      <div className="library-empty [min-height:360px] [place-items:center] [align-content:center] [gap:16px]">
        <Empty title="回收站是空的" description="从阅读器删除的书会在这里保留 30 天" />
      </div>
    );
  }

  return (
    <section
      className="book-trash [max-width:1180px] [margin:0_auto] overflow-hidden [background:var(--semi-color-bg-1)]"
      aria-label="回收站中的书籍"
    >
      <div className="book-trash__notice [padding:12px_16px] mobile:[padding:10px_12px]">
        <Text type="tertiary">
          书籍在移入回收站 30 天后自动清除；恢复前，相关学习记录仍会完整保留。
        </Text>
      </div>
      <div className="book-trash__list min-w-0">
        {sortedTrashedBooks.map((item) => {
          const daysRemaining = trashDaysRemaining(item.deletedAt);
          const restoring =
            pendingAction?.bookId === item.book.id && pendingAction.kind === 'restore';
          const deleting =
            pendingAction?.bookId === item.book.id && pendingAction.kind === 'delete';
          return (
            <article
              className="book-trash__item min-w-0 [min-height:88px] [grid-template-columns:48px_minmax(0,_1fr)_auto] [padding:12px_12px_12px_16px] mobile:[min-height:96px] mobile:[padding:12px_8px_12px_12px] [@media(max-width:480px)]:[grid-template-columns:48px_minmax(0,_1fr)]"
              key={item.book.id}
            >
              <BookCover book={item.book} compact />
              <div className="book-trash__copy min-w-0 [gap:3px]">
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
              <div className="book-trash__actions [gap:4px] [@media(max-width:480px)]:[grid-column:1_/_-1] [@media(max-width:480px)]:justify-end">
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

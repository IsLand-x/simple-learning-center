import { IconAlertTriangle } from '@douyinfe/semi-icons';
import { Toast } from '@douyinfe/semi-ui';
import type { BookItem, TrashedBookItem } from '../types';
import { confirmDialog } from './confirmDialog';
import { moveBookToTrash } from './epubStorage';

export function confirmMoveBookToTrash(
  book: BookItem,
  onMoved: (trashedBook: TrashedBookItem) => void | Promise<void>,
) {
  confirmDialog({
    title: `将《${book.title}》移到回收站？`,
    content: '书籍和相关学习记录会保留 30 天；期间可以恢复，也可以在回收站中彻底删除。',
    icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
    okText: '移到回收站',
    cancelText: '取消',
    okButtonProps: { type: 'danger' },
    onOk: async () => {
      try {
        const trashedBook = await moveBookToTrash(book.id);
        await onMoved(trashedBook);
        Toast.success('已移到回收站，30 天内可以恢复');
      } catch (error) {
        Toast.error(error instanceof Error ? error.message : '无法将书籍移到回收站');
        throw error;
      }
    },
  });
}

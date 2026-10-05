import { useEffect, useRef, useState } from 'react';
import { Button, Input, Toast, Typography } from '@douyinfe/semi-ui';
import type { BookItem } from '../../../../../../contracts/books';
import { AppFormModal } from '../../../../../components/AppFormModal';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { waitForServerStateWrites } from '../../../../../store/serverStateStorage';

export function BookRenameDialog({ book, onClose }: { book: BookItem; onClose: () => void }) {
  const [title, setTitle] = useState(book.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!window.matchMedia('(max-width: 800px)').matches) return;
    const id = crypto.randomUUID();
    window.history.pushState(
      { ...window.history.state, learningCenterBookRename: id },
      '',
      window.location.href,
    );
    const pop = () => {
      if (window.history.state?.learningCenterBookRename !== id) closeRef.current();
    };
    window.addEventListener('popstate', pop);
    return () => {
      window.removeEventListener('popstate', pop);
      if (window.history.state?.learningCenterBookRename === id) window.history.back();
    };
  }, []);
  const updateBook = useLearningStore((state) => state.updateBook);
  const save = async () => {
    if (saving || !title.trim()) return;
    setSaving(true);
    setError('');
    try {
      updateBook(book.id, { title: title.trim() });
      await waitForServerStateWrites();
      Toast.success('书籍名称已保存');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试');
      setSaving(false);
    }
  };
  return (
    <AppFormModal
      visible
      title="重命名书籍"
      closable={false}
      maskClosable={!saving}
      onCancel={() => {
        if (!saving) onClose();
      }}
      width="min(440px, calc(100vw - 32px))"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-2">
          <Typography.Text>书籍名称</Typography.Text>
          <Input
            aria-label="书籍名称"
            autoFocus
            value={title}
            maxLength={500}
            disabled={saving}
            onChange={setTitle}
            className="mobile:[&_input]:text-base"
          />
        </label>
        <Typography.Text type="tertiary" size="small">
          分享页和豆瓣搜索将使用此名称。
        </Typography.Text>
        {error && <Typography.Text type="danger">{error}</Typography.Text>}
        <div className="flex justify-end gap-2">
          <Button theme="borderless" type="tertiary" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button theme="solid" htmlType="submit" loading={saving} disabled={!title.trim()}>
            保存名称
          </Button>
        </div>
      </form>
    </AppFormModal>
  );
}

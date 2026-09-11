import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button, Input, Modal, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import type { BookList } from '../../../types';

const { Text } = Typography;

export interface BookListEditorProps {
  visible: boolean;
  bookList: BookList | null;
  onCancel: () => void;
  onSave: (values: { name: string; note: string }) => void;
}

export function BookListEditor({ visible, bookList, onCancel, onSave }: BookListEditorProps) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const nameId = useId();
  const noteId = useId();

  useEffect(() => {
    if (!visible) return;
    setName(bookList?.name ?? '');
    setNote(bookList?.note ?? '');
  }, [bookList, visible]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      Toast.warning('请输入书单名称');
      return;
    }
    onSave({ name: normalizedName.slice(0, 60), note: note.trim().slice(0, 500) });
  };

  return (
    <Modal
      closable={false}
      footer={null}
      title={bookList ? '编辑书单' : '新建书单'}
      visible={visible}
      width="min(520px, calc(100vw - 16px))"
      onCancel={onCancel}
    >
      <form className="book-list-form" onSubmit={submit}>
        <label htmlFor={nameId}>
          <Text strong>名称</Text>
          <Input
            id={nameId}
            autoFocus
            maxLength={60}
            placeholder="例如：今年想读"
            value={name}
            onChange={setName}
          />
        </label>
        <label htmlFor={noteId}>
          <Text strong>备注</Text>
          <TextArea
            id={noteId}
            maxCount={500}
            maxLength={500}
            autosize={{ minRows: 3, maxRows: 6 }}
            placeholder="记录这个书单的主题或阅读计划（选填）"
            value={note}
            onChange={setNote}
          />
        </label>
        <div className="book-list-form__actions">
          <Button theme="borderless" type="tertiary" onClick={onCancel}>
            取消
          </Button>
          <Button disabled={!name.trim()} htmlType="submit" theme="solid" type="primary">
            保存
          </Button>
        </div>
      </form>
    </Modal>
  );
}

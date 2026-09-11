import { useEffect, useMemo, useState } from 'react';
import { IconSearch } from '@douyinfe/semi-icons';
import { Button, Checkbox, Empty, Input, Modal, Typography } from '@douyinfe/semi-ui';
import type { BookItem, BookList } from '../../../types';
import { BookCover } from './BookCover';

const { Text } = Typography;

export interface BookPickerProps {
  visible: boolean;
  bookList: BookList | null;
  books: BookItem[];
  onCancel: () => void;
  onSave: (bookIds: string[]) => void;
}

export function BookPicker({ visible, bookList, books, onCancel, onSave }: BookPickerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSelectedIds(new Set(bookList?.bookIds ?? []));
    setQuery('');
  }, [bookList, visible]);

  const filteredBooks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return books;
    return books.filter((book) =>
      `${book.title} ${book.author}`.toLocaleLowerCase().includes(normalized),
    );
  }, [books, query]);

  const save = () => {
    const previousIds = bookList?.bookIds ?? [];
    const previousIdSet = new Set(previousIds);
    onSave([
      ...previousIds.filter((bookId) => selectedIds.has(bookId)),
      ...books
        .filter((book) => selectedIds.has(book.id) && !previousIdSet.has(book.id))
        .map((book) => book.id),
    ]);
  };

  return (
    <Modal
      closable={false}
      footer={null}
      title={`管理“${bookList?.name ?? ''}”中的书`}
      visible={visible}
      width="min(520px, calc(100vw - 16px))"
      onCancel={onCancel}
    >
      <div className="book-picker">
        <Input
          aria-label="搜索要加入书单的书"
          prefix={<IconSearch />}
          placeholder="搜索书名或作者"
          showClear
          value={query}
          onChange={setQuery}
        />
        <div className="book-picker__list" role="group" aria-label="选择书籍">
          {filteredBooks.length ? (
            filteredBooks.map((book) => (
              <label className="book-picker__item" key={book.id}>
                <Checkbox
                  checked={selectedIds.has(book.id)}
                  onChange={(event) =>
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(book.id);
                      else next.delete(book.id);
                      return next;
                    })
                  }
                />
                <BookCover book={book} compact />
                <span className="book-picker__copy">
                  <Text ellipsis={{ showTooltip: true }}>{book.title}</Text>
                  <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
                    {book.author}
                  </Text>
                </span>
              </label>
            ))
          ) : (
            <Empty
              title="没有找到书籍"
              description={query ? '换个关键词试试' : '先导入 EPUB，再把它加入书单'}
            />
          )}
        </div>
        <div className="book-list-form__actions">
          <Text size="small" type="tertiary">
            已选择 {selectedIds.size} 本
          </Text>
          <span className="book-picker__buttons">
            <Button theme="borderless" type="tertiary" onClick={onCancel}>
              取消
            </Button>
            <Button theme="solid" type="primary" onClick={save}>
              保存
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

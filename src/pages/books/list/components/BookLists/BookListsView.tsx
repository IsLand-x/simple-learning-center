import { useEffect, useMemo, useState } from 'react';
import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Empty } from '@douyinfe/semi-ui';
import {
  type DragStart,
  type DragUpdate,
  type DropResult,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import { confirmDialog } from '../../../../../util/confirmDialog';
import { useLearningStore } from '../../../../../store/useLearningStore';
import type { BookItem, BookList } from '../../../../../../contracts/books';
import { BookListDetail } from './BookListDetail';
import { BookListEditor } from './BookListEditor';
import { BookListNavigation } from './BookListNavigation';
import { BookPicker } from './BookPicker';

export interface BookListsViewProps {
  books: BookItem[];
  onOpenBook: (bookId: string) => void;
  onRequestCreate: () => void;
}

export function BookListsView({ books, onOpenBook, onRequestCreate }: BookListsViewProps) {
  const bookLists = useLearningStore((state) => state.bookLists);
  const updateBookList = useLearningStore((state) => state.updateBookList);
  const deleteBookList = useLearningStore((state) => state.deleteBookList);
  const moveBookList = useLearningStore((state) => state.moveBookList);
  const setBookListBooks = useLearningStore((state) => state.setBookListBooks);
  const moveBookInList = useLearningStore((state) => state.moveBookInList);
  const removeBookFromList = useLearningStore((state) => state.removeBookFromList);
  const [selectedListId, setSelectedListId] = useState<string | null>(bookLists[0]?.id ?? null);
  const [editingList, setEditingList] = useState<BookList | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    if (selectedListId && bookLists.some((bookList) => bookList.id === selectedListId)) return;
    setSelectedListId(bookLists[0]?.id ?? null);
  }, [bookLists, selectedListId]);

  const selectedList = bookLists.find((bookList) => bookList.id === selectedListId) ?? null;
  const bookById = useMemo(() => new Map(books.map((book) => [book.id, book])), [books]);
  const selectedBooks =
    selectedList?.bookIds.flatMap((bookId) => {
      const book = bookById.get(bookId);
      return book ? [book] : [];
    }) ?? [];

  const handleDragStart = (start: DragStart, provided: ResponderProvided) => {
    const book = bookById.get(start.draggableId.slice('book-list-item:'.length));
    provided.announce(`已抓取《${book?.title ?? '未命名书籍'}》，使用方向键调整位置，空格键放下。`);
  };
  const handleDragUpdate = (update: DragUpdate, provided: ResponderProvided) => {
    provided.announce(
      update.destination
        ? `将移动到第 ${update.destination.index + 1} 位。`
        : '当前不在可放置区域。',
    );
  };
  const handleDragEnd = (result: DropResult, provided: ResponderProvided) => {
    if (!selectedList || !result.destination) {
      provided.announce('已取消拖动。');
      return;
    }
    if (result.source.index === result.destination.index) {
      provided.announce('书籍位置未改变。');
      return;
    }
    moveBookInList(selectedList.id, result.source.index, result.destination.index);
    const book = bookById.get(result.draggableId.slice('book-list-item:'.length));
    provided.announce(
      `已将《${book?.title ?? '未命名书籍'}》移动到第 ${result.destination.index + 1} 位。`,
    );
  };

  const removeList = () => {
    if (!selectedList) return;
    confirmDialog({
      title: '删除书单？',
      content: `“${selectedList.name}”会被删除，书籍本身和阅读记录不会受到影响。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: () => deleteBookList(selectedList.id),
    });
  };

  if (!bookLists.length) {
    return (
      <div className="library-empty [min-height:360px] [place-items:center] [align-content:center] [gap:16px]">
        <Empty title="还没有书单" description="创建书单，把同一本书加入不同的阅读主题或计划" />
        <Button icon={<IconPlus />} theme="solid" type="primary" onClick={onRequestCreate}>
          新建书单
        </Button>
      </div>
    );
  }

  return (
    <>
      <section
        className="book-lists-workspace min-w-0 [min-height:420px] [grid-template-columns:240px_minmax(0,_1fr)] [max-width:1180px] [margin:0_auto] overflow-hidden [background:var(--semi-color-bg-1)] mobile:min-h-0 mobile:[gap:12px] mobile:[overflow:visible] mobile:[background:transparent]"
        aria-label="书单"
      >
        <BookListNavigation
          bookLists={bookLists}
          selectedListId={selectedList?.id ?? null}
          onSelect={setSelectedListId}
          onMove={moveBookList}
        />

        {selectedList && (
          <BookListDetail
            bookList={selectedList}
            books={selectedBooks}
            onDragStart={handleDragStart}
            onDragUpdate={handleDragUpdate}
            onDragEnd={handleDragEnd}
            onEdit={() => setEditingList(selectedList)}
            onManageBooks={() => setPickerVisible(true)}
            onOpenBook={onOpenBook}
            onRemoveBook={(bookId) => removeBookFromList(selectedList.id, bookId)}
            onRemoveList={removeList}
          />
        )}
      </section>

      <BookListEditor
        visible={Boolean(editingList)}
        bookList={editingList}
        onCancel={() => setEditingList(null)}
        onSave={(values) => {
          if (editingList) updateBookList(editingList.id, values);
          setEditingList(null);
        }}
      />
      <BookPicker
        visible={pickerVisible}
        bookList={selectedList}
        books={books}
        onCancel={() => setPickerVisible(false)}
        onSave={(bookIds) => {
          if (selectedList) setBookListBooks(selectedList.id, bookIds);
          setPickerVisible(false);
        }}
      />
    </>
  );
}

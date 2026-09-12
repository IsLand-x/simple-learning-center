import { useCallback, useMemo, useState } from 'react';
import {
  IconDeleteStroked,
  IconFavoriteList,
  IconPlus,
  IconSearch,
  IconTop,
} from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Empty, Input, Typography } from '@douyinfe/semi-ui';
import { useNavigate } from 'react-router-dom';
import { ImportBooksButton } from '../components/ImportBooksButton';
import {
  BookCard,
  BookListEditor,
  BookListsView,
  LibraryBookContextMenu,
  TrashView,
  filterLibraryBooks,
  sortBooksByShelfOrder,
  type LibraryFilter,
  type LibraryBookContextMenuState,
  type LibrarySection,
} from '../features/library';
import { confirmMoveBookToTrash } from '../lib/confirmBookTrash';
import { createUuid } from '../lib/uuid';
import { useLearningStore } from '../store/useLearningStore';
import type { BookItem, BookList } from '../types';

const { Title, Text } = Typography;

export function LibraryPage() {
  const navigate = useNavigate();
  const books = useLearningStore((state) => state.books);
  const bookLists = useLearningStore((state) => state.bookLists);
  const trashedBooks = useLearningStore((state) => state.trashedBooks);
  const createBookList = useLearningStore((state) => state.createBookList);
  const setBookPinned = useLearningStore((state) => state.setBookPinned);
  const setBookListBooks = useLearningStore((state) => state.setBookListBooks);
  const trashBook = useLearningStore((state) => state.trashBook);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [section, setSection] = useState<LibrarySection>('shelf');
  const [createVisible, setCreateVisible] = useState(false);
  const [createForBookId, setCreateForBookId] = useState<string | null>(null);
  const [bookContextMenu, setBookContextMenu] = useState<LibraryBookContextMenuState | null>(null);

  const sortedBooks = useMemo(() => sortBooksByShelfOrder(books), [books]);
  const filteredBooks = useMemo(
    () => filterLibraryBooks(sortedBooks, filter, query),
    [filter, query, sortedBooks],
  );
  const pinnedBooks = useMemo(
    () => filteredBooks.filter((book) => Boolean(book.pinnedAt)),
    [filteredBooks],
  );
  const unpinnedBooks = useMemo(
    () => filteredBooks.filter((book) => !book.pinnedAt),
    [filteredBooks],
  );
  const bookListsByBookId = useMemo(() => {
    const listsByBookId = new Map<string, BookList[]>();
    bookLists.forEach((bookList) => {
      bookList.bookIds.forEach((bookId) => {
        const assignedLists = listsByBookId.get(bookId) ?? [];
        assignedLists.push(bookList);
        listsByBookId.set(bookId, assignedLists);
      });
    });
    return listsByBookId;
  }, [bookLists]);

  const openBook = (bookId: string) => navigate(`/books/${bookId}`);
  const closeBookContextMenu = useCallback(() => setBookContextMenu(null), []);
  const openCreateBookList = (bookId: string | null = null) => {
    setCreateForBookId(bookId);
    setCreateVisible(true);
  };
  const toggleBookList = (book: BookItem, bookList: BookList) => {
    const nextBookIds = bookList.bookIds.includes(book.id)
      ? bookList.bookIds.filter((bookId) => bookId !== book.id)
      : [...bookList.bookIds, book.id];
    setBookListBooks(bookList.id, nextBookIds);
  };
  const deleteBook = (book: BookItem) => {
    confirmMoveBookToTrash(book, (trashedBook) => {
      trashBook(book.id, trashedBook.deletedAt);
    });
  };
  const renderBookCard = (book: BookItem) => (
    <BookCard
      book={book}
      bookLists={bookListsByBookId.get(book.id) ?? []}
      key={book.id}
      onOpen={openBook}
      onOpenContextMenu={(contextBook, x, y) => setBookContextMenu({ book: contextBook, x, y })}
    />
  );

  return (
    <main className="library-page">
      <header className="library-header">
        <div>
          <Title heading={4}>我的书架</Title>
          <Text type="tertiary">
            {books.length} 本书 · {bookLists.length} 个书单 · 回收站 {trashedBooks.length} 本
          </Text>
        </div>
        <ImportBooksButton />
      </header>

      <div className={`library-toolbar${section !== 'shelf' ? ' library-toolbar--lists' : ''}`}>
        <div className="library-toolbar__primary">
          <ButtonGroup aria-label="切换书架与书单">
            <Button
              theme={section === 'shelf' ? 'solid' : 'borderless'}
              type="tertiary"
              onClick={() => setSection('shelf')}
            >
              书架
            </Button>
            <Button
              icon={<IconFavoriteList />}
              theme={section === 'lists' ? 'solid' : 'borderless'}
              type="tertiary"
              onClick={() => setSection('lists')}
            >
              书单
            </Button>
            <Button
              icon={<IconDeleteStroked />}
              theme={section === 'trash' ? 'solid' : 'borderless'}
              type="tertiary"
              onClick={() => setSection('trash')}
            >
              回收站
            </Button>
          </ButtonGroup>
          {section === 'shelf' && (
            <Input
              aria-label="搜索书名或作者"
              prefix={<IconSearch />}
              placeholder="搜索书名或作者"
              showClear
              value={query}
              onChange={setQuery}
              className="search-input"
            />
          )}
        </div>
        <div className="toolbar-actions">
          {section === 'shelf' ? (
            <ButtonGroup aria-label="书籍筛选">
              <Button
                theme={filter === 'all' ? 'solid' : 'borderless'}
                type="tertiary"
                onClick={() => setFilter('all')}
              >
                全部
              </Button>
              <Button
                theme={filter === 'reading' ? 'solid' : 'borderless'}
                type="tertiary"
                onClick={() => setFilter('reading')}
              >
                阅读中
              </Button>
              <Button
                theme={filter === 'finished' ? 'solid' : 'borderless'}
                type="tertiary"
                onClick={() => setFilter('finished')}
              >
                已读完
              </Button>
            </ButtonGroup>
          ) : section === 'lists' ? (
            <Button
              icon={<IconPlus />}
              theme="solid"
              type="primary"
              onClick={() => openCreateBookList()}
            >
              新建书单
            </Button>
          ) : null}
        </div>
      </div>

      {section === 'shelf' ? (
        filteredBooks.length ? (
          <div className="library-shelf" aria-label="书籍列表">
            {pinnedBooks.length > 0 && (
              <section className="library-book-section" aria-labelledby="pinned-books-title">
                <header className="library-book-section__header">
                  <span className="library-book-section__title" id="pinned-books-title">
                    <IconTop aria-hidden="true" />
                    <Text strong>置顶书籍</Text>
                  </span>
                  <Text size="small" type="tertiary">
                    {pinnedBooks.length}
                  </Text>
                </header>
                <div className="book-grid">{pinnedBooks.map(renderBookCard)}</div>
              </section>
            )}
            {unpinnedBooks.length > 0 && (
              <section
                aria-label={pinnedBooks.length > 0 ? undefined : '书籍列表'}
                aria-labelledby={pinnedBooks.length > 0 ? 'other-books-title' : undefined}
                className="library-book-section"
              >
                {pinnedBooks.length > 0 && (
                  <header className="library-book-section__header">
                    <span className="library-book-section__title" id="other-books-title">
                      <Text strong>其他书籍</Text>
                    </span>
                    <Text size="small" type="tertiary">
                      {unpinnedBooks.length}
                    </Text>
                  </header>
                )}
                <div className="book-grid">{unpinnedBooks.map(renderBookCard)}</div>
              </section>
            )}
          </div>
        ) : (
          <div className="library-empty">
            <Empty
              title="没有找到书籍"
              description={query ? '换个关键词试试' : '导入 EPUB 后就可以开始阅读'}
            />
          </div>
        )
      ) : section === 'lists' ? (
        <BookListsView
          books={sortedBooks}
          onOpenBook={openBook}
          onRequestCreate={() => openCreateBookList()}
        />
      ) : (
        <TrashView trashedBooks={trashedBooks} />
      )}

      <BookListEditor
        visible={createVisible}
        bookList={null}
        onCancel={() => {
          setCreateVisible(false);
          setCreateForBookId(null);
        }}
        onSave={({ name, note }) => {
          const timestamp = Date.now();
          createBookList({
            id: createUuid(),
            name,
            note,
            bookIds:
              createForBookId && books.some((book) => book.id === createForBookId)
                ? [createForBookId]
                : [],
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          setCreateVisible(false);
          setCreateForBookId(null);
        }}
      />
      <LibraryBookContextMenu
        bookLists={bookLists}
        menu={bookContextMenu}
        onClose={closeBookContextMenu}
        onDelete={deleteBook}
        onPinnedChange={(book, pinned) => setBookPinned(book.id, pinned)}
        onRequestCreateList={(book) => openCreateBookList(book.id)}
        onToggleBookList={toggleBookList}
      />
    </main>
  );
}

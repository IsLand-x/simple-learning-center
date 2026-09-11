import { useMemo, useState } from 'react';
import { IconDeleteStroked, IconFavoriteList, IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Empty, Input, Typography } from '@douyinfe/semi-ui';
import { useNavigate } from 'react-router-dom';
import { ImportBooksButton } from '../components/ImportBooksButton';
import {
  BookCard,
  BookListEditor,
  BookListsView,
  TrashView,
  filterLibraryBooks,
  sortBooksByUpdatedAt,
  type LibraryFilter,
  type LibrarySection,
} from '../features/library';
import { createUuid } from '../lib/uuid';
import { useLearningStore } from '../store/useLearningStore';

const { Title, Text } = Typography;

export function LibraryPage() {
  const navigate = useNavigate();
  const books = useLearningStore((state) => state.books);
  const bookLists = useLearningStore((state) => state.bookLists);
  const trashedBooks = useLearningStore((state) => state.trashedBooks);
  const createBookList = useLearningStore((state) => state.createBookList);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [section, setSection] = useState<LibrarySection>('shelf');
  const [createVisible, setCreateVisible] = useState(false);

  const sortedBooks = useMemo(() => sortBooksByUpdatedAt(books), [books]);
  const filteredBooks = useMemo(
    () => filterLibraryBooks(sortedBooks, filter, query),
    [filter, query, sortedBooks],
  );

  const openBook = (bookId: string) => navigate(`/books/${bookId}`);

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
              onClick={() => setCreateVisible(true)}
            >
              新建书单
            </Button>
          ) : null}
        </div>
      </div>

      {section === 'shelf' ? (
        filteredBooks.length ? (
          <section className="book-grid" aria-label="书籍列表">
            {filteredBooks.map((book) => (
              <BookCard book={book} key={book.id} onOpen={openBook} />
            ))}
          </section>
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
          onRequestCreate={() => setCreateVisible(true)}
        />
      ) : (
        <TrashView trashedBooks={trashedBooks} />
      )}

      <BookListEditor
        visible={createVisible}
        bookList={null}
        onCancel={() => setCreateVisible(false)}
        onSave={({ name, note }) => {
          const timestamp = Date.now();
          createBookList({
            id: createUuid(),
            name,
            note,
            bookIds: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          setCreateVisible(false);
        }}
      />
    </main>
  );
}

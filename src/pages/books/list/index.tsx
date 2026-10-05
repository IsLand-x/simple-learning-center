import {
  IconDeleteStroked,
  IconFavoriteList,
  IconPlus,
  IconSearch,
  IconTop,
} from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Empty, Input, Typography } from '@douyinfe/semi-ui';
import type { BookItem } from '../../../../contracts/books';
import { LibraryBookContextMenu } from './components/BookLists/LibraryBookContextMenu';
import { ImportBooksButton } from './components/ImportBooksButton';
import { ArchivedBooksSection } from './components/Shelf/ArchivedBooksSection';
import { BookCard } from './components/Shelf/BookCard';
import { BookListEditor } from './components/BookLists/BookListEditor';
import { BookListsView } from './components/BookLists/BookListsView';
import { TrashView } from './components/TrashView';
import { useLibraryState } from './store/useLibraryState';

const { Title, Text } = Typography;

export function LibraryPage() {
  const page = useLibraryState();
  const renderBookCard = (book: BookItem) => (
    <BookCard
      book={book}
      bookLists={page.bookListsByBookId.get(book.id) ?? []}
      key={book.id}
      onOpen={page.openBook}
      onOpenContextMenu={(contextBook, x, y) =>
        page.setBookContextMenu({ book: contextBook, x, y })
      }
    />
  );

  return (
    <main className="library-page min-w-0 min-h-0 [background:var(--semi-color-bg-0)]">
      <header className="library-header justify-between [max-width:1180px] [gap:16px]">
        <div>
          <Title heading={4}>我的书架</Title>
          <Text type="tertiary">
            {page.books.length} 本书 · {page.bookLists.length} 个书单 · 回收站{' '}
            {page.trashedBooks.length} 本
          </Text>
        </div>
        <ImportBooksButton />
      </header>

      <div
        className={`library-toolbar justify-between [max-width:1180px] [gap:16px] mobile:[gap:8px] ${page.section !== 'shelf' ? ' library-toolbar--lists' : ''}`}
      >
        <div className="library-toolbar__primary min-w-0">
          <ButtonGroup aria-label="切换书架与书单">
            <Button
              theme={page.section === 'shelf' ? 'solid' : 'borderless'}
              type="tertiary"
              onClick={() => page.setSection('shelf')}
            >
              书架
            </Button>
            <Button
              icon={<IconFavoriteList />}
              theme={page.section === 'lists' ? 'solid' : 'borderless'}
              type="tertiary"
              onClick={() => page.setSection('lists')}
            >
              书单
            </Button>
            <Button
              icon={<IconDeleteStroked />}
              theme={page.section === 'trash' ? 'solid' : 'borderless'}
              type="tertiary"
              onClick={() => page.setSection('trash')}
            >
              回收站
            </Button>
          </ButtonGroup>
          {page.section === 'shelf' && (
            <Input
              aria-label="搜索书名或作者"
              prefix={<IconSearch />}
              placeholder="搜索书名或作者"
              showClear
              value={page.query}
              onChange={page.setQuery}
              className="search-input [width:300px] [min-width:300px] [max-width:100%] [@media(max-width:720px)]:w-full [@media(max-width:720px)]:min-w-0"
            />
          )}
        </div>
        <div className="toolbar-actions justify-between mobile:min-w-0 mobile:overflow-x-auto mobile:[scrollbar-width:none]">
          {page.section === 'shelf' ? (
            <ButtonGroup aria-label="书籍筛选">
              <Button
                theme={page.filter === 'all' ? 'solid' : 'borderless'}
                type="tertiary"
                onClick={() => page.setFilter('all')}
              >
                全部
              </Button>
              <Button
                theme={page.filter === 'reading' ? 'solid' : 'borderless'}
                type="tertiary"
                onClick={() => page.setFilter('reading')}
              >
                阅读中
              </Button>
              <Button
                theme={page.filter === 'finished' ? 'solid' : 'borderless'}
                type="tertiary"
                onClick={() => page.setFilter('finished')}
              >
                已读完
              </Button>
            </ButtonGroup>
          ) : page.section === 'lists' ? (
            <Button
              icon={<IconPlus />}
              theme="solid"
              type="primary"
              onClick={() => page.openCreateBookList()}
            >
              新建书单
            </Button>
          ) : null}
        </div>
      </div>

      {page.section === 'shelf' ? (
        page.filteredBooks.length || page.archivedCount ? (
          <div className="library-shelf" aria-label="书籍列表">
            {page.pinnedBooks.length > 0 && (
              <section className="library-book-section" aria-labelledby="pinned-books-title">
                <header className="library-book-section__header">
                  <span className="library-book-section__title" id="pinned-books-title">
                    <IconTop aria-hidden="true" />
                    <Text strong>置顶书籍</Text>
                  </span>
                  <Text size="small" type="tertiary">
                    {page.pinnedBooks.length}
                  </Text>
                </header>
                <div className="book-grid">{page.pinnedBooks.map(renderBookCard)}</div>
              </section>
            )}
            {page.unpinnedBooks.length > 0 && (
              <section
                aria-label={page.pinnedBooks.length > 0 ? undefined : '书籍列表'}
                aria-labelledby={page.pinnedBooks.length > 0 ? 'other-books-title' : undefined}
                className="library-book-section"
              >
                {page.pinnedBooks.length > 0 && (
                  <header className="library-book-section__header">
                    <span className="library-book-section__title" id="other-books-title">
                      <Text strong>其他书籍</Text>
                    </span>
                    <Text size="small" type="tertiary">
                      {page.unpinnedBooks.length}
                    </Text>
                  </header>
                )}
                <div className="book-grid">{page.unpinnedBooks.map(renderBookCard)}</div>
              </section>
            )}
            {page.archivedCount > 0 && (
              <ArchivedBooksSection
                key={`${page.query}:${page.filter}`}
                count={page.archivedCount}
                matchingCount={page.archivedBooks.length}
                filtered={Boolean(page.query.trim()) || page.filter !== 'all'}
              >
                {page.archivedBooks.map(renderBookCard)}
              </ArchivedBooksSection>
            )}
          </div>
        ) : (
          <div className="library-empty [min-height:360px] [place-items:center] [align-content:center] [gap:16px]">
            <Empty
              title="没有找到书籍"
              description={page.query ? '换个关键词试试' : '导入 EPUB 后就可以开始阅读'}
            />
          </div>
        )
      ) : page.section === 'lists' ? (
        <BookListsView
          books={page.sortedBooks}
          onOpenBook={page.openBook}
          onRequestCreate={() => page.openCreateBookList()}
        />
      ) : (
        <TrashView trashedBooks={page.trashedBooks} />
      )}

      <BookListEditor
        visible={page.createVisible}
        bookList={null}
        onCancel={page.cancelCreateBookList}
        onSave={page.saveBookList}
      />
      <LibraryBookContextMenu
        bookLists={page.bookLists}
        menu={page.bookContextMenu}
        onClose={page.closeBookContextMenu}
        onDelete={page.deleteBook}
        onArchivedChange={(book, archived) => page.setBookArchived(book.id, archived)}
        onPinnedChange={(book, pinned) => page.setBookPinned(book.id, pinned)}
        onRequestCreateList={(book) => page.openCreateBookList(book.id)}
        onToggleBookList={page.toggleBookList}
      />
    </main>
  );
}

import { IconDeleteStroked, IconFavoriteList, IconPlus, IconSearch } from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Empty, Input, Typography } from '@douyinfe/semi-ui';
import { ImportBooksButton } from './components/ImportBooksButton';
import { BookCard, BookListEditor, BookListsView, TrashView } from './components/index';
import { useLibraryPageStore } from './store/useLibraryPageStore';

const { Title, Text } = Typography;

export function LibraryPage() {
  const page = useLibraryPageStore();

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
              onClick={() => page.setCreateVisible(true)}
            >
              新建书单
            </Button>
          ) : null}
        </div>
      </div>

      {page.section === 'shelf' ? (
        page.filteredBooks.length ? (
          <section
            className="book-grid [gap:16px] [max-width:1180px] [margin:0_auto] mobile:[gap:18px_12px]"
            aria-label="书籍列表"
          >
            {page.filteredBooks.map((book) => (
              <BookCard book={book} key={book.id} onOpen={page.openBook} />
            ))}
          </section>
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
          onRequestCreate={() => page.setCreateVisible(true)}
        />
      ) : (
        <TrashView trashedBooks={page.trashedBooks} />
      )}

      <BookListEditor
        visible={page.createVisible}
        bookList={null}
        onCancel={() => page.setCreateVisible(false)}
        onSave={page.saveBookList}
      />
    </main>
  );
}

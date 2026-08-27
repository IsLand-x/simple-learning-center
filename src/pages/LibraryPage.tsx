import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button, ButtonGroup, Empty, Input, Progress, Tag, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconGridView, IconListView, IconSearch } from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router-dom';
import { ImportBooksButton } from '../components/ImportBooksButton';
import { formatFileSize, formatRelativeTime } from '../lib/format';
import { useLearningStore } from '../store/useLearningStore';
import type { BookItem } from '../types';

const { Title, Text } = Typography;
type Filter = 'all' | 'reading' | 'finished';

function BookCover({ book, index }: { book: BookItem; index: number }) {
  if (book.coverDataUrl) {
    return <img className="book-cover-image" src={book.coverDataUrl} alt={`${book.title} 封面`} />;
  }
  const tone = ['indigo', 'amber', 'teal'][index % 3];
  return (
    <div className={`book-cover book-cover--${tone}`} aria-hidden="true">
      <span className="book-cover__eyebrow">PERSONAL LIBRARY</span>
      <strong>{book.title}</strong>
      <span>{book.author}</span>
    </div>
  );
}

export function LibraryPage() {
  const navigate = useNavigate();
  const books = useLearningStore((state) => state.books);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const filteredBooks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return [...books]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .filter((book) => {
        if (filter === 'reading' && (book.progress <= 0 || book.progress >= 100)) return false;
        if (filter === 'finished' && book.progress < 100) return false;
        if (!normalized) return true;
        return `${book.title} ${book.author}`.toLocaleLowerCase().includes(normalized);
      });
  }, [books, filter, query]);

  const openBook = (bookId: string) => navigate(`/books/${bookId}`);
  const handleBookKeyDown = (event: KeyboardEvent<HTMLElement>, bookId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openBook(bookId);
  };

  return (
    <main className="library-page">
      <header className="library-header">
        <div>
          <Title heading={4}>我的书架</Title>
          <Text type="tertiary">{books.length} 本书 · EPUB 文件仅保存在此设备</Text>
        </div>
        <ImportBooksButton />
      </header>

      <div className="library-toolbar">
        <Input
          aria-label="搜索书名或作者"
          prefix={<IconSearch />}
          placeholder="搜索书名或作者"
          showClear
          value={query}
          onChange={setQuery}
          className="search-input"
        />
        <div className="toolbar-actions">
          <ButtonGroup aria-label="书籍筛选">
            <Button theme={filter === 'all' ? 'solid' : 'borderless'} type="tertiary" onClick={() => setFilter('all')}>全部</Button>
            <Button theme={filter === 'reading' ? 'solid' : 'borderless'} type="tertiary" onClick={() => setFilter('reading')}>阅读中</Button>
            <Button theme={filter === 'finished' ? 'solid' : 'borderless'} type="tertiary" onClick={() => setFilter('finished')}>已读完</Button>
          </ButtonGroup>
          <ButtonGroup>
            <Tooltip content="卡片视图">
              <Button aria-label="卡片视图" icon={<IconGridView />} theme={view === 'grid' ? 'solid' : 'borderless'} type="tertiary" onClick={() => setView('grid')} />
            </Tooltip>
            <Tooltip content="列表视图">
              <Button aria-label="列表视图" icon={<IconListView />} theme={view === 'list' ? 'solid' : 'borderless'} type="tertiary" onClick={() => setView('list')} />
            </Tooltip>
          </ButtonGroup>
        </div>
      </div>

      {filteredBooks.length ? (
        <section className={`book-grid book-grid--${view}`} aria-label="书籍列表">
          {filteredBooks.map((book, index) => (
            <article
              className="book-card"
              key={book.id}
              role="button"
              tabIndex={0}
              aria-label={`打开《${book.title}》，已读 ${book.progress}%`}
              onClick={() => openBook(book.id)}
              onKeyDown={(event) => handleBookKeyDown(event, book.id)}
            >
              <BookCover book={book} index={index} />
              <div className="book-meta">
                <div className="book-meta__topline">
                  <Tag size="small" color="blue">EPUB</Tag>
                  <Text size="small" type="tertiary">{formatRelativeTime(book.updatedAt)}</Text>
                </div>
                <Text strong ellipsis={{ showTooltip: true }}>{book.title}</Text>
                <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>{book.author}</Text>
                <Text size="small" type="tertiary" className="book-file-size">{formatFileSize(book.fileSize)}</Text>
                <div className="book-progress">
                  <div className="book-progress__label">
                    <Text size="small" type="tertiary">{book.currentChapter || '尚未开始'}</Text>
                    <Text size="small">{Math.round(book.progress)}%</Text>
                  </div>
                  <Progress percent={book.progress} showInfo={false} stroke="var(--semi-color-primary)" />
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="library-empty">
          <Empty title="没有找到书籍" description={query ? '换个关键词试试' : '导入 EPUB 后就可以开始阅读'} />
        </div>
      )}
    </main>
  );
}

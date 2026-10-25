import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BookItem } from '../../../../../contracts/books';
import { useReaderNavigation } from './useReaderNavigation';

const state = vi.hoisted(() => ({ updateBook: vi.fn(), upsertReadingSession: vi.fn() }));
vi.mock('../../../../store/useLearningStore', () => ({
  useLearningStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('./useReadingSession', () => ({ useReadingSession: vi.fn() }));
const book: BookItem = {
  id: 'navigation-book',
  kind: 'epub',
  title: '导航测试',
  author: '测试',
  fileName: '',
  fileSize: 0,
  createdAt: 1,
  updatedAt: 1,
  progress: 0,
  currentCfi: 'epubcfi(/6/2!/4/2:0)',
  currentChapter: '第一章',
  currentPage: 1,
  toc: [
    { id: 'first', label: '第一章', href: 'chapter-1' },
    { id: 'second', label: '第二章', href: 'chapter-2' },
  ],
};
const liveCfi = 'epubcfi(/6/2!/4/8:15)';
const targetCfi = 'epubcfi(/6/4!/4/2:0)';
let navigation: ReturnType<typeof useReaderNavigation>;
const readerRef = {
  current: {
    next: vi.fn(),
    prev: vi.fn(),
    display: vi.fn(),
    clearSelection: vi.fn(),
    getCurrentText: () => '',
    locateSource: vi.fn(),
  },
};
const closeToc = vi.fn();
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
function Reader({ currentBook = book }: { currentBook?: BookItem }) {
  navigation = useReaderNavigation(currentBook, readerRef, closeToc);
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  readerRef.current.locateSource.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Reader />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('术语、高亮和评论跳转保留尚未落盘的精确位置，连续目录跳转不覆盖它', () => {
  act(() => navigation.handleLocationChange({ cfi: liveCfi, href: 'chapter-1', page: 3 }));
  // An unrelated metadata update must not replace the pending live location.
  act(() => root.render(<Reader currentBook={{ ...book, title: '新标题' }} />));
  act(() => navigation.jumpToCfi(targetCfi));
  act(() => navigation.handleLocationChange({ cfi: targetCfi, href: 'chapter-2', page: 8 }));
  act(() => navigation.selectToc(book.toc[0]));
  act(() => navigation.returnToProgress?.());
  expect(readerRef.current.display).toHaveBeenLastCalledWith(liveCfi);
  expect(navigation.returnToProgress).toBeUndefined();
  expect(closeToc).toHaveBeenCalled();
});

it('思维导图按跳转前的位置返回，定位失败不会创建返回入口', async () => {
  const source = {
    cfi: targetCfi,
    passageId: 'passage',
    quote: '原文',
    chapter: '第二章',
    href: 'chapter-2',
  };
  readerRef.current.locateSource.mockRejectedValueOnce(new Error('找不到原文'));
  await act(async () => {
    await expect(navigation.locateSource(source)).rejects.toThrow('找不到原文');
  });
  expect(navigation.returnToProgress).toBeUndefined();
  act(() => navigation.handleLocationChange({ cfi: liveCfi, href: 'chapter-1' }));
  readerRef.current.locateSource.mockImplementationOnce(async () => {
    navigation.handleLocationChange({ cfi: targetCfi, href: 'chapter-2' });
  });
  await act(async () => {
    await navigation.locateSource(source);
  });
  act(() => navigation.returnToProgress?.());
  expect(readerRef.current.display).toHaveBeenLastCalledWith(liveCfi);
});

it('换书清除返回位置，异步定位完成不能把旧书的位置带到新书', async () => {
  act(() => navigation.jumpToCfi(targetCfi));
  let finish!: () => void;
  readerRef.current.locateSource.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const locating = navigation.locateSource({
    cfi: targetCfi,
    passageId: 'passage',
    quote: '原文',
    chapter: '第二章',
    href: 'chapter-2',
  });
  act(() => root.render(<Reader currentBook={{ ...book, id: 'another-book' }} />));
  expect(navigation.returnToProgress).toBeUndefined();
  await act(async () => {
    finish();
    await locating;
  });
  expect(navigation.returnToProgress).toBeUndefined();
});

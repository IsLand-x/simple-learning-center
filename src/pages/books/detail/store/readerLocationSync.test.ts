import { describe, expect, it } from 'vitest';
import {
  isUserDrivenLocation,
  locationFromBook,
  reportedReaderLocation,
  shouldPersistReportedLocation,
} from './readerLocationSync';
import type { BookItem } from '../../../../../contracts/books';

const opened: BookItem = {
  id: 'book',
  kind: 'epub',
  title: '书',
  author: '',
  fileName: '',
  fileSize: 1,
  createdAt: 1,
  updatedAt: 10,
  progress: 5,
  currentCfi: 'epubcfi(/opened)',
  currentChapter: '第一章',
  currentPage: 1,
  toc: [],
};

describe('isUserDrivenLocation', () => {
  it('keeps a page turn and a requested directory jump, and ignores open or reflow', () => {
    expect(isUserDrivenLocation('page', false)).toBe(true);
    expect(isUserDrivenLocation('snap', false)).toBe(true);
    expect(isUserDrivenLocation('scroll', false)).toBe(true);
    expect(isUserDrivenLocation('navigation', true)).toBe(true);
    expect(isUserDrivenLocation('navigation', false)).toBe(false);
    expect(isUserDrivenLocation('anchor', true)).toBe(true);
    expect(isUserDrivenLocation('anchor', false)).toBe(false);
    expect(isUserDrivenLocation('selection', true)).toBe(false);
    expect(isUserDrivenLocation(undefined, false)).toBe(false);
  });
});

describe('shouldPersistReportedLocation', () => {
  it('ignores reflow of the open page and a later page-count change', () => {
    const stored = {
      ...opened,
      progress: 48,
      currentCfi: 'epubcfi(/remote)',
      currentChapter: '第三章',
      updatedAt: 30,
    };
    const reflow = reportedReaderLocation(opened, {
      cfi: 'epubcfi(/normalized)',
      progress: opened.progress,
      chapter: opened.currentChapter,
      page: 4,
      totalPages: 20,
    });
    const again = reportedReaderLocation(opened, {
      cfi: 'epubcfi(/resized)',
      progress: opened.progress,
      chapter: opened.currentChapter,
      page: 5,
      totalPages: 40,
    });
    expect(
      shouldPersistReportedLocation(
        locationFromBook(opened),
        locationFromBook(stored),
        null,
        reflow,
      ),
    ).toBe(false);
    expect(
      shouldPersistReportedLocation(
        locationFromBook(opened),
        locationFromBook(stored),
        reflow,
        again,
      ),
    ).toBe(false);
  });

  it('keeps the first real page turn even before another sample exists', () => {
    const stored = { ...opened, progress: 48, currentCfi: 'epubcfi(/remote)', updatedAt: 30 };
    const turned = reportedReaderLocation(opened, {
      cfi: 'epubcfi(/turned)',
      progress: 0.62,
      chapter: '第二章',
      page: 8,
    });
    expect(
      shouldPersistReportedLocation(
        locationFromBook(opened),
        locationFromBook(stored),
        null,
        turned,
      ),
    ).toBe(true);
  });
});

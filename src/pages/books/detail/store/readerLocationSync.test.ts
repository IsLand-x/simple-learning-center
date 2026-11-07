import { describe, expect, it } from 'vitest';
import {
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

describe('shouldPersistReportedLocation', () => {
  it('does not save the open page again after another device stored a newer location', () => {
    const stored = { ...opened, progress: 48, currentCfi: 'epubcfi(/remote)', updatedAt: 30 };
    const echo = reportedReaderLocation(opened, {
      cfi: 'epubcfi(/normalized)',
      progress: 0.051,
      chapter: opened.currentChapter,
      page: 2,
    });
    expect(
      shouldPersistReportedLocation(
        locationFromBook(opened),
        opened.updatedAt,
        locationFromBook(stored),
        stored.updatedAt,
        null,
        echo,
      ),
    ).toBe(false);
  });

  it('saves a later page turn from the same open reader', () => {
    const stored = { ...opened, progress: 48, currentCfi: 'epubcfi(/remote)', updatedAt: 30 };
    const first = reportedReaderLocation(opened, { cfi: opened.currentCfi, progress: 0.05 });
    const turned = reportedReaderLocation(stored, {
      cfi: 'epubcfi(/turned)',
      progress: 0.62,
      chapter: '第二章',
      page: 8,
    });
    expect(
      shouldPersistReportedLocation(
        locationFromBook(opened),
        opened.updatedAt,
        locationFromBook(stored),
        stored.updatedAt,
        first,
        turned,
      ),
    ).toBe(true);
  });
});

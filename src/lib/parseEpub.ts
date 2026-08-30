import ePub from 'epubjs';
import type { NavItem } from 'epubjs';
import type { BookItem, TocItem } from '../types';
import { createUuid } from './uuid';

function mapToc(items: NavItem[]): TocItem[] {
  return items.map((item, index) => ({
    id: item.id || `${index}-${item.href}`,
    href: item.href,
    label: item.label.trim(),
    subitems: item.subitems?.length ? mapToc(item.subitems) : undefined,
  }));
}

async function readCover(book: ReturnType<typeof ePub>) {
  try {
    const coverPath = await book.loaded.cover;
    if (!coverPath) return undefined;
    return await book.archive.getBase64(coverPath);
  } catch {
    return undefined;
  }
}

export async function readEpubCover(data: ArrayBuffer) {
  const book = ePub(data);
  try {
    await book.ready;
    return await readCover(book);
  } finally {
    book.destroy();
  }
}

export async function parseEpubFile(file: File): Promise<{ item: BookItem; data: ArrayBuffer }> {
  const data = await file.arrayBuffer();
  const book = ePub(data);

  try {
    await book.ready;
    const [metadata, navigation, coverDataUrl] = await Promise.all([
      book.loaded.metadata,
      book.loaded.navigation,
      readCover(book),
    ]);
    const firstChapter = navigation.toc[0]?.label?.trim() || '开始阅读';
    const id = createUuid();

    return {
      data,
      item: {
        id,
        kind: 'epub',
        title: metadata.title?.trim() || file.name.replace(/\.epub$/i, ''),
        author: metadata.creator?.trim() || '未知作者',
        fileName: file.name,
        fileSize: file.size,
        coverDataUrl: coverDataUrl ?? '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        progress: 0,
        currentChapter: firstChapter,
        currentPage: 1,
        toc: mapToc(navigation.toc),
      },
    };
  } finally {
    book.destroy();
  }
}

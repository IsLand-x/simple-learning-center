import ePub from 'epubjs';
import type { NavItem } from 'epubjs';
import type { BookItem, TocItem } from '../types';

function mapToc(items: NavItem[]): TocItem[] {
  return items.map((item, index) => ({
    id: item.id || `${index}-${item.href}`,
    href: item.href,
    label: item.label.trim(),
    subitems: item.subitems?.length ? mapToc(item.subitems) : undefined,
  }));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('封面读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function readCover(book: ReturnType<typeof ePub>) {
  try {
    const coverUrl = await book.coverUrl();
    if (!coverUrl) return undefined;
    const response = await fetch(coverUrl);
    if (!response.ok) return undefined;
    return await blobToDataUrl(await response.blob());
  } catch {
    return undefined;
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
    const id = crypto.randomUUID();

    return {
      data,
      item: {
        id,
        kind: 'epub',
        title: metadata.title?.trim() || file.name.replace(/\.epub$/i, ''),
        author: metadata.creator?.trim() || '未知作者',
        fileName: file.name,
        fileSize: file.size,
        coverDataUrl,
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

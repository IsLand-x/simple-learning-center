import type { TocItem } from '../../../../../../contracts/books';
import type { ChapterVideo } from '../../../../../../contracts/reading';
import { normalizeBookHref, sameBookFile } from '../AssistantPanel/chapterIndex';

export function currentVideoChapter(
  chapters: Array<TocItem & { path: string[] }>,
  activeHref: string | undefined,
  currentChapter: string,
) {
  const exact =
    activeHref &&
    chapters.find((chapter) => {
      const left = normalizeBookHref(chapter.href);
      const right = normalizeBookHref(activeHref);
      return left === right || left.endsWith('/' + right) || right.endsWith('/' + left);
    });
  if (exact) return exact.path[0];
  const inFile = activeHref
    ? chapters.filter((chapter) => sameBookFile(chapter.href, activeHref))
    : [];
  const titled = (inFile.length ? inFile : chapters).filter(
    (chapter) => chapter.label === currentChapter,
  );
  if (titled.length === 1) return titled[0].path[0];
  const roots = new Set(inFile.map((chapter) => chapter.path[0]));
  if (roots.size === 1) return inFile[0].path[0];
  if (!activeHref && !currentChapter) return chapters[0]?.id;
  return undefined;
}

export function videoTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function chapterVideoParts(
  videos: ChapterVideo[],
  chapters: Array<TocItem & { path: string[] }>,
) {
  const order = new Map(chapters.map((chapter, index) => [chapter.id, index]));
  const scopes = new Set<string | undefined>();
  return [...videos]
    .sort((left, right) => right.generatedAt - left.generatedAt || left.id.localeCompare(right.id))
    .filter((video) => {
      if (scopes.has(video.chapterId)) return false;
      scopes.add(video.chapterId);
      return true;
    })
    .sort((left, right) => {
      const position = (video: ChapterVideo) =>
        video.chapterId === undefined ? -1 : (order.get(video.chapterId) ?? chapters.length);
      return position(left) - position(right) || left.id.localeCompare(right.id);
    });
}

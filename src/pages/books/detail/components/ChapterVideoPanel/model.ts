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

export function describeChapterVideoScope(
  toc: TocItem[],
  chapters: Array<TocItem & { path: string[] }>,
  chapterId: string | undefined,
) {
  if (chapterId === undefined) {
    const topChapters = toc.length > 0 ? toc : chapters.filter((item) => item.path.length === 1);
    return {
      scopeTitle: '全书导读',
      scopeSummary:
        topChapters.length > 0
          ? `覆盖全书 ${topChapters.length} 个大章，提炼全书核心问题、主干脉络与章节关联，生成 1 集全书导读视频（排在选集 P1）。`
          : '覆盖全书正文，提炼核心问题与主干脉络，生成 1 集全书导读视频（排在选集 P1）。',
      includedChapters: topChapters.map((item) => item.label),
    };
  }
  const target = chapters.find((item) => item.id === chapterId);
  const subchapters = chapters.filter(
    (item) => item.id !== chapterId && item.path[0] === (target?.path[0] ?? chapterId),
  );
  const label = target?.label ?? '当前章节';
  return {
    scopeTitle: label,
    scopeSummary:
      subchapters.length > 0
        ? `包含《${label}》及其下属 ${subchapters.length} 个小节，按“问题引入 → 核心机制 → 逐步推导与算例 → 常见误区 → 要点归纳”合并生成 1 集完整课程视频。`
        : `包含《${label}》完整章节正文，按“问题引入 → 核心机制 → 逐步推导与算例 → 常见误区 → 要点归纳”生成 1 集完整课程视频。`,
    includedChapters:
      subchapters.length > 0 ? [label, ...subchapters.map((item) => item.label)] : [label],
  };
}

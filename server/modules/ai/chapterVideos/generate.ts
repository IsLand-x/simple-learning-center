import { randomUUID } from 'node:crypto';
import type { ChapterVideo, MindMapNode } from '../../../../contracts/reading.js';
import type { AiChatContext, AiChatRunner, AiResult } from '../jobs/types.js';
import { loadBookPassages } from '../../books/search.js';
import { chapterPassages, findMindMapChapter, validateMindMapOutline } from '../mindmaps/model.js';
import { validateStoryboard } from './model.js';
import { renderChapterVideo } from './render.js';
import { planCompleteChapter } from './planner.js';
import type { VideoScriptRequest } from './planner.js';

export async function generateChapterVideo(
  context: AiChatContext,
  chapterId: string | undefined,
  runChat: AiChatRunner,
  signal: AbortSignal,
  onProgress: (progress: AiResult) => void,
): Promise<ChapterVideo> {
  const book = context.book!;
  const chapter = chapterId ? findMindMapChapter(book.toc, chapterId) : undefined;
  const allPassages = await loadBookPassages(book);
  const passages = chapterId ? chapterPassages(book, chapterId, allPassages) : allPassages;
  const batches: (typeof passages)[] = [];
  let batch: typeof passages = [];
  let size = 0;
  for (const passage of passages) {
    if (size + passage.text.length > 12_000 && batch.length) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(passage);
    size += passage.text.length;
  }
  if (batch.length) batches.push(batch);
  // Process every passage in the selected scope; never silently sample a long book.
  if (batches.length > 64) throw new Error('所选正文过长，请选择某个大章生成视频');
  const chapterTitle = chapter?.label ?? '全书导读';
  let calls = 0;
  const request: VideoScriptRequest = async (content, phase, stage) => {
    signal.throwIfAborted();
    if (content.length > 65_000) throw new Error('课程资料超过单次模型审校容量，请选择较小章节');
    calls++;
    if (calls > 160) throw new Error('课程生成达到模型调用上限，请选择较小章节');
    onProgress({ content: stage, dialogueContent: [] });
    const result = await runChat({
      ...context,
      purpose: phase === 'mindmap' ? 'mindmap' : 'chapter-video',
      videoPhase: phase === 'mindmap' || phase === 'overview' ? undefined : phase,
      book: { ...book, toc: chapter ? [chapter] : book.toc },
      conversationId: `${context.conversationId}:${calls}`,
      messages: [
        { role: 'user', content: `书籍：${book.title}\n范围：${chapterTitle}\n${content}` },
      ],
      currentText: '',
      notes: [],
      highlights: [],
      readingSessions: [],
      assistantPrompt: '',
      signal,
      onNoteChange: () => undefined,
      onProgress: (progress) =>
        onProgress({ content: stage, dialogueContent: progress.dialogueContent }),
    });
    signal.throwIfAborted();
    return result.content;
  };
  if (chapter) {
    const script = await planCompleteChapter(passages, batches, request);
    return renderChapterVideo(
      {
        id: randomUUID(),
        version: 1,
        bookId: book.id,
        chapterId,
        chapterTitle,
        ...script,
        durationSeconds: 0,
        hasAudio: Boolean(context.videoNarration),
        model: context.model,
        generatedAt: Date.now(),
      },
      book.title,
      context.videoNarration,
      signal,
      (stage) => onProgress({ content: stage, dialogueContent: [] }),
    );
  }
  let outlines: MindMapNode[][] = [];
  for (const [index, entries] of batches.entries()) {
    const result = await request(
      JSON.stringify(entries.map((entry) => ({ passageId: entry.id, text: entry.text }))),
      'mindmap',
      `正在提炼知识点 ${index + 1}/${batches.length}`,
    );
    outlines.push(validateMindMapOutline(result, entries, 'video'));
  }
  const outlineText = (nodes: MindMapNode[]) =>
    JSON.stringify(
      nodes.map((node) => ({
        title: node.title,
        sources: node.sources.map(({ passageId, quote }) => ({ passageId, quote })),
      })),
    );
  while (outlines.length > 1) {
    const merged: MindMapNode[][] = [];
    for (let index = 0; index < outlines.length; index += 4) {
      const nodes = outlines.slice(index, index + 4).flat();
      const ids = new Set(nodes.flatMap((node) => node.sources.map((source) => source.passageId)));
      const allowed = passages.filter((passage) => ids.has(passage.id));
      const result = await request(
        `合并这些已核验的观点，保留主要结论、限定条件与真实出处：\n${outlineText(nodes)}`,
        'mindmap',
        `正在组织课程重点 ${Math.floor(index / 4) + 1}/${Math.ceil(outlines.length / 4)}`,
      );
      merged.push(validateMindMapOutline(result, allowed, 'video'));
    }
    outlines = merged;
  }
  const outline = outlines[0];
  const allowedIds = new Set(
    outline.flatMap((node) => node.sources.map((source) => source.passageId)),
  );
  const storyboard = validateStoryboard(
    await request(
      `请把以下已核验观点编排成老师讲解的图解视频：\n${outlineText(outline)}`,
      'overview',
      '正在编排讲稿与图解分镜',
    ),
    passages.filter((passage) => allowedIds.has(passage.id)),
  );
  const video: ChapterVideo = {
    id: randomUUID(),
    version: 1,
    bookId: book.id,
    ...(chapterId ? { chapterId } : {}),
    chapterTitle,
    ...storyboard,
    durationSeconds: 0,
    hasAudio: Boolean(context.videoNarration),
    model: context.model,
    generatedAt: Date.now(),
  };
  return renderChapterVideo(video, book.title, context.videoNarration, signal, (stage) =>
    onProgress({ content: stage, dialogueContent: [] }),
  );
}

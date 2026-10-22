import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { BookItem, TocItem } from '../../../../contracts/books.js';
import type { MindMapNode, MindMapSource } from '../../../../contracts/reading.js';
import type { BookPassage } from '../../books/search.js';

export function findMindMapChapter(items: TocItem[], id: string): TocItem | undefined {
  const matches: TocItem[] = [];
  const visit = (entries: TocItem[]) =>
    entries.forEach((item) => {
      if (item.id === id) matches.push(item);
      visit(item.subitems ?? []);
    });
  visit(items);
  if (matches.length === 1) return matches[0];
  // Old NCX imports can contain duplicate IDs. Resolve the stable TOC path instead.
  const canonical = /^toc:([0-9.]+):(.*)$/s.exec(id);
  if (!canonical) return undefined;
  let entries = items;
  let result: TocItem | undefined;
  for (const part of canonical[1].split('.')) {
    result = entries[Number(part)];
    if (!result) return undefined;
    entries = result.subitems ?? [];
  }
  return result?.href === canonical[2] ? { ...result, id } : undefined;
}

export function mindMapId(bookId: string, chapterId: string) {
  return `mindmap:${createHash('sha256')
    .update(JSON.stringify([bookId, chapterId]))
    .digest('hex')
    .slice(0, 24)}`;
}

const outlineSchema = z.object({
  nodes: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        parent: z.string().max(100).nullable(),
        title: z.string().trim().min(1).max(100),
        sources: z
          .array(
            z.object({ passageId: z.string().max(100), quote: z.string().trim().min(8).max(300) }),
          )
          .min(1)
          .max(3),
      }),
    )
    .min(1)
    .max(60),
});

export function validateMindMapOutline(
  content: string,
  passages: BookPassage[],
  scope: string,
): MindMapNode[] {
  const clean = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let raw: unknown;
  try {
    raw = JSON.parse(clean);
  } catch {
    throw new Error('模型未返回有效的导图数据，请重新生成');
  }
  const parsed = outlineSchema.safeParse(raw);
  if (!parsed.success) throw new Error('导图节点或原文引用格式不正确，请重新生成');
  const byKey = new Map(parsed.data.nodes.map((node) => [node.key, node]));
  if (byKey.size !== parsed.data.nodes.length) throw new Error('导图节点标识重复，请重新生成');
  const sourceById = new Map(passages.map((passage) => [passage.id, passage]));
  const rootId = `${scope}:root`;
  const idFor = (key: string) =>
    `${scope}:${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
  return parsed.data.nodes.map((node) => {
    const ancestors = new Set([node.key]);
    let parent = node.parent;
    while (parent !== null) {
      if (ancestors.has(parent) || ancestors.size > 5 || !byKey.has(parent))
        throw new Error('导图层级无效，请重新生成');
      ancestors.add(parent);
      parent = byKey.get(parent)!.parent;
    }
    const sources: MindMapSource[] = node.sources.map((reference) => {
      const passage = sourceById.get(reference.passageId);
      if (
        !passage ||
        !passage.text.replace(/\s/g, '').includes(reference.quote.replace(/\s/g, ''))
      ) {
        throw new Error('导图包含无法核验的原文引用，请重新生成');
      }
      const normalized = passage.text.replace(/\s/g, '');
      const needle = reference.quote.replace(/\s/g, '');
      if (normalized.indexOf(needle, normalized.indexOf(needle) + 1) >= 0) {
        throw new Error('导图引用在段落中重复，无法唯一定位，请重新生成');
      }
      return {
        passageId: passage.id,
        quote: reference.quote,
        href: passage.href,
        chapter: passage.chapter,
        ...(passage.cfi ? { cfi: passage.cfi } : {}),
      };
    });
    return {
      id: idFor(node.key),
      parentId: node.parent === null ? rootId : idFor(node.parent),
      title: node.title,
      sources,
    };
  });
}

export function chapterPassages(book: BookItem, chapterId: string, passages: BookPassage[]) {
  if (!findMindMapChapter(book.toc, chapterId)) throw new Error('章节不存在或不属于当前书籍');
  const scoped = passages.filter((passage) => passage.chapterIds?.includes(chapterId));
  if (!scoped.length) throw new Error('该章节尚无可定位的正文，请重新打开思维导图以更新书内索引');
  if (book.kind === 'epub' && scoped.some((passage) => !passage.cfi))
    throw new Error('章节定位索引尚未就绪，请重新打开书籍');
  return scoped;
}

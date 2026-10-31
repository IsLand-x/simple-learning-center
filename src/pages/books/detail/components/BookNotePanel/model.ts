import type { NoteItem } from '../../../../../../contracts/reading';

function markdownNoteTitle(content: string, fallback = '未命名笔记') {
  const heading = content.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 120);

  const firstLine = content
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*(?:[-+*>]|\d+\.)\s*/, '')
        .replace(/[*_`~#[\]]/g, '')
        .trim(),
    )
    .find(Boolean);
  return (firstLine || fallback).slice(0, 120);
}
export function mergeBookNoteContent(notes: NoteItem[]) {
  const orderedNotes = [...notes].sort((left, right) => left.createdAt - right.createdAt);
  if (orderedNotes.length <= 1) return orderedNotes[0]?.content ?? '';
  return orderedNotes
    .map((note) => {
      const content = note.content.trim();
      const title = note.title.trim() || markdownNoteTitle(content);
      return content ? `## ${title}\n\n${content}` : `## ${title}`;
    })
    .join('\n\n---\n\n');
}

import type { NoteItem } from '../../../../../../contracts/reading';
import { markdownNoteTitle } from '../../../../../util/notes/markdownNotes';

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

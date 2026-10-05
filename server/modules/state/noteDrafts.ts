import type { NoteItem } from '../../../contracts/reading.js';
import type { PersistedState } from './types.js';
import { statusError } from '../../infrastructure/http/errors.js';

function change(base: string, text: string) {
  let start = 0;
  while (start < base.length && start < text.length && base[start] === text[start]) start++;
  let end = base.length;
  let textEnd = text.length;
  while (end > start && textEnd > start && base[end - 1] === text[textEnd - 1]) {
    end--;
    textEnd--;
  }
  return { start, end, text: text.slice(start, textEnd) };
}

export function mergeNoteDraft(base: string, draft: string, current: string) {
  if (draft === base || draft === current) return current;
  if (current === base) return draft;
  const local = change(base, draft);
  const remote = change(base, current);
  // Two additions at the same point are both retained, including an empty note.
  if (local.start === remote.start && local.end === local.start && remote.end === remote.start)
    return base.slice(0, local.start) + remote.text + '\n\n' + local.text + base.slice(local.end);
  if (local.end <= remote.start || remote.end <= local.start) {
    const [first, second] = [local, remote].sort((a, b) => a.start - b.start);
    return (
      base.slice(0, first.start) +
      first.text +
      base.slice(first.end, second.start) +
      second.text +
      base.slice(second.end)
    );
  }
  // Overlapping edits cannot be resolved safely. Keep the server version and
  // visibly preserve the complete local draft for the reader to reconcile.
  return `${current}\n\n---\n\n### 并发修改：保留的本地草稿\n\n${draft}`;
}

export function mergeClientNoteDrafts(
  incoming: PersistedState,
  current: PersistedState | null,
  base: unknown,
) {
  if (
    !Array.isArray(base) ||
    base.some((note) => !note || typeof note.id !== 'string' || typeof note.content !== 'string')
  )
    throw statusError(400, '笔记基准格式不正确');
  const baseline = new Map((base as NoteItem[]).map((note) => [note.id, note]));
  const stored = new Map((current?.state.notes ?? []).map((note) => [note.id, note]));
  incoming.state.notes = (incoming.state.notes ?? []).map((note) => {
    const existing = stored.get(note.id);
    if (!existing || existing.bookId !== note.bookId) return note;
    const original = baseline.get(note.id);
    const content = mergeNoteDraft(original?.content ?? '', note.content, existing.content);
    if (content === existing.content)
      return {
        ...existing,
        updatedAt: Math.max(
          existing.updatedAt,
          note.updatedAt + (note.content === existing.content ? 0 : 1),
        ),
      };
    return {
      ...note,
      content,
      updatedAt: Math.max(Date.now(), note.updatedAt + 1, existing.updatedAt + 1),
    };
  });
  return incoming;
}

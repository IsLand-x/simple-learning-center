import { statusError } from './errors.mjs';
import { mutatePersistedState, readPersistedState } from './storage.mjs';

const MAX_NOTE_CONTENT_LENGTH = 100_000;

function requireIdentifier(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw statusError(400, `${label}不正确`);
  }
  return value.trim();
}

function requireContent(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw statusError(400, '笔记正文不能为空');
  }
  if (value.length > MAX_NOTE_CONTENT_LENGTH) {
    throw statusError(400, `笔记正文不能超过 ${MAX_NOTE_CONTENT_LENGTH} 个字符`);
  }
  return value;
}

function notesForBook(state, bookId) {
  return (Array.isArray(state.notes) ? state.notes : [])
    .filter((note) => note?.bookId === bookId)
    .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0));
}

function publicNote(note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    fileName: note.fileName,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export async function readBookNotes(bookId) {
  const normalizedBookId = requireIdentifier(bookId, '书籍');
  const persistedState = await readPersistedState({
    hydrateNote: (note) => note?.bookId === normalizedBookId,
  });
  if (!persistedState?.state) throw statusError(409, '服务端尚未初始化');
  return notesForBook(persistedState.state, normalizedBookId).map(publicNote);
}

export async function createBookNote(bookId, bookTitle, content) {
  const normalizedBookId = requireIdentifier(bookId, '书籍');
  const normalizedBookTitle = requireIdentifier(bookTitle, '书名');
  const normalizedContent = requireContent(content);
  return mutatePersistedState((persistedState) => {
    if (notesForBook(persistedState.state, normalizedBookId).length) {
      throw statusError(409, '当前书籍已经存在阅读笔记，请先读取笔记并使用 update_book_note 更新');
    }
    const timestamp = Date.now();
    const note = {
      id: `book-note:${normalizedBookId}`,
      bookId: normalizedBookId,
      title: `${normalizedBookTitle} · 阅读笔记`,
      content: normalizedContent,
      fileName: 'reading-note.md',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const notes = Array.isArray(persistedState.state.notes) ? persistedState.state.notes : [];
    persistedState.state.notes = [note, ...notes];
    return publicNote(note);
  });
}

export async function updateBookNote(bookId, noteId, expectedUpdatedAt, content) {
  const normalizedBookId = requireIdentifier(bookId, '书籍');
  const normalizedNoteId = requireIdentifier(noteId, '笔记');
  const normalizedContent = requireContent(content);
  if (!Number.isSafeInteger(expectedUpdatedAt) || expectedUpdatedAt < 0) {
    throw statusError(400, '笔记版本不正确');
  }
  return mutatePersistedState((persistedState) => {
    const notes = Array.isArray(persistedState.state.notes) ? persistedState.state.notes : [];
    const index = notes.findIndex((note) => (
      note?.id === normalizedNoteId && note?.bookId === normalizedBookId
    ));
    if (index < 0) throw statusError(404, '找不到当前书籍的指定笔记');
    const current = notes[index];
    if (Number(current.updatedAt || 0) !== expectedUpdatedAt) {
      throw statusError(409, '笔记已在其他位置更新，请重新调用 read_book_notes 后再编辑');
    }
    const updated = {
      ...current,
      content: normalizedContent,
      updatedAt: Math.max(Date.now(), expectedUpdatedAt + 1),
    };
    persistedState.state.notes = notes.map((note, noteIndex) => (
      noteIndex === index ? updated : note
    ));
    return publicNote(updated);
  });
}

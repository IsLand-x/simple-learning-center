import { Typography } from '@douyinfe/semi-ui';
import { useEffect, useMemo } from 'react';
import { MarkdownNoteEditor } from '../../../../../components/notes/MarkdownNoteEditor';
import { synchronizeLearningState } from '../../../../../store/learningStateSync';
import { useLearningStore } from '../../../../../store/useLearningStore';
import type { BookItem } from '../../../../../../contracts/books';
import { mergeBookNoteContent } from './model';

const { Text } = Typography;

export function BookNotePanel({ book }: { book: BookItem }) {
  useEffect(() => {
    void synchronizeLearningState(['notes']).catch((error) => {
      console.warn('读取最新阅读笔记失败', error);
    });
  }, [book.id]);
  const allNotes = useLearningStore((state) => state.notes);
  const setBookNoteContent = useLearningStore((state) => state.setBookNoteContent);
  const content = useMemo(
    () => mergeBookNoteContent(allNotes.filter((note) => note.bookId === book.id)),
    [allNotes, book.id],
  );

  return (
    <div className="right-panel__body min-h-0 notes-panel book-note-panel">
      <div className="markdown-note-editor min-h-0">
        <MarkdownNoteEditor
          key={book.id}
          ariaLabel={`编辑《${book.title}》的 Markdown 笔记`}
          content={content}
          onChange={(markdown) => setBookNoteContent(book.id, book.title, markdown)}
        />
        <div className="markdown-note-editor__footer min-w-0 justify-between">
          <Text size="small" type="tertiary">
            自动保存为 Markdown
          </Text>
        </div>
      </div>
    </div>
  );
}

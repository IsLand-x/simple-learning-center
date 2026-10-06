import { Empty } from '@douyinfe/semi-ui';
import { useMemo } from 'react';
import type { BookItem } from '../../../../../../contracts/books';
import type { HighlightItem } from '../../../../../../contracts/reading';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useGlossaryExplanation } from './useGlossaryExplanation';
import { GlossaryTerm } from './GlossaryTerm';

export function GlossaryPanel({
  book,
  onJump,
  getCurrentText,
}: {
  book: BookItem;
  onJump: (term: HighlightItem) => void;
  getCurrentText: () => string;
}) {
  const ai = useGlossaryExplanation(book.id, getCurrentText);
  const highlights = useLearningStore((state) => state.highlights);
  const terms = useMemo(
    () => highlights.filter((item) => item.bookId === book.id && item.kind === 'term'),
    [highlights, book.id],
  );
  return (
    <div className="right-panel__body glossary-panel min-h-0 min-w-0 overflow-auto [padding:8px_12px]">
      {terms.length ? (
        terms.map((term) => (
          <GlossaryTerm
            key={term.id}
            term={term}
            onJump={onJump}
            busy={ai.status(term.id).busy}
            error={ai.status(term.id).error}
            configured={ai.configured}
            onGenerate={() => void ai.generate(term)}
          />
        ))
      ) : (
        <Empty title="还没有术语" description="选中文字，点击“添加到术语表”" />
      )}
    </div>
  );
}

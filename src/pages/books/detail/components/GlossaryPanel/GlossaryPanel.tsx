import { Empty, Input } from '@douyinfe/semi-ui';
import { useMemo, useState } from 'react';
import type { BookItem } from '../../../../../../contracts/books';
import type { HighlightItem } from '../../../../../../contracts/reading';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { type GlossaryExplanationState, useGlossaryExplanation } from './useGlossaryExplanation';
import { GlossaryTerm } from './GlossaryTerm';
import { sortAnnotations, type AnnotationSortOrder } from '../annotationSorting';

export function GlossaryPanel({
  book,
  onJump,
  getCurrentText,
  sortOrder,
  glossaryAi,
}: {
  book: BookItem;
  onJump: (term: HighlightItem) => void;
  getCurrentText: () => string;
  sortOrder: AnnotationSortOrder;
  glossaryAi?: GlossaryExplanationState;
}) {
  const [query, setQuery] = useState('');
  const keyword = query.trim().toLocaleLowerCase();
  const fallbackAi = useGlossaryExplanation(book.id, getCurrentText);
  const ai = glossaryAi ?? fallbackAi;
  const highlights = useLearningStore((state) => state.highlights);
  const terms = useMemo(
    () =>
      sortAnnotations(
        highlights.filter((item) => item.bookId === book.id && item.kind === 'term'),
        sortOrder,
      ),
    [highlights, book.id, sortOrder],
  );
  const filtered = terms.filter((item) =>
    [item.text, item.chapter, item.comment, item.definition].some((value) =>
      value?.toLocaleLowerCase().includes(keyword),
    ),
  );
  return (
    <div className="right-panel__body glossary-panel flex min-h-0 min-w-0 flex-col [padding:8px_12px]">
      <Input
        aria-label="搜索术语"
        placeholder="搜索术语、释义或章节"
        value={query}
        onChange={setQuery}
        showClear
        className="shrink-0 [margin-bottom:8px] mobile:[&_input]:text-[16px]"
      />
      <div className="glossary-panel__list min-h-0 min-w-0 flex-1 overflow-auto">
        {filtered.length ? (
          filtered.map((term) => (
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
          <Empty
            title={keyword ? '没有匹配结果' : '还没有术语'}
            description={keyword ? '试试其他关键词，或清空搜索' : '选中文字，点击“添加到术语表”'}
          />
        )}
      </div>
    </div>
  );
}

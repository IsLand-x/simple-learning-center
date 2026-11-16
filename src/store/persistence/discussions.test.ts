import { expect, it } from 'vitest';
import type { DiscussionItem } from '../../../contracts/reading';
import { mergeDiscussions } from './discussions';
import { createReadingActions } from '../actions/readingActions';
import { useLearningStore } from '../useLearningStore';

const original: DiscussionItem = {
  id: 'discussion',
  bookId: 'book',
  question: '为什么？',
  content: '**回答**',
  source: {
    passageId: '',
    chapter: '第一章',
    href: 'chapter.xhtml',
    cfi: 'epubcfi(/6/2)',
    quote: '',
  },
  createdAt: 1,
  updatedAt: 2,
};
it('keeps edits and deletions when stale or legacy snapshots arrive', () => {
  expect(mergeDiscussions([original], [])).toEqual([original]);
  const edited = { ...original, content: '编辑后的内容', updatedAt: 4 };
  expect(mergeDiscussions([edited], [original])).toEqual([edited]);
  const deleted = { ...edited, deletedAt: 5, content: '' };
  expect(mergeDiscussions([deleted], [edited])).toEqual([deleted]);
});
it('saves content and exact source and prevents stale editors reviving deletions', () => {
  let state = { ...useLearningStore.getInitialState() };
  const actions = createReadingActions((change) => {
    state = { ...state, ...(typeof change === 'function' ? change(state) : change) };
  });
  actions.saveDiscussion(original);
  expect(state.discussions[0].source).toEqual(original.source);
  actions.saveDiscussion({ ...state.discussions[0], content: '可编辑内容' });
  expect(state.discussions[0].content).toBe('可编辑内容');
  actions.deleteDiscussion(original.id);
  actions.saveDiscussion(original);
  expect(state.discussions[0].deletedAt).toBeGreaterThan(state.discussions[0].updatedAt);
});

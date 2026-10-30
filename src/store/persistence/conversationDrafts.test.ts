import { expect, it } from 'vitest';
import { mergeConversationDrafts } from './conversationDrafts';
import { mergeLearningState } from './mergeLearningState';
import { useLearningStore } from '../useLearningStore';

const first = { resourceId: 'book', conversationId: 'one', text: '问题', updatedAt: 1 };
it('keeps the newest draft per resource and session, including sent empty drafts', () => {
  expect(
    mergeConversationDrafts(
      [{ ...first, text: '', updatedAt: 3 }],
      [first, { ...first, conversationId: 'two' }, { ...first, resourceId: 'rss:item' }],
    ),
  ).toEqual([
    { ...first, text: '', updatedAt: 3 },
    { ...first, conversationId: 'two' },
    { ...first, resourceId: 'rss:item' },
  ]);
});
it('hydrates drafts without overwriting more recent typing', () => {
  const current = {
    ...useLearningStore.getInitialState(),
    conversationDrafts: [{ ...first, updatedAt: 2 }],
  };
  expect(mergeLearningState({ conversationDrafts: [first] }, current).conversationDrafts).toEqual(
    current.conversationDrafts,
  );
});

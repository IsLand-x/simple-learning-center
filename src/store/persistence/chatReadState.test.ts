import { describe, expect, it } from 'vitest';
import { useLearningStore } from '../useLearningStore';
import { createConversationActions } from '../actions/conversationActions';
import { migrateLearningState } from './migrateLearningState';
import { mergeLearningState } from './mergeLearningState';
import type { ChatMessage } from '../../types';

const reply: ChatMessage = {
  id: 'reply',
  bookId: 'book',
  conversationId: 'session',
  role: 'assistant',
  content: '回复',
  createdAt: 1,
};

describe('chat read receipts', () => {
  it('migrates legacy replies as read without changing users or existing receipts', () => {
    const chats = [
      reply,
      { ...reply, id: 'read', readAt: 12 },
      { ...reply, id: 'user', role: 'user' as const },
    ];
    expect(migrateLearningState({ chats }, 32).chats).toEqual([
      { ...reply, readAt: 1 },
      chats[1],
      chats[2],
    ]);
    expect(migrateLearningState({ chats: [reply] }, 33).chats).toEqual([reply]);
  });
  it('marks only selected assistant replies and preserves receipt times', () => {
    let state = {
      ...useLearningStore.getInitialState(),
      chats: [
        reply,
        { ...reply, id: 'read', readAt: 12 },
        { ...reply, id: 'user', role: 'user' as const },
        { ...reply, id: 'other' },
      ],
    };
    const actions = createConversationActions((change) => {
      state = { ...state, ...(typeof change === 'function' ? change(state) : change) };
    });
    actions.markChatMessagesRead(['reply', 'read', 'user']);
    expect(state.chats[0].readAt).toBeGreaterThan(1);
    expect(state.chats[1].readAt).toBe(12);
    expect(state.chats[2].readAt).toBeUndefined();
    expect(state.chats[3].readAt).toBeUndefined();
  });
  it('merges read receipts monotonically without reviving deleted messages', () => {
    const current = { ...useLearningStore.getInitialState(), chats: [{ ...reply, readAt: 10 }] };
    expect(mergeLearningState({ chats: [reply] }, current).chats[0].readAt).toBe(10);
    expect(mergeLearningState({ chats: [{ ...reply, readAt: 20 }] }, current).chats[0].readAt).toBe(
      20,
    );
    expect(mergeLearningState({ chats: [] }, current).chats).toEqual([]);
  });
});

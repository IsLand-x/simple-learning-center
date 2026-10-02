import { describe, expect, it } from 'vitest';
import type { AiJob } from '../../../../../api/ai/type';

import type { ChatMessage } from '../../../../../../contracts/ai';
import { resolveReaderAiActivity } from './activity';

const reply: ChatMessage = {
  id: 'reply',
  bookId: 'book',
  conversationId: 'unread-session',
  role: 'assistant',
  content: '回复',
  createdAt: 1,
};
const job: AiJob = {
  id: 'job',
  bookId: 'book',
  conversationId: 'running-session',
  userMessageId: 'user',
  assistantMessageId: 'reply',
  status: 'running',
  revision: 1,
  content: '',
  dialogueContent: [],
  createdAt: 1,
  updatedAt: 1,
};

describe('reader AI activity', () => {
  it('prioritizes any running or queued session over unread replies', () => {
    for (const status of ['queued', 'running'] as const) {
      expect(resolveReaderAiActivity('book', [{ ...job, status }], [reply])).toEqual({
        status: 'running',
        conversationId: 'running-session',
      });
    }
  });
  it('keeps unread replies from other conversations until they are read', () => {
    expect(resolveReaderAiActivity('book', [{ ...job, status: 'completed' }], [reply]).status).toBe(
      'unread',
    );
    expect(
      resolveReaderAiActivity(
        'book',
        [],
        [
          { ...reply, readAt: 10 },
          { ...reply, id: 'other', conversationId: 'other-session' },
        ],
      ),
    ).toEqual({ status: 'unread', conversationId: 'other-session' });
    expect(resolveReaderAiActivity('book', [], [{ ...reply, readAt: 10 }]).status).toBe('idle');
  });
  it('ignores other books, user messages, failed and cancelled jobs', () => {
    expect(resolveReaderAiActivity('other-book', [job], [reply]).status).toBe('idle');
    for (const status of ['failed', 'cancelled'] as const) {
      expect(
        resolveReaderAiActivity('book', [{ ...job, status }], [{ ...reply, role: 'user' }]).status,
      ).toBe('idle');
    }
  });
});

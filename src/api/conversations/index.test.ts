import { expect, it } from 'vitest';
import { ConversationsApi } from './index';
import { ApiTransport } from '../http/transport';

it('revalidates summary and message pages and encodes resource identifiers', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = new ConversationsApi(
    new ApiTransport(async (path, init) => {
      calls.push({ path: String(path), init });
      if (new Headers(init?.headers).has('If-None-Match'))
        return new Response(null, { status: 304 });
      return new Response(JSON.stringify({ sessions: [], messages: [], nextCursor: null }), {
        headers: { ETag: '"revision"' },
      });
    }),
  );
  const first = await api.list('book:中文/章节');
  expect(await api.list('book:中文/章节')).toEqual(first);
  expect(new Headers(calls[1].init?.headers).get('If-None-Match')).toBe('"revision"');
  expect(new URL(calls[0].path, 'https://test.invalid').searchParams.get('bookId')).toBe(
    'book:中文/章节',
  );
  await api.messages('book', 'session/one', 'message:two');
  expect(calls[2].path).toContain('/session%2Fone/messages?');
  expect(new URL(calls[2].path, 'https://test.invalid').searchParams.get('before')).toBe(
    'message:two',
  );
});

it('uses explicit mutation requests rather than replacing a conversation snapshot', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = new ConversationsApi(
    new ApiTransport(async (path, init) => {
      calls.push({ path: String(path), init });
      return new Response(null, { status: 204 });
    }),
  );
  await api.update('one', { model: 'test' });
  await api.markRead('one', ['message']);
  await api.delete('one');
  expect(calls.map((call) => call.init?.method)).toEqual(['PATCH', 'POST', 'DELETE']);
  expect(calls.every((call) => call.path.startsWith('/api/conversations/'))).toBe(true);
  expect(JSON.parse(String(calls[1].init?.body))).toEqual({ messageIds: ['message'] });
});

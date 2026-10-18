import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const directory = await mkdtemp(join(tmpdir(), 'learning-conversations-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { createApp } = await import('../../app.js');
const { writePersistedState, readPersistedState } = await import('../state/stateStore.js');
after(() => rm(directory, { recursive: true, force: true }));
const session = (id, bookId = 'book') => ({ id, bookId, title: id, createdAt: 1, updatedAt: 3 });
const message = (index, conversationId = 'one', bookId = 'book') => ({
  id: `message-${String(index).padStart(3, '0')}`,
  bookId,
  conversationId,
  role: index % 2 ? 'assistant' : 'user',
  content: `消息 ${index}`,
  createdAt: 2,
  dialogueContent: [{ type: 'text', text: '只在消息详情返回的过程'.repeat(100) }],
});
const app = createApp({ mode: 'local', serveFrontend: false });
const jsonRequest = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('摘要按资源分页，不携带正文；消息相同时间戳分页无遗漏，支持压缩、ETag与鉴权', async () => {
  await writePersistedState({
    version: 38,
    state: {
      books: [{ id: 'book', title: '测试书籍', kind: 'demo' }],
      notes: [],
      chatSessions: [session('one'), session('two'), session('other', 'rss:other')],
      chats: [
        ...Array.from({ length: 65 }, (_, i) => message(i)),
        message(100, 'other', 'rss:other'),
      ],
    },
  });
  const initial = await app.request('/api/conversations?bookId=book&limit=1');
  assert.equal(initial.status, 200);
  const first = await initial.json();
  assert.equal(first.sessions.length, 1);
  assert.equal(first.sessions[0].id, 'one');
  assert.equal(first.sessions[0].messageCount, 65);
  assert.equal(first.sessions[0].unreadCount, 32);
  assert.equal(JSON.stringify(first).includes('只在消息详情'), false);
  const second = await (
    await app.request(`/api/conversations?bookId=book&limit=1&cursor=${first.nextCursor}`)
  ).json();
  assert.deepEqual(
    second.sessions.map((s) => s.id),
    ['two'],
  );
  assert.equal(second.nextCursor, null);
  const response = await app.request('/api/conversations/one/messages?bookId=book&limit=50');
  const page = await response.json();
  assert.equal(page.messages.length, 50);
  const older = await (
    await app.request(`/api/conversations/one/messages?bookId=book&before=${page.nextCursor}`)
  ).json();
  assert.equal(older.messages.length, 15);
  assert.equal(new Set([...page.messages, ...older.messages].map((m) => m.id)).size, 65);
  assert.equal(older.nextCursor, null);
  assert.equal((await app.request('/api/conversations/one/messages?bookId=rss:other')).status, 200);
  assert.deepEqual(
    (await (await app.request('/api/conversations/one/messages?bookId=rss:other')).json()).messages,
    [],
  );
  assert.equal((await app.request('/api/conversations?bookId=book&limit=0')).status, 400);
  assert.equal((await app.request('/api/conversations?bookId=book&cursor=missing')).status, 400);
  assert.equal(
    (await app.request('/api/conversations/one/messages?bookId=book&before=missing')).status,
    400,
  );
  assert.equal((await app.request('/api/conversations')).status, 400);
  const etag = initial.headers.get('ETag');
  assert.equal(
    (
      await app.request('/api/conversations?bookId=book&limit=1', {
        headers: { 'If-None-Match': etag },
      })
    ).status,
    304,
  );
  const compressed = await app.request('/api/conversations/one/messages?bookId=book', {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  assert.equal(compressed.headers.get('Content-Encoding'), 'gzip');
  assert.deepEqual(
    JSON.parse(gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString()),
    page,
  );
  const remote = createApp({ mode: 'remote', password: 'test-only', serveFrontend: false });
  for (const [url, options] of [
    ['/api/conversations?bookId=book', {}],
    ['/api/conversations/one/messages?bookId=book', {}],
    ['/api/conversations/one', { method: 'DELETE' }],
    ['/api/conversations/one/read', jsonRequest('POST', { messageIds: ['message-001'] })],
  ])
    assert.equal((await remote.request(url, options)).status, 401);
});

test('显式已读、模型修改和删除不会覆盖其他会话，旧快照不能复活删除的会话', async () => {
  const stale = await readPersistedState();
  assert.equal(
    (
      await app.request(
        '/api/conversations/one/read',
        jsonRequest('POST', { messageIds: ['message-001', 'message-002'] }),
      )
    ).status,
    204,
  );
  const read = await readPersistedState();
  assert.ok(read.state.chats.find((m) => m.id === 'message-001').readAt);
  assert.equal(read.state.chats.find((m) => m.id === 'message-002').readAt, undefined);
  const previousTime = read.state.chats.find((m) => m.id === 'message-001').readAt;
  await app.request(
    '/api/conversations/one/read',
    jsonRequest('POST', { messageIds: ['message-001'] }),
  );
  assert.equal(
    (await readPersistedState()).state.chats.find((m) => m.id === 'message-001').readAt,
    previousTime,
  );
  assert.equal(
    (
      await app.request(
        '/api/conversations/one',
        jsonRequest('PATCH', { model: 'new-model', provider: 'api:test' }),
      )
    ).status,
    204,
  );
  assert.equal(
    (await app.request('/api/conversations/one', jsonRequest('PATCH', { bookId: 'other' }))).status,
    400,
  );
  assert.equal((await app.request('/api/conversations/one', { method: 'DELETE' })).status, 204);
  assert.equal(
    (await app.request('/api/state/conversations', jsonRequest('PUT', stale))).status,
    204,
  );
  const saved = await readPersistedState();
  assert.equal(
    saved.state.chatSessions.some((s) => s.id === 'one'),
    false,
  );
  assert.equal(
    saved.state.chats.some((m) => m.conversationId === 'one'),
    false,
  );
  assert.ok(saved.state.chatSessions.some((s) => s.id === 'other'));
  assert.ok(saved.state.chats.some((m) => m.conversationId === 'other'));
  assert.equal(
    (
      await app.request(
        '/api/conversations/one/read',
        jsonRequest('POST', { messageIds: ['message-001'] }),
      )
    ).status,
    404,
  );
  assert.equal((await stat(join(directory, 'state.json'))).mode & 0o777, 0o600);
  assert.ok(
    JSON.parse(
      await readFile(join(directory, 'state.json'), 'utf8'),
    ).persistedState.deletedConversationIds.includes('one'),
  );
});

test('旧对话接口在同一文件版本内复用序列化快照，304 不再克隆消息列表', async () => {
  const clone = globalThis.structuredClone;
  let messageClones = 0;
  globalThis.structuredClone = (value, options) => {
    if (Array.isArray(value) && value.some((item) => item?.conversationId)) messageClones++;
    return clone(value, options);
  };
  try {
    const first = await app.request('/api/state/conversations');
    assert.equal(first.status, 200);
    const before = messageClones;
    assert.ok(before > 0);
    const unchanged = await app.request('/api/state/conversations', {
      headers: { 'If-None-Match': first.headers.get('ETag') },
    });
    assert.equal(unchanged.status, 304);
    assert.equal(messageClones, before);
  } finally {
    globalThis.structuredClone = clone;
  }
});

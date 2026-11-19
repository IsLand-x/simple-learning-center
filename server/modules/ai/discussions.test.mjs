import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentSystemPrompt,
} from '@earendil-works/pi-ai';

test('Agent 将当前 session 的完整对话整理为可编辑的问答讨论', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'learning-center-ai-discussions-'));
  process.env.LEARNING_CENTER_DATA_DIR = directory;
  const { createDiscussionTools } = await import('./discussions.js');
  const { runServerAiChat } = await import('./chat.js');
  const { readPersistedState, writePersistedState, mutatePersistedState } =
    await import('../state/stateStore.js');
  const { protectClientState } = await import('../state/compatibility/clientState.js');
  const { piTool } = await import('./toolDefinition.js');
  const book = {
    id: 'book',
    title: '测试书',
    currentChapter: '第一章',
    currentCfi: 'epubcfi(/6/2!/4/2/1:0)',
  };
  const messages = Array.from({ length: 46 }, (_, index) => ({
    id: `message-${index}`,
    bookId: 'book',
    conversationId: 'session',
    role: index % 2 ? 'assistant' : 'user',
    content: index % 2 ? `答案 ${index}` : `问题 ${index}`,
    ...(index === 0 ? { quote: { text: '书中原文', chapter: '第一章' } } : {}),
    createdAt: index + 1,
  }));
  const request = {
    id: 'save-request',
    bookId: 'book',
    conversationId: 'session',
    role: 'user',
    content: '保存到对话',
    createdAt: 100,
  };
  const entry = {
    source_message_id: 'message-0',
    question: '第一个问题的核心是什么？',
    answer: '结合追问整理后的结论。\n\n> 书中原文',
  };
  let changes = 0;
  const tools = createDiscussionTools({
    book,
    conversationId: 'session',
    userMessageId: request.id,
    onChange: () => changes++,
  });
  try {
    await writePersistedState({
      version: 42,
      state: {
        books: [book],
        chatSessions: [
          { id: 'session', bookId: 'book', title: '当前对话', createdAt: 1, updatedAt: 100 },
          { id: 'other', bookId: 'book', title: '其他对话', createdAt: 1, updatedAt: 1 },
        ],
        chats: [
          ...messages,
          request,
          { ...messages[0], id: 'other-question', conversationId: 'other' },
          { ...messages[0], id: 'future-question', createdAt: 101 },
        ],
        discussions: [],
      },
    });
    const staleSnapshot = await readPersistedState();

    await t.test('分页覆盖四十条以前的问题，排除其他 session、当前指令及后续消息', async () => {
      const collected = [];
      let offset = 0;
      for (;;) {
        const page = await tools.read_current_conversation.execute({ offset });
        collected.push(...page.messages);
        assert.equal(page.total, 46);
        if (!page.hasMore) break;
        offset = page.nextOffset;
      }
      assert.deepEqual(
        collected.map((item) => item.id),
        messages.map((item) => item.id),
      );
      assert.deepEqual(collected[0].quote, messages[0].quote);
    });

    await t.test('自然语言请求通过 PiAgent 工具写入问答并报告变更', async () => {
      const faux = fauxProvider({ tokensPerSecond: 0 });
      faux.setResponses([
        (context) => {
          assert.match(getCurrentSystemPrompt(context.messages), /保存到对话.*总结对话/);
          return fauxAssistantMessage(fauxToolCall('read_current_conversation', {}), {
            stopReason: 'toolUse',
          });
        },
        fauxAssistantMessage(fauxToolCall('read_current_conversation', { offset: 20 }), {
          stopReason: 'toolUse',
        }),
        fauxAssistantMessage(fauxToolCall('read_current_conversation', { offset: 40 }), {
          stopReason: 'toolUse',
        }),
        fauxAssistantMessage(fauxToolCall('save_conversation_discussions', { entries: [entry] }), {
          stopReason: 'toolUse',
        }),
        fauxAssistantMessage('已保存 1 个问题到讨论。'),
      ]);
      const models = createModels();
      models.setProvider(faux.provider);
      const result = await runServerAiChat({
        config: { baseUrl: 'https://example.invalid/v1' },
        model: 'mock',
        conversationId: 'session',
        userMessageId: request.id,
        purpose: 'chat',
        resourceType: 'book',
        messages: [request],
        book,
        currentText: '',
        notes: [],
        highlights: [],
        readingSessions: [],
        webSearchConfig: {},
        runtimeFactory: () => ({ models, model: faux.getModel() }),
        onDiscussionChange: () => changes++,
      });
      assert.match(result.content, /已保存/);
      assert.equal(changes, 1);
      const saved = (await readPersistedState()).state.discussions[0];
      assert.equal(saved.question, entry.question);
      assert.match(saved.content, /^## 问题\n\n.*\n\n## 答案\n\n结合追问/);
      assert.equal(saved.source.quote, '书中原文');
      assert.equal(saved.conversationId, 'session');
      await writePersistedState(staleSnapshot, false, (incoming, current) =>
        protectClientState((state) => state, incoming, current),
      );
      assert.equal((await readPersistedState()).state.discussions.length, 1);
    });

    await t.test('重复和并发调用保留手动编辑及删除，每个原始问题仅保存一份', async () => {
      await mutatePersistedState((persisted) => {
        persisted.state.discussions[0].content = '用户修改后的答案';
      });
      const duplicate = await tools.save_conversation_discussions.execute({ entries: [entry] });
      assert.equal(duplicate.results[0].status, 'already_saved');
      assert.equal((await readPersistedState()).state.discussions[0].content, '用户修改后的答案');
      const next = { ...entry, source_message_id: 'message-2', question: '第二个问题？' };
      const results = await Promise.all([
        tools.save_conversation_discussions.execute({ entries: [next] }),
        tools.save_conversation_discussions.execute({ entries: [next] }),
      ]);
      assert.deepEqual(results.map((item) => item.results[0].status).sort(), [
        'already_saved',
        'saved',
      ]);
      assert.equal(changes, 2);
      await mutatePersistedState((persisted) => {
        persisted.state.discussions[0].deletedAt = Date.now();
      });
      assert.equal(
        (await tools.save_conversation_discussions.execute({ entries: [entry] })).results[0].status,
        'deleted',
      );
      assert.equal(changes, 2);
    });

    await t.test('参数或来源无效时整批拒绝，取消和会话删除后不写入', async () => {
      const save = tools.save_conversation_discussions;
      await assert.rejects(
        piTool('save_conversation_discussions', save).execute('invalid', {
          entries: [{ ...entry, answer: '  ' }],
        }),
        /不能为空/,
      );
      for (const source_message_id of ['other-question', request.id, 'message-1']) {
        await assert.rejects(
          save.execute({
            entries: [
              { ...entry, source_message_id: 'message-4' },
              { ...entry, source_message_id },
            ],
          }),
          /当前 session/,
        );
      }
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        save.execute(
          { entries: [{ ...entry, source_message_id: 'message-4' }] },
          controller.signal,
        ),
        { name: 'AbortError' },
      );
      assert.equal((await readPersistedState()).state.discussions.length, 2);
      await mutatePersistedState((persisted) => {
        persisted.state.chatSessions = [];
      });
      await assert.rejects(
        save.execute({ entries: [{ ...entry, source_message_id: 'message-4' }] }),
        /会话已删除/,
      );
      assert.equal((await readPersistedState()).state.discussions.length, 2);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiJob } from './ai/type';
import type { ApiFetch } from './http/type';
import { AiApi } from './ai';
import { AuthApi } from './auth';
import { BooksApi } from './books';
import { AUTHENTICATION_REQUIRED_EVENT, ServerApiError } from './http/errors';
import { ReadingApi } from './reading';
import { StateApi } from './state';
import { ApiTransport } from './http/transport';

function createTransport() {
  const fetcher = vi.fn<ApiFetch>();
  return { fetcher, transport: new ApiTransport(fetcher) };
}

function job(changes: Partial<AiJob> = {}): AiJob {
  return {
    id: 'job/中文',
    bookId: 'book',
    conversationId: 'conversation',
    userMessageId: 'user',
    assistantMessageId: 'assistant',
    status: 'running',
    revision: 1,
    content: '逐字接收中文',
    dialogueContent: [],
    createdAt: 1,
    updatedAt: 2,
    ...changes,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('HTTP 错误与认证协议', () => {
  it('受保护请求的 401 发出认证事件，登录失败只返回原始业务错误', async () => {
    const { fetcher, transport } = createTransport();
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    fetcher.mockResolvedValueOnce(
      Response.json({ error: '会话已过期', code: 'session_expired' }, { status: 401 }),
    );
    await expect(new StateApi(transport).readDomain('library')).rejects.toMatchObject({
      name: 'ServerApiError',
      message: '会话已过期',
      status: 401,
      code: 'session_expired',
    });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: AUTHENTICATION_REQUIRED_EVENT }),
    );

    dispatch.mockClear();
    fetcher.mockResolvedValueOnce(Response.json({ error: '账号或密码不正确' }, { status: 401 }));
    await expect(
      new AuthApi(transport).login({ username: 'reader', password: 'incorrect' }),
    ).rejects.toMatchObject({ message: '账号或密码不正确', status: 401 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('网络错误转为可展示错误，主动取消保留同一个 AbortError', async () => {
    const { fetcher, transport } = createTransport();
    fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(new AuthApi(transport).getSession()).rejects.toMatchObject({
      name: 'ServerApiError',
      status: 0,
      message: '无法连接学习中心服务，请确认服务已经启动',
    });

    const aborted = Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    fetcher.mockRejectedValueOnce(aborted);
    await expect(new AuthApi(transport).getSession()).rejects.toBe(aborted);
  });

  it('非 JSON 错误响应保留 HTTP 状态回退，204 登出不尝试解析 JSON', async () => {
    const { fetcher, transport } = createTransport();
    fetcher.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(new AuthApi(transport).getSession()).rejects.toMatchObject({
      message: '服务器请求失败（502）',
      status: 502,
    });
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(new AuthApi(transport).logout()).resolves.toBeUndefined();
  });
});

describe('状态快照协议', () => {
  it('首次空目录、带 ETag 的快照及 304 不混淆，也不解析无正文响应', async () => {
    const { fetcher, transport } = createTransport();
    const api = new StateApi(transport);
    const snapshot = { version: 33, state: { books: [], bookLists: [] } };
    fetcher
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json(snapshot, { headers: { ETag: '"library-v1"' } }))
      .mockResolvedValueOnce(
        new Response(null, { status: 304, headers: { ETag: '"library-v1"' } }),
      );

    await expect(api.readDomain('library')).resolves.toEqual({ status: 204, etag: null });
    const initialized = await api.readDomain('library');
    expect(initialized).toEqual({ status: 200, etag: '"library-v1"', snapshot });
    await expect(api.readDomain('library', initialized.etag ?? undefined)).resolves.toEqual({
      status: 304,
      etag: '"library-v1"',
    });
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: 'no-store', credentials: 'same-origin' });
    expect(fetcher.mock.calls[2][1]).toEqual({
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'If-None-Match': '"library-v1"' },
    });
  });

  it.each(['not-json', 'null', '{"state":null}', '{"state":"invalid"}'])(
    '拒绝损坏状态 %s，防止作为空快照覆盖本地数据',
    async (body) => {
      const { fetcher, transport } = createTransport();
      fetcher.mockResolvedValueOnce(new Response(body));
      await expect(new StateApi(transport).readDomain('reading')).rejects.toThrow(
        '服务端学习数据格式不正确',
      );
    },
  );

  it('初始化冲突仍向持久化层暴露 409，成功写入无需响应正文', async () => {
    const { fetcher, transport } = createTransport();
    const api = new StateApi(transport);
    fetcher
      .mockResolvedValueOnce(Response.json({ error: '服务端已有数据' }, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.initialize({ state: {}, version: 33 })).rejects.toMatchObject({
      status: 409,
      message: '服务端已有数据',
    });
    await expect(
      api.writeDomain('conversations', { state: { chats: [], chatSessions: [] }, version: 33 }),
    ).resolves.toBeUndefined();
  });
});

describe('书籍与索引的兼容读取协议', () => {
  it('404 表示文件尚不存在；EPUB 与索引均保留 undefined', async () => {
    const { fetcher, transport } = createTransport();
    fetcher.mockImplementation(async () => new Response(null, { status: 404 }));
    await expect(new BooksApi(transport).loadEpubFile('missing')).resolves.toBeUndefined();
    await expect(new ReadingApi(transport).loadSearchIndex('missing')).resolves.toBeUndefined();
  });

  it('EPUB 使用二进制和编码后的 ID，不能由 JSON 或路径分隔符破坏内容', async () => {
    const { fetcher, transport } = createTransport();
    const data = Uint8Array.from([80, 75, 0, 128, 255]).buffer;
    fetcher
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(data));
    const api = new BooksApi(transport);
    const id = '书/名?part=1#封面';
    await api.saveEpubFile(id, data);
    const loaded = await api.loadEpubFile(id);
    expect(new Uint8Array(loaded!)).toEqual(new Uint8Array(data));
    expect(fetcher.mock.calls[0]).toEqual([
      `/api/books/${encodeURIComponent(id)}`,
      {
        cache: 'no-store',
        credentials: 'same-origin',
        method: 'PUT',
        headers: { 'Content-Type': 'application/epub+zip' },
        body: data,
      },
    ]);
  });

  it('旧二进制读取保留独立错误文案，不新增全局认证副作用', async () => {
    const { fetcher, transport } = createTransport();
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    fetcher
      .mockResolvedValueOnce(Response.json({ error: '此书暂不可读' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: '不展示此服务端消息' }, { status: 500 }));
    const epubRequest = new BooksApi(transport).loadEpubFile('book');
    await expect(epubRequest).rejects.toBeInstanceOf(Error);
    await expect(epubRequest).rejects.not.toBeInstanceOf(ServerApiError);
    await expect(epubRequest).rejects.toThrow('此书暂不可读');
    await expect(new ReadingApi(transport).loadSearchIndex('book')).rejects.toThrow(
      '读取书内搜索索引失败（500）',
    );
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('AI 任务事件流协议', () => {
  it('支持 UTF-8 跨分片、多行 data、末尾未换行事件并忽略非 job 事件', async () => {
    const { fetcher, transport } = createTransport();
    const first = job();
    const completed = job({ revision: 2, status: 'completed', content: '完成' });
    const multiline = JSON.stringify(first, null, 2)
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n');
    const bytes = new TextEncoder().encode(
      `:heartbeat\n\nevent: other\ndata: ignored\n\nevent: job\n${multiline}\n\nevent: job\ndata: ${JSON.stringify(completed)}`,
    );
    fetcher.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (let offset = 0; offset < bytes.length; offset += 1) {
              controller.enqueue(bytes.subarray(offset, offset + 1));
            }
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    const onJob = vi.fn();
    const controller = new AbortController();
    await new AiApi(transport).watchJob(first.id, onJob, controller.signal);
    expect(onJob.mock.calls).toEqual([[first], [completed]]);
    expect(fetcher.mock.calls[0]).toEqual([
      `/api/ai/jobs/${encodeURIComponent(first.id)}/events`,
      {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      },
    ]);
  });

  it('中途取消将 AbortSignal 交给请求，并保留流读取的取消错误', async () => {
    const { fetcher, transport } = createTransport();
    const aborted = Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    fetcher.mockImplementation(async (_path, init) => {
      const signal = init?.signal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            signal?.addEventListener('abort', () => controller.error(aborted), { once: true });
          },
        }),
      );
    });
    const onJob = vi.fn();
    const controller = new AbortController();
    const watching = new AiApi(transport).watchJob('job', onJob, controller.signal);
    const rejected = expect(watching).rejects.toBe(aborted);
    controller.abort();
    await rejected;
    expect(onJob).not.toHaveBeenCalled();
  });
});

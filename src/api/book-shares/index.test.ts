import { expect, it, vi } from 'vitest';
import { BookSharesApi } from './index';
import { ApiTransport } from '../http/transport';

it('匿名读取分享不携带会话，EPUB 使用二进制接口，管理操作保持私有路径', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ title: '书', author: '作者' })));
  const api = new BookSharesApi(new ApiTransport(fetcher));
  await api.get('token');
  expect(fetcher).toHaveBeenCalledWith(
    '/api/public/book-shares/token',
    expect.objectContaining({ credentials: 'omit' }),
  );
  fetcher.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  const controller = new AbortController();
  expect(new Uint8Array(await api.loadEpub('token', controller.signal))).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(fetcher).toHaveBeenLastCalledWith(
    '/api/public/book-shares/token/epub',
    expect.objectContaining({ credentials: 'omit', signal: controller.signal }),
  );
  fetcher.mockResolvedValue(new Response('{}'));
  await api.create('book/id');
  expect(fetcher).toHaveBeenLastCalledWith(
    '/api/books/book%2Fid/share',
    expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
  );
  fetcher.mockResolvedValue(new Response(null, { status: 204 }));
  await api.revoke('book/id');
});

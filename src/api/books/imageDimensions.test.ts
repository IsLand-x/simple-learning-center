import { describe, expect, it, vi } from 'vitest';
import { BooksApi } from './index';
import { ApiTransport } from '../http/transport';
import type { ApiFetch } from '../http/type';

describe('书籍图片尺寸协议', () => {
  it('用受认证的 HEAD 读取尺寸，不下载或解析图片正文', async () => {
    const response = new Response(null, {
      headers: { 'X-Image-Width': '1145', 'X-Image-Height': '1374' },
    });
    const body = vi.spyOn(response, 'arrayBuffer');
    const fetcher = vi.fn<ApiFetch>().mockResolvedValue(response);
    const api = new BooksApi(new ApiTransport(fetcher));
    await expect(api.imageDimensions('书/籍', 'image')).resolves.toEqual({
      width: 1145,
      height: 1374,
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      '/api/books/%E4%B9%A6%2F%E7%B1%8D/knowledge-maps/image',
      expect.objectContaining({ method: 'HEAD', credentials: 'same-origin', cache: 'force-cache' }),
    );
    expect(body).not.toHaveBeenCalled();
  });

  it('尺寸缺失、无效或图片不存在时允许使用通用加载占位', async () => {
    for (const value of ['', '0', '-1', 'NaN', 'Infinity', '1.5']) {
      const fetcher = vi
        .fn<ApiFetch>()
        .mockResolvedValue(
          new Response(null, { headers: { 'X-Image-Width': value, 'X-Image-Height': '1200' } }),
        );
      await expect(
        new BooksApi(new ApiTransport(fetcher)).imageDimensions('book', 'image'),
      ).resolves.toBeUndefined();
    }
    const fetcher = vi.fn<ApiFetch>().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(
      new BooksApi(new ApiTransport(fetcher)).imageDimensions('book', 'image'),
    ).resolves.toBeUndefined();
  });
});

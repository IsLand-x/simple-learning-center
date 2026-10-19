import { describe, expect, it } from 'vitest';
import { bookResourceImageId, sortBookResources } from './model';

const id = '11111111-1111-4111-8111-111111111111';
describe('资源库图片来源', () => {
  it('只识别当前书籍的完整服务端图片路径', () => {
    expect(
      bookResourceImageId(
        `/api/books/${encodeURIComponent('书/籍')}/knowledge-maps/${id}`,
        '书/籍',
      ),
    ).toBe(id);
    for (const src of [
      undefined,
      `/api/books/other/knowledge-maps/${id}`,
      `https://other.test/api/books/book/knowledge-maps/${id}`,
      `/api/books/book/knowledge-maps/${id}?other`,
      '/api/books/book/knowledge-maps/../state',
      'data:image/png;base64,abc',
    ]) {
      expect(bookResourceImageId(src, 'book')).toBeNull();
    }
  });
});

const cosUrl = `https://images-123456.cos.ap-singapore.myqcloud.com/learning-center/nested/2026-10-19/${id}.png`;

describe('COS 图床收藏兼容', () => {
  it('从图床原图地址恢复本地图片标识，兼容已保存的历史消息', () => {
    expect(bookResourceImageId(cosUrl, 'book')).toBe(id);
  });

  it('不把外部图片、伪造域名或非法路径当作可收藏图片', () => {
    for (const src of [
      cosUrl.replace('https:', 'http:'),
      cosUrl.replace('.myqcloud.com/', '.myqcloud.com.evil.test/'),
      cosUrl.replace('images-123456.cos.ap-singapore.myqcloud.com', 'other.test'),
      cosUrl.replace(id, '../state'),
      `${cosUrl}?other`,
      `${cosUrl}#other`,
    ]) {
      expect(bookResourceImageId(src, 'book')).toBeNull();
    }
  });
});

describe('资源库创建时间排序', () => {
  const resource = (imageId: string, savedAt: number) => ({
    imageId,
    savedAt,
    title: imageId,
    url: `/image/${imageId}`,
  });
  it('按时间正倒序排列，不修改共享资源列表，同一时间保持原顺序', () => {
    const resources = [
      resource('middle', 20),
      resource('new', 30),
      resource('old', 10),
      resource('same', 20),
    ];
    expect(sortBookResources(resources, 'newest').map((item) => item.imageId)).toEqual([
      'new',
      'middle',
      'same',
      'old',
    ]);
    expect(sortBookResources(resources, 'oldest').map((item) => item.imageId)).toEqual([
      'old',
      'middle',
      'same',
      'new',
    ]);
    expect(resources.map((item) => item.imageId)).toEqual(['middle', 'new', 'old', 'same']);
    expect(sortBookResources([], 'oldest')).toEqual([]);
  });
});

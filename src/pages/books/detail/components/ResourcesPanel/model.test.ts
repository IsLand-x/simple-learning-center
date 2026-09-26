import { describe, expect, it } from 'vitest';
import { bookResourceImageId } from './model';

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

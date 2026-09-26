import { describe, expect, it } from 'vitest';
import { digestPreview } from './rssFormat';
describe('RSS content formatting', () => {
  it('creates the same compact digest preview without markdown punctuation', () => {
    expect(digestPreview('## **主题** [来源](https://example.com)\n下一行')).toBe(
      ' 主题 来源https://example.com 下一行',
    );
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { imageHostingMarkdown } from './imageHostingMarkdown.js';

test('对话明确标记公开 COS 链接，失败显示提示，未配置时不增加文案', () => {
  assert.equal(imageHostingMarkdown({}), '');
  assert.match(
    imageHostingMarkdown({ cosUrl: 'https://images.example.test/image.png' }),
    /COS 原图链接（公开访问）.*https:\/\/images.example.test\/image.png/,
  );
  assert.match(
    imageHostingMarkdown({ uploadWarning: '原图已保存在本地；COS 上传未完成' }),
    /本地；COS 上传未完成/,
  );
});

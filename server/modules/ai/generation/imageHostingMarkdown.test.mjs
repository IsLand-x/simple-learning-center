import assert from 'node:assert/strict';
import test from 'node:test';
import { imageHostingMarkdown } from './imageHostingMarkdown.js';

const imageUrl = '/api/books/book/knowledge-maps/11111111-1111-4111-8111-111111111111';
const cosUrl = 'https://images.example.test/image.png';

for (const title of ['全景知识地图', '信息图']) {
  test(`${title}上传成功后预览和原图入口均使用 COS 地址`, () => {
    assert.equal(
      imageHostingMarkdown(title, { imageUrl, cosUrl }),
      `![${title}](${cosUrl})\n\n[查看或保存原图](${cosUrl})\n\n[COS 原图链接（公开访问）](${cosUrl})`,
    );
  });

  test(`${title}未配置 COS 时使用本地图片，不增加上传提示`, () => {
    assert.equal(
      imageHostingMarkdown(title, { imageUrl }),
      `![${title}](${imageUrl})\n\n[查看或保存原图](${imageUrl})`,
    );
  });

  test(`${title}上传失败时使用本地图片并保留失败提示`, () => {
    const uploadWarning = '原图已保存在本地；COS 上传未完成';
    assert.equal(
      imageHostingMarkdown(title, { imageUrl, uploadWarning }),
      `![${title}](${imageUrl})\n\n[查看或保存原图](${imageUrl})\n\n${uploadWarning}`,
    );
  });
}

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('视频、封面和删除接口经过远程认证，CDN 资源入口不能代理视频文件', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'private-chapter-video-'));
  process.env.LEARNING_CENTER_DATA_DIR = directory;
  process.env.LEARNING_CENTER_MODE = 'remote';
  process.env.LEARNING_CENTER_PASSWORD = 'fixture-access-password';
  try {
    const { createApp } = await import('../../app.js');
    const app = createApp({ serveFrontend: false });
    const path = '/api/books/book/chapter-videos/b4a45c29-493b-47d7-b75a-d19c0b311cb4';
    for (const [method, suffix] of [
      ['GET', ''],
      ['HEAD', ''],
      ['GET', '/poster'],
      ['DELETE', ''],
    ])
      assert.equal((await app.request(path + suffix, { method })).status, 401);
    assert.equal(
      (await app.request(path, { headers: { 'X-Learning-Center-Static-Only': '1' } })).status,
      404,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

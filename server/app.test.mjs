import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const testDataDirectory = await mkdtemp(join(tmpdir(), 'learning-center-test-'));
process.env.LEARNING_CENTER_DATA_DIR = testDataDirectory;
process.env.LEARNING_CENTER_MODE = 'local';

const [{ createApp }, { initializeDataDirectories }] = await Promise.all([
  import('./app.mjs'),
  import('./storage.mjs'),
]);

before(async () => {
  await initializeDataDirectories();
});

after(async () => {
  await rm(testDataDirectory, { force: true, recursive: true });
});

test('数据 API、API Key 迁移与远程认证', async (t) => {
  const app = createApp({ serveFrontend: false });

  await t.test('初始化并读取服务端状态', async () => {
    const persistedState = {
      state: {
        books: [],
        notes: [],
        openAIConfigs: [{
          id: 'provider-1',
          name: '测试模型',
          baseUrl: 'https://example.com/v1',
          models: ['test-model'],
          apiKey: 'test-key-1',
          createdAt: 1,
          updatedAt: 1,
        }],
        webSearchConfig: { provider: 'jina', apiKey: 'test-search-key' },
      },
      version: 1,
    };
    const writeResponse = await app.request('/api/state?initialize=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(persistedState),
    });
    assert.equal(writeResponse.status, 204);

    const readResponse = await app.request('/api/state');
    assert.equal(readResponse.status, 200);
    assert.deepEqual(await readResponse.json(), persistedState);
  });

  await t.test('导出并导入 API Key', async () => {
    const exportResponse = await app.request('/api/api-keys/export');
    assert.equal(exportResponse.status, 200);
    const exported = await exportResponse.json();
    assert.equal(exported.format, 'learning-center-api-keys');
    assert.equal(exported.openAIConfigs[0].apiKey, 'test-key-1');

    exported.openAIConfigs[0].apiKey = 'test-key-2';
    const importResponse = await app.request('/api/api-keys/import', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exported),
    });
    assert.equal(importResponse.status, 200);
    assert.deepEqual(await importResponse.json(), {
      imported: { added: 0, updated: 1, webSearch: true },
    });

    const stateResponse = await app.request('/api/state');
    const state = await stateResponse.json();
    assert.equal(state.state.openAIConfigs[0].apiKey, 'test-key-2');
  });

  await t.test('错误输入返回客户端错误', async () => {
    const malformedResponse = await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(malformedResponse.status, 400);
    assert.deepEqual(await malformedResponse.json(), { error: 'JSON 数据格式不正确' });

    const importResponse = await app.request('/api/api-keys/import', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'unknown', version: 1, openAIConfigs: [] }),
    });
    assert.equal(importResponse.status, 400);
  });

  await t.test('远程模式保护页面与 API', async () => {
    const remoteApp = createApp({
      mode: 'remote',
      username: 'reader',
      password: 'test-password',
      serveFrontend: false,
    });
    const unauthorizedResponse = await remoteApp.request('/api/health');
    assert.equal(unauthorizedResponse.status, 401);

    const authorization = `Basic ${Buffer.from('reader:test-password').toString('base64')}`;
    const authorizedResponse = await remoteApp.request('/api/health', {
      headers: { Authorization: authorization },
    });
    assert.equal(authorizedResponse.status, 200);
    assert.equal((await authorizedResponse.json()).mode, 'remote');
  });
});

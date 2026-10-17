import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const directory = await mkdtemp(join(tmpdir(), 'cos-images-test-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { publishBookImage, removeHostedBookImages } = await import('./imageHosting.js');
const { atomicWrite, knowledgeMapDirectoryPath } = await import('../../infrastructure/fs/files.js');
const id = '11111111-1111-4111-8111-111111111111';
const imageUrl = `/api/books/book/knowledge-maps/${id}`;
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const input = { bookId: 'book', imageUrl, png };
const configPath = join(directory, 'cos-images.json');
const config = {
  enabled: true,
  bucket: 'test-images-1250000000',
  region: 'ap-singapore',
  prefix: 'learning-center',
  secretId: 'fixture-only-id',
  secretKey: 'fixture-only-key',
};
const metadata = join(knowledgeMapDirectoryPath('book'), `${id}.cos.json`);
const requests = [];
const deps = {
  configPath,
  now: () => new Date('2026-10-17T16:01:00Z'),
  fetchImpl: async (url, options) => {
    requests.push({ url: String(url), ...options });
    return new Response(null, { status: options.method === 'PUT' ? 200 : 204 });
  },
};
after(() => rm(directory, { recursive: true, force: true }));
beforeEach(async () => {
  requests.length = 0;
  await rm(knowledgeMapDirectoryPath('book'), { recursive: true, force: true });
  await atomicWrite(
    join(directory, 'state.json'),
    JSON.stringify({ version: 37, state: { books: [{ id: 'book', fileSize: 42 }] } }),
  );
  await atomicWrite(join(knowledgeMapDirectoryPath('book'), `${id}.png`), png);
  await atomicWrite(configPath, JSON.stringify(config));
});

test('按上海日期跨日建目录；公开上传签名包含完整性校验，不泄漏密钥', async () => {
  const result = await publishBookImage(input, deps);
  assert.equal(
    result.cosUrl,
    `https://${config.bucket}.cos.${config.region}.myqcloud.com/learning-center/2026-10-18/${id}.png`,
  );
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.method, 'PUT');
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers['x-cos-acl'], 'public-read');
  assert.equal(request.headers['content-md5'], createHash('md5').update(png).digest('base64'));
  assert.equal(request.headers['x-cos-forbid-overwrite'], 'true');
  assert.match(request.headers.authorization, /q-signature=/);
  assert.deepEqual(Buffer.from(request.body), png);
  const saved = await readFile(metadata, 'utf8');
  assert.equal(JSON.parse(saved).key, `learning-center/2026-10-18/${id}.png`);
  assert.equal((await stat(metadata)).mode & 0o777, 0o600);
  assert.doesNotMatch(saved + JSON.stringify(result), /fixture-only/);
  await removeHostedBookImages('book', deps);
  assert.equal(requests[1].method, 'DELETE');
  assert.equal(requests[1].url, request.url);
  await assert.rejects(readFile(metadata), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(knowledgeMapDirectoryPath('book'), `${id}.png`)), png);
});

test('没有配置或明确关闭时不上传；错误配置不泄漏字段值', async () => {
  for (const raw of [null, { enabled: false }, { ...config, secretKey: 123 }]) {
    if (raw) await atomicWrite(configPath, JSON.stringify(raw));
    else await rm(configPath);
    const result = await publishBookImage(input, deps);
    if (raw?.enabled) {
      assert.match(result.uploadWarning, /本地.*COS 上传未完成/);
      assert.doesNotMatch(JSON.stringify(result), /fixture-only|123/);
    } else assert.deepEqual(result, {});
  }
  assert.equal(requests.length, 0);
});

test('上传失败保留本地原图并提示，不把供应商响应体带入结果', async () => {
  const result = await publishBookImage(input, {
    ...deps,
    fetchImpl: async () => new Response('secret-provider-body', { status: 403 }),
  });
  assert.equal(result.cosUrl, undefined);
  assert.match(result.uploadWarning, /本地/);
  assert.doesNotMatch(JSON.stringify(result), /secret-provider-body/);
  assert.deepEqual(await readFile(join(knowledgeMapDirectoryPath('book'), `${id}.png`)), png);
  await assert.rejects(readFile(metadata), { code: 'ENOENT' });
});

test('上传遇到对象冲突时不能删除已有云端对象', async () => {
  let calls = 0;
  const result = await publishBookImage(input, {
    ...deps,
    fetchImpl: async () => {
      calls++;
      return new Response(null, { status: 409 });
    },
  });
  assert.ok(result.uploadWarning);
  assert.equal(calls, 1);
});

test('上传后书籍被删除或用户取消时清理云端对象，不留下成功链接', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    requests.length = 0;
    const result = publishBookImage(
      { ...input, signal: controller.signal },
      {
        ...deps,
        fetchImpl: async (url, options) => {
          const response = await deps.fetchImpl(url, options);
          if (options.method === 'PUT') {
            if (cancel) controller.abort();
            else
              await atomicWrite(
                join(directory, 'state.json'),
                JSON.stringify({ version: 37, state: { books: [] } }),
              );
          }
          return response;
        },
      },
    );
    if (cancel) await assert.rejects(result, { name: 'AbortError' });
    else assert.ok((await result).uploadWarning);
    assert.deepEqual(
      requests.map((r) => r.method),
      ['PUT', 'DELETE'],
    );
    assert.equal(requests[1].signal.aborted, false);
    await assert.rejects(readFile(metadata), { code: 'ENOENT' });
  }
});

test('删除失败保留追踪记录；不允许通过记录删除其他桶或目录', async () => {
  await publishBookImage(input, deps);
  await assert.rejects(
    removeHostedBookImages('book', {
      ...deps,
      fetchImpl: async () => new Response(null, { status: 403 }),
    }),
    /HTTP 403/,
  );
  const record = JSON.parse(await readFile(metadata, 'utf8'));
  for (const invalid of [
    { ...record, bucket: 'other-images-1250000000' },
    { ...record, key: `unrelated/2026-10-18/${id}.png` },
    { ...record, key: record.key.replace(id, '22222222-2222-4222-8222-222222222222') },
  ]) {
    await atomicWrite(metadata, JSON.stringify(invalid));
    await assert.rejects(
      removeHostedBookImages('book', { ...deps, fetchImpl: () => assert.fail('不得发送删除请求') }),
    );
    assert.ok(await readFile(metadata));
  }
});

test('彻底删除书籍实际调用 COS 清理，再删除本地原图及追踪记录', async () => {
  await publishBookImage(input, deps);
  const { permanentlyDeletePersistedBook } = await import('./trash.js');
  const mocked = mock.method(globalThis, 'fetch', deps.fetchImpl);
  try {
    await permanentlyDeletePersistedBook('book');
    assert.deepEqual(
      requests.map((request) => request.method),
      ['PUT', 'DELETE'],
    );
    await assert.rejects(stat(knowledgeMapDirectoryPath('book')), { code: 'ENOENT' });
  } finally {
    mocked.mock.restore();
  }
});

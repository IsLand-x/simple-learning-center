import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createSourceSecretsService } from './sourceSecrets.mjs';

test('B站 Cookie 只在服务端私有文件中保存，状态接口不回显', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'learning-center-source-secrets-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const path = join(directory, 'source-secrets.json');
  const service = createSourceSecretsService({
    path,
    verifyCookie: async (cookie) => {
      assert.equal(cookie, 'SESSDATA=test; bili_jct=csrf');
      return { accountLabel: '测试账号', verifiedAt: 200 };
    },
    now: () => 100,
  });

  const status = await service.setBilibiliCookie(' SESSDATA=test;  bili_jct=csrf ');
  assert.deepEqual(status, {
    configured: true,
    verificationStatus: 'valid',
    updatedAt: 100,
    lastVerifiedAt: 200,
    accountLabel: '测试账号',
    message: undefined,
  });
  assert.equal(Object.hasOwn(status, 'cookie'), false);
  assert.match(await readFile(path, 'utf8'), /SESSDATA=test/);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal(await service.getBilibiliCookie(), 'SESSDATA=test; bili_jct=csrf');

  assert.deepEqual(await service.deleteBilibiliCookie(), {
    configured: false,
    verificationStatus: 'unconfigured',
  });
});

test('B站 Cookie 拒绝换行和无键值格式', async () => {
  const service = createSourceSecretsService({ path: join(tmpdir(), 'unused-source-secrets.json') });
  await assert.rejects(service.setBilibiliCookie('SESSDATA=x\nInjected=y'));
  await assert.rejects(service.setBilibiliCookie('not-a-cookie'));
});

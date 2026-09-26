import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readSystemInfo } from './app/systemInfo.js';
import { createApp } from './app.js';

test('机器信息保留 IPv4/IPv6，过滤回环和网卡敏感字段，并兼容无 CPU 信息', () => {
  const result = readSystemInfo({
    hostname: () => 'test-host',
    type: () => 'Linux',
    release: () => '6.1',
    arch: () => 'arm64',
    cpus: () => [],
    totalmem: () => 8 * 1024 ** 3,
    freemem: () => 2 * 1024 ** 3,
    networkInterfaces: () => ({
      lo: [{ internal: true, address: '127.0.0.1', family: 'IPv4' }],
      eth0: [
        { internal: false, address: '192.0.2.10', family: 'IPv4', mac: 'private' },
        { internal: false, address: '2001:db8::10', family: 'IPv6', mac: 'private' },
      ],
      empty: undefined,
    }),
  });
  assert.deepEqual(result.addresses, [
    { name: 'eth0', address: '192.0.2.10', family: 'IPv4' },
    { name: 'eth0', address: '2001:db8::10', family: 'IPv6' },
  ]);
  assert.deepEqual(result.cpu, { model: null, logicalCores: 0 });
  assert.equal(result.operatingSystem, 'Linux 6.1');
  assert.equal(result.memory.totalBytes, 8 * 1024 ** 3);
});

test('机器信息接口只读、不缓存，远程模式须登录', async (t) => {
  const dir = await mkdtemp(join(os.tmpdir(), 'learning-system-info-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const app = createApp({ mode: 'local', serveFrontend: false });
  const response = await app.request('/api/settings/system-info');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const info = await response.json();
  assert.equal(info.hostname, os.hostname());
  assert.equal(info.cpu.logicalCores, os.cpus().length);
  assert.equal(info.memory.totalBytes, os.totalmem());
  assert.equal(info.nodeVersion, process.version);
  assert.equal((await app.request('/api/settings/system-info', { method: 'POST' })).status, 405);

  const remote = createApp({
    mode: 'remote',
    serveFrontend: false,
    username: 'reader',
    password: 'test-password',
    authFile: join(dir, 'auth.json'),
  });
  assert.equal((await remote.request('/api/settings/system-info')).status, 401);
  const login = await remote.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'reader', password: 'test-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';', 1)[0];
  assert.equal(
    (await remote.request('/api/settings/system-info', { headers: { cookie } })).status,
    200,
  );
});

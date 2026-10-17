import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { createStaticRoutes } from './staticRoutes.js';
import { registerStaticOriginGuard } from './middleware.js';
import { createRouter } from './router.js';

test('静态资源压缩、版本缓存与入口更新', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'static-cache-'));
  try {
    await mkdir(join(directory, 'assets'));
    const script = 'const content = "移动端阅读";\n'.repeat(200);
    await writeFile(join(directory, 'assets', 'reader-abcdefgh.js'), script);
    await writeFile(join(directory, 'index.html'), '<html>入口</html>');
    await writeFile(join(directory, 'sw.js'), '/* worker */');
    const app = createRouter();
    registerStaticOriginGuard(app);
    app.get('/api/private', (c) => c.json({ secret: 'must not reach CDN' }));
    app.route('/', createStaticRoutes(directory));
    const compressed = await app.request('/assets/reader-abcdefgh.js', {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(compressed.status, 200);
    assert.equal(compressed.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(compressed.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
    assert.equal(compressed.headers.get('Content-Encoding'), 'gzip');
    assert.match(compressed.headers.get('Vary'), /Accept-Encoding/i);
    const bytes = Buffer.from(await compressed.arrayBuffer());
    assert.equal(gunzipSync(bytes).toString(), script);
    assert.ok(bytes.length < Buffer.byteLength(script) / 2);
    const plain = await app.request('/assets/reader-abcdefgh.js');
    assert.equal(plain.headers.get('Content-Encoding'), null);
    assert.equal(await plain.text(), script);
    const range = await app.request('/assets/reader-abcdefgh.js', {
      headers: { Range: 'bytes=0-9', 'Accept-Encoding': 'gzip' },
    });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('Content-Encoding'), null);
    assert.equal((await range.arrayBuffer()).byteLength, 10);
    for (const path of ['/index.html', '/sw.js', '/books/example']) {
      const response = await app.request(path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-cache');
    }
    const missing = await app.request('/assets/missing-abcdefgh.js');
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('Cache-Control'), 'no-store');
    const originHeaders = { 'X-Learning-Center-Static-Only': '1' };
    for (const path of [
      '/api/private',
      '/api/public/book-shares/example',
      '/',
      '/sw.js',
      '/assets/not-versioned.js',
    ]) {
      const response = await app.request(path, { headers: originHeaders });
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get('Cache-Control'), 'no-store', path);
    }
    assert.equal((await app.request('/api/private')).status, 200);
    const cdnAsset = await app.request('/assets/reader-abcdefgh.js', { headers: originHeaders });
    assert.equal(cdnAsset.status, 200);
    assert.equal(cdnAsset.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(
      (await app.request('/assets/reader-abcdefgh.js', { method: 'POST', headers: originHeaders }))
        .status,
      404,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

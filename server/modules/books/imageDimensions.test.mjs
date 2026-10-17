import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPngDimensions } from './imageDimensions.js';

const directory = await mkdtemp(join(tmpdir(), 'png-dimensions-'));
after(() => rm(directory, { recursive: true, force: true }));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=',
  'base64',
);

test('从 PNG 头读取原图长宽，不要求加载整个文件', async () => {
  const path = join(directory, 'portrait.png');
  const header = Buffer.from(png.subarray(0, 24));
  header.writeUInt32BE(1145, 16);
  header.writeUInt32BE(1374, 20);
  await writeFile(path, header);
  assert.deepEqual(await readPngDimensions(path), { width: 1145, height: 1374 });
});

test('缺失、截断、非 PNG、无效 IHDR 或无效尺寸不提供比例', async () => {
  assert.equal(await readPngDimensions(join(directory, 'missing.png')), undefined);
  const invalid = [Buffer.from('not png'), png.subarray(0, 20)];
  for (const [offset, value] of [
    [8, 12],
    [12, 0],
    [16, 0],
    [20, 0],
    [16, 0xffffffff],
  ]) {
    const header = Buffer.from(png);
    header.writeUInt32BE(value, offset);
    invalid.push(header);
  }
  for (const [index, header] of invalid.entries()) {
    const path = join(directory, `${index}.png`);
    await writeFile(path, header);
    assert.equal(await readPngDimensions(path), undefined);
  }
});

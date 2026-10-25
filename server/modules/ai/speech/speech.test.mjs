import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTtsSettings } from './settings.js';
import { synthesizeAliyunSpeech } from './synthesize.js';

test('TTS 密钥独立私有保存、读取不泄露、并发修改保留最新密钥、删除配置', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'learning-center-tts-'));
  const path = join(dir, 'tts.json');
  const service = createTtsSettings(path);
  const config = {
    provider: 'aliyun',
    region: 'cn-beijing',
    model: 'qwen3-tts-flash',
    voice: 'Cherry',
  };
  try {
    assert.equal((await service.status()).configured, false);
    await assert.rejects(service.save(config), /Key/);
    const status = await service.save({ ...config, apiKey: 'fixture-private-key' });
    assert.equal(status.configured, true);
    assert.equal(JSON.stringify(status).includes('fixture-private-key'), false);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await Promise.all([
      service.save({ ...config, apiKey: 'fixture-new-key' }),
      service.save({ ...config, voice: 'Ethan', apiKey: '' }),
    ]);
    assert.equal((await service.read()).apiKey, 'fixture-new-key');
    assert.equal((await service.status()).voice, 'Ethan');
    assert.equal(JSON.parse(await readFile(path, 'utf8')).apiKey, 'fixture-new-key');
    await service.remove();
    assert.equal((await service.status()).configured, false);
    await assert.rejects(stat(path), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('百炼专用协议正确生成中文音频，升级 OSS TLS、不向下载地址发送 Key、拒绝外部地址', async () => {
  const calls = [];
  const config = {
    provider: 'aliyun',
    region: 'cn-beijing',
    model: 'qwen3-tts-flash',
    voice: 'Cherry',
    apiKey: 'fixture-key',
    updatedAt: 0,
  };
  const wav = Buffer.alloc(44);
  wav.write('RIFF');
  wav.write('WAVE', 8);
  const request = async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? Response.json({
          output: {
            audio: {
              url: 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/speech.wav?signature=fixture',
            },
          },
        })
      : new Response(wav);
  };
  const audio = await synthesizeAliyunSpeech(
    config,
    '我们用动态图理解贸易。',
    new AbortController().signal,
    request,
  );
  assert.equal(audio.length, 44);
  assert.match(calls[0].url, /dashscope\.aliyuncs\.com\/api\/v1/);
  assert.equal(JSON.parse(calls[0].options.body).input.language_type, 'Chinese');
  assert.match(calls[1].url, /^https:\/\//);
  assert.equal(calls[1].options.headers, undefined);
  for (const url of [
    'https://unselected.example/private',
    'http://127.0.0.1/private',
    'https://aliyuncs.com.unselected.example/a.wav',
  ])
    await assert.rejects(
      synthesizeAliyunSpeech(config, '测试语音', new AbortController().signal, async () =>
        Response.json({ output: { audio: { url } } }),
      ),
      /地址不受支持/,
    );
  await assert.rejects(
    synthesizeAliyunSpeech(
      config,
      '测试语音',
      new AbortController().signal,
      async () => new Response('secret-body', { status: 401 }),
    ),
    /401/,
  );
});

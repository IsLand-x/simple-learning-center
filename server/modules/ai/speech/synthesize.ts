import { z } from 'zod';
import type { StoredTtsConfig } from './settings.js';

const responseSchema = z.object({
  output: z.object({ audio: z.object({ url: z.string().url() }) }),
});

export async function synthesizeAliyunSpeech(
  config: StoredTtsConfig,
  text: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
) {
  if (!text.trim() || Array.from(text).length > 600) throw new Error('单次配音文本需为 1–600 字');
  const host =
    config.region === 'cn-beijing' ? 'dashscope.aliyuncs.com' : 'dashscope-intl.aliyuncs.com';
  const combined = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
  const response = await request(
    `https://${host}/api/v1/services/aigc/multimodal-generation/generation`,
    {
      method: 'POST',
      redirect: 'manual',
      signal: combined,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        input: { text, voice: config.voice, language_type: 'Chinese' },
      }),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`百炼配音失败（${response.status}），请检查密钥地域、模型权限和账户额度`);
  }
  const result = responseSchema.safeParse(await response.json());
  if (!result.success) throw new Error('百炼未返回有效的配音结果');
  const url = new URL(result.data.output.audio.url);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname.endsWith('.aliyuncs.com') ||
    url.username ||
    url.password
  )
    throw new Error('百炼返回的音频地址不受支持');
  // DashScope may return an HTTP OSS link. The same signed object supports TLS.
  url.protocol = 'https:';
  // A signed download URL needs no API Key; never forward Authorization to storage.
  const audio = await request(url, { redirect: 'manual', signal: combined });
  if (!audio.ok || !audio.body) throw new Error('百炼音频下载失败');
  const limit = 12 * 1024 * 1024;
  const reader = audio.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error('配音音频超过大小限制');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WAVE')
    throw new Error('百炼未返回有效的 WAV 音频');
  return buffer;
}

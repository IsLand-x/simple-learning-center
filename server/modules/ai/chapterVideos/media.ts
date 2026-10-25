import { spawn } from 'node:child_process';
import type { OpenAICompatibleConfig } from '../../../../contracts/ai.js';
import { synthesizeAliyunSpeech } from '../speech/synthesize.js';
import type { StoredTtsConfig } from '../speech/settings.js';

export interface VideoNarrationContext {
  config: OpenAICompatibleConfig;
  model: string;
  voice: string;
  tts?: StoredTtsConfig;
}

export function speechUrl(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('配音供应商的 API 地址格式不正确');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('配音供应商需要不含账号或查询参数的 HTTP/HTTPS API 地址');
  url.pathname =
    url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models|audio\/speech)$/, '') +
    '/audio/speech';
  return url.href;
}

export async function synthesizeNarration(
  narration: VideoNarrationContext,
  text: string,
  signal: AbortSignal,
): Promise<Buffer> {
  if (narration.tts) return synthesizeAliyunSpeech(narration.tts, text, signal);
  const timeout = AbortSignal.timeout(120_000);
  let response: Response;
  try {
    response = await fetch(speechUrl(narration.config.baseUrl), {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${narration.config.apiKey}`,
      },
      body: JSON.stringify({
        model: narration.model,
        voice: narration.voice,
        input: text,
        response_format: 'mp3',
      }),
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch {
    signal.throwIfAborted();
    throw new Error(timeout.aborted ? '配音请求超时，请稍后重试' : '无法连接所选配音供应商');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`配音失败（${response.status}），请确认供应商支持语音接口及所填模型和音色`);
  }
  const type = response.headers.get('content-type') ?? '';
  const limit = 12 * 1024 * 1024;
  if (
    (!type.startsWith('audio/') && !type.startsWith('application/octet-stream')) ||
    Number(response.headers.get('content-length')) > limit
  ) {
    await response.body?.cancel();
    throw new Error('配音供应商未返回有效的 MP3 音频');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('配音供应商未返回音频');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('配音音频超过大小限制');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error('配音供应商返回了空音频');
  return Buffer.concat(chunks);
}

export function runMediaCommand(
  command: 'ffmpeg' | 'ffprobe',
  args: string[],
  cwd: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd, signal, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.stdout.on('data', (data: Buffer) => {
      output = (output + data.toString()).slice(-4096);
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      reject(
        error.code === 'ENOENT'
          ? new Error('服务器需要安装 FFmpeg（含 ffprobe）才能生成视频')
          : error,
      );
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (signal.aborted) reject(signal.reason);
      else if (code === 0) resolve(output);
      else
        reject(new Error(`${command === 'ffprobe' ? '配音音频读取' : '视频渲染'}失败，请稍后重试`));
    });
  });
}

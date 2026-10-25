import { createRouter } from '../../../http/router.js';
import { readJsonRequest } from '../../../http/body.js';
import { methodNotAllowed } from '../../../http/responses.js';
import { ttsSettings } from './settings.js';
import { synthesizeAliyunSpeech } from './synthesize.js';
import { statusError } from '../../../infrastructure/http/errors.js';

export function createTtsRoutes() {
  const app = createRouter();
  app.get('/', async (c) => c.json(await ttsSettings.status()));
  app.put('/', async (c) => c.json(await ttsSettings.save(await readJsonRequest(c.req.raw, 8192))));
  app.delete('/', async (c) => c.json(await ttsSettings.remove()));
  app.post('/test', async () => {
    const config = await ttsSettings.read();
    if (!config) throw statusError(400, '请先保存 TTS 配置');
    const audio = await synthesizeAliyunSpeech(
      config,
      '你好，我们用动态图和生活中的例子，把这一章的知识讲清楚。',
      AbortSignal.timeout(120_000),
    ).catch(() => {
      throw statusError(502, '百炼试听失败，请检查密钥地域、模型权限、账户额度或稍后重试', {
        expose: true,
      });
    });
    return new Response(new Uint8Array(audio), {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
    });
  });
  app.all('/', methodNotAllowed);
  app.all('/test', methodNotAllowed);
  return app;
}

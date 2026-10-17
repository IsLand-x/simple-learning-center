import { z } from 'zod';
import { statusError } from '../../infrastructure/http/errors.js';

const requestSchema = z.object({
  baseUrl: z.string().trim().min(1).max(2048),
  apiKey: z.string().trim().max(16384).optional().default(''),
});
const listSchema = z.object({ data: z.array(z.unknown()).max(10000) });
const modelSchema = z.object({ id: z.string().trim().min(1).max(512) });
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function providerUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw statusError(400, 'API 地址格式不正确');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw statusError(400, '请填写 HTTP 或 HTTPS API 地址，不要包含账号、查询参数或片段');
  }
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/, '');
  return url.href.replace(/\/+$/, '');
}

async function readModels(response: Response) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw statusError(502, '供应商返回的模型列表过大，请手动填写模型', { expose: true });
  }
  const reader = response.body?.getReader();
  if (!reader) throw statusError(502, '供应商未返回模型列表', { expose: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw statusError(502, '供应商返回的模型列表过大，请手动填写模型', { expose: true });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw statusError(502, '供应商未返回有效的 JSON 模型列表，请检查 API 地址或手动填写', {
      expose: true,
    });
  }
  const parsed = listSchema.safeParse(payload);
  if (!parsed.success) {
    throw statusError(502, '供应商未返回 OpenAI 兼容的模型列表，请手动填写模型', { expose: true });
  }
  const models = [
    ...new Set(
      parsed.data.data.flatMap((item) => {
        const model = modelSchema.safeParse(item);
        return model.success ? [model.data.id] : [];
      }),
    ),
  ];
  if (!models.length) {
    throw statusError(502, '供应商没有返回可用模型，请确认 API Key 权限或手动填写模型', {
      expose: true,
    });
  }
  return models;
}

export async function discoverModels(payload: unknown, signal?: AbortSignal) {
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success || /[\r\n]/.test(parsed.data.apiKey)) {
    throw statusError(400, '请填写有效的 API 地址和 API Key');
  }
  const { apiKey } = parsed.data;
  const baseUrl = providerUrl(parsed.data.baseUrl);
  // A bare gateway address may expose either /models or /v1/models. Stay on the chosen host.
  const candidates = new URL(baseUrl).pathname === '/' ? [baseUrl, `${baseUrl}/v1`] : [baseUrl];
  const timeout = AbortSignal.timeout(15000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (const [index, candidate] of candidates.entries()) {
    try {
      const response = await fetch(`${candidate}/models`, {
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        redirect: 'manual',
        signal: requestSignal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ([404, 405].includes(response.status)) continue;
        const message = [401, 403].includes(response.status)
          ? '供应商拒绝访问，请检查 API Key 和模型列表权限'
          : response.status >= 300 && response.status < 400
            ? '模型列表地址发生重定向，请填写供应商的最终 API 地址后重试'
            : `检测模型失败（供应商返回 ${response.status}），请稍后重试或手动填写模型`;
        throw statusError(502, message, { expose: true });
      }
      try {
        return { baseUrl: candidate, models: await readModels(response) };
      } catch (error) {
        // Gateways can serve their HTML frontend at /models instead of returning a 404.
        if (index < candidates.length - 1 && !requestSignal.aborted) continue;
        throw error;
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      // Never return upstream bodies, URLs or errors: they can contain the supplied API Key.
      throw statusError(
        502,
        timeout.aborted ? '检测模型超时，请稍后重试' : '无法连接供应商，请检查 API 地址和网络',
        { expose: true },
      );
    }
  }
  throw statusError(502, '该地址不提供模型列表，请检查 API 版本路径或手动填写模型', {
    expose: true,
  });
}

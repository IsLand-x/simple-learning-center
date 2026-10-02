import { statusError } from '../infrastructure/http/errors.js';

async function readRequestBody(request: Request, maxBytes: number) {
  const declaredSize = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw statusError(413, '请求内容过大');
  }
  if (!request.body) throw statusError(400, '请求内容为空');

  const chunks = [];
  let size = 0;
  for await (const chunk of request.body) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      throw statusError(413, '请求内容过大');
    }
    chunks.push(Buffer.from(chunk));
  }
  if (!size) throw statusError(400, '请求内容为空');
  return Buffer.concat(chunks, size);
}

export async function readJsonRequest<T = Record<string, unknown>>(
  request: Request,
  maxBytes: number,
): Promise<T> {
  const body = await readRequestBody(request, maxBytes);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw statusError(400, 'JSON 数据格式不正确');
  }
}

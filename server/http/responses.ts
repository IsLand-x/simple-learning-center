import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ServerApp, ServerContext } from './router.js';
import { HTTPException } from 'hono/http-exception';

export function noContent(c: ServerContext) {
  return c.body(null, 204);
}

export function methodNotAllowed(c: ServerContext) {
  return c.json({ error: '不支持的请求方法' }, 405);
}

export function registerErrorHandler(app: ServerApp) {
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    const details = error as Error & { status?: number; expose?: boolean; sourceCode?: string };
    const requestedStatus = Number.isInteger(details.status) ? (details.status ?? 500) : 500;
    const status = (
      requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500
    ) as ContentfulStatusCode;
    if (status >= 500 && details.expose !== true) console.error(error);
    const message =
      status >= 500 && details.expose !== true
        ? '服务器处理失败'
        : error instanceof Error
          ? error.message
          : '请求处理失败';
    if (c.req.path.startsWith('/api/')) {
      return c.json(
        {
          error: message,
          ...(typeof details.sourceCode === 'string' ? { code: details.sourceCode } : {}),
        },
        status,
      );
    }
    return c.text(message, status);
  });
}

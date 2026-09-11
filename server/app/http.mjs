import { HTTPException } from 'hono/http-exception';

export function noContent(c) {
  return c.body(null, 204);
}

export function methodNotAllowed(c) {
  return c.json({ error: '不支持的请求方法' }, 405);
}

export function registerErrorHandler(app) {
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    const requestedStatus = Number.isInteger(error?.status) ? error.status : 500;
    const status = requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
    if (status >= 500 && error?.expose !== true) console.error(error);
    const message =
      status >= 500 && error?.expose !== true
        ? '服务器处理失败'
        : error instanceof Error
          ? error.message
          : '请求处理失败';
    if (c.req.path.startsWith('/api/')) {
      return c.json(
        {
          error: message,
          ...(typeof error?.sourceCode === 'string' ? { code: error.sourceCode } : {}),
        },
        status,
      );
    }
    return c.text(message, status);
  });
}

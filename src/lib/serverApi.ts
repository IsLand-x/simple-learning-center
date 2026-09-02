export class ServerApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ServerApiError';
    this.status = status;
    this.code = code;
  }
}

export const AUTHENTICATION_REQUIRED_EVENT = 'learning-center:authentication-required';

async function responseError(response: Response) {
  try {
    const payload = await response.json() as { error?: unknown; code?: unknown };
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return {
        message: payload.error,
        code: typeof payload.code === 'string' ? payload.code : undefined,
      };
    }
  } catch {
    // Fall back to the HTTP status below.
  }
  return { message: `服务器请求失败（${response.status}）` };
}

export async function serverRequest(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ServerApiError('无法连接学习中心服务，请确认服务已经启动', 0);
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
    }
    const details = await responseError(response);
    throw new ServerApiError(details.message, response.status, details.code);
  }
  return response;
}

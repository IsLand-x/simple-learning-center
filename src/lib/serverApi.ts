export class ServerApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ServerApiError';
    this.status = status;
  }
}

export const AUTHENTICATION_REQUIRED_EVENT = 'learning-center:authentication-required';

async function responseError(response: Response) {
  try {
    const payload = await response.json() as { error?: unknown };
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  } catch {
    // Fall back to the HTTP status below.
  }
  return `服务器请求失败（${response.status}）`;
}

export async function serverRequest(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
    });
  } catch {
    throw new ServerApiError('无法连接学习中心服务，请确认服务已经启动', 0);
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
    }
    throw new ServerApiError(await responseError(response), response.status);
  }
  return response;
}

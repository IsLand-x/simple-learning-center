import type { ApiErrorResponse, ApiFetch } from '../types/http';

import { AUTHENTICATION_REQUIRED_EVENT, ServerApiError } from './errors';

export class ApiTransport {
  constructor(private readonly fetcher: ApiFetch = (...args) => fetch(...args)) {}

  // Binary and legacy index readers have their own established HTTP error behavior.
  fetchResponse(path: string, init?: RequestInit): Promise<Response> {
    return this.fetcher(path, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...init,
    });
  }

  async request(
    path: string,
    init?: RequestInit,
    allowedStatuses: readonly number[] = [],
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchResponse(path, init);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ServerApiError('无法连接学习中心服务，请确认服务已经启动', 0);
    }
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      if (response.status === 401 && !path.startsWith('/api/auth/')) {
        window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
      }
      const details = await this.responseError(response);
      throw new ServerApiError(details.message, response.status, details.code);
    }
    return response;
  }

  async json<Result>(path: string, init?: RequestInit): Promise<Result> {
    const response = await this.request(path, init);
    return response.json() as Promise<Result>;
  }

  private async responseError(response: Response) {
    try {
      const payload = (await response.json()) as ApiErrorResponse;
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
}

export const apiTransport = new ApiTransport();

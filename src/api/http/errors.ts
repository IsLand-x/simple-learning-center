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

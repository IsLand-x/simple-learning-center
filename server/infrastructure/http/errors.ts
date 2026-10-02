export interface StatusError extends Error {
  status: number;
  expose: boolean;
  sourceCode?: string;
}

export function statusError(status: number, message: string, { expose = false } = {}): StatusError {
  return Object.assign(new Error(message), { status, expose });
}

export function errorHasCode(error: unknown, code: string): boolean {
  return (error as { code?: unknown } | null)?.code === code;
}

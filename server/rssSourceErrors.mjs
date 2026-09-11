import { statusError } from './errors.mjs';

export function sourceError(status, sourceCode, message, options = {}) {
  const error = statusError(status, message, { expose: true, ...options });
  error.sourceCode = sourceCode;
  return error;
}

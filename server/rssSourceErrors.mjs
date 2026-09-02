import { statusError } from './errors.mjs';

export function sourceError(status, sourceCode, message, options = {}) {
  const error = statusError(status, message, { expose: true, ...options });
  error.sourceCode = sourceCode;
  return error;
}

export function copySourceError(error, fallbackCode, fallbackMessage) {
  if (error?.sourceCode) return error;
  const copied = sourceError(
    Number.isInteger(error?.status) ? error.status : 502,
    fallbackCode,
    error instanceof Error && error.message ? error.message : fallbackMessage,
  );
  if (error?.cause) copied.cause = error.cause;
  return copied;
}

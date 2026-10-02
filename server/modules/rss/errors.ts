import type { RssSourceErrorCode } from '../../../contracts/rss.js';
import { statusError } from '../../infrastructure/http/errors.js';

export function sourceError(
  status: number,
  sourceCode: RssSourceErrorCode,
  message: string,
  options: { expose?: boolean } = {},
) {
  const error = statusError(status, message, { expose: true, ...options });
  error.sourceCode = sourceCode;
  return error;
}

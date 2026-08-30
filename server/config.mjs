import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export const PROJECT_DIRECTORY = resolve(SERVER_DIRECTORY, '..');
export const DIST_DIRECTORY = join(PROJECT_DIRECTORY, 'dist');
export const DATA_DIRECTORY = resolve(
  process.env.LEARNING_CENTER_DATA_DIR || join(PROJECT_DIRECTORY, 'data'),
);
export const BOOK_DIRECTORY = join(DATA_DIRECTORY, 'books');
export const NOTE_DIRECTORY = join(DATA_DIRECTORY, 'notes');
export const SEARCH_INDEX_DIRECTORY = join(DATA_DIRECTORY, 'search-indexes');
export const STATE_FILE = join(DATA_DIRECTORY, 'state.json');
export const AUTH_FILE = join(DATA_DIRECTORY, 'auth.json');

export const MODE = process.env.LEARNING_CENTER_MODE === 'remote' ? 'remote' : 'local';
export const HOST = MODE === 'remote' ? '0.0.0.0' : '127.0.0.1';
export const PORT = Number.parseInt(process.env.LEARNING_CENTER_PORT || '4174', 10);
export const USERNAME = process.env.LEARNING_CENTER_USERNAME || 'admin';
export const PASSWORD = process.env.LEARNING_CENTER_PASSWORD || 'password';
export const RSS_REFRESH_INTERVAL_MS = Number.parseInt(
  process.env.LEARNING_CENTER_RSS_REFRESH_INTERVAL_MS || String(30 * 60 * 1_000),
  10,
);
export const RSS_REFRESH_INITIAL_DELAY_MS = Number.parseInt(
  process.env.LEARNING_CENTER_RSS_REFRESH_INITIAL_DELAY_MS || '15000',
  10,
);
export const YOUTUBE_PROXY = process.env.LEARNING_CENTER_YOUTUBE_PROXY?.trim() || '';
export const YOUTUBE_ENV_PROXY_CONFIGURED = Boolean(
  process.env.HTTPS_PROXY
  || process.env.HTTP_PROXY
  || process.env.https_proxy
  || process.env.http_proxy,
);
export const YOUTUBE_PROXY_CONFIGURED = Boolean(YOUTUBE_PROXY || YOUTUBE_ENV_PROXY_CONFIGURED);

export const MAX_STATE_BYTES = 64 * 1024 * 1024;
export const MAX_INDEX_BYTES = 256 * 1024 * 1024;
export const MAX_BOOK_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_API_KEY_IMPORT_BYTES = 1024 * 1024;
export const MAX_AUTH_REQUEST_BYTES = 8 * 1024;
export const MAX_AI_JOB_REQUEST_BYTES = 512 * 1024;
export const MAX_RSS_REQUEST_BYTES = 16 * 1024;
export const MAX_VIDEO_REQUEST_BYTES = 16 * 1024;

export function validateServerConfig() {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
    throw new Error('LEARNING_CENTER_PORT 必须是有效端口号');
  }
  if (!Number.isInteger(RSS_REFRESH_INTERVAL_MS) || RSS_REFRESH_INTERVAL_MS < 60_000) {
    throw new Error('LEARNING_CENTER_RSS_REFRESH_INTERVAL_MS 必须是不小于 60000 的整数');
  }
  if (
    !Number.isInteger(RSS_REFRESH_INITIAL_DELAY_MS)
    || RSS_REFRESH_INITIAL_DELAY_MS < 0
    || RSS_REFRESH_INITIAL_DELAY_MS > RSS_REFRESH_INTERVAL_MS
  ) {
    throw new Error('LEARNING_CENTER_RSS_REFRESH_INITIAL_DELAY_MS 必须是刷新周期内的非负整数');
  }
  if (YOUTUBE_PROXY) {
    let proxyUrl;
    try {
      proxyUrl = new URL(YOUTUBE_PROXY);
    } catch {
      throw new Error('LEARNING_CENTER_YOUTUBE_PROXY 必须是有效的代理 URL');
    }
    if (!['http:', 'https:', 'socks5:'].includes(proxyUrl.protocol)) {
      throw new Error('LEARNING_CENTER_YOUTUBE_PROXY 仅支持 http、https 或 socks5 代理');
    }
  }
}

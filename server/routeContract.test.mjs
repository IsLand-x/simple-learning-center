import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';

const expectedRoutes = [
  {
    method: 'ALL',
    path: '/api/*',
  },
  {
    method: 'ALL',
    path: '/api/*',
  },
  {
    method: 'ALL',
    path: '/api/settings/openapi-token*',
  },
  {
    method: 'GET',
    path: '/api/settings/openapi-token/mcp',
  },
  {
    method: 'GET',
    path: '/api/settings/openapi-token',
  },
  {
    method: 'POST',
    path: '/api/settings/openapi-token',
  },
  {
    method: 'DELETE',
    path: '/api/settings/openapi-token',
  },
  {
    method: 'ALL',
    path: '/api/settings/openapi-token',
  },
  {
    method: 'POST',
    path: '/api/openapi/v1/books',
  },
  {
    method: 'ALL',
    path: '/api/openapi/v1/books',
  },
  {
    method: 'ALL',
    path: '/api/openapi/mcp',
  },
  {
    method: 'GET',
    path: '/api/auth/session',
  },
  {
    method: 'POST',
    path: '/api/auth/login',
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
  },
  {
    method: 'PUT',
    path: '/api/auth/credentials',
  },
  {
    method: 'ALL',
    path: '/api/auth/session',
  },
  {
    method: 'ALL',
    path: '/api/auth/login',
  },
  {
    method: 'ALL',
    path: '/api/auth/logout',
  },
  {
    method: 'ALL',
    path: '/api/auth/credentials',
  },
  {
    method: 'GET',
    path: '/api/health',
  },
  {
    method: 'ALL',
    path: '/api/health',
  },
  {
    method: 'GET',
    path: '/api/settings/system-info',
  },
  {
    method: 'ALL',
    path: '/api/settings/system-info',
  },
  {
    method: 'GET',
    path: '/api/state',
  },
  {
    method: 'PUT',
    path: '/api/state',
  },
  {
    method: 'ALL',
    path: '/api/state',
  },
  {
    method: 'GET',
    path: '/api/state/:domain',
  },
  {
    method: 'PUT',
    path: '/api/state/:domain',
  },
  {
    method: 'ALL',
    path: '/api/state/:domain',
  },
  {
    method: 'ALL',
    path: '/api/ai/oauth/*',
  },
  {
    method: 'GET',
    path: '/api/ai/oauth/providers',
  },
  {
    method: 'POST',
    path: '/api/ai/oauth/:provider/login',
  },
  {
    method: 'DELETE',
    path: '/api/ai/oauth/:provider/login',
  },
  {
    method: 'DELETE',
    path: '/api/ai/oauth/:provider',
  },
  {
    method: 'POST',
    path: '/api/rss/fetch',
  },
  {
    method: 'ALL',
    path: '/api/rss/fetch',
  },
  {
    method: 'POST',
    path: '/api/rss/sources/resolve',
  },
  {
    method: 'POST',
    path: '/api/rss/sources/fetch',
  },
  {
    method: 'ALL',
    path: '/api/rss/sources/resolve',
  },
  {
    method: 'ALL',
    path: '/api/rss/sources/fetch',
  },
  {
    method: 'GET',
    path: '/api/source-credentials/bilibili',
  },
  {
    method: 'PUT',
    path: '/api/source-credentials/bilibili',
  },
  {
    method: 'POST',
    path: '/api/source-credentials/bilibili/verify',
  },
  {
    method: 'DELETE',
    path: '/api/source-credentials/bilibili',
  },
  {
    method: 'ALL',
    path: '/api/source-credentials/bilibili',
  },
  {
    method: 'ALL',
    path: '/api/source-credentials/bilibili/verify',
  },
  {
    method: 'POST',
    path: '/api/rss/article',
  },
  {
    method: 'ALL',
    path: '/api/rss/article',
  },
  {
    method: 'POST',
    path: '/api/rss/digests/run',
  },
  {
    method: 'ALL',
    path: '/api/rss/digests/run',
  },
  {
    method: 'POST',
    path: '/api/videos/import',
  },
  {
    method: 'ALL',
    path: '/api/videos/import',
  },
  {
    method: 'POST',
    path: '/api/ai/jobs',
  },
  {
    method: 'GET',
    path: '/api/ai/jobs',
  },
  {
    method: 'GET',
    path: '/api/ai/jobs/:jobId/events',
  },
  {
    method: 'GET',
    path: '/api/ai/jobs/:jobId',
  },
  {
    method: 'DELETE',
    path: '/api/ai/jobs/:jobId',
  },
  {
    method: 'ALL',
    path: '/api/ai/jobs',
  },
  {
    method: 'ALL',
    path: '/api/ai/jobs/:jobId',
  },
  {
    method: 'GET',
    path: '/api/books/:bookId/resources',
  },
  {
    method: 'POST',
    path: '/api/books/:bookId/resources',
  },
  {
    method: 'PATCH',
    path: '/api/books/:bookId/resources/:imageId',
  },
  {
    method: 'DELETE',
    path: '/api/books/:bookId/resources/:imageId',
  },
  {
    method: 'ALL',
    path: '/api/books/:bookId/resources',
  },
  {
    method: 'ALL',
    path: '/api/books/:bookId/resources/:imageId',
  },
  {
    method: 'GET',
    path: '/api/books/:bookId/knowledge-maps/:imageId',
  },
  {
    method: 'HEAD',
    path: '/api/books/:bookId/knowledge-maps/:imageId',
  },
  {
    method: 'GET',
    path: '/api/books/:bookId/cover',
  },
  {
    method: 'HEAD',
    path: '/api/books/:bookId/cover',
  },
  {
    method: 'GET',
    path: '/api/books/:bookId',
  },
  {
    method: 'HEAD',
    path: '/api/books/:bookId',
  },
  {
    method: 'PUT',
    path: '/api/books/:bookId',
  },
  {
    method: 'POST',
    path: '/api/books/:bookId/trash',
  },
  {
    method: 'POST',
    path: '/api/books/:bookId/restore',
  },
  {
    method: 'DELETE',
    path: '/api/books/:bookId',
  },
  {
    method: 'ALL',
    path: '/api/books/:bookId/trash',
  },
  {
    method: 'ALL',
    path: '/api/books/:bookId/restore',
  },
  {
    method: 'ALL',
    path: '/api/books/:bookId/cover',
  },
  {
    method: 'ALL',
    path: '/api/books/:bookId',
  },
  {
    method: 'GET',
    path: '/api/search-indexes/:bookId',
  },
  {
    method: 'PUT',
    path: '/api/search-indexes/:bookId',
  },
  {
    method: 'DELETE',
    path: '/api/search-indexes/:bookId',
  },
  {
    method: 'ALL',
    path: '/api/search-indexes/:bookId',
  },
  {
    method: 'ALL',
    path: '/api/*',
  },
  {
    method: 'GET',
    path: '/*',
  },
  {
    method: 'GET',
    path: '/*',
  },
  {
    method: 'ALL',
    path: '/*',
  },
];

test('Hono 子路由保持既有 HTTP 方法、路径与注册顺序', () => {
  assert.deepEqual(
    createApp().routes.map(({ method, path }) => ({ method, path })),
    expectedRoutes,
  );
});

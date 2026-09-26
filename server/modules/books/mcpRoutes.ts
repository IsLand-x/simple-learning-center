import { createRouter } from '../../http/router.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createLibraryMcpServer } from './mcp.js';
import { readJsonRequest } from '../../http/body.js';

export function createMcpRoutes() {
  const app = createRouter();
  app.all('/', async (c) => {
    const origin = c.req.header('origin');
    if (origin) {
      try {
        if (new URL(origin).host !== new URL(c.req.url).host)
          return c.json({ error: '不允许跨站访问 MCP' }, 403);
      } catch {
        return c.json({ error: 'Origin 不正确' }, 403);
      }
    }
    if (c.req.method !== 'POST') {
      c.header('Allow', 'POST');
      return c.json(
        { jsonrpc: '2.0', error: { code: -32000, message: '仅支持 POST' }, id: null },
        405,
      );
    }
    const server = createLibraryMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    try {
      const parsedBody = await readJsonRequest(c.req.raw, 15 * 1024 * 1024);
      await server.connect(transport);
      return await transport.handleRequest(c.req.raw, { parsedBody });
    } catch (error) {
      const details = error as { status?: number; message: string };
      if (details.status === 400 || details.status === 413) {
        return c.json(
          {
            jsonrpc: '2.0',
            id: null,
            error: { code: details.status === 400 ? -32700 : -32000, message: details.message },
          },
          details.status,
        );
      }
      throw error;
    } finally {
      await server.close();
    }
  });
  return app;
}

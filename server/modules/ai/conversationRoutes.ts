import { compress } from 'hono/compress';
import { z } from 'zod';
import type { AiProvider } from '../../../contracts/ai.js';
import { createRouter, type ServerContext } from '../../http/router.js';
import { readJsonRequest } from '../../http/body.js';
import { noContent, methodNotAllowed } from '../../http/responses.js';
import { statusError } from '../../infrastructure/http/errors.js';
import {
  changeConversation,
  conversationMessages,
  conversationResponse,
  deleteConversation,
  listConversations,
  markConversationRead,
} from './conversations.js';

const idSchema = z.string().min(1).max(200);
const querySchema = z.object({
  bookId: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(200).optional(),
  before: z.string().min(1).max(200).optional(),
});
const changesSchema = z
  .object({
    provider: z
      .string()
      .startsWith('api:')
      .max(220)
      .transform((value) => value as AiProvider)
      .optional(),
    model: z.string().max(500).optional(),
    reasoningEffort: z
      .enum(['auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
      .optional(),
  })
  .strict();
const readSchema = z
  .object({ messageIds: z.array(z.string().min(1).max(200)).min(1).max(100) })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw statusError(400, '对话请求参数不正确');
  return result.data;
}

function respond(c: ServerContext, value: unknown) {
  const { body, etag } = conversationResponse(value);
  c.header('ETag', etag);
  if (
    c.req
      .header('If-None-Match')
      ?.split(',')
      .some((value) => value.trim().replace(/^W\//, '') === etag || value.trim() === '*')
  )
    return c.body(null, 304);
  return c.body(body, 200, { 'Content-Type': 'application/json; charset=utf-8' });
}

export function createConversationRoutes() {
  const app = createRouter();
  app.use('*', compress({ encoding: 'gzip', contentTypeFilter: /^application\/json/ }));
  app.get('/', async (c) => {
    const { bookId, cursor, limit } = parse(querySchema, c.req.query());
    return respond(c, await listConversations(bookId, cursor, limit));
  });
  app.all('/', methodNotAllowed);
  app.get('/:id/messages', async (c) => {
    const { bookId, before, limit } = parse(querySchema, c.req.query());
    return respond(
      c,
      await conversationMessages(bookId, parse(idSchema, c.req.param('id')), before, limit),
    );
  });
  app.all('/:id/messages', methodNotAllowed);
  app.patch('/:id', async (c) => {
    await changeConversation(
      parse(idSchema, c.req.param('id')),
      parse(changesSchema, await readJsonRequest(c.req.raw, 8192)),
    );
    return noContent(c);
  });
  app.delete('/:id', async (c) => {
    await deleteConversation(parse(idSchema, c.req.param('id')));
    return noContent(c);
  });
  app.all('/:id', methodNotAllowed);
  app.post('/:id/read', async (c) => {
    const { messageIds } = parse(readSchema, await readJsonRequest(c.req.raw, 32768));
    await markConversationRead(parse(idSchema, c.req.param('id')), messageIds);
    return noContent(c);
  });
  app.all('/:id/read', methodNotAllowed);
  return app;
}

import type { HttpBindings } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';

type ServerEnvironment = { Bindings: HttpBindings };
export type ServerContext = Context<ServerEnvironment>;
export type ServerApp = Hono<ServerEnvironment>;

export function createRouter() {
  return new Hono<ServerEnvironment>();
}

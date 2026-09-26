import type { AppDependencies } from '../dependencies.js';
import { createRouter } from './router.js';
import { STATE_FILE } from '../config.js';
import { exists } from '../infrastructure/fs/files.js';
import { methodNotAllowed } from './responses.js';

export function createHealthRoutes({ mode }: Pick<AppDependencies, 'mode'>) {
  const app = createRouter();
  app.get('/', async (c) =>
    c.json({
      initialized: await exists(STATE_FILE),
      mode,
    }),
  );
  app.all('/', methodNotAllowed);
  return app;
}

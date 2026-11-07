import type { AppDependencies } from '../dependencies.js';
import { createRouter } from './router.js';
import { isPersistedStateInitialized } from '../modules/state/stateStore.js';
import { methodNotAllowed } from './responses.js';

export function createHealthRoutes({ mode }: Pick<AppDependencies, 'mode'>) {
  const app = createRouter();
  app.get('/', (c) =>
    c.json({
      initialized: isPersistedStateInitialized(),
      mode,
    }),
  );
  app.all('/', methodNotAllowed);
  return app;
}

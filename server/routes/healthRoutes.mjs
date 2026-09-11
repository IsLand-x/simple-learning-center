import { STATE_FILE } from '../config.mjs';
import { exists } from '../storage.mjs';
import { methodNotAllowed } from '../app/http.mjs';

export function registerHealthRoutes(app, { mode }) {
  app.get('/api/health', async (c) =>
    c.json({
      initialized: await exists(STATE_FILE),
      mode,
    }),
  );
  app.all('/api/health', methodNotAllowed);
}

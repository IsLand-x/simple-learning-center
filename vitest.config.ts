import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the PWA virtual module so update lifecycle tests can mock registration.
      'virtual:pwa-register': fileURLToPath(
        new URL('./node_modules/vite-plugin-pwa/dist/client/dev/register.js', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    setupFiles: ['./src/util/testing/setup.ts'],
  },
});

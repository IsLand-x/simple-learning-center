import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), sites()],
  server: {
    proxy: {
      '/acp': {
        target: 'ws://127.0.0.1:4312',
        ws: true,
      },
    },
  },
});

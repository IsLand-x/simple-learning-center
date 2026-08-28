import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sites(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'app-icon.svg', 'apple-touch-icon-180x180.png', 'og.png'],
      manifest: {
        id: '/',
        name: '学习中心 · 读书',
        short_name: '学习中心',
        description: '本地优先的个人阅读、笔记与 AI 学习中心',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#18181b',
        background_color: '#fafafa',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        navigateFallbackAllowlist: [/^\/$/, /^\/books\//, /^\/settings$/],
      },
    }),
  ],
});

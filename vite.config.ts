import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

function foliateSrcdocCompatibility(): Plugin {
  const paginatorImport = "import('./paginator.js')";
  const versionedPaginatorImport = "import('./paginator.js?learning-center-srcdoc-v1')";
  const fixedLayoutImport = "import('./fixed-layout.js')";
  const versionedFixedLayoutImport = "import('./fixed-layout.js?learning-center-srcdoc-v1')";
  const loadGuard = "if (typeof src !== 'string') throw new Error(`${src} is not string`)";
  const iframeNavigation = 'this.#iframe.src = src';
  const fixedLayoutGuard = 'if (!src) return { blank: true, element, iframe }';
  const fixedLayoutNavigation = 'iframe.src = src';

  return {
    name: 'foliate-srcdoc-compatibility',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?', 1)[0].replaceAll('\\', '/');
      if (cleanId.endsWith('/foliate-js/view.js')) {
        if (!code.includes(paginatorImport) || !code.includes(fixedLayoutImport)) {
          throw new Error('Foliate view changed: the renderer compatibility imports must be reviewed.');
        }
        return code
          .replace(paginatorImport, versionedPaginatorImport)
          .replace(fixedLayoutImport, versionedFixedLayoutImport);
      }
      if (cleanId.endsWith('/foliate-js/fixed-layout.js')) {
        if (!code.includes(fixedLayoutGuard) || !code.includes(fixedLayoutNavigation)) {
          throw new Error('Foliate fixed-layout renderer changed: the srcdoc compatibility patch must be reviewed.');
        }
        return code
          .replace(fixedLayoutGuard, `${fixedLayoutGuard}
        const srcdoc = src.startsWith('learning-center-srcdoc:')
            ? src.slice('learning-center-srcdoc:'.length) : null
        if (srcdoc != null) await new Promise(resolve => setTimeout(resolve, 0))`)
          .replace(fixedLayoutNavigation, `
            if (srcdoc == null) iframe.src = src
            else {
                const doc = iframe.contentDocument
                doc.open()
                doc.write(srcdoc)
                doc.close()
            }`);
      }
      if (!cleanId.endsWith('/foliate-js/paginator.js')) return null;
      if (
        !code.includes(loadGuard)
        || !code.includes(iframeNavigation)
      ) {
        throw new Error('Foliate paginator changed: the srcdoc compatibility patch must be reviewed.');
      }
      return code
        .replace(loadGuard, `${loadGuard}
        let srcdoc
        if (src.startsWith('learning-center-srcdoc:')) {
            srcdoc = src.slice('learning-center-srcdoc:'.length)
        }
        else if (src.startsWith('blob:')) {
            const response = await fetch(src)
            if (!response.ok) throw new Error(\`Failed to load EPUB section: \${response.status}\`)
            srcdoc = await response.text()
        }
        if (srcdoc != null) {
            await new Promise(resolve => setTimeout(resolve, 0))
        }`)
        .replace(iframeNavigation, `
            if (srcdoc == null) this.#iframe.src = src
            else {
                const doc = this.#iframe.contentDocument
                doc.open()
                doc.write(srcdoc)
                doc.close()
            }`);
    },
  };
}

export default defineConfig({
  plugins: [
    foliateSrcdocCompatibility(),
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
        display_override: ['window-controls-overlay'],
        related_applications: [
          {
            platform: 'webapp',
            url: '/manifest.webmanifest',
            id: '/',
          },
        ],
        prefer_related_applications: false,
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
    }),
  ],
  optimizeDeps: {
    exclude: ['foliate-js'],
  },
});

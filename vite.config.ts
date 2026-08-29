import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

function replaceFoliateSource(code: string, source: string, replacement: string, message: string) {
  if (!code.includes(source)) throw new Error(message);
  return code.replace(source, replacement);
}

function addFoliateAdjacentSectionPreview(code: string) {
  const fieldAnchor = '    #lastVisibleRange\n    constructor() {';
  const fields = [
    '    #lastVisibleRange',
    '    #nextPreview',
    '    #nextPreviewWrapper',
    '    #nextPreviewIndex',
    '    #nextPreviewOwnerIndex',
    '    #nextPreviewStyles',
    '    #nextPreviewSrc',
    '    #previewGeneration = 0',
    '    constructor() {',
  ].join('\n');
  let transformed = replaceFoliateSource(
    code,
    fieldAnchor,
    fields,
    'Foliate paginator changed: adjacent-section preview fields must be reviewed.',
  );

  const createViewAnchor = '    #createView() {';
  const previewMethods = [
    '    #discardNextPreview({ unload = true } = {}) {',
    '        const preview = this.#nextPreview',
    '        const wrapper = this.#nextPreviewWrapper',
    '        const index = this.#nextPreviewIndex',
    '        this.#nextPreview = null',
    '        this.#nextPreviewWrapper = null',
    '        this.#nextPreviewIndex = null',
    '        this.#nextPreviewOwnerIndex = null',
    '        this.#nextPreviewStyles = null',
    '        this.#nextPreviewSrc = null',
    '        preview?.destroy()',
    '        wrapper?.remove()',
    '        if (unload && index != null) this.sections[index]?.unload?.()',
    '    }',
    '    #positionNextPreview() {',
    '        const preview = this.#nextPreview',
    '        const wrapper = this.#nextPreviewWrapper',
    '        if (!preview || !wrapper || !this.#view || this.scrolled) return',
    '        const size = this.size',
    '        const pages = this.pages',
    '        if (!size || pages < 3) return',
    '        Object.assign(wrapper.style, {',
    "            position: 'absolute', overflow: 'hidden', pointerEvents: 'none',",
    "            zIndex: '1', left: '', right: '', top: '', bottom: '',",
    "            insetInlineStart: '', width: '', height: '',",
    '        })',
    '        Object.assign(preview.element.style, {',
    "            position: 'absolute', left: '', right: '', top: '', bottom: '',",
    "            insetInlineStart: '',",
    '        })',
    '        if (this.#vertical) {',
    "            Object.assign(wrapper.style, { left: '0', top: `${(pages - 1) * size}px`, width: '100%', height: `${size}px` })",
    "            Object.assign(preview.element.style, { left: '0', top: `-${size}px` })",
    '        } else {',
    "            Object.assign(wrapper.style, { insetInlineStart: `${(pages - 1) * size}px`, top: '0', width: `${size}px`, height: '100%' })",
    "            Object.assign(preview.element.style, { insetInlineStart: `-${size}px`, top: '0' })",
    '        }',
    '    }',
    '    #previewBeforeRender({ vertical }) {',
    '        const { width, height } = this.#container.getBoundingClientRect()',
    '        const size = vertical ? height : width',
    '        const style = getComputedStyle(this.#top)',
    "        const maxInlineSize = parseFloat(style.getPropertyValue('--_max-inline-size'))",
    "        const maxColumnCount = parseInt(style.getPropertyValue('--_max-column-count-spread'))",
    "        const margin = parseFloat(style.getPropertyValue('--_margin'))",
    "        const g = parseFloat(style.getPropertyValue('--_gap')) / 100",
    '        const gap = -g / (g - 1) * size',
    "        const flow = this.getAttribute('flow')",
    "        if (flow === 'scrolled') return { flow, margin, gap, columnWidth: maxInlineSize }",
    '        const divisor = Math.min(maxColumnCount, Math.ceil(size / maxInlineSize))',
    '        const columnWidth = vertical ? (size / divisor - margin) : (size / divisor - gap)',
    '        return { height, width, margin, gap, columnWidth }',
    '    }',
    '    #applyNextPreviewStyles(styles) {',
    '        const $$styles = this.#nextPreviewStyles',
    '        if (!$$styles) return',
    '        const [$beforeStyle, $style] = $$styles',
    '        if (Array.isArray(styles)) {',
    '            const [beforeStyle, style] = styles',
    '            $beforeStyle.textContent = beforeStyle',
    '            $style.textContent = style',
    '        } else $style.textContent = styles',
    '    }',
    '    async #prepareNextPreview() {',
    '        const ownerIndex = this.#index',
    '        const index = this.#adjacentIndex(1)',
    '        if (this.scrolled || index == null || !this.#view) {',
    '            this.#previewGeneration++',
    '            this.#discardNextPreview()',
    '            return',
    '        }',
    '        if (this.#nextPreview && this.#nextPreviewOwnerIndex === ownerIndex',
    '        && this.#nextPreviewIndex === index) {',
    '            this.#positionNextPreview()',
    '            return',
    '        }',
    '        const generation = ++this.#previewGeneration',
    '        this.#discardNextPreview()',
    '        let src',
    '        try {',
    '            src = await this.sections[index].load()',
    '        } catch (e) {',
    '            console.warn(e)',
    '            return',
    '        }',
    '        if (generation !== this.#previewGeneration || ownerIndex !== this.#index || !this.#view) {',
    '            this.sections[index]?.unload?.()',
    '            return',
    '        }',
    '        if (!src) {',
    '            this.sections[index]?.unload?.()',
    '            return',
    '        }',
    '        const ownerView = this.#view',
    "        const wrapper = document.createElement('div')",
    "        wrapper.setAttribute('aria-hidden', 'true')",
    '        wrapper.inert = true',
    "        wrapper.style.visibility = 'hidden'",
    '        let preview',
    '        preview = new View({',
    '            container: this,',
    '            onExpand: () => {',
    '                if (this.#nextPreview === preview) this.#positionNextPreview()',
    '                else if (this.#view === preview) this.#scrollToAnchor(this.#anchor)',
    '            },',
    '        })',
    '        this.#nextPreview = preview',
    '        this.#nextPreviewWrapper = wrapper',
    '        this.#nextPreviewIndex = index',
    '        this.#nextPreviewOwnerIndex = ownerIndex',
    '        this.#nextPreviewSrc = src',
    '        ownerView.element.append(wrapper)',
    '        wrapper.append(preview.element)',
    '        try {',
    '            await preview.load(src, doc => {',
    '                if (!doc.head) return',
    "                const $styleBefore = doc.createElement('style')",
    '                doc.head.prepend($styleBefore)',
    "                const $style = doc.createElement('style')",
    '                doc.head.append($style)',
    '                this.#styleMap.set(doc, [$styleBefore, $style])',
    '                this.#nextPreviewStyles = [$styleBefore, $style]',
    '                this.#applyNextPreviewStyles(this.#styles)',
    '            }, this.#previewBeforeRender.bind(this))',
    '            if (generation !== this.#previewGeneration || ownerView !== this.#view',
    '            || this.#nextPreview !== preview) {',
    '                if (this.#nextPreview === preview) this.#discardNextPreview()',
    '                else this.sections[index]?.unload?.()',
    '                return',
    '            }',
    "            wrapper.style.visibility = ''",
    '            this.#positionNextPreview()',
    '        } catch (e) {',
    '            console.warn(e)',
    '            if (this.#nextPreview === preview) this.#discardNextPreview()',
    '        }',
    '    }',
    '    async #promoteNextPreview({ index, anchor, onLoad, select }) {',
    '        const preview = this.#nextPreview',
    '        const wrapper = this.#nextPreviewWrapper',
    '        const src = this.#nextPreviewSrc',
    '        if (!preview || !wrapper || !src || index !== this.#nextPreviewIndex) return false',
    '        const oldView = this.#view',
    '        const hasFocus = oldView?.document?.hasFocus()',
    '        let nextView',
    '        nextView = new View({',
    '            container: this,',
    '            onExpand: () => {',
    '                if (this.#view === nextView) this.#scrollToAnchor(this.#anchor)',
    '            },',
    '        })',
    '        Object.assign(nextView.element.style, {',
    "            position: 'absolute', visibility: 'hidden', left: '0', top: '0',",
    '        })',
    '        this.#container.append(nextView.element)',
    '        let doc',
    '        try {',
    '            await nextView.load(src, loadedDoc => {',
    '                doc = loadedDoc',
    '                if (!loadedDoc.head) return',
    "                const $styleBefore = loadedDoc.createElement('style')",
    '                loadedDoc.head.prepend($styleBefore)',
    "                const $style = loadedDoc.createElement('style')",
    '                loadedDoc.head.append($style)',
    '                this.#styleMap.set(loadedDoc, [$styleBefore, $style])',
    '                if (Array.isArray(this.#styles)) {',
    '                    const [beforeStyle, style] = this.#styles',
    '                    $styleBefore.textContent = beforeStyle',
    '                    $style.textContent = style',
    '                } else $style.textContent = this.#styles',
    '            }, this.#beforeRender.bind(this))',
    '        } catch (e) {',
    '            console.warn(e)',
    '            nextView.destroy()',
    '            nextView.element.remove()',
    '            return false',
    '        }',
    '        if (!doc || this.#view !== oldView || index !== this.#nextPreviewIndex) {',
    '            nextView.destroy()',
    '            nextView.element.remove()',
    '            return false',
    '        }',
    '        this.#previewGeneration++',
    '        this.#discardNextPreview({ unload: false })',
    '        oldView?.destroy()',
    '        oldView?.element.remove()',
    '        Object.assign(nextView.element.style, {',
    "            position: 'relative', visibility: 'hidden', left: '', top: '',",
    '        })',
    '        this.#view = nextView',
    '        this.#index = index',
    '        onLoad?.({ doc, index })',
    "        this.dispatchEvent(new CustomEvent('create-overlayer', {",
    '            detail: {',
    '                doc, index, attach: overlayer => nextView.overlayer = overlayer,',
    '            },',
    '        }))',
    '        await this.scrollToAnchor((typeof anchor === \'function\' ? anchor(doc) : anchor) ?? 0, select)',
    "        nextView.element.style.visibility = ''",
    '        if (hasFocus) this.focusView()',
    '        return true',
    '    }',
    createViewAnchor,
  ].join('\n');
  transformed = replaceFoliateSource(
    transformed,
    createViewAnchor,
    previewMethods,
    'Foliate paginator changed: adjacent-section preview methods must be reviewed.',
  );

  const renderSource = [
    '    render() {',
    '        if (!this.#view) return',
    '        this.#view.render(this.#beforeRender({',
    '            vertical: this.#vertical,',
    '            rtl: this.#rtl,',
    '        }))',
    '        this.#scrollToAnchor(this.#anchor)',
    '    }',
  ].join('\n');
  const renderReplacement = [
    '    render() {',
    '        if (!this.#view) return',
    '        this.#view.render(this.#beforeRender({',
    '            vertical: this.#vertical,',
    '            rtl: this.#rtl,',
    '        }))',
    '        const previewDoc = this.#nextPreview?.document',
    '        if (previewDoc) this.#nextPreview.render(',
    '            this.#previewBeforeRender(getDirection(previewDoc)))',
    '        this.#positionNextPreview()',
    '        this.#scrollToAnchor(this.#anchor)',
    '    }',
  ].join('\n');
  transformed = replaceFoliateSource(
    transformed,
    renderSource,
    renderReplacement,
    'Foliate paginator changed: adjacent-section preview rendering must be reviewed.',
  );

  const goToSource = [
    '    async #goTo({ index, anchor, select }) {',
    '        if (index === this.#index) await this.#display({ index, anchor, select })',
    '        else {',
    '            const oldIndex = this.#index',
    '            const onLoad = detail => {',
    '                this.sections[oldIndex]?.unload?.()',
    '                this.setStyles(this.#styles)',
    "                this.dispatchEvent(new CustomEvent('load', { detail }))",
    '            }',
    '            await this.#display(Promise.resolve(this.sections[index].load())',
    '                .then(src => ({ index, src, anchor, onLoad, select }))',
    '                .catch(e => {',
    '                    console.warn(e)',
    '                    console.warn(new Error(`Failed to load section ${index}`))',
    '                    return {}',
    '                }))',
    '        }',
    '    }',
  ].join('\n');
  const goToReplacement = [
    '    async #goTo({ index, anchor, select }) {',
    '        if (index === this.#index) await this.#display({ index, anchor, select })',
    '        else {',
    '            const oldIndex = this.#index',
    '            const onLoad = detail => {',
    '                this.sections[oldIndex]?.unload?.()',
    '                this.setStyles(this.#styles)',
    "                this.dispatchEvent(new CustomEvent('load', { detail }))",
    '            }',
    '            if (!await this.#promoteNextPreview({ index, anchor, onLoad, select })) {',
    '                this.#previewGeneration++',
    '                this.#discardNextPreview()',
    '                await this.#display(Promise.resolve(this.sections[index].load())',
    '                    .then(src => ({ index, src, anchor, onLoad, select }))',
    '                    .catch(e => {',
    '                        console.warn(e)',
    '                        console.warn(new Error(`Failed to load section ${index}`))',
    '                        return {}',
    '                    }))',
    '            }',
    '        }',
    '        void this.#prepareNextPreview()',
    '    }',
  ].join('\n');
  transformed = replaceFoliateSource(
    transformed,
    goToSource,
    goToReplacement,
    'Foliate paginator changed: adjacent-section preview navigation must be reviewed.',
  );

  const styleSource = '        } else $style.textContent = styles\n\n        // NOTE: needs `requestAnimationFrame` in Chromium';
  const styleReplacement = '        } else $style.textContent = styles\n        this.#applyNextPreviewStyles(styles)\n\n        // NOTE: needs `requestAnimationFrame` in Chromium';
  transformed = replaceFoliateSource(
    transformed,
    styleSource,
    styleReplacement,
    'Foliate paginator changed: adjacent-section preview styles must be reviewed.',
  );

  const destroySource = [
    '    destroy() {',
    '        this.#observer.unobserve(this)',
    '        this.#view.destroy()',
    '        this.#view = null',
  ].join('\n');
  const destroyReplacement = [
    '    destroy() {',
    '        this.#previewGeneration++',
    '        this.#discardNextPreview()',
    '        this.#observer.unobserve(this)',
    '        this.#view.destroy()',
    '        this.#view = null',
  ].join('\n');
  return replaceFoliateSource(
    transformed,
    destroySource,
    destroyReplacement,
    'Foliate paginator changed: adjacent-section preview cleanup must be reviewed.',
  );
}

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
      const transformed = code
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
                if (!doc) resolve()
                else {
                    doc.open()
                    doc.write(srcdoc)
                    doc.close()
                }
            }`);
      return addFoliateAdjacentSectionPreview(transformed);
    },
  };
}

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
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

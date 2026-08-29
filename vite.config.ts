import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

function readGitMetadata(args: string[]) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const appRevision = process.env.APP_BUILD_REVISION?.trim()
  || readGitMetadata(['rev-parse', 'HEAD'])
  || 'local';
const appUpdatedAt = process.env.APP_UPDATED_AT?.trim()
  || readGitMetadata(['show', '-s', '--format=%cI', 'HEAD'])
  || new Date().toISOString();

function replaceFoliateSource(code: string, source: string, replacement: string, message: string) {
  if (!code.includes(source)) throw new Error(message);
  return code.replace(source, replacement);
}

function addFoliateAdjacentSectionPreview(code: string) {
  const fieldAnchor = '    #lastVisibleRange\n    constructor() {';
  const fields = [
    '    #lastVisibleRange',
    '    #touchFrame',
    '    #touchDeltaX = 0',
    '    #touchDeltaY = 0',
    '    #adjacentPreviews = new Map()',
    '    #previewGenerations = new Map([[-1, 0], [1, 0]])',
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
    '    #bumpPreviewGeneration(dir) {',
    '        const generation = (this.#previewGenerations.get(dir) ?? 0) + 1',
    '        this.#previewGenerations.set(dir, generation)',
    '        return generation',
    '    }',
    '    #discardPreview(dir, { unload = true } = {}) {',
    '        const state = this.#adjacentPreviews.get(dir)',
    '        if (!state) return',
    '        this.#adjacentPreviews.delete(dir)',
    '        state.view.destroy()',
    '        state.wrapper.remove()',
    '        if (unload && state.index != null) this.sections[state.index]?.unload?.()',
    '    }',
    '    #positionPreview(dir) {',
    '        const state = this.#adjacentPreviews.get(dir)',
    '        if (!state || !this.#view || this.scrolled) return',
    '        const { view: preview, wrapper } = state',
    '        const size = this.size',
    '        const ownerPages = this.pages',
    '        if (!size || ownerPages < 3) return',
    '        const previewPages = Math.round(preview.element.getBoundingClientRect()[this.sideProp] / size)',
    '        if (previewPages < 3) return',
    '        const ownerOffset = dir > 0 ? (ownerPages - 1) * size : 0',
    '        const previewOffset = dir > 0 ? size : (previewPages - 2) * size',
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
    "            Object.assign(wrapper.style, { left: '0', top: `${ownerOffset}px`, width: '100%', height: `${size}px` })",
    "            Object.assign(preview.element.style, { left: '0', top: `-${previewOffset}px` })",
    '        } else {',
    "            Object.assign(wrapper.style, { insetInlineStart: `${ownerOffset}px`, top: '0', width: `${size}px`, height: '100%' })",
    "            Object.assign(preview.element.style, { insetInlineStart: `-${previewOffset}px`, top: '0' })",
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
    '    #applyPreviewStyles(state, styles) {',
    '        const $$styles = state?.styles',
    '        if (!$$styles) return',
    '        const [$beforeStyle, $style] = $$styles',
    '        if (Array.isArray(styles)) {',
    '            const [beforeStyle, style] = styles',
    '            $beforeStyle.textContent = beforeStyle',
    '            $style.textContent = style',
    '        } else $style.textContent = styles',
    '    }',
    '    async #preparePreview(dir) {',
    '        const ownerIndex = this.#index',
    '        const index = this.#adjacentIndex(dir)',
    '        if (this.scrolled || index == null || !this.#view) {',
    '            this.#bumpPreviewGeneration(dir)',
    '            this.#discardPreview(dir)',
    '            return',
    '        }',
    '        const current = this.#adjacentPreviews.get(dir)',
    '        if (current && current.ownerIndex === ownerIndex && current.index === index) {',
    '            this.#positionPreview(dir)',
    '            return',
    '        }',
    '        const generation = this.#bumpPreviewGeneration(dir)',
    '        this.#discardPreview(dir)',
    '        let src',
    '        try {',
    '            src = await this.sections[index].load()',
    '        } catch (e) {',
    '            console.warn(e)',
    '            return',
    '        }',
    '        if (generation !== this.#previewGenerations.get(dir) || ownerIndex !== this.#index || !this.#view) {',
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
    '                if (this.#adjacentPreviews.get(dir)?.view === preview) this.#positionPreview(dir)',
    '                else if (this.#view === preview) this.#scrollToAnchor(this.#anchor)',
    '            },',
    '        })',
    '        const state = { view: preview, wrapper, index, ownerIndex, src, styles: null }',
    '        this.#adjacentPreviews.set(dir, state)',
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
    '                state.styles = [$styleBefore, $style]',
    '                this.#applyPreviewStyles(state, this.#styles)',
    '            }, this.#previewBeforeRender.bind(this))',
    '            await preview.document?.fonts?.ready',
    '            if (generation !== this.#previewGenerations.get(dir) || ownerView !== this.#view',
    '            || this.#adjacentPreviews.get(dir)?.view !== preview) {',
    '                if (this.#adjacentPreviews.get(dir)?.view === preview) this.#discardPreview(dir)',
    '                else this.sections[index]?.unload?.()',
    '                return',
    '            }',
    "            wrapper.style.visibility = ''",
    '            this.#positionPreview(dir)',
    '        } catch (e) {',
    '            console.warn(e)',
    '            if (this.#adjacentPreviews.get(dir)?.view === preview) this.#discardPreview(dir)',
    '        }',
    '    }',
    '    async #promotePreview(dir, { index, anchor, onLoad, select }) {',
    '        const state = this.#adjacentPreviews.get(dir)',
    '        if (!state?.src || index !== state.index) return false',
    '        const { src } = state',
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
    '            await doc?.fonts?.ready',
    '        } catch (e) {',
    '            console.warn(e)',
    '            nextView.destroy()',
    '            nextView.element.remove()',
    '            return false',
    '        }',
    '        if (!doc || this.#view !== oldView || this.#adjacentPreviews.get(dir) !== state) {',
    '            nextView.destroy()',
    '            nextView.element.remove()',
    '            return false',
    '        }',
    '        this.#bumpPreviewGeneration(-1)',
    '        this.#bumpPreviewGeneration(1)',
    '        this.#discardPreview(dir, { unload: false })',
    '        this.#discardPreview(-dir)',
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
    '        for (const dir of [-1, 1]) {',
    '            const preview = this.#adjacentPreviews.get(dir)?.view',
    '            const previewDoc = preview?.document',
    '            if (previewDoc) preview.render(',
    '                this.#previewBeforeRender(getDirection(previewDoc)))',
    '            this.#positionPreview(dir)',
    '        }',
    '        this.#scrollToAnchor(this.#anchor)',
    '    }',
  ].join('\n');
  transformed = replaceFoliateSource(
    transformed,
    renderSource,
    renderReplacement,
    'Foliate paginator changed: adjacent-section preview rendering must be reviewed.',
  );

  const touchPagingSource = [
    '    #onTouchStart(e) {',
    '        const touch = e.changedTouches[0]',
    '        this.#touchState = {',
    '            x: touch?.screenX, y: touch?.screenY,',
    '            t: e.timeStamp,',
    '            vx: 0, xy: 0,',
    '        }',
    '    }',
    '    #onTouchMove(e) {',
    '        const state = this.#touchState',
    '        if (state.pinched) return',
    '        state.pinched = globalThis.visualViewport.scale > 1',
    '        if (this.scrolled || state.pinched) return',
    '        if (e.touches.length > 1) {',
    '            if (this.#touchScrolled) e.preventDefault()',
    '            return',
    '        }',
    '        const doc = this.#view?.document',
    '        const selection = doc?.getSelection()',
    '        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {',
    '            return',
    '        }',
    '        e.preventDefault()',
    '        const touch = e.changedTouches[0]',
    '        const x = touch.screenX, y = touch.screenY',
    '        const dx = state.x - x, dy = state.y - y',
    '        const dt = e.timeStamp - state.t',
    '        state.x = x',
    '        state.y = y',
    '        state.t = e.timeStamp',
    '        state.vx = dx / dt',
    '        state.vy = dy / dt',
    '        this.#touchScrolled = true',
    '        if (Math.abs(dx) >= Math.abs(dy)) {',
    '            this.scrollBy(dx, 0)',
    '        } else if (Math.abs(dy) > Math.abs(dx)) {',
    '            this.scrollBy(0, dy)',
    '        }',
    '    }',
    '    #onTouchEnd() {',
    '        this.#touchScrolled = false',
    '        if (this.scrolled) return',
    '',
    '        // XXX: Firefox seems to report scale as 1... sometimes...?',
    "        // at this point I'm basically throwing `requestAnimationFrame` at",
    "        // anything that doesn't work",
    '        requestAnimationFrame(() => {',
    '            if (globalThis.visualViewport.scale === 1)',
    '                this.snap(this.#touchState.vx, this.#touchState.vy)',
    '        })',
    '    }',
  ].join('\n');
  const touchPagingReplacement = [
    '    #queueTouchScroll(dx, dy) {',
    '        this.#touchDeltaX += dx',
    '        this.#touchDeltaY += dy',
    '        if (this.#touchFrame != null) return',
    '        this.#touchFrame = requestAnimationFrame(() => this.#flushTouchScroll())',
    '    }',
    '    #flushTouchScroll() {',
    '        if (this.#touchFrame != null) cancelAnimationFrame(this.#touchFrame)',
    '        this.#touchFrame = null',
    '        const dx = this.#touchDeltaX',
    '        const dy = this.#touchDeltaY',
    '        this.#touchDeltaX = 0',
    '        this.#touchDeltaY = 0',
    '        if (dx || dy) this.scrollBy(dx, dy)',
    '    }',
    '    cancelTouchScroll() {',
    '        if (this.#touchFrame != null) cancelAnimationFrame(this.#touchFrame)',
    '        this.#touchFrame = null',
    '        this.#touchDeltaX = 0',
    '        this.#touchDeltaY = 0',
    '    }',
    '    #onTouchStart(e) {',
    '        this.cancelTouchScroll()',
    '        const touch = e.changedTouches[0]',
    '        this.#touchState = {',
    '            x: touch?.screenX, y: touch?.screenY,',
    '            t: e.timeStamp,',
    '            vx: 0, xy: 0,',
    '        }',
    '    }',
    '    #onTouchMove(e) {',
    '        const state = this.#touchState',
    '        if (state.pinched) return',
    '        state.pinched = globalThis.visualViewport.scale > 1',
    '        if (this.scrolled || state.pinched) return',
    '        if (e.touches.length > 1) {',
    '            if (this.#touchScrolled) e.preventDefault()',
    '            return',
    '        }',
    '        const doc = this.#view?.document',
    '        const selection = doc?.getSelection()',
    '        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {',
    '            return',
    '        }',
    '        e.preventDefault()',
    '        const touch = e.changedTouches[0]',
    '        const x = touch.screenX, y = touch.screenY',
    '        const dx = state.x - x, dy = state.y - y',
    '        const dt = e.timeStamp - state.t',
    '        state.x = x',
    '        state.y = y',
    '        state.t = e.timeStamp',
    '        state.vx = dx / dt',
    '        state.vy = dy / dt',
    '        this.#touchScrolled = true',
    '        if (Math.abs(dx) >= Math.abs(dy)) {',
    '            this.#queueTouchScroll(dx, 0)',
    '        } else if (Math.abs(dy) > Math.abs(dx)) {',
    '            this.#queueTouchScroll(0, dy)',
    '        }',
    '    }',
    '    #onTouchEnd() {',
    '        this.#flushTouchScroll()',
    '        this.#touchScrolled = false',
    '        if (this.scrolled) return',
    '',
    '        // XXX: Firefox seems to report scale as 1... sometimes...?',
    "        // at this point I'm basically throwing `requestAnimationFrame` at",
    "        // anything that doesn't work",
    '        requestAnimationFrame(() => {',
    '            if (globalThis.visualViewport.scale === 1)',
    '                this.snap(this.#touchState.vx, this.#touchState.vy)',
    '        })',
    '    }',
  ].join('\n');
  transformed = replaceFoliateSource(
    transformed,
    touchPagingSource,
    touchPagingReplacement,
    'Foliate paginator changed: touch paging optimization must be reviewed.',
  );

  const pageAnimationSource = [
    '            this.containerPosition, offset, 300, easeOutQuad,',
    '            x => this.containerPosition = x,',
  ].join('\n');
  const pageAnimationReplacement = [
    '            this.containerPosition, offset,',
    '            Math.max(140, Math.min(240,',
    '                Math.abs(offset - this.containerPosition) / size * 240)),',
    '            easeOutQuad, x => this.containerPosition = x,',
  ].join('\n');
  transformed = replaceFoliateSource(
    transformed,
    pageAnimationSource,
    pageAnimationReplacement,
    'Foliate paginator changed: page animation duration must be reviewed.',
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
    '            const dir = index < oldIndex ? -1 : 1',
    '            if (!await this.#promotePreview(dir, { index, anchor, onLoad, select })) {',
    '                this.#bumpPreviewGeneration(-1)',
    '                this.#bumpPreviewGeneration(1)',
    '                this.#discardPreview(-1)',
    '                this.#discardPreview(1)',
    '                await this.#display(Promise.resolve(this.sections[index].load())',
    '                    .then(src => ({ index, src, anchor, onLoad, select }))',
    '                    .catch(e => {',
    '                        console.warn(e)',
    '                        console.warn(new Error(`Failed to load section ${index}`))',
    '                        return {}',
    '                    }))',
    '            }',
    '        }',
    '        void Promise.all([this.#preparePreview(-1), this.#preparePreview(1)])',
    '    }',
  ].join('\n');
  transformed = replaceFoliateSource(
    transformed,
    goToSource,
    goToReplacement,
    'Foliate paginator changed: adjacent-section preview navigation must be reviewed.',
  );

  const styleSource = '        } else $style.textContent = styles\n\n        // NOTE: needs `requestAnimationFrame` in Chromium';
  const styleReplacement = '        } else $style.textContent = styles\n        for (const state of this.#adjacentPreviews.values())\n            this.#applyPreviewStyles(state, styles)\n\n        // NOTE: needs `requestAnimationFrame` in Chromium';
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
    '        this.#bumpPreviewGeneration(-1)',
    '        this.#bumpPreviewGeneration(1)',
    '        this.#discardPreview(-1)',
    '        this.#discardPreview(1)',
    '        this.cancelTouchScroll()',
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
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_REVISION__: JSON.stringify(appRevision),
    __APP_UPDATED_AT__: JSON.stringify(appUpdatedAt),
  },
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

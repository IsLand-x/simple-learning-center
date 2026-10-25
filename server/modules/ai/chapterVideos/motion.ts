import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { makeCancelSignal, openBrowser, renderMedia, renderStill } from '@remotion/renderer';
import type { MotionSceneProps } from './composition/ChapterMotionScene.js';

const serveUrl = fileURLToPath(new URL('../../../video/', import.meta.url));

export async function createMotionRenderer(signal: AbortSignal) {
  signal.throwIfAborted();
  const executable =
    process.env.LEARNING_CENTER_CHROMIUM ||
    [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].find(existsSync);
  const browser = await openBrowser('chrome', {
    browserExecutable: executable,
    logLevel: 'error',
  });
  if (signal.aborted) {
    await browser.close({ silent: true });
    signal.throwIfAborted();
  }
  const { cancelSignal, cancel } = makeCancelSignal();
  signal.addEventListener('abort', cancel, { once: true });
  return {
    async render(
      props: MotionSceneProps,
      duration: number,
      output: string,
      poster: string | undefined,
      onProgress: (percent: number) => void,
    ) {
      const durationInFrames = Math.round(duration * 30);
      const composition = {
        id: 'ChapterScene',
        width: 1280,
        height: 720,
        fps: 30,
        durationInFrames,
        props,
        defaultProps: props,
        defaultCodec: null,
        defaultOutName: null,
        defaultVideoImageFormat: null,
        defaultPixelFormat: null,
        defaultProResProfile: null,
        defaultSampleRate: null,
      };
      let reported = -1;
      await renderMedia({
        serveUrl,
        composition,
        inputProps: props,
        codec: 'h264',
        outputLocation: output,
        puppeteerInstance: browser,
        concurrency: 2,
        cancelSignal,
        logLevel: 'error',
        crf: 20,
        onProgress: ({ progress }) => {
          const percent = Math.floor(progress * 20) * 5;
          if (percent !== reported) {
            reported = percent;
            onProgress(percent);
          }
        },
      });
      if (poster)
        await renderStill({
          serveUrl,
          composition,
          inputProps: props,
          output: poster,
          frame: Math.floor(durationInFrames * 0.65),
          puppeteerInstance: browser,
          imageFormat: 'png',
          cancelSignal,
          logLevel: 'error',
        });
    },
    async close() {
      signal.removeEventListener('abort', cancel);
      await browser.close({ silent: true });
    },
  };
}

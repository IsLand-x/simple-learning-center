import { parentPort, workerData } from 'node:worker_threads';
import { Resvg } from '@resvg/resvg-js';
import { executeSvgScript } from './script.js';
import { validateDiagramSvg } from './svg.js';

try {
  if (typeof workerData !== 'string') throw new Error('绘图脚本无效。');
  const { svg, width, height, labels } = validateDiagramSvg(await executeSvgScript(workerData));
  const renderer = new Resvg(svg, {
    background: '#ffffff',
    font: {
      defaultFontFamily: 'Noto Sans CJK SC',
      loadSystemFonts: true,
      fontFiles: process.env.LEARNING_CENTER_DIAGRAM_FONT
        ? [process.env.LEARNING_CENTER_DIAGRAM_FONT]
        : undefined,
    },
  });
  const png = renderer.render().asPng();
  if (png.length > 8 * 1024 * 1024) throw new Error('绘图文件过大。');
  parentPort?.postMessage({ png, width, height, labels });
} catch (error) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : '本地绘图失败。' });
}

import { getQuickJS } from 'quickjs-emscripten';

// No host functions, module loader, filesystem, network or process are exposed.
export async function executeSvgScript(script: string) {
  if (!script.trim() || script.length > 40_000) throw new Error('绘图脚本须为 1—40000 字符。');
  const quickJS = await getQuickJS();
  const runtime = quickJS.newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + 1500;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const context = runtime.newContext();
  try {
    const result = context.evalCode(`(() => { "use strict";\n${script}\n})()`);
    if (result.error) {
      result.error.dispose();
      throw new Error('绘图脚本执行失败或超过资源限制，请检查语法、计算与返回值。');
    }
    try {
      if (context.typeof(result.value) !== 'string')
        throw new Error('绘图脚本必须 return 完整 SVG 字符串。');
      const svg = context.getString(result.value);
      if (svg.length > 160_000) throw new Error('SVG 超过 160000 字符，请简化图形。');
      return svg;
    } finally {
      result.value.dispose();
    }
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

// Keep downloaded model code as data, with the same lack of host APIs. Do not
// recommend running it directly in Node, where dormant branches could access files.
export function runnableDiagramScript(script: string) {
  return `// 安装依赖：npm install quickjs-emscripten
// 运行：node diagram.js > diagram.svg
(async () => {
  const { getQuickJS } = await import('quickjs-emscripten');
  const runtime = (await getQuickJS()).newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + 1500;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const context = runtime.newContext();
  try {
    const result = context.evalCode(${JSON.stringify(`(() => { "use strict";\n${script}\n})()`)});
    if (result.error) {
      result.error.dispose();
      throw new Error('绘图脚本执行失败或超过资源限制');
    }
    try {
      if (context.typeof(result.value) !== 'string') throw new Error('脚本未返回 SVG');
      const svg = context.getString(result.value);
      if (svg.length > 160000) throw new Error('SVG 过大');
      console.log(svg);
    } finally { result.value.dispose(); }
  } finally { context.dispose(); runtime.dispose(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
`;
}

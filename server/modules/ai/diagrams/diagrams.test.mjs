import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createModels,
  getCurrentTools,
  getCurrentSystemPrompt,
  fauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai';
import { executeSvgScript } from './script.js';
import { runnableDiagramScript } from './script.js';
import { spawnSync } from 'node:child_process';
import { validateDiagramSvg } from './svg.js';
import { renderDiagram } from './renderer.js';
import { createDiagramTools } from './tools.js';
import { runServerAiChat } from '../chat.js';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect x="10" y="10" width="100" height="80" fill="#2463ab"/><text x="30" y="150" font-size="24">示例数据</text></svg>';
const script = `if (Math.abs(Math.sin(Math.PI)) > 1e-10) throw new Error('公式自检失败'); return ${JSON.stringify(svg)};`;
const input = {
  title: '关系示意',
  kind: 'schematic',
  basis: '原文定义',
  assumptions: ['仅用于说明关系，非按比例'],
  checks: ['核对原文定义；执行 sin(π) 数值断言'],
  example_data: true,
  explanation: '颜色表示同一种关系。',
  script,
};
const imageUrl = '/api/books/book/knowledge-maps/11111111-1111-4111-8111-111111111111';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

test('脚本可计算并断言；宿主能力不可见，脚本错误、无限循环与内存滥用受限', async () => {
  assert.equal(await executeSvgScript(script), svg);
  const capabilities = await executeSvgScript(
    'return [typeof process, typeof require, typeof fetch, typeof console].join(",");',
  );
  assert.equal(capabilities, 'undefined,undefined,undefined,undefined');
  for (const bad of [
    'while (true) {}',
    'return "x".repeat(100_000_000);',
    'throw new Error("失败");',
    'return 42;',
    'return "x".repeat(160_001);',
    'return import("node:fs");',
  ])
    await assert.rejects(executeSvgScript(bad));
});

test('SVG 拒绝外部资源、实体、脚本、事件、样式与越界画布', () => {
  assert.equal(validateDiagramSvg(svg).width, 600);
  for (const bad of [
    svg.replace('<rect ', '<image href="file:///data/state.json" '),
    svg.replace('<rect ', '<rect onclick="alert(1)" '),
    svg.replace('<rect ', '<rect style="fill:url(https://example.com)" '),
    svg.replace('fill="#2463ab"', 'fill="url(file:///data/state.json)"'),
    svg.replace('width="600"', 'width="60000"'),
    svg.replace('0 0 600 400', '0 0 500 400'),
    svg.replace('</svg>', '<script>evil()</script></svg>'),
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///data/state.json">]>' + svg,
    svg.replace('<rect ', '<rect bogus="x" '),
    svg.replace('x="10"', 'x="NaN"'),
  ])
    assert.throws(() => validateDiagramSvg(bad));
});

test('下载脚本可直接复现，模型代码始终在隔离环境中运行', () => {
  const source = runnableDiagramScript(
    `if (typeof process !== 'undefined') throw new Error('宿主泄漏'); ${script}`,
  );
  const result = spawnSync(process.execPath, ['--input-type=commonjs', '-e', source], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), svg);
});

test('实际 worker 执行脚本生成可解码 PNG，取消不得继续渲染', async () => {
  const result = await renderDiagram(script);
  assert.deepEqual(result.png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(result.png.readUInt32BE(16), 600);
  assert.equal(result.png.readUInt32BE(20), 400);
  const controller = new AbortController();
  const pending = renderDiagram('while(true) {}', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(renderDiagram(script, controller.signal), { name: 'AbortError' });
});

test('绘图去重、串行执行、失败不保存，修正与尝试上限独立于 AI 生图', async () => {
  let active = 0;
  let renders = 0;
  let saves = 0;
  const results = [];
  const tool = createDiagramTools({
    book: { id: 'book' },
    supportsImages: false,
    onResult: (value) => results.push(value),
    render: async (source) => {
      assert.equal(active++, 0);
      renders++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      if (source === 'bad') throw new Error('脚本失败');
      return { png, width: 600, height: 400, labels: '示例数据' };
    },
    save: async () => {
      saves++;
      return imageUrl;
    },
  }).render_diagram;
  await assert.rejects(tool.execute({ ...input, script: 'bad' }), /脚本失败/);
  assert.equal(saves, 0);
  const [a, b] = await Promise.all([tool.execute(input), tool.execute(input)]);
  assert.equal(a, b);
  assert.equal(renders, 2);
  assert.equal(saves, 1);
  assert.equal(results.length, 1);
  assert.match(a.visualInspection, /尚未进行成图视觉检查/);
  assert.equal(tool.modelContent(a).length, 1);
  await Promise.all([
    tool.execute({ ...input, title: '第二图' }),
    tool.execute({ ...input, title: '第三图' }),
  ]);
  await assert.rejects(tool.execute({ ...input, title: '超限' }), /最多尝试 4/);
});

test('示例数据缺少图内声明或渲染取消时不保存、不展示图片', async () => {
  for (const cancelled of [false, true]) {
    const controller = new AbortController();
    const tool = createDiagramTools({
      book: { id: 'book' },
      supportsImages: false,
      onResult: () => assert.fail('不能展示未保存图片'),
      render: async () => {
        if (cancelled) controller.abort();
        return { png, width: 600, height: 400, labels: cancelled ? '示例数据' : '未注明数据性质' };
      },
      save: async () => assert.fail('不能保存无声明或已取消的绘图'),
    }).render_diagram;
    await assert.rejects(
      tool.execute(input, controller.signal),
      cancelled ? { name: 'AbortError' } : /图内/,
    );
  }
});

for (const supportsImages of [false, true]) {
  test(`阅读 Agent 保存并展示脚本图，按模型能力返回成图（图片输入=${supportsImages}）`, async () => {
    const faux = fauxProvider({
      tokensPerSecond: 0,
      models: [{ id: 'mock', input: supportsImages ? ['text', 'image'] : ['text'] }],
    });
    faux.setResponses([
      (context) => {
        assert.ok(getCurrentTools(context.messages).some((tool) => tool.name === 'render_diagram'));
        assert.match(getCurrentSystemPrompt(context.messages), /主动调用 render_diagram/);
        return fauxAssistantMessage(fauxToolCall('render_diagram', input, { id: 'diagram-1' }), {
          stopReason: 'toolUse',
        });
      },
      (context) => {
        const result = context.messages.find((message) => message.role === 'toolResult');
        assert.ok(result);
        assert.equal(
          result.content.some((part) => part.type === 'image'),
          supportsImages,
        );
        return fauxAssistantMessage(
          supportsImages ? '已查看成图，关系如图所示。' : '图片已生成，当前模型无法进行视觉检查。',
        );
      },
    ]);
    const models = createModels();
    models.setProvider(faux.provider);
    const progress = [];
    const result = await runServerAiChat({
      config: { baseUrl: 'https://example.invalid/v1' },
      model: 'mock',
      conversationId: 'diagram-test',
      messages: [{ role: 'user', content: '解释关系' }],
      book: { id: 'book', title: '测试' },
      currentText: '',
      notes: [],
      highlights: [],
      readingSessions: [],
      webSearchConfig: {},
      runtimeFactory: () => ({ models, model: faux.getModel() }),
      diagramRender: async () => ({ png, width: 600, height: 400, labels: '示例数据' }),
      diagramSave: async () => imageUrl,
      onProgress: (value) => progress.push(value),
    });
    assert.match(result.content, /!\[关系示意\]/);
    assert.ok(result.content.includes(`${imageUrl}/script`));
    assert.match(result.content, /示例数据/);
    assert.ok(!result.content.includes(png.toString('base64')));
    assert.ok(progress.some((value) => value.content.includes(imageUrl)));
  });
}

test('RSS、视频、日报与术语释义不暴露绘图工具或主动绘图指令', async () => {
  for (const [resourceType, purpose] of [
    ['rss', 'chat'],
    ['video', 'chat'],
    ['rssDigest', 'digest'],
    ['book', 'glossary'],
  ]) {
    const faux = fauxProvider({ tokensPerSecond: 0 });
    faux.setResponses([
      (context) => {
        assert.ok(
          !getCurrentTools(context.messages).some((tool) => tool.name === 'render_diagram'),
        );
        assert.doesNotMatch(getCurrentSystemPrompt(context.messages), /主动调用 render_diagram/);
        return fauxAssistantMessage('完成');
      },
    ]);
    const models = createModels();
    models.setProvider(faux.provider);
    await runServerAiChat({
      config: { baseUrl: 'https://example.invalid/v1' },
      model: 'mock',
      resourceType,
      purpose,
      conversationId: 'scope',
      messages: [{ role: 'user', content: '解释' }],
      book: { id: 'book' },
      currentText: '',
      notes: [],
      highlights: [],
      readingSessions: [],
      webSearchConfig: {},
      runtimeFactory: () => ({ models, model: faux.getModel() }),
    });
  }
});

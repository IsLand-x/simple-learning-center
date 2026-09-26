import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai';
import { createInfographicTools } from './modules/knowledgeMaps/infographic.js';
import { runServerAiChat } from './modules/ai/chat.js';
import { INFOGRAPHIC_PRESETS } from './modules/knowledgeMaps/presets.js';

const plan = {
  title: '复制方案对比',
  purpose: '解释当前章节中的两种复制方式',
  preset: 'comparison',
  selection_reason: '读者问两种复制方式的区别，统一维度便于比较。',
  layout: '横向对比图，左侧同步，右侧异步',
  nodes: [
    {
      id: 'sync',
      label: '同步复制',
      detail: '等待副本确认',
      kind: 'paraphrase',
      source_ids: ['s1'],
    },
    {
      id: 'async',
      label: '异步复制',
      detail: '不等待副本确认',
      kind: 'paraphrase',
      source_ids: ['s1'],
    },
  ],
  relationships: [{ from: 'sync', to: 'async', label: '比较延迟与一致性' }],
  sources: [
    {
      id: 's1',
      location: '当前章节：复制',
      excerpt: '同步复制等待副本确认；异步复制不等待副本确认。',
    },
  ],
  limitations: '仅覆盖本次读取的章节片段',
  style: '简体中文，克制的蓝色系，清晰的大字',
};
const imageUrl = '/api/books/book/knowledge-maps/11111111-1111-4111-8111-111111111111';

test('规划校验节点和关系；生图必须使用本次有效方案', async () => {
  let generated = 0;
  const tools = createInfographicTools({
    generateImage: async () => {
      generated++;
      return Buffer.from('fixture');
    },
    save: async () => imageUrl,
  });
  await assert.rejects(tools.generate_infographic.execute({ plan_id: 'fake' }), /先调用/);
  for (const invalid of [
    { ...plan, title: ' ' },
    { ...plan, nodes: [plan.nodes[0], plan.nodes[0]] },
    { ...plan, relationships: [{ from: 'missing', to: 'async', label: '比较' }] },
    { ...plan, sources: [] },
    { ...plan, title: '字'.repeat(121) },
  ])
    await assert.rejects(tools.plan_infographic.execute(invalid));
  assert.equal(generated, 0);
  const first = await tools.plan_infographic.execute(plan);
  const second = await tools.plan_infographic.execute({ ...plan, title: '修订方案' });
  await assert.rejects(tools.generate_infographic.execute({ plan_id: first.plan_id }), /最新/);
  const results = await Promise.all([
    tools.generate_infographic.execute({ plan_id: second.plan_id }),
    tools.generate_infographic.execute({ plan_id: second.plan_id }),
  ]);
  assert.equal(generated, 1);
  assert.equal(results[0].imageUrl, imageUrl);
  assert.match(results[0].outline, /修订方案/);
  await assert.rejects(tools.plan_infographic.execute(plan), /已尝试/);
});

test('失败不自动重试，取消不保存，结构方案先于图片请求展示', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    const events = [];
    let calls = 0;
    const tools = createInfographicTools({
      onPlan: () => events.push('plan'),
      onStage: (_stage, status) => events.push(status),
      generateImage: async ({ prompt, signal }) => {
        assert.match(prompt, /同步复制/);
        assert.match(prompt, /横向对比图/);
        assert.equal(signal, controller.signal);
        calls++;
        if (cancel) {
          controller.abort();
          return Buffer.from('fixture');
        }
        throw new Error('生图失败');
      },
      save: () => assert.fail('不得保存失败或取消的图片'),
    });
    const { plan_id } = await tools.plan_infographic.execute(plan);
    await assert.rejects(tools.generate_infographic.execute({ plan_id }, controller.signal));
    await assert.rejects(tools.generate_infographic.execute({ plan_id }, controller.signal));
    assert.equal(calls, 1);
    assert.deepEqual(events, ['plan', 'in_progress', 'failed']);
  }
});

test('六种预设分别使用对应绘图规则，并保留信息类型和逐项来源', async () => {
  assert.deepEqual(Object.keys(INFOGRAPHIC_PRESETS), [
    'concept',
    'mechanism',
    'comparison',
    'argument',
    'timeline',
    'application',
  ]);
  for (const [preset, definition] of Object.entries(INFOGRAPHIC_PRESETS)) {
    let draft = '';
    const tools = createInfographicTools({
      onPlan: (value) => {
        draft = value;
      },
      generateImage: async ({ prompt }) => {
        assert.ok(draft.includes(definition.label));
        assert.ok(prompt.includes(definition.drawing));
        assert.match(prompt, /不能缩小文字/);
        assert.match(prompt, /不能把解释或类比写成原文/);
        return Buffer.from('fixture');
      },
      save: async () => imageUrl,
    });
    const { plan_id, outline } = await tools.plan_infographic.execute({
      ...plan,
      preset,
      follow_up_topics: ['副本故障处理'],
    });
    assert.match(outline, /原文概括/);
    assert.match(outline, /来源 s1/);
    assert.match(outline, /当前章节：复制/);
    assert.match(outline, /建议另行成图：副本故障处理/);
    await tools.generate_infographic.execute({ plan_id });
  }
});

test('不能伪装原文、遗漏来源、使用未知预设或用过量文字塞满图片', async () => {
  const tools = createInfographicTools({ generateImage: () => assert.fail('不得生图') });
  const invalidPlans = [
    { ...plan, preset: 'poster' },
    { ...plan, selection_reason: ' ' },
    {
      ...plan,
      nodes: [{ ...plan.nodes[0], kind: 'quote', detail: '没有任何代价' }, plan.nodes[1]],
    },
    { ...plan, nodes: [{ ...plan.nodes[0], source_ids: ['missing'] }, plan.nodes[1]] },
    { ...plan, sources: [plan.sources[0], plan.sources[0]] },
    {
      ...plan,
      nodes: Array.from({ length: 8 }, (_, index) => ({
        ...plan.nodes[index % 2],
        id: index < 2 ? plan.nodes[index].id : `n${index}`,
        detail: '信息'.repeat(100),
      })),
    },
  ];
  for (const invalid of invalidPlans) await assert.rejects(tools.plan_infographic.execute(invalid));
  const valid = await tools.plan_infographic.execute({
    ...plan,
    nodes: [{ ...plan.nodes[0], kind: 'quote' }, plan.nodes[1]],
  });
  assert.match(valid.outline, /同步复制（原文）/);
});

function runtimeFor(faux) {
  const models = createModels();
  models.setProvider(faux.provider);
  return { models, model: faux.getModel() };
}
const options = {
  config: { oauthProvider: 'openai-codex' },
  model: 'mock',
  book: { id: 'book', title: '示例', toc: [], currentChapter: '复制' },
  conversationId: 'infographic-test',
  messages: [{ role: 'user', content: '请生成复制方式的信息图' }],
  currentText: '同步复制等待副本确认；异步复制不等待。',
  notes: [],
  highlights: [],
  readingSessions: [],
};

test('真实 PiAgent 工具循环先读正文再规划与生图，方案和图片进入最终及进度消息', async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    (context) => {
      assert.match(context.systemPrompt, /先按需读取相关材料/);
      return fauxAssistantMessage(fauxToolCall('read_current_chapter', {}), {
        stopReason: 'toolUse',
      });
    },
    fauxAssistantMessage(fauxToolCall('plan_infographic', plan), { stopReason: 'toolUse' }),
    (context) => {
      const result = context.messages.filter((message) => message.role === 'toolResult').at(-1);
      const { plan_id } = JSON.parse(result.content[0].text);
      return fauxAssistantMessage(
        [
          fauxToolCall('generate_infographic', { plan_id }, { id: 'image-1' }),
          fauxToolCall('generate_infographic', { plan_id }, { id: 'image-2' }),
        ],
        { stopReason: 'toolUse' },
      );
    },
  ]);
  let generated = 0;
  const progress = [];
  const runtime = runtimeFor(faux);
  const result = await runServerAiChat({
    ...options,
    oauth: { runtime: async () => runtime },
    infographicImageGenerator: async ({ runtime: selected }) => {
      assert.equal(selected, runtime);
      assert.ok(progress.some((value) => value.content.includes('信息图内容稿')));
      generated++;
      return Buffer.from('fixture');
    },
    infographicImageSave: async () => imageUrl,
    onProgress: (value) => progress.push(value),
  });
  assert.equal(generated, 1);
  assert.equal(faux.state.callCount, 3);
  assert.match(result.content, /信息图内容稿/);
  assert.match(result.content, /!\[信息图\]/);
  assert.match(result.content, /仅覆盖本次读取的章节片段/);
  assert.equal(result.content.split(imageUrl).length, 3);
  assert.ok(
    progress.some((value) =>
      value.dialogueContent.some((item) => item.name === '信息图' && item.status === 'completed'),
    ),
  );
});

test('非 ChatGPT 供应商或非阅读场景不提供信息图工具', async () => {
  for (const [provider, resourceType] of [
    ['kimi-coding', 'book'],
    [undefined, 'book'],
    ['openai-codex', 'video'],
  ]) {
    const faux = fauxProvider({ tokensPerSecond: 0 });
    faux.setResponses([
      (context) => {
        assert.ok(!context.tools.some((tool) => /infographic/.test(tool.name)));
        return fauxAssistantMessage('请选择阅读器中的 ChatGPT 模型');
      },
    ]);
    const runtime = runtimeFor(faux);
    await runServerAiChat({
      ...options,
      resourceType,
      config: { oauthProvider: provider },
      oauth: { runtime: async () => runtime },
      runtimeFactory: () => runtime,
    });
  }
});

test('生图失败保留方案和真实失败状态，并阻止改用全景工具再次收费', async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('plan_infographic', plan), { stopReason: 'toolUse' }),
    (context) => {
      const result = context.messages.filter((message) => message.role === 'toolResult').at(-1);
      const { plan_id } = JSON.parse(result.content[0].text);
      return fauxAssistantMessage(fauxToolCall('generate_infographic', { plan_id }), {
        stopReason: 'toolUse',
      });
    },
    fauxAssistantMessage(fauxToolCall('generate_book_knowledge_map', {}), {
      stopReason: 'toolUse',
    }),
    fauxAssistantMessage('信息图生成失败，请检查额度后重新发送请求。'),
  ]);
  const result = await runServerAiChat({
    ...options,
    oauth: { runtime: async () => runtimeFor(faux) },
    infographicImageGenerator: async () => {
      throw new Error('ChatGPT 订阅生图未成功');
    },
    knowledgeMapGenerator: () => assert.fail('不能切换工具重复生图'),
  });
  assert.match(result.content, /信息图内容稿/);
  assert.match(result.content, /信息图生成失败/);
  assert.ok(!result.content.includes('![信息图]'));
  assert.ok(
    result.dialogueContent.some(
      (item) => item.name === 'generate_infographic' && item.status === 'failed',
    ),
  );
});

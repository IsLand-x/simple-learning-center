import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLessonEvidence, validateLessonPlan } from './lessonModel.js';
import { planCompleteChapter } from './planner.js';
import { tradeExample } from './composition/tradeModel.js';
import { sceneTiming } from './composition/sceneTiming.js';

const first = '小国接受世界价格，贸易的总收益大于总损失，但对受损者的补偿并不自动发生。';
const second = '关税提高国内价格，减少进口，带来政府收入，也造成过度生产和消费不足两种无谓损失。';
const passages = [first, second].map((text, index) => ({
  id: `p${index}`,
  text,
  href: 'trade.xhtml',
  chapter: '国际贸易',
  sectionIndex: 0,
  cfi: `cfi-${index}`,
}));
const source = (index) => ({ passageId: `p${index}`, quote: [first, second][index].slice(0, 16) });
const evidence = () => ({
  topics: [0, 1].map((index) => ({
    id: `t${index}`,
    section: index ? '关税' : '贸易的得失',
    title: index ? '关税造成两种扭曲' : '总收益与补偿不同',
    claim: [first, second][index],
    reasoning: [
      index ? '税使生产和消费背离原来的配置。' : '收益和损失的总和并不决定补偿是否实施。',
    ],
    conditions: ['小国接受世界价格'],
    misconceptions: ['不能把总收益增加当作所有人获益'],
    sources: [source(index)],
  })),
  coverage: [0, 1].map((index) => ({ passageId: `p${index}`, topicIds: [`t${index}`] })),
});
const plan = () => ({
  title: '完整解释贸易与关税',
  summary: '能说明贸易分配后果与关税扭曲',
  units: [0, 1].map((index) => ({
    id: `u${index}`,
    title: index ? '关税的两种损失' : '贸易收益如何分配',
    goal: '解释机制并指出其适用条件',
    topicIds: [`b1:t${index}`],
  })),
});

test('课程资料必须覆盖所有正文段落，计划必须保留全部主题与真实出处', () => {
  const topics = validateLessonEvidence(JSON.stringify(evidence()), passages, 1);
  assert.equal(topics[0].claim, first);
  assert.equal(topics[0].conditions[0], '小国接受世界价格');
  assert.equal(validateLessonPlan(JSON.stringify(plan()), topics).units.length, 2);
  const sameTopic = evidence();
  sameTopic.coverage[1].topicIds = ['t0'];
  const forwarded = validateLessonEvidence(JSON.stringify(sameTopic), passages, 1);
  assert.ok(
    forwarded[0].passageIds.includes('p1'),
    '关联正文必须随主题进入后续编写和审校，不能只转发引用片段',
  );
  const omitted = evidence();
  omitted.coverage.pop();
  assert.throws(() => validateLessonEvidence(JSON.stringify(omitted), passages, 1), /遗漏/);
  const unsupported = evidence();
  unsupported.topics[1].sources[0].quote = '这是一段实际没有出现过的引用。';
  assert.throws(() => validateLessonEvidence(JSON.stringify(unsupported), passages, 1), /无法核验/);
  const incomplete = plan();
  incomplete.units.pop();
  assert.throws(() => validateLessonPlan(JSON.stringify(incomplete), topics), /遗漏/);
  const duplicate = plan();
  duplicate.units[1].topicIds = ['b1:t1', 'b1:t1'];
  assert.throws(() => validateLessonPlan(JSON.stringify(duplicate), topics), /重复/);
});

test('章节生成逐单元重读原文，并只修订审校指出的单元再复核', async () => {
  const received = [];
  let reviews = 0;
  const result = await planCompleteChapter(passages, [passages], async (content, phase) => {
    const input = JSON.parse(content);
    received.push({ phase, input });
    if (phase === 'evidence') return JSON.stringify(evidence());
    if (phase === 'plan') return JSON.stringify(plan());
    if (phase === 'review') {
      reviews++;
      return JSON.stringify({
        issues:
          reviews === 1
            ? [
                {
                  topicId: 'b1:t1',
                  kind: 'omission',
                  message: '关税段没有明确小国价格接受的适用条件，应在讲解中补充。',
                },
              ]
            : [],
      });
    }
    const index = input.unit.id === 'u1' ? 1 : 0;
    const text =
      (input.editorFeedback ? '在小国接受世界价格这一条件下，' : '') + [first, second][index];
    return JSON.stringify({
      title: input.unit.title,
      summary: input.unit.goal,
      scenes: [
        {
          title: input.unit.title,
          topicIds: input.unit.topicIds,
          narration: text,
          beats: [{ text, focus: 'point', pointIndex: 0 }],
          layout: 'concept',
          points: [
            { title: '机制', detail: '保留推导关系' },
            { title: '条件', detail: '小国接受世界价格' },
          ],
          visual: { kind: 'flow' },
          sources: [source(index)],
        },
      ],
    });
  });
  assert.equal(result.scenes.length, 2);
  assert.equal(result.coverage.length, 2);
  assert.deepEqual(
    result.coverage.map((item) => item.sceneIndexes),
    [[0], [1]],
  );
  assert.ok(result.scenes[1].narration.startsWith('在小国接受世界价格'));
  assert.equal(received.filter((item) => item.phase === 'script').length, 3);
  assert.equal(reviews, 2);
  const unit = received.find((item) => item.phase === 'script');
  assert.equal(
    unit.input.originals[0].text,
    first,
    '编写讲稿必须看到完整证据段落，不能只靠标题和短引用',
  );
  assert.ok(unit.input.topics[0].misconceptions.length > 0);
});

test('审校仍有实质遗漏时停止课程生成，不返回未经核对的成片资料', async () => {
  let writes = 0;
  await assert.rejects(
    planCompleteChapter(passages, [passages], async (content, phase) => {
      if (phase === 'evidence') return JSON.stringify(evidence());
      if (phase === 'plan') return JSON.stringify(plan());
      if (phase === 'review')
        return JSON.stringify({
          issues: [
            {
              topicId: 'b1:t1',
              kind: 'incorrect',
              message: '把关税的政府收入当成了净收益，没有计算消费者损失。',
            },
          ],
        });
      writes++;
      const { unit } = JSON.parse(content);
      const index = unit.id === 'u1' ? 1 : 0;
      const text = [first, second][index];
      return JSON.stringify({
        title: unit.title,
        summary: unit.goal,
        scenes: [
          {
            title: unit.title,
            topicIds: unit.topicIds,
            narration: text,
            beats: [{ text, focus: 'setup' }],
            layout: 'concept',
            points: [
              { title: '结论', detail: '核对原文' },
              { title: '条件', detail: '核对条件' },
            ],
            visual: { kind: 'flow' },
            sources: [source(index)],
          },
        ],
      });
    }),
    /仍有论证遗漏/,
  );
  assert.equal(writes, 3);
});

test('教学供需算例按统一模型核算数量、转移及两种无谓损失', () => {
  const closed = tradeExample('closed');
  assert.equal(closed.after.price, 6);
  assert.equal(closed.after.supply, 40);
  const imported = tradeExample('import');
  assert.equal(imported.after.imports, 40);
  assert.equal(imported.consumerChange, 100);
  assert.equal(imported.producerChange, -60);
  assert.equal(imported.netChange, 40);
  const exported = tradeExample('export');
  assert.equal(exported.after.exports, 40);
  assert.equal(exported.consumerChange, -60);
  assert.equal(exported.producerChange, 100);
  const tariff = tradeExample('tariff');
  assert.equal(tariff.after.price, 5);
  assert.equal(tariff.after.imports, 20);
  assert.equal(tariff.consumerChange, -55);
  assert.equal(tariff.producerChange, 25);
  assert.equal(tariff.transfer, 20);
  assert.equal(tariff.netChange, -10);
  assert.equal(tariff.productionLoss + tariff.consumptionLoss, 10);
  const partial = tradeExample('tariff', 0.5);
  assert.equal(partial.netChange, -partial.productionLoss - partial.consumptionLoss);
  assert.equal(tradeExample('quota').transfer, tariff.transfer);
});

test('图形只在对应讲解段落变化，未讲的福利不会在结尾自动出现', () => {
  const scene = {
    points: [{ title: '价格' }, { title: '数量' }],
    beats: [
      { text: '价格变化', focus: 'price', startSeconds: 2, durationSeconds: 8 },
      { text: '数量变化', focus: 'quantities', startSeconds: 10, durationSeconds: 8 },
      { text: '条件限制', focus: 'conclusion', startSeconds: 18, durationSeconds: 6 },
    ],
  };
  assert.equal(sceneTiming(scene, 0, 24).progress('price', 0), 0);
  assert.equal(sceneTiming(scene, 6, 24).progress('price', 0), 1);
  assert.equal(sceneTiming(scene, 6, 24).progress('quantities', 0), 0);
  assert.equal(sceneTiming(scene, 23, 24).progress('loss', 0), 0);
  const welfareOnly = {
    ...scene,
    beats: [{ text: '剩余变化', focus: 'welfare', startSeconds: 0, durationSeconds: 8 }],
  };
  assert.equal(
    sceneTiming(welfareOnly, 0, 8).progress('price', 0.5),
    1,
    '只分析福利时使用调整后的市场状态',
  );
});

test('审校上下文过长时按完整单元分组，保留所有原文和课程结尾', async () => {
  const originals = Array.from({ length: 4 }, (_, index) => ({
    ...passages[0],
    id: `large-${index}`,
    text: `第${index}段的唯一原文引用，需要保留相关全部证据。` + '完整证据。'.repeat(1695),
  }));
  const topicIds = originals.map((_, index) => `b${index + 1}:t`);
  const reviewed = new Set();
  let reviews = 0;
  const result = await planCompleteChapter(
    originals,
    originals.map((passage) => [passage]),
    async (content, phase) => {
      const input = JSON.parse(content);
      if (phase === 'evidence')
        return JSON.stringify({
          topics: [
            {
              id: 't',
              section: '完整章节',
              title: '核对完整论证',
              claim: '保留完整结论。'.repeat(50),
              reasoning: Array(8).fill('原文中的推理步骤。'.repeat(25)),
              conditions: Array(4).fill('结论成立的条件。'.repeat(15)),
              misconceptions: Array(4).fill('不能遗漏的限定条件。'.repeat(12)),
              sources: [{ passageId: input[0].passageId, quote: input[0].text.slice(0, 20) }],
            },
          ],
          coverage: [{ passageId: input[0].passageId, topicIds: ['t'] }],
        });
      if (phase === 'plan')
        return JSON.stringify({
          title: '完整的长章课程',
          summary: '逐项核对推导与条件',
          units: Array.from({ length: 24 }, (_, index) => ({
            id: `u${index}`,
            title: `推导目标${index + 1}`,
            goal: '按本单元目标保留原文的完整推导及其适用条件。'.repeat(4),
            targetCharacters: 240,
            topicIds,
          })),
        });
      if (phase === 'review') {
        reviews++;
        assert.ok(content.length <= 65000);
        assert.equal(input.originals.length, originals.length);
        input.originals.forEach((passage, index) =>
          assert.equal(passage.text, originals[index].text),
        );
        input.units.forEach((unit) => reviewed.add(unit.id));
        return JSON.stringify({ issues: [] });
      }
      const text = '本段核对原文中的推导与条件。'.repeat(8);
      return JSON.stringify({
        title: input.unit.title,
        summary: '完整解释推导',
        scenes: [
          {
            title: input.unit.title,
            topicIds,
            narration: text + text,
            beats: [
              { text, focus: 'point', pointIndex: 0 },
              { text, focus: 'conclusion', pointIndex: 3 },
            ],
            layout: 'steps',
            points: Array.from({ length: 4 }, (_, index) => ({
              title: `保留推导${index + 1}`,
              detail: '核对原文的结论和条件，保留推理步骤与论据，不截断相关证据。',
            })),
            visual: { kind: 'flow' },
            sources: [{ passageId: originals[0].id, quote: originals[0].text.slice(0, 20) }],
          },
        ],
      });
    },
  );
  assert.equal(result.scenes.length, 24);
  assert.ok(reviews > 1, '容量不足时应分组而非跳过审校');
  assert.equal(reviewed.size, 24);
  assert.ok(reviewed.has('u23'), '课程结尾也必须经过完整审校');
});

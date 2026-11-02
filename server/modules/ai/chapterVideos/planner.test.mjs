import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLessonEvidence, validateLessonPlan, validateLessonReview } from './lessonModel.js';
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
const story = {
  question: '为什么贸易有总收益，各方却仍会围绕关税争论？',
  answer: '贸易总收益和分配并不相同，关税改变价格与分配，也带来扭曲。',
  throughline: '始终观察同一个接受世界价格的小国市场，先看分配，再看加征关税的变化。',
};
const teachingStep = (index, count) => ({
  role:
    count === 1
      ? 'complete'
      : index === 0
        ? 'opening'
        : index === count - 1
          ? 'synthesis'
          : 'explanation',
  buildsOn: index ? [`u${index - 1}`] : [],
  bridge: index
    ? '已说明总收益与补偿不同，因此还要看干预如何改变分配。'
    : '从各方对贸易的不同态度进入全章问题。',
  takeaway: index
    ? '关税会改变分配并产生两种扭曲，需要区分转移与净损失。'
    : '贸易有总收益，不意味着每个人都会受益。',
});
const plan = () => ({
  title: '完整解释贸易与关税',
  summary: '能说明贸易分配后果与关税扭曲',
  story,
  units: [0, 1].map((index) => ({
    id: `u${index}`,
    title: index ? '关税的两种损失' : '贸易收益如何分配',
    goal: '解释机制并指出其适用条件',
    topicIds: [`b1:t${index}`],
    ...teachingStep(index, 2),
  })),
});
const requestInput = (content) => JSON.parse(content.split('\n上次结果未通过校验：')[0]);
const narration = (input, index) => ({
  unitId: input.unit.id,
  narration:
    (input.editorFeedback ? '在小国接受世界价格这一条件下，' : '') + [first, second][index],
  visualIntent: '沿用小国市场，逐步展示各方受到的影响与价格变化。',
  sources: [source(index)],
});
const storyboard = (input, index, count = 2) => {
  const clauses = input.draft.narration.match(/[^，。！？]+[，。！？]?/g);
  return {
    title: input.unit.title,
    summary: input.unit.goal,
    scenes: [
      {
        title: input.unit.title,
        topicIds: input.unit.topicIds,
        narration: input.draft.narration,
        beats: Array.from({ length: count }, (_, pointIndex) => ({
          text: clauses
            .slice(
              Math.floor((pointIndex * clauses.length) / count),
              Math.floor(((pointIndex + 1) * clauses.length) / count),
            )
            .join(''),
          focus: 'point',
          pointIndex,
        })),
        layout: 'concept',
        points: Array.from({ length: count }, (_, pointIndex) => ({
          title: `机制${pointIndex}`,
          detail: '保留原文的具体推导与条件',
        })),
        visual: { kind: 'flow', connections: [{ from: 0, to: 1, label: '导致' }] },
        sources: input.draft.sources ?? [source(index)],
      },
    ],
  };
};

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
  incomplete.units[0].role = 'complete';
  assert.throws(() => validateLessonPlan(JSON.stringify(incomplete), topics), /遗漏/);
  const duplicate = plan();
  duplicate.units[1].topicIds = ['b1:t1', 'b1:t1'];
  assert.throws(() => validateLessonPlan(JSON.stringify(duplicate), topics), /重复/);
});

test('教学路径必须建立整章问题、前置依赖和开场到收束，拒绝先用后讲', () => {
  const topics = validateLessonEvidence(JSON.stringify(evidence()), passages, 1);
  const future = plan();
  future.units[0].buildsOn = ['u1'];
  assert.throws(() => validateLessonPlan(JSON.stringify(future), topics), /尚未讲解/);
  const isolated = plan();
  isolated.units[1].buildsOn = [];
  assert.throws(() => validateLessonPlan(JSON.stringify(isolated), topics), /承接/);
  const unfinished = plan();
  unfinished.units[1].role = 'explanation';
  assert.throws(() => validateLessonPlan(JSON.stringify(unfinished), topics), /整体认识/);
  const noStory = plan();
  delete noStory.story;
  assert.throws(() => validateLessonPlan(JSON.stringify(noStory), topics), /story/);
  const issue = {
    topicId: 'b1:t1',
    unitId: 'u1',
    kind: 'discontinuity',
    message: '忽然切换了案例，应沿用上一段的小国市场。',
  };
  assert.equal(
    validateLessonReview(JSON.stringify({ issues: [issue] }), topics, plan().units)[0].kind,
    'discontinuity',
  );
  assert.throws(
    () =>
      validateLessonReview(
        JSON.stringify({ issues: [{ ...issue, unitId: 'u0' }] }),
        topics,
        plan().units,
      ),
    /未知教学单元/,
  );
});

test('章节生成逐单元重读原文，并只修订审校指出的单元再复核', async () => {
  const received = [];
  let reviews = 0;
  const result = await planCompleteChapter(passages, [passages], async (content, phase) => {
    const input = requestInput(content);
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
    return JSON.stringify(
      phase === 'narrative' ? narration(input, index) : storyboard(input, index),
    );
  });
  assert.equal(result.scenes.length, 2);
  assert.equal(result.coverage.length, 2);
  assert.deepEqual(
    result.coverage.map((item) => item.sceneIndexes),
    [[0], [1]],
  );
  assert.ok(result.scenes[1].narration.startsWith('在小国接受世界价格'));
  assert.equal(received.filter((item) => item.phase === 'narrative').length, 3);
  assert.equal(received.filter((item) => item.phase === 'script').length, 2);
  assert.equal(reviews, 3);
  assert.equal(result.centralQuestion, story.question);
  const unit = received.find((item) => item.phase === 'narrative');
  assert.equal(
    unit.input.originals[0].text,
    first,
    '编写讲稿必须看到完整证据段落，不能只靠标题和短引用',
  );
  assert.ok(unit.input.topics[0].misconceptions.length > 0);
  const secondDraft = received.filter((item) => item.phase === 'narrative')[1].input;
  assert.equal(secondDraft.neighbors.previous.narration, first);
  assert.equal(secondDraft.course.story.throughline, story.throughline);
  assert.equal(secondDraft.course.outline.at(-1).role, 'synthesis');
  const firstVisual = received.findIndex((item) => item.phase === 'script');
  assert.equal(
    received.slice(0, firstVisual).filter((item) => item.phase === 'review').length,
    2,
    '先审校连贯讲稿，再设计画面',
  );
  assert.equal(received.at(-1).input.reviewStage, 'storyboard');
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
      assert.equal(phase, 'narrative', '讲稿没通过审校时不能开始分镜');
      const input = requestInput(content);
      return JSON.stringify(narration(input, input.unit.id === 'u1' ? 1 : 0));
    }),
    /仍有论证遗漏/,
  );
  assert.equal(writes, 3);
});

test('分镜只能分配已审校的讲稿，不能删除衔接句或添加结论', async () => {
  let visualAttempts = 0;
  await assert.rejects(
    planCompleteChapter(passages, [passages], async (content, phase) => {
      const input = requestInput(content);
      if (phase === 'evidence') return JSON.stringify(evidence());
      if (phase === 'plan') return JSON.stringify(plan());
      if (phase === 'review') return JSON.stringify({ issues: [] });
      const index = input.unit.id === 'u1' ? 1 : 0;
      if (phase === 'narrative') return JSON.stringify(narration(input, index));
      visualAttempts++;
      const result = storyboard(input, index);
      result.scenes[0].narration += '这是擅自添加的新结论。';
      result.scenes[0].beats.at(-1).text += '这是擅自添加的新结论。';
      return JSON.stringify(result);
    }),
    /改写了已经审校/,
  );
  assert.equal(visualAttempts, 2, '允许一次格式修正，仍然改稿则阻止渲染');
});

test('同样长度的原文包含更多推导时，讲解预算随认知步骤增加，避免被压成摘要', async () => {
  const budgets = [];
  for (const complex of [false, true]) {
    await planCompleteChapter(passages, [passages], async (content, phase) => {
      const input = requestInput(content);
      if (phase === 'evidence') {
        const material = evidence();
        if (complex)
          material.topics.forEach((topic) => {
            topic.reasoning = Array(8).fill(topic.reasoning[0]);
          });
        return JSON.stringify(material);
      }
      if (phase === 'plan') {
        budgets.push(input.targetNarrationCharacters);
        return JSON.stringify(plan());
      }
      if (phase === 'review') return JSON.stringify({ issues: [] });
      const index = input.unit.id === 'u1' ? 1 : 0;
      return JSON.stringify(
        phase === 'narrative' ? narration(input, index) : storyboard(input, index),
      );
    });
  }
  assert.ok(budgets[1] > budgets[0], '额外推导需要实际讲解空间，不能只按原文长度压缩');
});

test('叙事割裂会触发重写与整章复核，图形问题只修图且保留讲稿', async () => {
  const writes = [];
  let narrativeReviews = 0;
  let visualReviews = 0;
  const result = await planCompleteChapter(passages, [passages], async (content, phase) => {
    const input = requestInput(content);
    if (phase === 'evidence') return JSON.stringify(evidence());
    if (phase === 'plan') return JSON.stringify(plan());
    if (phase === 'review') {
      const narrativeReview = input.reviewStage === 'narrative';
      const attempt = narrativeReview ? ++narrativeReviews : ++visualReviews;
      return JSON.stringify({
        issues:
          attempt === 1
            ? [
                {
                  topicId: 'b1:t1',
                  unitId: 'u1',
                  kind: narrativeReview ? 'discontinuity' : 'diagram-mismatch',
                  message: narrativeReview
                    ? '没有承接上一段的分配问题，需要说明为何引入关税。'
                    : '因果箭头与讲解方向不一致，需要修正图解关系。',
                },
              ]
            : [],
      });
    }
    writes.push({ phase, input });
    const index = input.unit.id === 'u1' ? 1 : 0;
    return JSON.stringify(
      phase === 'narrative' ? narration(input, index) : storyboard(input, index),
    );
  });
  assert.equal(narrativeReviews, 2);
  assert.equal(visualReviews, 2);
  assert.equal(writes.filter((item) => item.phase === 'narrative').length, 3);
  const visuals = writes.filter((item) => item.phase === 'script');
  assert.equal(visuals.length, 3);
  assert.equal(visuals.at(-1).input.draft.narration, visuals[1].input.draft.narration);
  assert.equal(result.scenes[1].narration, visuals[1].input.draft.narration);
  assert.equal(
    writes.find((item) => item.input.currentDraft)?.input.neighbors.previous.narration,
    first,
  );
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
  assert.equal(sceneTiming(scene, 0, 24).pointProgress(0), 0);
  assert.equal(sceneTiming(scene, 6, 24).pointProgress(1), 0, '未讲的节点必须隐藏');
  assert.equal(sceneTiming(scene, 12, 24).pointProgress(0), 1, '已经讲过的节点保留');
  assert.equal(sceneTiming(scene, 12, 24).pointProgress(1), 1);
  const reordered = {
    ...scene,
    beats: [
      { text: '先观察结果', focus: 'point', pointIndex: 1, startSeconds: 0, durationSeconds: 5 },
      { text: '再追溯原因', focus: 'point', pointIndex: 0, startSeconds: 5, durationSeconds: 5 },
    ],
  };
  assert.equal(
    sceneTiming(reordered, 2, 10).pointProgress(0),
    0,
    '按语义索引揭示，不能用卡片顺序猜测',
  );
  assert.equal(sceneTiming(reordered, 2, 10).pointProgress(1), 1);
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
      const input = requestInput(content);
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
          story,
          units: Array.from({ length: 24 }, (_, index) => ({
            id: `u${index}`,
            title: `推导目标${index + 1}`,
            goal: '按本单元目标保留原文的完整推导及其适用条件。'.repeat(4),
            targetCharacters: 240,
            topicIds,
            ...teachingStep(index, 24),
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
        const firstIndex = Number(input.units[0].id.slice(1));
        const lastIndex = Number(input.units.at(-1).id.slice(1));
        if (firstIndex > 0) assert.equal(input.neighbors.previous.unitId, `u${firstIndex - 1}`);
        if (lastIndex < 23) assert.equal(input.neighbors.next.unitId, `u${lastIndex + 1}`);
        return JSON.stringify({ issues: [] });
      }
      if (phase === 'narrative')
        return JSON.stringify({
          unitId: input.unit.id,
          narration: '本段核对原文中的推导与条件。'.repeat(16),
          visualIntent: '沿用前段的论证对象，逐步揭示推导中的机制和限制条件。',
          sources: [{ passageId: originals[0].id, quote: originals[0].text.slice(0, 20) }],
        });
      return JSON.stringify(storyboard(input, 0, 4));
    },
  );
  assert.equal(result.scenes.length, 24);
  assert.ok(reviews > 1, '容量不足时应分组而非跳过审校');
  assert.equal(reviewed.size, 24);
  assert.ok(reviewed.has('u23'), '课程结尾也必须经过完整审校');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStoryboard } from './model.js';
import { createSceneCaptions, createTimedSceneCaptions } from './composition/captions.js';
import { videoByteRange } from '../../books/chapterVideos.js';
import { speechUrl, synthesizeNarration } from './media.js';

const quote = '可靠性是系统在遇到故障时仍然继续正确运行的能力。';
const passages = [
  {
    id: 'one',
    text: quote,
    href: 'one.xhtml',
    chapter: '可靠性',
    sectionIndex: 0,
    cfi: 'trusted-cfi',
  },
];
const storyboard = () => ({
  title: '理解可靠性',
  summary: '用故障和失效理解可靠性',
  scenes: Array.from({ length: 3 }, (_, index) => ({
    title: `知识点${index + 1}`,
    narration: '想象一个系统遇到了故障，我们需要关注它能否继续正确运行，这就是本节要理解的可靠性。',
    layout: 'concept',
    points: [
      { title: '故障', detail: '某个组件出现问题' },
      { title: '失效', detail: '系统无法正确运行' },
    ],
    sources: [{ passageId: 'one', quote }],
  })),
});

test('视频分镜核验原文并保留可信位置，拒绝虚构出处、非法布局及过量分镜', () => {
  const result = validateStoryboard(JSON.stringify(storyboard()), passages);
  assert.equal(result.scenes[0].sources[0].cfi, 'trusted-cfi');
  assert.equal(result.scenes[0].sources[0].href, 'one.xhtml');
  const invalid = storyboard();
  invalid.scenes[0].sources[0].quote = '这是没有出现在所选书籍中的原文引用。';
  assert.throws(() => validateStoryboard(JSON.stringify(invalid), passages), /无法核验/);
  invalid.scenes[0].sources[0] = { passageId: 'other-chapter', quote };
  assert.throws(() => validateStoryboard(JSON.stringify(invalid), passages), /无法核验/);
  invalid.scenes[0].layout = '<script>';
  assert.throws(() => validateStoryboard(JSON.stringify(invalid), passages), /格式/);
  assert.throws(() => validateStoryboard('not json', passages), /分镜/);
  assert.throws(
    () =>
      validateStoryboard(
        JSON.stringify({ ...storyboard(), scenes: Array(33).fill(storyboard().scenes[0]) }),
        passages,
      ),
    /格式/,
  );
});

test('逐段配音字幕遵循实测段落边界，拒绝图文关系和讲稿不一致', () => {
  const scene = storyboard().scenes[0];
  const texts = ['第一段需要较长时间解释推导。', '第二段是一个简短结论。'];
  scene.narration = texts.join('');
  scene.beats = texts.map((text, index) => ({ text, focus: 'point', pointIndex: index }));
  scene.visual = { kind: 'flow', connections: [{ from: 0, to: 1, label: '导致' }] };
  const valid = validateStoryboard(JSON.stringify({ ...storyboard(), scenes: [scene] }), passages)
    .scenes[0];
  assert.equal(valid.beats[0].startSeconds, 0);
  assert.equal(valid.beats[0].durationSeconds, 0);
  valid.beats[0].startSeconds = 0;
  valid.beats[0].durationSeconds = 10;
  valid.beats[1].startSeconds = 10;
  valid.beats[1].durationSeconds = 2;
  const captions = createTimedSceneCaptions(valid, 12000);
  assert.equal(captions.find((caption) => caption.text === texts[1]).startMs, 10000);
  assert.equal(captions.at(-1).endMs, 12000);
  assert.equal(captions.map((caption) => caption.text).join(''), scene.narration);
  scene.beats[1].text = '替换成与完整讲稿不同的内容。';
  assert.throws(
    () => validateStoryboard(JSON.stringify({ ...storyboard(), scenes: [scene] }), passages),
    /不一致/,
  );
  scene.beats[1].text = texts[1];
  scene.visual.connections[0].to = 3;
  assert.throws(
    () => validateStoryboard(JSON.stringify({ ...storyboard(), scenes: [scene] }), passages),
    /不存在/,
  );
  const privateLabel = '不应进入任务日志的超长私有关系文字';
  scene.visual.connections[0] = { from: 0, to: 1, label: privateLabel };
  assert.throws(
    () => validateStoryboard(JSON.stringify({ ...storyboard(), scenes: [scene] }), passages),
    (error) =>
      error.message.includes('connections.0.label') &&
      error.message.includes('12') &&
      !error.message.includes(privateLabel),
    '格式修订需要字段位置和限制，但不能把模型正文写进任务错误日志',
  );
  scene.visual = { kind: 'comparison' };
  assert.throws(
    () => validateStoryboard(JSON.stringify({ ...storyboard(), scenes: [scene] }), passages),
    /缺少/,
  );
});

test('得失核算图必须为每个群体及净变化提供实际讲解段落', () => {
  const scene = storyboard().scenes[0];
  scene.visual = { kind: 'ledger', mode: 'tariff', example: 'linear-trade' };
  scene.points = ['消费者', '生产者', '政府', '净变化'].map((title) => ({
    title,
    detail: '逐笔核算并区分转移与净损失',
  }));
  scene.beats = scene.points.map((point, pointIndex) => ({
    text: `${point.title}的得失需要与其他群体加总比较。`,
    focus: pointIndex === 3 ? 'conclusion' : 'welfare',
    pointIndex,
  }));
  scene.narration = scene.beats.map((beat) => beat.text).join('');
  const payload = () => JSON.stringify({ ...storyboard(), scenes: [scene] });
  assert.equal(validateStoryboard(payload(), passages).scenes.length, 1);
  delete scene.beats[1].pointIndex;
  assert.throws(() => validateStoryboard(payload(), passages), /逐笔对应/);
});

test('讲稿字幕完整分段，时序连续覆盖整个分镜，不伪造语音识别置信度', () => {
  const text = '这是一个包含中文、英文和表情的例子。A useful example，继续讲解这个知识点。'.repeat(
    4,
  );
  const captions = createSceneCaptions(text, 10000);
  const chunks = captions.map((caption) => caption.text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 32));
  assert.equal(captions[0].startMs, 0);
  assert.equal(captions.at(-1).endMs, 10000);
  captions.forEach((caption, index) => {
    assert.equal(caption.confidence, null);
    if (index) assert.equal(caption.startMs, captions[index - 1].endMs);
  });
});

test('视频支持普通、开放结尾、后缀 Range，拒绝越界或多段请求', () => {
  assert.equal(videoByteRange(null, 100), null);
  assert.deepEqual(videoByteRange('bytes=20-39', 100), { start: 20, end: 39 });
  assert.deepEqual(videoByteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(videoByteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(videoByteRange('bytes=90-999', 100), { start: 90, end: 99 });
  for (const range of [
    'bytes=100-',
    'bytes=20-10',
    'bytes=-0',
    'bytes=-',
    'bytes=1-2,4-5',
    'bytes=9007199254740993-',
  ])
    assert.equal(videoByteRange(range, 100), false);
});

test('配音只使用所选 API 地址，不接受带凭据或参数的 URL', () => {
  assert.equal(
    speechUrl('https://chosen.example/v1/chat/completions'),
    'https://chosen.example/v1/audio/speech',
  );
  assert.equal(speechUrl('https://chosen.example/v1/'), 'https://chosen.example/v1/audio/speech');
  for (const url of [
    'file:///private',
    'https://user:secret@example.com/v1',
    'https://example.com?key=secret',
  ])
    assert.throws(() => speechUrl(url));
});

test('百炼视频配音仅为暂时超时或断线重试一次，取消和凭据错误不重试', async () => {
  const narration = {
    tts: {
      provider: 'aliyun',
      region: 'cn-beijing',
      model: 'qwen3-tts-flash',
      voice: 'Cherry',
      apiKey: 'fixture-key',
      updatedAt: 0,
    },
  };
  const wave = Buffer.from('RIFF0000WAVE');
  let attempts = 0;
  const recovered = await synthesizeNarration(
    narration,
    '原文讲解',
    new AbortController().signal,
    async (input, init) => {
      if (init?.method === 'POST') {
        attempts++;
        if (attempts === 1) throw new DOMException('temporary timeout', 'TimeoutError');
        return Response.json({
          output: { audio: { url: 'http://fixture.aliyuncs.com/voice.wav' } },
        });
      }
      assert.equal(String(input), 'https://fixture.aliyuncs.com/voice.wav');
      assert.equal(init?.headers?.Authorization, undefined);
      return new Response(wave);
    },
  );
  assert.deepEqual(recovered, wave);
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(
    synthesizeNarration(narration, '原文讲解', new AbortController().signal, async () => {
      attempts++;
      throw new TypeError('fetch failed');
    }),
    /已重试一次/,
  );
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(
    synthesizeNarration(narration, '原文讲解', new AbortController().signal, async () => {
      attempts++;
      return new Response('private upstream message', { status: 401 });
    }),
    (error) => /401/.test(error.message) && !error.message.includes('private upstream'),
  );
  assert.equal(attempts, 1);
  const cancelled = new AbortController();
  attempts = 0;
  await assert.rejects(
    synthesizeNarration(narration, '原文讲解', cancelled.signal, async () => {
      attempts++;
      cancelled.abort();
      throw new DOMException('temporary timeout', 'TimeoutError');
    }),
    { name: 'AbortError' },
  );
  assert.equal(attempts, 1);
});

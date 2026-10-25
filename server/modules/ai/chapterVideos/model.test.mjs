import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStoryboard, subtitleChunks } from './model.js';
import { videoSlideSvg } from './slide.js';
import { videoByteRange } from '../../books/chapterVideos.js';
import { speechUrl } from './media.js';

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
        JSON.stringify({ ...storyboard(), scenes: Array(10).fill(storyboard().scenes[0]) }),
        passages,
      ),
    /格式/,
  );
});

test('讲稿字幕完整分段且图解中的用户文字转义为文本', () => {
  const text = '这是一个包含中文、英文和表情的例子。A useful example，继续讲解这个知识点。'.repeat(
    4,
  );
  const chunks = subtitleChunks(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 32));
  const scene = {
    ...storyboard().scenes[0],
    title: '<script>bad</script>',
    startSeconds: 0,
    durationSeconds: 10,
  };
  for (const layout of ['concept', 'steps', 'compare', 'summary']) {
    const svg = videoSlideSvg(
      { ...scene, layout },
      '书籍<script>',
      '章节',
      0,
      3,
      2,
      '字幕<image href="https://unselected.example"/>',
    );
    assert.equal(svg.includes('<script>'), false);
    assert.equal(svg.includes('<image'), false);
    assert.ok(svg.includes('&lt;script&gt;'));
    assert.ok(svg.includes('viewBox="0 0 1280 720"'));
  }
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

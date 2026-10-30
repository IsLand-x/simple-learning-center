import { expect, it } from 'vitest';
import { useLearningStore } from '../useLearningStore';
import { mergeLearningState } from './mergeLearningState';

it('唯一持久化核心不再创建 RSS 或独立视频字段和操作', () => {
  const state = useLearningStore.getInitialState();
  expect(
    Object.keys(state).filter((field) =>
      /^(rss|video|.*Rss|.*VideoResource|.*VideoTimestamp)/.test(field),
    ),
  ).toEqual([]);
  expect(state).toHaveProperty('chapterVideos', []);
  expect(useLearningStore.persist.getOptions()).toMatchObject({
    name: 'learning-center-state-v1',
    version: 42,
  });
});

it('合并及重复读取阅读状态时保留历史字段，不再改写旧配置和来源', () => {
  const legacy = {
    rssFeeds: [{ id: 'feed', url: 'https://example.com/feed' }],
    rssDigestSettings: { enabled: true, prompt: '旧版提示词' },
    videoResources: [{ id: 'video', title: '历史视频' }],
    videoTimestampNotes: [{ id: 'note', content: '时间戳笔记' }],
    futureField: { retained: true },
  };
  const merged = mergeLearningState(legacy, useLearningStore.getInitialState());
  for (const [field, value] of Object.entries(legacy)) {
    expect(merged).toHaveProperty(field, value);
  }
  const reread = mergeLearningState({ navCollapsed: true }, merged);
  expect(reread).toMatchObject({ ...legacy, navCollapsed: true });
});

import { Composition } from 'remotion';
import { ChapterMotionScene } from './ChapterMotionScene.js';

export function ChapterVideoRoot() {
  return (
    <Composition
      id="ChapterScene"
      component={ChapterMotionScene}
      durationInFrames={300}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{
        bookTitle: '章节视频',
        chapterTitle: '知识讲解',
        index: 0,
        count: 1,
        scene: {
          title: '用动态图讲清楚一个问题',
          narration: '观察图形的变化，理解知识之间的联系。',
          layout: 'concept',
          points: [
            { title: '提出问题', detail: '从一个具体问题开始' },
            { title: '理解机制', detail: '让变化的过程可见' },
          ],
          sources: [],
          startSeconds: 0,
          durationSeconds: 10,
        },
      }}
    />
  );
}

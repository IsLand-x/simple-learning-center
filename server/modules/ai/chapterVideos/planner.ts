import type { ChapterVideo, ChapterVideoScene } from '../../../../contracts/reading.js';
import type { BookPassage } from '../../books/search.js';
import type { VideoGenerationPhase } from '../jobs/types.js';
import {
  validateLessonEvidence,
  validateLessonNarration,
  validateLessonPlan,
  validateLessonReview,
} from './lessonModel.js';
import type { LessonNarration, LessonTopic, LessonUnit } from './lessonModel.js';
import { validateStoryboard } from './model.js';
import { tradeExample } from './composition/tradeModel.js';

export type VideoScriptRequest = (
  content: string,
  phase: VideoGenerationPhase | 'mindmap' | 'overview',
  stage: string,
) => Promise<string>;

export async function planCompleteChapter(
  passages: BookPassage[],
  batches: BookPassage[][],
  request: VideoScriptRequest,
) {
  if (!passages.length) throw new Error('所选章节没有可分析的正文');
  const checked = async <T>(
    content: string,
    phase: VideoGenerationPhase,
    stage: string,
    validate: (response: string) => T,
  ): Promise<T> => {
    if (content.length > 65_000) throw new Error('课程资料超过单次模型审校容量，请选择较小章节');
    let correction = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request(
        content + correction,
        phase,
        stage + (attempt ? '（修正格式或覆盖遗漏）' : ''),
      );
      try {
        return validate(response);
      } catch (cause) {
        if (attempt) throw cause;
        correction = `\n上次结果未通过校验：${cause instanceof Error ? cause.message : '格式不正确'}。请重新返回完整 JSON，修正此问题。`;
      }
    }
    throw new Error('课程校验未完成');
  };
  const topics: LessonTopic[] = [];
  for (const [index, entries] of batches.entries()) {
    const extracted = await checked(
      JSON.stringify(
        entries.map((entry) => ({ passageId: entry.id, chapter: entry.chapter, text: entry.text })),
      ),
      'evidence',
      `正在提炼知识点与推导 ${index + 1}/${batches.length}`,
      (response) => validateLessonEvidence(response, entries, index + 1),
    );
    topics.push(...extracted);
  }
  const material = JSON.stringify(topics);
  if (
    material.length + JSON.stringify(passages.map(({ id, text }) => ({ id, text }))).length >
      55_000 ||
    topics.length > 384
  )
    throw new Error('该章论证过多，超过单次完整课程容量，请选择较小章节');
  const reasoningCharacters = topics.reduce(
    (sum, topic) =>
      sum +
      120 +
      topic.reasoning.length * 35 +
      (topic.conditions.length + topic.misconceptions.length) * 15,
    0,
  );
  // A terse source can need a longer explanation. Do not turn the source compression
  // ratio into a limit that forces the writer to remove prerequisite steps or bridges.
  const targetNarrationCharacters = Math.min(
    7200,
    Math.max(
      600,
      Math.ceil(passages.reduce((sum, passage) => sum + passage.text.length, 0) / 3),
      reasoningCharacters,
    ),
  );
  const plan = await checked(
    JSON.stringify({ topics, targetNarrationCharacters }),
    'plan',
    '正在建立章节主线、贯穿情境与认知阶梯',
    (response) => validateLessonPlan(response, topics, targetNarrationCharacters),
  );
  const unitMaterial = (unit: LessonUnit) => {
    const evidence = topics.filter((topic) => unit.topicIds.includes(topic.id));
    const ids = new Set(evidence.flatMap((topic) => topic.passageIds));
    const originals = passages.filter((passage) => ids.has(passage.id));
    return { evidence, originals };
  };
  const course = {
    title: plan.title,
    summary: plan.summary,
    story: plan.story,
    // Every writer sees the same complete teaching path, including its ending.
    outline: plan.units,
  };
  const narrations: LessonNarration[] = [];
  const neighbors = (index: number) => ({
    ...(narrations[index - 1] ? { previous: narrations[index - 1] } : {}),
    ...(narrations[index + 1] ? { next: narrations[index + 1] } : {}),
  });
  const writeNarration = async (unit: LessonUnit, index: number, feedback?: string) => {
    const { evidence, originals } = unitMaterial(unit);
    return checked(
      JSON.stringify({
        course,
        unit,
        established: plan.units.slice(0, index).map(({ id, takeaway }) => ({ id, takeaway })),
        neighbors: neighbors(index),
        topics: evidence,
        originals: originals.map((passage) => ({ passageId: passage.id, text: passage.text })),
        ...(feedback ? { currentDraft: narrations[index], editorFeedback: feedback } : {}),
      }),
      'narrative',
      `${feedback ? '正在修订' : '正在串联'}完整讲稿 ${index + 1}/${plan.units.length}`,
      (content) => validateLessonNarration(content, unit, originals),
    );
  };
  const writeUnit = async (unit: LessonUnit, index: number, feedback?: string) => {
    const { evidence, originals } = unitMaterial(unit);
    const draft = narrations[index];
    return checked(
      JSON.stringify({
        course,
        unit,
        draft,
        neighbors: neighbors(index),
        topics: evidence,
        originals: originals.map((passage) => ({ passageId: passage.id, text: passage.text })),
        ...(feedback ? { editorFeedback: feedback } : {}),
      }),
      'script',
      `${feedback ? '正在修订' : '正在编排'}叙事分镜与图解 ${index + 1}/${plan.units.length}`,
      (content) => {
        const script = validateStoryboard(content, originals);
        if (script.scenes.length !== 1) throw new Error('教学单元必须返回一个完整分镜');
        const scene = script.scenes[0];
        const actual = new Set(scene.topicIds);
        if (actual.size !== unit.topicIds.length || unit.topicIds.some((id) => !actual.has(id)))
          throw new Error('讲稿遗漏或混入了本单元之外的主题');
        if (!scene.beats?.length || !scene.visual) throw new Error('讲稿缺少与画面对应的讲解段落');
        if (scene.narration.replace(/\s/g, '') !== draft.narration.replace(/\s/g, ''))
          throw new Error('分镜改写了已经审校的连续讲稿，只能分配画面，不能删改讲稿');
        const rows =
          scene.visual.kind === 'comparison'
            ? scene.visual.comparison!.rows.length
            : scene.points.length;
        if (
          ['flow', 'comparison'].includes(scene.visual.kind) &&
          Array.from({ length: rows }, (_, row) => row).some(
            (row) => !scene.beats?.some((beat) => beat.pointIndex === row),
          )
        )
          throw new Error('每个图解节点或对比行都必须对应实际讲解段落，不能提前展示未讲内容');
        return scene;
      },
    );
  };
  const scenes: ChapterVideoScene[] = [];
  const review = async (
    reviewStage: 'narrative' | 'storyboard',
    indices = plan.units.map((_, index) => index),
  ): Promise<ReturnType<typeof validateLessonReview>> => {
    const units = indices.map((index) => plan.units[index]);
    const topicIds = new Set(units.flatMap((unit) => unit.topicIds));
    const evidence = topics.filter((topic) => topicIds.has(topic.id));
    const passageIds = new Set(evidence.flatMap((topic) => topic.passageIds));
    const content = JSON.stringify({
      reviewStage,
      course,
      topics: evidence,
      units,
      narrations: indices.map((index) => narrations[index]),
      // A split review must still hear the actual sentences on both sides of its boundary.
      neighbors: {
        previous: narrations[indices[0] - 1],
        next: narrations[indices.at(-1)! + 1],
      },
      originals: passages
        .filter((passage) => passageIds.has(passage.id))
        .map((passage) => ({ passageId: passage.id, text: passage.text })),
      scenes:
        reviewStage === 'narrative'
          ? undefined
          : indices.map((index) => {
              const { title, topicIds, narration, visual, points, beats } = scenes[index];
              return {
                unitId: plan.units[index].id,
                title,
                topicIds,
                ...(beats?.length ? {} : { narration }),
                visual,
                points,
                beats: beats?.map(({ text, focus, pointIndex }) => ({ text, focus, pointIndex })),
                ...(visual?.example === 'linear-trade'
                  ? { numericExample: tradeExample(visual.mode ?? 'import') }
                  : {}),
              };
            }),
    });
    // Split whole teaching units rather than truncating evidence or the end of a chapter.
    if (content.length > 65_000 && indices.length > 1) {
      const middle = Math.ceil(indices.length / 2);
      return [
        ...(await review(reviewStage, indices.slice(0, middle))),
        ...(await review(reviewStage, indices.slice(middle))),
      ];
    }
    return checked(
      content,
      'review',
      `正在审校${reviewStage === 'narrative' ? '章节主线、认知衔接与完整讲稿' : '图文一致性与整章理解'} · 单元 ${indices[0] + 1}–${indices.at(-1)! + 1}`,
      (response) => validateLessonReview(response, evidence, units),
    );
  };
  const repair = async (
    issues: ReturnType<typeof validateLessonReview>,
    stage: 'narrative' | 'storyboard',
  ) => {
    const affected = plan.units
      .map((unit, index) => ({
        unit,
        index,
        issues: issues.filter(
          (issue) =>
            unit.topicIds.includes(issue.topicId) && (!issue.unitId || issue.unitId === unit.id),
        ),
      }))
      .filter((item) => item.issues.length);
    if (affected.length > 8)
      throw new Error('讲稿审校发现多处实质问题，已停止渲染，请重新生成或选择其他模型');
    for (const item of affected) {
      const feedback = JSON.stringify(item.issues);
      if (stage === 'narrative' || item.issues.some((issue) => issue.kind !== 'diagram-mismatch'))
        narrations[item.index] = await writeNarration(item.unit, item.index, feedback);
      if (stage === 'storyboard')
        scenes[item.index] = await writeUnit(item.unit, item.index, feedback);
    }
    checkCapacity();
    if ((await review(stage)).length)
      throw new Error('修订后仍有论证遗漏、叙事割裂或图文不一致，已停止渲染，请重新生成');
  };
  const checkCapacity = () => {
    if (narrations.reduce((sum, draft) => sum + draft.narration.length, 0) > 9000)
      throw new Error('完整课程超过单次讲稿容量，请选择较小章节');
  };
  for (const [index, unit] of plan.units.entries())
    narrations.push(await writeNarration(unit, index));
  checkCapacity();
  const narrativeIssues = await review('narrative');
  if (narrativeIssues.length) await repair(narrativeIssues, 'narrative');
  for (const [index, unit] of plan.units.entries()) scenes.push(await writeUnit(unit, index));
  const visualIssues = await review('storyboard');
  if (visualIssues.length) await repair(visualIssues, 'storyboard');
  const coverage: NonNullable<ChapterVideo['coverage']> = topics.map((topic) => ({
    title: topic.title,
    sceneIndexes: scenes.flatMap((scene, index) =>
      scene.topicIds?.includes(topic.id) ? [index] : [],
    ),
  }));
  return {
    title: plan.title,
    summary: plan.summary,
    centralQuestion: plan.story.question,
    scenes,
    coverage,
  };
}

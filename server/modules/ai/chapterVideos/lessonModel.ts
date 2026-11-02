import { z } from 'zod';
import type { BookPassage } from '../../books/search.js';
import { validateMindMapOutline } from '../mindmaps/model.js';
import { describeValidationIssues } from './validation.js';

const reference = z.object({
  passageId: z.string().min(1).max(100),
  quote: z.string().trim().min(8).max(300),
});
const evidenceSchema = z.object({
  topics: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        section: z.string().trim().min(1).max(160),
        title: z.string().trim().min(1).max(100),
        claim: z.string().trim().min(8).max(500),
        reasoning: z.array(z.string().trim().min(4).max(300)).max(8),
        conditions: z.array(z.string().trim().min(2).max(200)).max(6),
        misconceptions: z.array(z.string().trim().min(2).max(200)).max(6),
        sources: z.array(reference).min(1).max(4),
      }),
    )
    .min(1)
    .max(24),
  coverage: z
    .array(z.object({ passageId: z.string(), topicIds: z.array(z.string()).min(1).max(24) }))
    .min(1)
    .max(300),
});
const planSchema = z.object({
  title: z.string().trim().min(1).max(60),
  summary: z.string().trim().min(1).max(240),
  story: z.object({
    question: z.string().trim().min(8).max(100),
    answer: z.string().trim().min(8).max(300),
    throughline: z.string().trim().min(8).max(400),
  }),
  units: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        title: z.string().trim().min(1).max(40),
        goal: z.string().trim().min(4).max(300),
        role: z.enum(['opening', 'explanation', 'synthesis', 'complete']),
        buildsOn: z.array(z.string().min(1).max(100)).max(32),
        bridge: z.string().trim().min(8).max(200),
        takeaway: z.string().trim().min(8).max(240),
        targetCharacters: z.number().int().min(80).max(600).default(240),
        topicIds: z.array(z.string()).min(1).max(32),
      }),
    )
    .min(1)
    .max(32),
});
const narrationSchema = z.object({
  unitId: z.string().min(1).max(100),
  narration: z.string().trim().min(20).max(840),
  visualIntent: z.string().trim().min(8).max(300),
  sources: z.array(reference).min(1).max(4),
});
const reviewSchema = z.object({
  issues: z
    .array(
      z.object({
        topicId: z.string(),
        unitId: z.string().optional(),
        kind: z.enum([
          'omission',
          'incorrect',
          'unsupported',
          'diagram-mismatch',
          'prerequisite-gap',
          'discontinuity',
          'summary-only',
        ]),
        message: z.string().trim().min(8).max(600),
      }),
    )
    .max(12),
});

export type LessonTopic = z.infer<typeof evidenceSchema>['topics'][number] & {
  passageIds: string[];
};
export type LessonUnit = z.infer<typeof planSchema>['units'][number];
export type LessonNarration = z.infer<typeof narrationSchema>;

function parse(content: string): unknown {
  try {
    return JSON.parse(
      content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
    );
  } catch {
    throw new Error('课程编辑没有返回有效的 JSON，请重新生成');
  }
}

export function validateLessonEvidence(
  content: string,
  passages: BookPassage[],
  batch: number,
): LessonTopic[] {
  const result = evidenceSchema.safeParse(parse(content));
  if (!result.success)
    throw new Error(`章节论证资料格式不正确：${describeValidationIssues(result.error)}`);
  const { topics, coverage } = result.data;
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  if (byId.size !== topics.length) throw new Error('章节主题标识重复');
  const allowed = new Set(passages.map((passage) => passage.id));
  const covered = new Set<string>();
  for (const item of coverage) {
    if (!allowed.has(item.passageId) || covered.has(item.passageId))
      throw new Error('章节覆盖清单包含重复或未知段落');
    if (item.topicIds.some((id) => !byId.has(id))) throw new Error('章节覆盖清单引用未知主题');
    covered.add(item.passageId);
  }
  if (covered.size !== allowed.size) throw new Error('章节论证资料遗漏正文段落，请重新生成');
  return topics.map((topic) => {
    validateMindMapOutline(
      JSON.stringify({
        nodes: topic.sources.map((source, index) => ({
          key: String(index),
          parent: null,
          title: topic.title,
          sources: [source],
        })),
      }),
      passages,
      'video-evidence',
    );
    const passageIds = [
      ...new Set([
        ...topic.sources.map((source) => source.passageId),
        ...coverage
          .filter((item) => item.topicIds.includes(topic.id))
          .map((item) => item.passageId),
      ]),
    ];
    return { ...topic, id: `b${batch}:${topic.id}`, passageIds };
  });
}

export function validateLessonPlan(
  content: string,
  topics: LessonTopic[],
  targetCharacters = 9000,
) {
  const result = planSchema.safeParse(parse(content));
  if (!result.success)
    throw new Error(`完整章节课程计划格式不正确：${describeValidationIssues(result.error)}`);
  const known = new Set(topics.map((topic) => topic.id));
  const assigned = new Set<string>();
  const units = new Set<string>();
  for (const [index, unit] of result.data.units.entries()) {
    if (units.has(unit.id)) throw new Error('课程单元标识重复');
    if (new Set(unit.buildsOn).size !== unit.buildsOn.length)
      throw new Error('课程单元重复列出相同前置单元');
    if (unit.buildsOn.some((id) => !units.has(id)))
      throw new Error('课程不能依赖尚未讲解或不存在的前置单元');
    if (index > 0 && !unit.buildsOn.length) throw new Error('后续单元必须承接已经建立的认知');
    const expectedRole =
      result.data.units.length === 1
        ? 'complete'
        : index === 0
          ? 'opening'
          : index === result.data.units.length - 1
            ? 'synthesis'
            : 'explanation';
    if (unit.role !== expectedRole)
      throw new Error('课程必须从整体问题出发，逐步解释，最后回到本章问题形成整体认识');
    units.add(unit.id);
    if (new Set(unit.topicIds).size !== unit.topicIds.length)
      throw new Error('课程单元重复列出相同主题');
    for (const id of unit.topicIds) {
      if (!known.has(id)) throw new Error('课程计划包含未知主题');
      assigned.add(id);
    }
  }
  if (assigned.size !== known.size) throw new Error('课程计划遗漏章节主题，不能开始渲染');
  if (
    result.data.units.reduce((sum, unit) => sum + unit.targetCharacters, 0) >
    Math.max(1200, targetCharacters * 1.25)
  )
    throw new Error('课程计划篇幅过于分散，请合并重复铺垫和辅助案例，保留主要推导');
  return result.data;
}

export function validateLessonNarration(
  content: string,
  unit: LessonUnit,
  passages: BookPassage[],
): LessonNarration {
  const result = narrationSchema.safeParse(parse(content));
  if (!result.success)
    throw new Error(`连续讲稿格式不正确：${describeValidationIssues(result.error)}`);
  const draft = result.data;
  if (draft.unitId !== unit.id) throw new Error('讲稿对应了错误的教学单元');
  if (draft.narration.length > Math.max(240, unit.targetCharacters * 1.4))
    throw new Error('本单元超过篇幅安排，请保留必要解释并合并重复铺垫');
  validateMindMapOutline(
    JSON.stringify({
      nodes: draft.sources.map((source, index) => ({
        key: String(index),
        parent: null,
        title: unit.title,
        sources: [source],
      })),
    }),
    passages,
    'video-narration',
  );
  return draft;
}

export function validateLessonReview(
  content: string,
  topics: LessonTopic[],
  units: LessonUnit[] = [],
) {
  const result = reviewSchema.safeParse(parse(content));
  if (!result.success)
    throw new Error(`讲稿审校结果格式不正确：${describeValidationIssues(result.error)}`);
  const known = new Set(topics.map((topic) => topic.id));
  if (result.data.issues.some((issue) => !known.has(issue.topicId)))
    throw new Error('讲稿审校引用未知主题');
  if (
    result.data.issues.some(
      (issue) =>
        issue.unitId &&
        !units.some((unit) => unit.id === issue.unitId && unit.topicIds.includes(issue.topicId)),
    )
  )
    throw new Error('讲稿审校引用未知教学单元');
  return result.data.issues;
}

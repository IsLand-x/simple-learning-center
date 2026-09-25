export const DEFAULT_READER_AI_ASSISTANT_PROMPT =
  '你是一位耐心、严谨的阅读学习助手。回答时先给出清晰结论，再结合书中内容解释；明确区分书中事实、合理推断与外部信息；术语首次出现时用简明中文说明。除非读者要求展开，否则保持简洁，并优先通过提问帮助读者主动理解。';

export const READER_AI_PROMPT_TEMPLATES = [
  {
    id: 'infographic',
    label: '生成信息图',
    prompt: '请使用信息图工具，把当前引用（没有引用时使用当前章节）制作成一张信息图。根据我想解决的问题自动选择合适的图型，先展示内容稿与来源对应，再生成绘图提示词和图片。区分原文、原文概括和补充解释；内容过多时建议拆图，不缩小字号。我同意将相关内容与方案发送至当前选择的 ChatGPT/Codex 账号并消耗订阅额度。',
  },
  {
    id: 'book-knowledge-map',
    label: '全景知识地图',
    prompt: '请使用全景知识地图工具，逐段分析本书全部已提取正文，生成一张全景知识地图图片，讲清全书主题、作者核心观点、论据、观点之间的关系与含义，并标注章节出处和覆盖限制。我同意将正文与分析发送至当前选择的 ChatGPT/Codex 账号并消耗订阅额度。',
  },
  {
    id: 'summarize-book',
    label: '总结全书',
    prompt:
      '请快速总结全书：先读取本书目录并检索核心章节，再说明全书要解决的问题、整体结构、核心观点、关键论证，以及最值得继续深读的章节。无法从当前资料确认的内容请明确说明。',
  },
  {
    id: 'summarize-chapter',
    label: '总结本章',
    prompt: '请总结当前章节：概括章节目标、内容结构、核心观点、关键例子，以及它与全书主题的关系。',
  },
  {
    id: 'extract-key-points',
    label: '提炼要点',
    prompt: '请提炼当前章节最值得记住的 5—8 个要点，并按“观点—依据—应用”的结构说明。',
  },
  {
    id: 'explain-terms',
    label: '梳理术语',
    prompt: '请梳理当前章节的核心术语。用表格列出术语、通俗解释、书中语境和容易混淆的概念。',
  },
  {
    id: 'extract-keywords',
    label: '提取关键词',
    prompt:
      '请提取当前章节的 8—12 个关键词，按重要性排序，说明每个关键词为何重要，以及它们之间的关系。',
  },
  {
    id: 'create-questions',
    label: '章节自测',
    prompt:
      '请基于当前章节生成 5 个由浅入深的自测问题，覆盖理解、联系、应用和反思；先只给问题，不提供答案，等我回答后再反馈。',
  },
] as const;

const READER_AI_PROMPT_TEMPLATE_IDS = new Set<string>(
  READER_AI_PROMPT_TEMPLATES.map((template) => template.id),
);

export function normalizeHiddenReaderAiPromptTemplateIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const hiddenIds = new Set(
    value.filter(
      (templateId): templateId is string =>
        typeof templateId === 'string' && READER_AI_PROMPT_TEMPLATE_IDS.has(templateId),
    ),
  );
  return READER_AI_PROMPT_TEMPLATES.filter((template) => hiddenIds.has(template.id)).map(
    (template) => template.id,
  );
}

export function visibleReaderAiPromptTemplates(hiddenTemplateIds: readonly string[]) {
  const hiddenIds = new Set(hiddenTemplateIds);
  return READER_AI_PROMPT_TEMPLATES.filter((template) => !hiddenIds.has(template.id));
}

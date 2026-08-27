import type { BookItem } from '../types';

const now = Date.now();

export const demoBooks: BookItem[] = [
  {
    id: 'demo-data-intensive',
    kind: 'demo',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    fileName: 'designing-data-intensive-applications.epub',
    fileSize: 8_740_000,
    createdAt: now - 1000 * 60 * 60 * 24 * 18,
    updatedAt: now - 1000 * 60 * 22,
    progress: 42,
    currentChapter: '第五章 · 复制',
    currentPage: 186,
    totalPages: 446,
    toc: [
      { id: 'd1', href: 'chapter-1', label: '第一章 · 可靠、可扩展与可维护' },
      { id: 'd2', href: 'chapter-2', label: '第二章 · 数据模型与查询语言' },
      { id: 'd3', href: 'chapter-3', label: '第三章 · 存储与检索' },
      { id: 'd4', href: 'chapter-4', label: '第四章 · 编码与演化' },
      { id: 'd5', href: 'chapter-5', label: '第五章 · 复制' },
      { id: 'd6', href: 'chapter-6', label: '第六章 · 分区' },
      { id: 'd7', href: 'chapter-7', label: '第七章 · 事务' },
      { id: 'd8', href: 'chapter-8', label: '第八章 · 分布式系统的麻烦' },
    ],
  },
  {
    id: 'demo-thinking',
    kind: 'demo',
    title: '思考，快与慢',
    author: 'Daniel Kahneman',
    fileName: 'thinking-fast-and-slow.epub',
    fileSize: 4_680_000,
    createdAt: now - 1000 * 60 * 60 * 24 * 12,
    updatedAt: now - 1000 * 60 * 60 * 25,
    progress: 18,
    currentChapter: '启发法与偏见',
    currentPage: 92,
    totalPages: 512,
    toc: [
      { id: 't1', href: 'chapter-1', label: '第一部分 · 系统 1，系统 2' },
      { id: 't2', href: 'chapter-2', label: '第二部分 · 启发法与偏见' },
      { id: 't3', href: 'chapter-3', label: '第三部分 · 过度自信' },
      { id: 't4', href: 'chapter-4', label: '第四部分 · 选择与风险' },
    ],
  },
  {
    id: 'demo-learning',
    kind: 'demo',
    title: '学习之道',
    author: 'Josh Waitzkin',
    fileName: 'the-art-of-learning.epub',
    fileSize: 3_120_000,
    createdAt: now - 1000 * 60 * 60 * 24 * 26,
    updatedAt: now - 1000 * 60 * 60 * 72,
    progress: 67,
    currentChapter: '化小圈为大圈',
    currentPage: 176,
    totalPages: 263,
    toc: [
      { id: 'l1', href: 'chapter-1', label: '第一章 · 天真无邪的探索' },
      { id: 'l2', href: 'chapter-2', label: '第二章 · 失败的投资' },
      { id: 'l3', href: 'chapter-3', label: '第三章 · 化小圈为大圈' },
      { id: 'l4', href: 'chapter-4', label: '第四章 · 放慢时间' },
    ],
  },
];

export const demoChapterContent: Record<string, { heading: string; eyebrow: string; paragraphs: string[] }> = {
  'chapter-1': {
    eyebrow: '第一部分 · 数据系统的基础',
    heading: '可靠、可扩展与可维护的应用',
    paragraphs: [
      '今天的很多应用都属于数据密集型，而不是计算密集型。原始 CPU 性能通常不是首要限制；更大的问题来自数据量、数据复杂度以及变化速度。',
      '一个应用往往由多个通用组件组合而成：数据库保存数据，缓存加快读取，搜索索引支持按关键字查找，流处理把消息发送给其他进程，批处理则周期性分析累积数据。',
      '可靠性意味着系统即使遇到故障也能继续正确工作；可扩展性描述负载增长时保持性能的方法；可维护性则关乎不同角色的人能否长期高效地使用和演化系统。',
    ],
  },
  'chapter-2': {
    eyebrow: '第二部分 · 数据模型',
    heading: '数据模型与查询语言',
    paragraphs: [
      '数据模型可能是软件开发中最重要的部分，因为它们不仅影响软件的编写方式，也影响我们对问题本身的思考方式。',
      '每一层数据模型都通过提供清晰的数据结构隐藏下一层的复杂性。关系模型、文档模型和图模型针对不同的关系形态各有优势。',
      '不存在适合一切场景的单一模型。好的选择来自对访问模式、数据关系以及未来变化的理解。',
    ],
  },
  'chapter-3': {
    eyebrow: '第三部分 · 存储引擎',
    heading: '存储与检索',
    paragraphs: [
      '数据库在内部必须做两件事：保存交给它的数据，并在再次需要时把数据返回。看似简单的职责背后，是日志、索引、压缩和并发控制的协作。',
      '索引是从主要数据派生出的附加结构。它能加快读取，却会增加写入成本，因此是否建立索引取决于读写之间的真实权衡。',
      '理解存储引擎并不是为了重复造轮子，而是为了根据工作负载选择更合适的工具，并在性能偏离预期时知道该看哪里。',
    ],
  },
  'chapter-4': {
    eyebrow: '第四部分 · 数据编码',
    heading: '编码与演化',
    paragraphs: [
      '应用的需求总在变化，数据格式也随之演化。新代码和旧代码在一段时间内共存，是滚动升级与长期存储带来的常态。',
      '向后兼容意味着新代码可以读取旧数据，向前兼容意味着旧代码也能读取新数据。设计清晰的演化策略，比一次性替换所有组件更现实。',
    ],
  },
  'chapter-5': {
    eyebrow: '第五章 · 复制',
    heading: '数据复制的真正困难',
    paragraphs: [
      '复制意味着在通过网络连接的多台机器上保留同一份数据副本。它可以让数据更靠近用户，提高可用性，也能扩大读取吞吐量。',
      '如果被复制的数据永远不变，复制很简单。真正困难的部分，是处理数据变化：谁接受写入，变化以什么顺序传播，副本落后时读到什么。',
      '每一种复制方案都在延迟、一致性、可用性和运维复杂度之间做选择。理解这些选择，比记住某个数据库的默认配置更重要。',
      '一个好的阅读问题是：当前系统承诺了什么一致性？这个承诺对用户能观察到的行为意味着什么？',
    ],
  },
  'chapter-6': {
    eyebrow: '第六章 · 分区',
    heading: '把大数据集拆开',
    paragraphs: [
      '对于非常大的数据集，或非常高的查询吞吐量，仅靠复制并不够。我们还需要把数据拆成分区，让不同节点负责不同的数据子集。',
      '分区的目标是均匀分布数据与查询负载，同时保留高效定位数据的能力。热点、再平衡与路由是设计中最常见的挑战。',
    ],
  },
};

export function getDemoContent(href: string) {
  return demoChapterContent[href] ?? demoChapterContent['chapter-5'];
}

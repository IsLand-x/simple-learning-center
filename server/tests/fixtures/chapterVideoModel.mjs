// A deterministic transport fixture shared by the Node and browser integration tests.
// Assertions about semantic coverage and repair live in planner.test.mjs.
export function videoFixturePhase(system) {
  if (system.includes('严谨的中文课程编辑')) return 'evidence';
  if (system.includes('中文教材的课程主编')) return 'plan';
  if (system.includes('负责教材精讲')) return 'script';
  if (system.includes('教材事实审校编辑')) return 'review';
  return system.includes('分镜') ? 'overview' : 'mindmap';
}

export function videoFixtureResponse(phase, prompt, invalid = false) {
  const clean = prompt.split('\n上次结果未通过校验：')[0];
  const start = clean.search(/[[{]/);
  const input = JSON.parse(clean.slice(start));
  const sourceOf = (entry) => ({
    passageId: entry.passageId,
    quote: invalid ? '这是一段没有出现在所选书籍中的虚构原文引用。' : entry.text.slice(0, 80),
  });
  const title = '用问题、证据与回顾理解阅读';
  const summary = '根据正文核对观点与推导';
  const makeScene = (topicIds, source, index = 0) => {
    const text = '阅读时先确认需要解释的问题，再用原文证据核对作者的观点，尤其保留结论成立的条件。';
    return {
      title: ['从原文问题开始', '核对证据与条件', '用自己的话复述'][index],
      ...(topicIds
        ? { topicIds, beats: [{ text, focus: 'point', pointIndex: 0 }], visual: { kind: 'flow' } }
        : {}),
      narration: text,
      layout: 'concept',
      points: [
        { title: '原文证据', detail: '核对作者实际提出的结论' },
        { title: '成立条件', detail: '保留条件并避免扩大结论' },
      ],
      sources: [source],
    };
  };
  if (phase === 'review') return JSON.stringify({ issues: [] });
  if (phase === 'evidence') {
    const topics = [];
    const coverage = [];
    for (let offset = 0; offset < input.length; offset += 4) {
      const entries = input.slice(offset, offset + 4);
      const id = `t${topics.length}`;
      topics.push({
        id,
        section: entries[0].chapter || '阅读',
        title: '核对原文与适用条件',
        claim: entries[0].text.slice(0, 120),
        reasoning: [entries[0].text.slice(0, 80)],
        conditions: [],
        misconceptions: [],
        sources: entries.map(sourceOf),
      });
      entries.forEach((entry) => coverage.push({ passageId: entry.passageId, topicIds: [id] }));
    }
    return JSON.stringify({ topics, coverage });
  }
  if (phase === 'plan') {
    const topics = input.topics ?? input;
    const units = [];
    const count = Math.min(3, topics.length);
    for (let index = 0; index < count; index++)
      units.push({
        id: `u${index}`,
        title: '解释原文观点',
        goal: '解释结论并指出成立条件',
        topicIds: topics
          .filter((_, topicIndex) => topicIndex % count === index)
          .map((topic) => topic.id),
      });
    return JSON.stringify({ title, summary, units });
  }
  if (phase === 'script')
    return JSON.stringify({
      title,
      summary,
      scenes: [makeScene(input.unit.topicIds, sourceOf(input.originals[0]))],
    });
  const source = input[0].passageId ? sourceOf(input[0]) : input[0].sources[0];
  if (phase === 'mindmap')
    return JSON.stringify({
      nodes: [{ key: 'learning', parent: null, title: '根据原文核对观点', sources: [source] }],
    });
  return JSON.stringify({
    title,
    summary,
    scenes: [0, 1, 2].map((index) => makeScene(undefined, source, index)),
  });
}

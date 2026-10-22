import { describe, expect, it } from 'vitest';
import { documentTextAnchor, findQuoteRange, textAnchorRange } from './textAnchors';

describe('原文文本锚点', () => {
  it('跨行内标签和排版空白定位，排除脚本，并拒绝歧义引用', () => {
    document.body.innerHTML =
      '<p>可靠性需要<b>系统</b>在出现\n故障时继续正确运行。</p><script>不能索引的内容</script><p>重复的引用内容。重复的引用内容。</p>';
    const anchor = documentTextAnchor(document);
    expect(anchor.text).not.toContain('不能索引');
    const range = findQuoteRange(document, '可靠性需要系统在出现故障时继续正确运行。');
    expect(range?.toString().replace(/\s/g, '')).toBe('可靠性需要系统在出现故障时继续正确运行。');
    expect(findQuoteRange(document, '重复的引用内容。')).toBeUndefined();
    expect(findQuoteRange(document, '原文没有的内容')).toBeUndefined();
  });

  it('同一句话出现多次时，限制在可信段落范围内解析', () => {
    document.body.innerHTML =
      '<p>这是一段可以精确定位的原文。</p><p>这是一段可以精确定位的原文。</p>';
    const paragraph = document.querySelectorAll('p')[1];
    const within = document.createRange();
    within.selectNodeContents(paragraph);
    const range = findQuoteRange(document, '可以精确定位的原文', within);
    expect(paragraph.contains(range!.startContainer)).toBe(true);
    const anchor = documentTextAnchor(document);
    expect(textAnchorRange(document, anchor, 0, 3)?.toString()).toBe('这是一');
  });
});

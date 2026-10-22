import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const namespace = 'http://www.w3.org/2000/svg';
const elements = new Set([
  'svg',
  'g',
  'defs',
  'marker',
  'clipPath',
  'path',
  'line',
  'rect',
  'circle',
  'ellipse',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
]);
const attributes = new Set([
  'xmlns',
  'width',
  'height',
  'viewBox',
  'preserveAspectRatio',
  'id',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'dx',
  'dy',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'transform',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'marker-start',
  'marker-mid',
  'marker-end',
  'markerWidth',
  'markerHeight',
  'refX',
  'refY',
  'orient',
  'markerUnits',
  'clip-path',
  'clipPathUnits',
]);

export function validateDiagramSvg(svg: string) {
  if (svg.length > 160_000 || /<!|<\?/.test(svg))
    throw new Error('SVG 不支持声明、实体、注释或处理指令。');
  const fail = () => {
    throw new Error('SVG 格式无效。');
  };
  const document = new DOMParser({
    errorHandler: { warning: fail, error: fail, fatalError: fail },
  }).parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (!root || root.tagName !== 'svg' || root.namespaceURI !== namespace)
    throw new Error('请返回带 SVG namespace 的完整 svg 元素。');
  if (Array.from(document.childNodes).some((node) => node.nodeType !== 1 && node.nodeType !== 3))
    throw new Error('SVG 包含不支持的文档节点。');
  const width = Number(root.getAttribute('width'));
  const height = Number(root.getAttribute('height'));
  if (![width, height].every((value) => Number.isInteger(value) && value >= 200 && value <= 2000))
    throw new Error('SVG width 和 height 须为 200—2000 的整数像素。');
  const viewBox = (root.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox.length !== 4 ||
    viewBox.some((value) => !Number.isFinite(value)) ||
    viewBox[0] !== 0 ||
    viewBox[1] !== 0 ||
    viewBox[2] !== width ||
    viewBox[3] !== height
  )
    throw new Error('SVG viewBox 须为 0 0 width height，保持坐标比例一致。');
  let count = 0;
  const visit = (element: typeof root, depth: number) => {
    if (++count > 2000 || depth > 24) throw new Error('SVG 元素过多或嵌套过深。');
    if (
      element.namespaceURI !== namespace ||
      !elements.has(element.tagName) ||
      (element !== root && element.tagName === 'svg')
    )
      throw new Error('SVG 仅支持静态几何、文字、箭头和裁剪，不支持外部资源。');
    for (const attribute of Array.from(element.attributes)) {
      const value = attribute.value;
      if (
        !attributes.has(attribute.name) ||
        value.includes('\\') ||
        Array.from(value).some((character) => character.charCodeAt(0) < 32) ||
        (attribute.name !== 'xmlns' &&
          /(?:https?:|file:|data:|javascript:|@import)/i.test(value)) ||
        (attribute.name === 'xmlns' && value !== namespace) ||
        (/url\s*\(/i.test(value) && !/^url\(#[a-zA-Z][\w-]*\)$/.test(value)) ||
        /(?:NaN|Infinity)/.test(value)
      )
        throw new Error(`SVG 属性 ${attribute.name} 无效或不安全。`);
    }
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 1) visit(child as typeof root, depth + 1);
      else if (child.nodeType !== 3) throw new Error('SVG 仅支持元素和文字节点。');
    }
  };
  visit(root, 0);
  const labels = Array.from(root.getElementsByTagName('text'))
    .map((element) => element.textContent || '')
    .join('\n');
  return { svg: new XMLSerializer().serializeToString(root), width, height, labels };
}

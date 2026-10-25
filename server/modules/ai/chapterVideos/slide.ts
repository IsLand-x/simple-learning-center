import type { ChapterVideoScene } from '../../../../contracts/reading.js';

const colors = {
  paper: '#132333',
  panel: '#1c3448',
  text: '#f0f4f6',
  muted: '#b7c9d3',
  accent: '#85d4c4',
  line: '#395668',
};
const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

function lines(text: string, width: number, size: number, max: number) {
  const result: string[] = [];
  let line = '';
  let length = 0;
  for (const char of Array.from(text.replace(/\s+/g, ' ').trim())) {
    const advance = char.codePointAt(0)! <= 0xff ? size * 0.56 : size;
    if (length + advance > width && line) {
      result.push(line);
      line = '';
      length = 0;
    }
    line += char;
    length += advance;
  }
  if (line) result.push(line);
  if (result.length > max) result[max - 1] = result[max - 1].slice(0, -1) + '…';
  return result.slice(0, max);
}

function textBlock(
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  max: number,
  color = colors.text,
  weight = 400,
) {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}">${lines(
    text,
    width,
    size,
    max,
  )
    .map((line, index) => `<tspan x="${x}" dy="${index ? size * 1.45 : 0}">${escape(line)}</tspan>`)
    .join('')}</text>`;
}

export function videoSlideSvg(
  scene: ChapterVideoScene,
  bookTitle: string,
  chapterTitle: string,
  index: number,
  count: number,
  revealed: number,
  caption: string,
) {
  const points = scene.points;
  let diagram: string;
  if (scene.layout === 'steps') {
    const width = (1120 - (points.length - 1) * 32) / points.length;
    diagram = points
      .map((point, position) => {
        const x = 80 + position * (width + 32);
        if (position >= revealed) return '';
        return `<rect x="${x}" y="250" width="${width}" height="270" rx="12" fill="${colors.panel}" stroke="${colors.line}"/>
        ${textBlock(String(position + 1).padStart(2, '0'), x + 22, 293, width - 44, 20, 1, colors.accent, 600)}
        ${textBlock(point.title, x + 22, 340, width - 44, 27, 2, colors.text, 600)}
        ${textBlock(point.detail, x + 22, 424, width - 44, 21, 3, colors.muted)}
        ${position < points.length - 1 && position < revealed - 1 ? `<path d="M${x + width + 8} 385h16m-6-6 6 6-6 6" fill="none" stroke="${colors.accent}" stroke-width="3"/>` : ''}`;
      })
      .join('');
  } else if (scene.layout === 'concept') {
    diagram = `<rect x="462" y="305" width="356" height="150" rx="14" fill="${colors.panel}" stroke="${colors.accent}" stroke-width="2"/>${textBlock(scene.title, 486, 362, 308, 29, 2, colors.text, 600)}`;
    diagram += points
      .map((point, position) => {
        if (position >= revealed) return '';
        const x = position % 2 ? 885 : 75;
        const y = position < 2 ? 235 : 430;
        const startX = x < 640 ? x + 320 : x;
        const endX = x < 640 ? 462 : 818;
        return `<path d="M${startX} ${y + 62}L${endX} 380" stroke="${colors.line}" stroke-width="2"/>
        <rect x="${x}" y="${y}" width="320" height="153" rx="10" fill="${colors.panel}"/>
        ${textBlock(point.title, x + 20, y + 40, 280, 25, 2, colors.accent, 600)}
        ${textBlock(point.detail, x + 20, y + 96, 280, 20, 2, colors.muted)}`;
      })
      .join('');
  } else {
    const columns = scene.layout === 'compare' ? points.length : 2;
    const width = (1120 - (columns - 1) * 24) / columns;
    diagram = points
      .map((point, position) => {
        if (position >= revealed) return '';
        const x = 80 + (position % columns) * (width + 24);
        const y = 235 + Math.floor(position / columns) * 175;
        const height = scene.layout === 'compare' ? 300 : 150;
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="${colors.panel}" stroke="${colors.line}"/>
        ${textBlock(point.title, x + 22, y + 44, width - 44, 27, 2, colors.accent, 600)}
        ${textBlock(point.detail, x + 22, y + 100, width - 44, 22, scene.layout === 'compare' ? 5 : 2, colors.muted)}`;
      })
      .join('');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <rect width="1280" height="720" fill="${colors.paper}"/>
    <g font-family="Noto Sans CJK SC, Noto Sans, sans-serif">
      ${textBlock(bookTitle, 80, 58, 840, 21, 1, colors.muted)}
      ${textBlock(`${index + 1} / ${count}`, 1095, 58, 120, 20, 1, colors.muted)}
      <path d="M80 88H1200" stroke="${colors.line}"/>
      ${textBlock(chapterTitle, 80, 125, 1120, 18, 1, colors.accent)}
      ${textBlock(scene.title, 80, 182, 1120, 38, 1, colors.text, 600)}
      ${diagram}
      <rect x="60" y="612" width="1160" height="70" rx="8" fill="${colors.paper}"/>
      ${textBlock(caption, 90, 642, 1100, 25, 2)}
      <rect x="80" y="698" width="1120" height="3" fill="${colors.line}"/>
      <rect x="80" y="698" width="${(1120 * (index + 1)) / count}" height="3" fill="${colors.accent}"/>
    </g>
  </svg>`;
}

import { Type } from '@earendil-works/pi-ai';
import type { BookItem } from '../../../../contracts/books.js';
import { createHash } from 'node:crypto';
import { saveBookDiagram } from '../../books/resources.js';
import { defineTool } from '../toolDefinition.js';
import { renderDiagram } from './renderer.js';
import { runnableDiagramScript } from './script.js';

export interface DiagramResult {
  imageUrl: string;
  scriptUrl: string;
  title: string;
  explanation: string;
  basis: string;
  assumptions: string[];
  exampleData: boolean;
  checks: string[];
  width: number;
  height: number;
  visualInspection: string;
  supportsVisualInspection: boolean;
}

interface Options {
  book: BookItem;
  supportsImages: boolean;
  onResult: (result: DiagramResult) => void;
  render?: typeof renderDiagram;
  save?: typeof saveBookDiagram;
}

const boundedText = (description: string, maxLength = 1500) =>
  Type.String({ minLength: 1, maxLength, description });

export function createDiagramTools({
  book,
  supportsImages,
  onResult,
  render = renderDiagram,
  save = saveBookDiagram,
}: Options) {
  const runs = new Map<string, Promise<DiagramResult>>();
  const images = new Map<string, string>();
  let queue: Promise<unknown> = Promise.resolve();
  return {
    render_diagram: defineTool({
      description:
        '本地执行 JavaScript 计算并绘制 SVG，返回真实 PNG 与可下载脚本，不调用 AI 生图，不联网。仅用于阅读理解的曲线图、示意图、流程图或对比图。先核对原文、概念、公式、数据与假设。脚本为函数体，必须 return 完整 SVG 字符串；可用标准 JS/Math，不支持 import、require、fetch、文件或进程。用脚本计算坐标与填色边界，并对关键数值使用 if (...) throw new Error(...) 自检。SVG 根必须有 xmlns="http://www.w3.org/2000/svg"、整数 width/height（200—2000）和 viewBox="0 0 width height"。仅支持静态几何、text/tspan、defs/marker/clipPath；禁止 style、image、use、外链、事件、HTML 和动画。使用 font-family="Noto Sans CJK SC"、清晰中文标签、单位与图例；文字建议至少 20px。每条消息最多尝试 4 个不同脚本，包含修正。支持图片输入时返回成图供你实际检查；否则明确未完成视觉检查。',
      inputSchema: Type.Object(
        {
          title: boundedText('图示标题', 120),
          kind: Type.Union([
            Type.Literal('curve'),
            Type.Literal('schematic'),
            Type.Literal('flowchart'),
            Type.Literal('comparison'),
          ]),
          basis: boundedText('已核对的概念、公式和依据；来自原文时写明章节或段落，不虚构出处'),
          assumptions: Type.Array(boundedText('必要假设与适用边界', 500), { maxItems: 8 }),
          example_data: Type.Boolean({
            description: '是否包含假设或示例数据；为 true 时必须在图内明确标注“示例数据”',
          }),
          checks: Type.Array(
            boundedText('绘图前核对项，以及脚本实际执行的数值断言；不得声称已检查成图', 500),
            { minItems: 1, maxItems: 8 },
          ),
          explanation: boundedText('配图的简短解释，不得提前声称完成视觉检查'),
          script: boundedText(
            '完整 JavaScript 函数体，计算、自检并 return SVG；不要 Markdown 围栏',
            40_000,
          ),
        },
        { additionalProperties: false },
      ),
      execute: async (input, signal) => {
        const key = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        const existing = runs.get(key);
        if (existing) return existing;
        if (runs.size >= 4) throw new Error('本条消息最多尝试 4 个绘图方案，请在下一条消息继续。');
        const run = queue.then(async () => {
          signal?.throwIfAborted();
          const { png, width, height, labels } = await render(input.script, signal);
          if (input.example_data && !labels.includes('示例数据'))
            throw new Error('使用示例数据时，必须在图内 text 标签中注明“示例数据”，请修正脚本。');
          signal?.throwIfAborted();
          const imageUrl = await save(book, png, runnableDiagramScript(input.script), signal);
          const result: DiagramResult = {
            imageUrl,
            scriptUrl: `${imageUrl}/script`,
            title: input.title,
            explanation: input.explanation,
            basis: input.basis,
            assumptions: input.assumptions,
            checks: input.checks,
            exampleData: input.example_data,
            width,
            height,
            supportsVisualInspection: supportsImages,
            visualInspection: supportsImages
              ? '成图已作为图片返回给当前模型，请实际查看中文、重叠、坐标、比例、图例与填色；发现问题时修正脚本重绘，再给出简短解释。'
              : '当前模型未声明支持图片输入：已执行脚本并检查 SVG 结构与尺寸，尚未进行成图视觉检查。请明确告知读者，不得声称已查看或确认成图正确。',
          };
          if (supportsImages) images.set(imageUrl, png.toString('base64'));
          onResult(result);
          return result;
        });
        runs.set(key, run);
        queue = run.catch(() => undefined);
        return run;
      },
      modelContent: (result) => {
        const image = images.get(result.imageUrl);
        return [
          { type: 'text', text: JSON.stringify(result) },
          ...(image ? [{ type: 'image' as const, data: image, mimeType: 'image/png' }] : []),
        ];
      },
    }),
  };
}

function plainMarkdown(value: string) {
  return value.replace(/[\\`*_{}[\]()<>!#|]/g, '\\$&');
}

export function diagramMarkdown(result: DiagramResult) {
  const title = plainMarkdown(result.title);
  return [
    `![${title}](${result.imageUrl})`,
    `[查看或保存原图](${result.imageUrl}) · [下载绘图脚本](${result.scriptUrl})`,
    plainMarkdown(result.explanation),
    `依据：${plainMarkdown(result.basis)}`,
    result.assumptions.length
      ? `假设与边界：${result.assumptions.map(plainMarkdown).join('；')}`
      : '',
    result.exampleData ? '包含示例数据，不代表实测结果。' : '',
    result.supportsVisualInspection
      ? '图示已生成，视觉检查结论见后续回复。'
      : '脚本已执行并生成图片；当前模型不支持查看图片，尚未完成视觉检查。',
  ]
    .filter(Boolean)
    .join('\n\n');
}

import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { componentNames } from './component-file-rules.mjs';

const root = resolve(import.meta.dirname, '..');
async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const file = resolve(directory, entry.name);
        return entry.isDirectory() ? collect(file) : file.endsWith('.tsx') ? [file] : [];
      }),
    )
  ).flat();
}

const violations = [];
const files = await collect(resolve(root, 'src'));
for (const file of files) {
  const components = componentNames(await readFile(file, 'utf8'), file);
  if (components.length > 1 || (!file.endsWith('.test.tsx') && components.length !== 1))
    violations.push(
      `${relative(root, file)}: 必须只定义一个组件，当前 ${components.length} 个 (${components.join(', ')})；无组件逻辑使用 .ts 文件`,
    );
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else
  console.log(`组件文件检查通过（${files.length} 个 TSX 文件；测试最多一个、生产恰好一个组件）`);

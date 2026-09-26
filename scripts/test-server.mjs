import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = fileURLToPath(new URL('..', import.meta.url));
const sourceDirectory = join(projectDirectory, 'server');
const outputDirectory = join(projectDirectory, 'server-dist');
const testPattern = /\.test\.(?:[cm]?[jt]s|tsx)$/;

async function discoverTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return discoverTests(path);
      return entry.isFile() && testPattern.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

const sourceTests = await discoverTests(sourceDirectory);
const outputTests = await discoverTests(outputDirectory);
const expectedTests = sourceTests
  .map((path) =>
    join(
      outputDirectory,
      relative(sourceDirectory, path)
        .replace(/\.tsx?$/, '.js')
        .replace(/\.mts$/, '.mjs')
        .replace(/\.cts$/, '.cjs'),
    ),
  )
  .sort();

// Check both sides so moving tests cannot silently skip files or run stale output.
if (
  !sourceTests.length ||
  expectedTests.length !== outputTests.length ||
  expectedTests.some((path, index) => path !== outputTests[index])
) {
  throw new Error('服务端测试源文件与构建产物不一致，请先运行 npm run build:server');
}

console.log(`运行 ${outputTests.length} 个服务端测试文件（递归发现并核对源文件）。`);
const runner = spawn(process.execPath, ['--test', '--test-concurrency=1', ...outputTests], {
  cwd: projectDirectory,
  stdio: 'inherit',
});
runner.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
runner.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

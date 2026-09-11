import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(projectRoot, 'src');
const serverRoot = resolve(projectRoot, 'server');
const supportedExtensions = new Set(['.ts', '.tsx', '.mjs']);
const violations = [];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? collectFiles(path)
        : supportedExtensions.has(extname(path))
          ? [path]
          : [];
    }),
  );
  return files.flat();
}

function normalizedRelative(path) {
  return relative(projectRoot, path).split(sep).join('/');
}

function resolveImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  return resolve(dirname(importer), specifier).split(sep).join('/');
}

function featureName(path) {
  const match = path.match(/\/src\/features\/([^/]+)\//);
  return match?.[1];
}

function validateImport(importer, specifier) {
  const target = resolveImport(importer, specifier);
  if (!target) return;
  const importerPath = importer.split(sep).join('/');

  if (importerPath.startsWith(`${sourceRoot.split(sep).join('/')}/shared/`)) {
    if (/\/src\/(?:app|components|features|pages|store)\//.test(target)) {
      violations.push(`${normalizedRelative(importer)}: shared 模块不能依赖 ${specifier}`);
    }
  }

  if (importerPath.startsWith(`${sourceRoot.split(sep).join('/')}/store/`)) {
    if (/\/src\/(?:app|components|features|pages)\//.test(target)) {
      violations.push(`${normalizedRelative(importer)}: store 不能依赖界面层 ${specifier}`);
    }
  }

  const importerFeature = featureName(importerPath);
  const targetFeature = featureName(target);
  if (importerFeature && targetFeature && importerFeature !== targetFeature) {
    violations.push(
      `${normalizedRelative(importer)}: feature ${importerFeature} 不能深层依赖 feature ${targetFeature}`,
    );
  }

  if (
    !importerPath.startsWith(`${serverRoot.split(sep).join('/')}/routes/`) &&
    importerPath !== `${serverRoot.split(sep).join('/')}/app.mjs` &&
    /\/server\/routes\//.test(target)
  ) {
    violations.push(
      `${normalizedRelative(importer)}: 只有服务端组合入口可以依赖 routes ${specifier}`,
    );
  }
}

for (const file of [...(await collectFiles(sourceRoot)), ...(await collectFiles(serverRoot))]) {
  const source = await readFile(file, 'utf8');
  const imports = source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g);
  for (const match of imports) validateImport(file, match[1]);
}

if (violations.length) {
  console.error(`模块边界检查失败（${violations.length} 项）：`);
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log('模块边界检查通过');
}

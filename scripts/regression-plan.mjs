import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const glossaryFiles =
  /(?:\/termAnnotations(?:\.test)?\.ts$|\/DemoHighlightedText(?:\.test)?\.tsx$|\/ReaderGlossaryPanel\/|\/GlossaryPanel\/)/;
const domains = [
  [
    /^src\/pages\/books\/list\//,
    ['book-list-order', 'book-archive', 'book-resources', 'book-sharing', 'book-share-loading'],
  ],
  [
    /^src\/pages\/books\/detail\//,
    [
      'foliate-runtime',
      'reading-progress',
      'toc-scroll-position',
      'reader-typography',
      'reader-paragraph-spacing',
      'reader-glossary',
      'reader-annotation-sorting',
      'reader-content-settings',
      'reader-ai-activity',
      'mobile-reader-overlays',
      'note-concurrency',
      'book-knowledge-map',
    ],
  ],
  [/^src\/pages\/rss\//, ['rss-video-workflows']],
  [/^src\/pages\/videos\//, ['rss-video-workflows', 'video-dialog-state']],
  [/^src\/pages\/settings\//, ['settings-model-controls', 'oauth-settings', 'about-settings']],
];

export function regressionPlan(changes, forceFull = false) {
  const specs = new Set();
  const reasons = [];
  for (const { status, path } of changes) {
    if (/\.md$/.test(path)) continue;
    if (status === 'D') {
      reasons.push(`删除文件：${path}`);
    } else if (/^tests\/e2e\/[^/]+\.spec\.ts$/.test(path)) {
      specs.add(path);
    } else if (path.startsWith('src/pages/books/detail/') && glossaryFiles.test(path)) {
      specs.add('tests/e2e/reader-glossary.spec.ts');
      specs.add('tests/e2e/mobile-reader-overlays.spec.ts');
    } else {
      // Reader runtime, persistence, shared code and unknown paths are deliberately conservative.
      const domain =
        !/\/ReaderSurface\//.test(path) && domains.find(([pattern]) => pattern.test(path));
      if (!domain) reasons.push(`公共、高风险或未映射文件：${path}`);
      else {
        for (const name of domain[1]) specs.add(`tests/e2e/${name}.spec.ts`);
        specs.add('tests/e2e/visual-regression.spec.ts');
        specs.add('tests/e2e/app-shell.spec.ts');
      }
    }
  }
  if (forceFull) reasons.push('显式要求全量回归或比较基线不可用');
  return {
    mode: reasons.length ? 'full' : specs.size ? 'related' : 'none',
    specs: reasons.length ? [] : [...specs].sort(),
    reasons,
  };
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || '无法读取 Git 变动');
  return result.stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let plan;
  try {
    const base = process.env.REGRESSION_BASE || 'HEAD';
    const entries = git(['diff', '--no-renames', '--name-status', '-z', base, '--']).split('\0');
    const changes = [];
    for (let index = 0; index < entries.length - 1; index += 2) {
      changes.push({ status: entries[index], path: entries[index + 1] });
    }
    if (!process.env.CI) {
      for (const path of git(['ls-files', '--others', '--exclude-standard', '-z'])
        .split('\0')
        .filter(Boolean)) {
        changes.push({ status: 'A', path });
      }
    }
    plan = regressionPlan(changes, process.env.REGRESSION_FULL === 'true');
  } catch (error) {
    plan = regressionPlan([], true);
    plan.reasons.push(error.message);
  }
  console.log(JSON.stringify(plan, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `mode=${plan.mode}\nspecs=${JSON.stringify(plan.specs)}\n`,
    );
  }
  if (process.argv.includes('--run-browser') && plan.mode !== 'none') {
    const result = spawnSync('npm', ['run', 'test:e2e:container', '--', ...plan.specs], {
      stdio: 'inherit',
    });
    process.exitCode = result.status ?? 1;
  }
}

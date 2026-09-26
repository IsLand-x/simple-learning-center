import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dockerfile = readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8');
const imageVersion = dockerfile.match(/playwright:v([\d.]+)-noble@sha256:/)?.[1];
const lockfile = JSON.parse(
  readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'),
);
const playwrightVersion = lockfile.packages['node_modules/@playwright/test'].version;
if (imageVersion !== playwrightVersion) {
  throw new Error(
    `浏览器容器 ${imageVersion} 与 Playwright ${playwrightVersion} 不一致，请同步升级并验收视觉基线。`,
  );
}

const available = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
  encoding: 'utf8',
});
if (available.status !== 0) {
  console.error(
    '完整浏览器回归需要可用的 Docker。启动 Docker 后重试；本机调试可使用 npm run test:e2e。',
  );
  process.exit(1);
}

const image = `learning-center-browser-tests:${playwrightVersion}`;
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`浏览器容器命令失败：${signal ?? code}`));
    });
  });

await run(['build', '--tag', image, '--file', 'tests/browser/Dockerfile', 'tests/browser']);
await run([
  'run',
  '--rm',
  '--init',
  '--ipc=host',
  ...(process.getuid ? ['--user', `${process.getuid()}:${process.getgid()}`] : []),
  '--volume',
  `${root}:/work`,
  '--workdir',
  '/work',
  '--env',
  'LEARNING_CENTER_E2E_BROWSER=chromium',
  '--env',
  'LEARNING_CENTER_E2E_PRODUCTION=1',
  ...(process.env.CI ? ['--env', 'CI=true'] : []),
  image,
  'node',
  'node_modules/@playwright/test/cli.js',
  'test',
  ...process.argv.slice(2),
]);

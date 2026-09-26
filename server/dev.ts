import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectDirectory = fileURLToPath(new URL('../', import.meta.url));
const typescriptEntry = fileURLToPath(
  new URL('../node_modules/typescript/bin/tsc', import.meta.url),
);
const serverEntry = fileURLToPath(new URL('./index.js', import.meta.url));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = {
  ...process.env,
  LEARNING_CENTER_MODE: 'local',
  LEARNING_CENTER_PORT: '8787',
};
const childOptions = { cwd: projectDirectory, env: environment, stdio: 'inherit' as const };
const children = [
  spawn(
    process.execPath,
    [typescriptEntry, '-p', 'tsconfig.server.json', '--watch', '--preserveWatchOutput'],
    childOptions,
  ),
  spawn(process.execPath, ['--watch', serverEntry], childOptions),
  spawn(npmCommand, ['run', 'dev:web'], childOptions),
];

let stopping = false;
async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  const exits = children.map((child) => {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null)
      return Promise.resolve();
    return new Promise<void>((resolve) => child.once('close', () => resolve()));
  });
  children.forEach((child) => child.kill('SIGTERM'));
  await Promise.all(exits);
  process.exitCode = exitCode;
}

children.forEach((child) => {
  child.on('error', (error) => {
    console.error(error);
    void stop(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping || signal === 'SIGTERM') return;
    void stop(code ?? 1);
  });
});

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

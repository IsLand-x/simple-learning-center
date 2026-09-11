import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDirectory = await mkdtemp(join(tmpdir(), 'learning-center-e2e-'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = {
  ...process.env,
  LEARNING_CENTER_API_PROXY: 'http://127.0.0.1:18787',
  LEARNING_CENTER_DATA_DIR: dataDirectory,
  LEARNING_CENTER_MODE: 'local',
  LEARNING_CENTER_PORT: '18787',
  LEARNING_CENTER_RSS_REFRESH_INITIAL_DELAY_MS: '1800000',
};
const children = [
  spawn(process.execPath, ['server/index.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: environment,
    stdio: 'inherit',
  }),
  spawn(npmCommand, ['run', 'dev:web', '--', '--port', '15173', '--strictPort'], {
    cwd: new URL('..', import.meta.url),
    env: environment,
    stdio: 'inherit',
  }),
];

let stopping = false;
async function stop(signal = 'SIGTERM', exitCode = 0) {
  if (stopping) return;
  stopping = true;
  const exits = children.map((child) => {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => child.once('exit', resolve));
  });
  children.forEach((child) => child.kill(signal));
  await Promise.all(exits);
  await rm(dataDirectory, { force: true, recursive: true });
  process.exitCode = exitCode;
}

children.forEach((child) => {
  child.on('exit', (code, signal) => {
    if (stopping || signal === 'SIGTERM') return;
    void stop('SIGTERM', code ?? 1);
  });
});

process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop());

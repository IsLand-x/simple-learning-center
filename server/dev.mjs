import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = {
  ...process.env,
  LEARNING_CENTER_MODE: 'local',
  LEARNING_CENTER_PORT: '8787',
};
const children = [
  spawn(process.execPath, ['server/index.mjs'], { env: environment, stdio: 'inherit' }),
  spawn(npmCommand, ['run', 'dev:web'], { env: environment, stdio: 'inherit' }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill('SIGTERM'));
  setTimeout(() => process.exit(exitCode), 100).unref();
}

children.forEach((child) => {
  child.on('exit', (code, signal) => {
    if (stopping || signal === 'SIGTERM') return;
    stop(code ?? 1);
  });
});

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

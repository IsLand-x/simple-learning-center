import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bridgePath = fileURLToPath(new URL('./acp-bridge.mjs', import.meta.url));
const vitePath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const children = [
  spawn(process.execPath, [bridgePath], { stdio: 'inherit' }),
  spawn(process.execPath, [vitePath, '--host', '127.0.0.1'], { stdio: 'inherit' }),
];

let shuttingDown = false;

function shutdown(signal = 'SIGTERM', exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => {
    if (!child.killed) child.kill(signal);
  });
  setTimeout(() => process.exit(exitCode), 100).unref();
}

children.forEach((child) => {
  child.on('exit', (code, signal) => shutdown(signal || 'SIGTERM', code || 0));
  child.on('error', () => shutdown('SIGTERM', 1));
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
